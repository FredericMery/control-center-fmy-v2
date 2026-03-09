import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callOpenAi } from '@/lib/ai/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_TASK_INBOUND_ADDRESS = 'taskpro@control.meetsync-ai.com';

export async function POST(request: NextRequest) {
  try {
    if (!isWebhookAuthorized(request)) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const eventData = normalizeEventData(payload as Record<string, unknown>);

    const inboundAddress = String(
      process.env.RESEND_TASK_INBOUND_ADDRESS || DEFAULT_TASK_INBOUND_ADDRESS
    )
      .trim()
      .toLowerCase();

    const recipientEmails = [
      ...extractEmailList(eventData.to),
      ...extractEmailList(eventData.cc),
      ...extractEmailList(eventData.bcc),
    ];

    const addressedToTaskInbox = recipientEmails.some((email) => email === inboundAddress);
    if (!addressedToTaskInbox) {
      return NextResponse.json({ ok: true, skipped: 'not-task-inbox' });
    }

    const senderEmail = extractSingleEmail(eventData.from);
    if (!senderEmail) {
      return NextResponse.json({ error: 'Expediteur introuvable' }, { status: 400 });
    }

    const userId = await findUserIdByEmail(senderEmail);
    if (!userId) {
      // On accuse reception sans erreur pour eviter les retries webhook infinis.
      return NextResponse.json({ ok: true, skipped: 'unknown-sender', senderEmail });
    }

    const subject = normalizeText(eventData.subject);
    const plainText = normalizeText(eventData.text || eventData.text_body || eventData.snippet);
    const htmlText = normalizeText(eventData.html);
    const bodyForAi = plainText || htmlText;

    const analysis = await analyzeTaskEmail({
      userId,
      subject,
      body: bodyForAi,
      receivedAt: normalizeText(eventData.date || eventData.created_at),
    });

    const title = buildTaskTitle(subject, analysis.description || bodyForAi);
    const deadline = resolveTaskDeadline(analysis.deadlineIso, eventData.date || eventData.created_at);

    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        type: 'pro',
        status: 'todo',
        archived: false,
        deadline,
      })
      .select('id,title,user_id,created_at')
      .single();

    if (error) {
      console.error('resend inbound -> insert task failed', error);
      return NextResponse.json(
        { error: 'Erreur creation tache', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: inserted,
      inferred: {
        deadline,
        usedDefaultDeadline: !analysis.deadlineIso,
        description: analysis.description,
      },
    });
  } catch (error) {
    console.error('resend inbound webhook error', error);
    return NextResponse.json({ error: 'Erreur serveur webhook' }, { status: 500 });
  }
}

function isWebhookAuthorized(request: NextRequest): boolean {
  const configuredToken = String(process.env.RESEND_INBOUND_WEBHOOK_TOKEN || '').trim();
  if (!configuredToken) {
    return true;
  }

  const fromHeader = String(request.headers.get('x-inbound-token') || '').trim();
  const fromQuery = String(request.nextUrl.searchParams.get('token') || '').trim();

  return fromHeader === configuredToken || fromQuery === configuredToken;
}

function normalizeEventData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return payload;
}

function extractEmailList(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => extractEmailList(value))
      .filter(Boolean);
  }

  if (typeof input === 'object') {
    const asRecord = input as Record<string, unknown>;
    if (Array.isArray(asRecord.email)) {
      return asRecord.email
        .map((v) => normalizeEmail(v))
        .filter((v): v is string => Boolean(v));
    }
    if (typeof asRecord.email === 'string') {
      const normalized = normalizeEmail(asRecord.email);
      return normalized ? [normalized] : [];
    }
    if (Array.isArray(asRecord.value)) {
      return asRecord.value
        .flatMap((v) => extractEmailList(v))
        .filter(Boolean);
    }
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((part) => extractSingleEmail(part))
      .filter((v): v is string => Boolean(v));
  }

  return [];
}

function extractSingleEmail(input: unknown): string | null {
  if (!input) return null;

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (typeof record.email === 'string') {
      return normalizeEmail(record.email);
    }
    if (typeof record.from === 'string') {
      return extractSingleEmail(record.from);
    }
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const bracketMatch = raw.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) {
    return normalizeEmail(bracketMatch[1]);
  }

  const simpleMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (simpleMatch?.[0]) {
    return normalizeEmail(simpleMatch[0]);
  }

  return null;
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return null;
  return email;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTaskTitle(subject: string, plainText: string): string {
  const normalizedSubject = subject.replace(/^\s*(re|fwd?)\s*:\s*/i, '').trim();

  if (normalizedSubject) {
    return truncate(normalizedSubject, 180);
  }

  if (plainText) {
    const firstSentence = plainText.split(/\.|\n/)[0]?.trim() || plainText;
    return truncate(firstSentence || 'Tache depuis email', 180);
  }

  return 'Tache depuis email';
}

type TaskEmailAnalysis = {
  description: string;
  deadlineIso: string | null;
};

async function analyzeTaskEmail(args: {
  userId: string;
  subject: string;
  body: string;
  receivedAt?: string;
}): Promise<TaskEmailAnalysis> {
  const subject = truncate(normalizeText(args.subject), 240);
  const body = truncate(normalizeText(args.body), 8000);

  if (!subject && !body) {
    return {
      description: 'Tache creee depuis email',
      deadlineIso: null,
    };
  }

  try {
    const model = 'gpt-4.1-mini';
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content:
              'You extract actionable professional tasks from incoming emails. Return strict JSON only.',
          },
          {
            role: 'user',
            content: [
              'Analyze this email and return JSON with:',
              '- description: concise professional action sentence in French',
              '- deadline_iso: YYYY-MM-DD if an explicit deadline is present, otherwise null',
              '',
              `received_at: ${args.receivedAt || 'unknown'}`,
              `subject: ${subject}`,
              `body: ${body}`,
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

    const content =
      response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';

    const parsed = JSON.parse(content) as {
      description?: unknown;
      deadline_iso?: unknown;
    };

    return {
      description: truncate(
        normalizeText(parsed.description) || buildTaskTitle(subject, body),
        180
      ),
      deadlineIso: normalizeIsoDate(parsed.deadline_iso),
    };
  } catch (error) {
    console.error('resend inbound -> ai analysis fallback', error);
    return {
      description: buildTaskTitle(subject, body),
      deadlineIso: null,
    };
  }
}

function resolveTaskDeadline(inferredIso: string | null, eventDate: unknown): string {
  if (inferredIso) {
    return new Date(`${inferredIso}T23:59:59.000Z`).toISOString();
  }

  const baseDate = parseInputDate(eventDate) || new Date();
  const fallback = new Date(baseDate);
  fallback.setUTCDate(fallback.getUTCDate() + 5);
  fallback.setUTCHours(23, 59, 59, 0);
  return fallback.toISOString();
}

function parseInputDate(value: unknown): Date | null {
  if (!value) return null;
  const candidate = new Date(String(value));
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate;
}

function normalizeIsoDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function truncate(value: string, max: number): string {
  const normalized = String(value || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('listUsers failed', error);
      return null;
    }

    const users = data?.users || [];
    const found = users.find((user) => String(user.email || '').toLowerCase() === normalized);
    if (found?.id) {
      return found.id;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}
