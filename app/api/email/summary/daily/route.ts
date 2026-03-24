import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';

type DailyAction = {
  priority: 'urgent' | 'high' | 'normal' | 'low';
  action: string;
  why: string;
  sender: string;
  email_message_id: string;
};

type DailyRow = {
  id: string;
  subject: string;
  sender: string;
  summary: string;
  ai_priority: string;
  ai_action: string;
  response_status: string;
  archived: boolean;
  received_at: string;
};

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const requestedDate = parseDateKey(request.nextUrl.searchParams.get('date')) || new Date();
  const rowsResult = await getEmailRowsForDate(supabase, userId, requestedDate);
  if (rowsResult.error) return NextResponse.json({ error: rowsResult.error }, { status: 500 });

  const rows = rowsResult.rows;
  if (rows.length === 0) {
    return NextResponse.json({
      day: toDayKey(requestedDate),
      count: 0,
      summary: 'Aucun email recu aujourd hui.',
      actions: [] as DailyAction[],
    });
  }

  const synthesis = await generateDailySynthesis(userId, rows);

  return NextResponse.json({
    day: toDayKey(requestedDate),
    count: rows.length,
    summary: synthesis.summary,
    actions: synthesis.actions,
  });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const now = new Date();

  const body = (await request.json().catch(() => ({}))) as {
    priorities?: Array<'urgent' | 'high' | 'normal' | 'low'>;
    date?: string;
  };

  const allowedPriorities = (Array.isArray(body.priorities) && body.priorities.length > 0
    ? body.priorities
    : ['urgent', 'high']) as Array<'urgent' | 'high' | 'normal' | 'low'>;

  const requestedDate = parseDateKey(body.date) || now;
  const rowsResult = await getEmailRowsForDate(supabase, userId, requestedDate);
  if (rowsResult.error) return NextResponse.json({ error: rowsResult.error }, { status: 500 });

  const rows = rowsResult.rows;
  if (rows.length === 0) {
    return NextResponse.json({
      day: toDayKey(requestedDate),
      count: 0,
      created: 0,
      skipped: 0,
      createdTasks: [],
      skippedActions: [],
    });
  }

  const synthesis = await generateDailySynthesis(userId, rows);
  const candidates = synthesis.actions.filter((action) => allowedPriorities.includes(action.priority));

  const createdTasks: Array<{ id: string; title: string; email_message_id: string }> = [];
  const skippedActions: Array<{ reason: string; email_message_id: string; action: string }> = [];

  for (const action of candidates) {
    const emailId = normalizeText(action.email_message_id);
    if (!emailId) {
      skippedActions.push({
        reason: 'missing-email-id',
        email_message_id: '',
        action: action.action,
      });
      continue;
    }

    const sourceToken = `[email:${emailId}]`;
    const iaMarker = '[IA-MAIL]';

    const { data: existing } = await supabase
      .from('tasks')
      .select('id,title')
      .eq('user_id', userId)
      .eq('type', 'pro')
      .ilike('title', `%${iaMarker}%${sourceToken}%`)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      skippedActions.push({
        reason: 'already-created',
        email_message_id: emailId,
        action: action.action,
      });
      continue;
    }

    const title = buildIaMailTaskTitle(action);
    const deadline = buildDeadlineFromPriority(action.priority);

    const { data: inserted, error: insertError } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        type: 'pro',
        status: 'todo',
        archived: false,
        deadline,
      })
      .select('id,title')
      .single();

    if (insertError || !inserted?.id) {
      skippedActions.push({
        reason: 'insert-failed',
        email_message_id: emailId,
        action: action.action,
      });
      continue;
    }

    createdTasks.push({
      id: String(inserted.id),
      title: String(inserted.title || ''),
      email_message_id: emailId,
    });
  }

  return NextResponse.json({
    day: toDayKey(requestedDate),
    count: rows.length,
    considered: candidates.length,
    created: createdTasks.length,
    skipped: skippedActions.length,
    createdTasks,
    skippedActions,
    priorities: allowedPriorities,
  });
}

async function getEmailRowsForDate(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
  date: Date
): Promise<{ rows: DailyRow[]; error: string | null }> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const { data: messages, error } = await supabase
    .from('email_messages')
    .select('id,subject,sender_email,sender_name,ai_summary,ai_priority,ai_action,response_status,received_at,archived')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('received_at', start.toISOString())
    .lte('received_at', end.toISOString())
    .order('received_at', { ascending: false });

  if (error) return { rows: [], error: error.message };

  const rows = (messages || []).map((entry) => ({
    id: String(entry.id || ''),
    subject: normalizeText(entry.subject),
    sender: normalizeText(entry.sender_name) || normalizeText(entry.sender_email) || 'expediteur inconnu',
    summary: normalizeText(entry.ai_summary),
    ai_priority: normalizeText(entry.ai_priority) || 'normal',
    ai_action: normalizeText(entry.ai_action) || 'classer',
    response_status: normalizeText(entry.response_status) || 'none',
    archived: Boolean(entry.archived),
    received_at: normalizeText(entry.received_at),
  }));

  return { rows, error: null };
}

async function generateDailySynthesis(
  userId: string,
  rows: DailyRow[]
): Promise<{ summary: string; actions: DailyAction[] }> {
  const fallback = buildFallbackSynthesis(rows);

  try {
    const model = 'gpt-4.1-mini';
    const response = await callOpenAi({
      userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'Tu es un assistant de priorisation d emails professionnels.',
              'Retourne STRICTEMENT un JSON valide.',
              'Format: {"summary":"...","actions":[{"priority":"urgent|high|normal|low","action":"...","why":"...","sender":"...","email_message_id":"..."}]}'
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              'Fais une synthese de la journee et liste les actions concretes a entreprendre, classees par priorite.',
              'Max 8 actions, sans doublons, orientees execution.',
              '',
              JSON.stringify(rows),
            ].join('\n'),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = JSON.parse(content) as {
      summary?: unknown;
      actions?: Array<Record<string, unknown>>;
    };

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
          .map((entry) => ({
            priority: normalizePriority(entry.priority),
            action: truncate(normalizeText(entry.action), 220),
            why: truncate(normalizeText(entry.why), 240),
            sender: truncate(normalizeText(entry.sender), 140),
            email_message_id: normalizeText(entry.email_message_id),
          }))
          .filter((entry) => entry.action && entry.email_message_id)
          .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
      : [];

    return {
      summary: truncate(normalizeText(parsed.summary) || fallback.summary, 1000),
      actions: actions.length > 0 ? actions : fallback.actions,
    };
  } catch (error) {
    console.error('daily email synthesis fallback', error);
    return fallback;
  }
}

function buildFallbackSynthesis(
  rows: DailyRow[]
): { summary: string; actions: DailyAction[] } {
  const sorted = [...rows].sort((a, b) => priorityWeight(b.ai_priority) - priorityWeight(a.ai_priority));
  const actionable = sorted
    .filter((row) => !row.archived && row.ai_action === 'repondre' && row.response_status !== 'sent')
    .slice(0, 8)
    .map((row) => ({
      priority: normalizePriority(row.ai_priority),
      action: truncate(`Repondre a ${row.sender}: ${row.subject || 'email sans objet'}`, 220),
      why: truncate(row.summary || 'Action necessaire identifiee par le tri IA.', 240),
      sender: row.sender,
      email_message_id: row.id,
    }));

  const summary = actionable.length > 0
    ? `Aujourd hui: ${rows.length} emails traites. ${actionable.length} actions prioritaires identifiees.`
    : `Aujourd hui: ${rows.length} emails traites. Aucune action prioritaire non resolue.`;

  return {
    summary,
    actions: actionable,
  };
}

function buildIaMailTaskTitle(action: DailyAction): string {
  const marker = '[IA-MAIL]';
  const actionText = truncate(normalizeText(action.action) || 'Action email', 140);
  const sender = truncate(normalizeText(action.sender) || 'expediteur inconnu', 60);
  const sourceToken = `[email:${normalizeText(action.email_message_id)}]`;
  return truncate(`${marker} ${actionText} - ${sender} ${sourceToken}`, 240);
}

function buildDeadlineFromPriority(priority: DailyAction['priority']): string {
  const now = new Date();

  if (priority === 'urgent') {
    const deadline = new Date(now);
    deadline.setHours(18, 0, 0, 0);
    if (deadline < now) {
      deadline.setDate(deadline.getDate() + 1);
    }
    return deadline.toISOString();
  }

  const plusDays = priority === 'high' ? 1 : priority === 'normal' ? 3 : 5;
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + plusDays);
  deadline.setHours(18, 0, 0, 0);
  return deadline.toISOString();
}

function normalizePriority(value: unknown): 'urgent' | 'high' | 'normal' | 'low' {
  const raw = normalizeText(value).toLowerCase();
  if (raw === 'urgent') return 'urgent';
  if (raw === 'high') return 'high';
  if (raw === 'low') return 'low';
  return 'normal';
}

function priorityWeight(value: unknown): number {
  const p = normalizePriority(value);
  if (p === 'urgent') return 4;
  if (p === 'high') return 3;
  if (p === 'normal') return 2;
  return 1;
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(value: unknown): Date | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}
