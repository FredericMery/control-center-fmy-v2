import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';

type AiProposal = {
  id?: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  action: string;
  why: string;
  sender: string;
  email_message_id: string;
  source_type: string;
  status: string;
  generated_at: string;
  batch_id: string;
};

type DailyRow = {
  id: string;
  subject: string;
  sender: string;
  summary: string;
  ai_priority: string;
  ai_action: string;
  response_required: boolean;
  response_status: string;
  archived: boolean;
  received_at: string;
};

// GET — Retourne le dernier batch de propositions stockées
export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();

  // Récupérer le batch_id du plus récent batch
  const { data: latestRow } = await supabase
    .from('ai_action_proposals')
    .select('batch_id, generated_at')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRow?.batch_id) {
    return NextResponse.json({ proposals: [], generated_at: null, batch_id: null });
  }

  const { data: proposals, error } = await supabase
    .from('ai_action_proposals')
    .select('*')
    .eq('user_id', userId)
    .eq('batch_id', latestRow.batch_id)
    .order('priority', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = [...(proposals || [])].sort(
    (a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)
  );

  return NextResponse.json({
    proposals: sorted as AiProposal[],
    generated_at: latestRow.generated_at,
    batch_id: latestRow.batch_id,
  });
}

// POST — Génère de nouvelles propositions et les stocke en DB
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const now = new Date();

  // Récupérer les emails du jour
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const { data: messages, error: emailError } = await supabase
    .from('email_messages')
    .select(
      'id,subject,sender_email,sender_name,ai_summary,ai_priority,ai_action,response_required,response_status,received_at,archived'
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('received_at', start.toISOString())
    .lte('received_at', end.toISOString())
    .order('received_at', { ascending: false });

  if (emailError) return NextResponse.json({ error: emailError.message }, { status: 500 });

  const rows: DailyRow[] = (messages || []).map((entry) => ({
    id: String(entry.id || ''),
    subject: normalizeText(entry.subject),
    sender:
      normalizeText(entry.sender_name) ||
      normalizeText(entry.sender_email) ||
      'expediteur inconnu',
    summary: normalizeText(entry.ai_summary),
    ai_priority: normalizeText(entry.ai_priority) || 'normal',
    ai_action: normalizeText(entry.ai_action) || 'classer',
    response_required: Boolean(entry.response_required),
    response_status: normalizeText(entry.response_status) || 'none',
    archived: Boolean(entry.archived),
    received_at: normalizeText(entry.received_at),
  }));

  // Génère la synthèse IA
  const synthesis = await generateSynthesis(userId, rows);

  // Génère un batch_id unique pour ce lot
  const batchId = crypto.randomUUID();
  const generatedAt = now.toISOString();

  // Supprime les anciens batches > 24h pour garder la table propre
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('ai_action_proposals')
    .delete()
    .eq('user_id', userId)
    .lt('generated_at', cutoff);

  // Insère le nouveau batch
  if (synthesis.actions.length > 0) {
    const inserts = synthesis.actions.map((action) => ({
      user_id: userId,
      priority: action.priority,
      action: action.action,
      why: action.why,
      sender: action.sender,
      email_message_id: action.email_message_id,
      source_type: 'email',
      status: 'pending',
      batch_id: batchId,
      generated_at: generatedAt,
    }));

    const { error: insertError } = await supabase
      .from('ai_action_proposals')
      .insert(inserts);

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    proposals: synthesis.actions.map((action) => ({
      ...action,
      source_type: 'email',
      status: 'pending',
      generated_at: generatedAt,
      batch_id: batchId,
    })) as AiProposal[],
    summary: synthesis.summary,
    generated_at: generatedAt,
    batch_id: batchId,
    email_count: rows.length,
  });
}

// ─── Synthèse IA ────────────────────────────────────────────────────────────

async function generateSynthesis(
  userId: string,
  rows: DailyRow[]
): Promise<{ summary: string; actions: Array<{ priority: 'urgent' | 'high' | 'normal' | 'low'; action: string; why: string; sender: string; email_message_id: string }> }> {
  if (rows.length === 0) {
    return { summary: 'Aucun email traite aujourd hui.', actions: [] };
  }

  const fallback = buildFallback(rows);

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
              'Format: {"summary":"...","actions":[{"priority":"urgent|high|normal|low","action":"...","why":"...","sender":"...","email_message_id":"..."}]}',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              'Fais une synthese et liste les actions concretes a entreprendre, classees par priorite.',
              'Max 8 actions, sans doublons, orientees execution.',
              '',
              JSON.stringify(rows),
            ].join('\n'),
          },
        ],
        text: { format: { type: 'json_object' } },
      },
    });

    const content =
      response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
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
  } catch {
    return fallback;
  }
}

function buildFallback(rows: DailyRow[]) {
  const sorted = [...rows].sort(
    (a, b) => priorityWeight(b.ai_priority) - priorityWeight(a.ai_priority)
  );
  const actions = sorted
    .filter(
      (row) =>
        !row.archived &&
        row.response_required &&
        row.ai_action === 'repondre' &&
        row.response_status !== 'sent'
    )
    .slice(0, 8)
    .map((row) => ({
      priority: normalizePriority(row.ai_priority),
      action: truncate(
        `Repondre a ${row.sender}: ${row.subject || 'email sans objet'}`,
        220
      ),
      why: truncate(row.summary || 'Action necessaire identifiee par le tri IA.', 240),
      sender: row.sender,
      email_message_id: row.id,
    }));

  const summary =
    actions.length > 0
      ? `${rows.length} emails traites. ${actions.length} actions prioritaires detectees.`
      : `${rows.length} emails traites. Aucune action prioritaire non resolue.`;

  return { summary, actions };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

function normalizePriority(
  value: unknown
): 'urgent' | 'high' | 'normal' | 'low' {
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
