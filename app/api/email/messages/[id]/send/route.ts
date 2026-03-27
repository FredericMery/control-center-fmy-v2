import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { sendPreparedReplyEmail } from '@/lib/email/assistantService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const payload = (await request.json().catch(() => ({}))) as {
    subject?: string;
    body?: string;
    reply_to_email?: string;
  };

  const supabase = getSupabaseAdminClient();

  const [{ data: message }, { data: draft }] = await Promise.all([
    supabase
      .from('email_messages')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('email_reply_drafts')
      .select('*')
      .eq('message_id', id)
      .eq('user_id', userId)
      .eq('is_current', true)
      .single(),
  ]);

  if (!message) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  if (!draft) return NextResponse.json({ error: 'Brouillon introuvable' }, { status: 404 });

  const { data: aiBaselineDraft } = await supabase
    .from('email_reply_drafts')
    .select('id,version,proposed_subject,proposed_body')
    .eq('message_id', id)
    .eq('user_id', userId)
    .order('version', { ascending: true })
    .limit(1)
    .maybeSingle();

  const replyTarget = resolveReplyTargetFromMessage(message);

  if (!replyTarget) {
    return NextResponse.json({ error: 'Destinataire email introuvable' }, { status: 400 });
  }

  const finalSubject = String(payload.subject || draft.proposed_subject || message.subject || 'Reponse');
  const finalBody = String(payload.body || draft.proposed_body || '').trim();

  if (!finalBody) {
    return NextResponse.json({ error: 'Le contenu de reponse est vide' }, { status: 400 });
  }

  const aiBaselineSubject = String(aiBaselineDraft?.proposed_subject || draft.proposed_subject || '');
  const aiBaselineBody = String(aiBaselineDraft?.proposed_body || draft.proposed_body || '');
  const editedByUser = aiBaselineSubject !== finalSubject || aiBaselineBody !== finalBody;

  const { data: schedulingPreferences } = await supabase
    .from('scheduling_preferences')
    .select('professional_email')
    .eq('user_id', userId)
    .maybeSingle();

  const personalEmail = await getAuthenticatedUserEmail(request);
  const professionalEmail = normalizeEmail(schedulingPreferences?.professional_email) || '';
  const requestedReplyTo = normalizeEmail(payload.reply_to_email) || '';
  const allowedReplyTos = new Set([personalEmail, professionalEmail].filter(Boolean));
  const replyToEmail = allowedReplyTos.has(requestedReplyTo)
    ? requestedReplyTo
    : professionalEmail || personalEmail;

  const sent = await sendPreparedReplyEmail({
    to: replyTarget,
    cc: Array.isArray(message.cc_emails) ? (message.cc_emails as string[]) : [],
    subject: finalSubject,
    body: finalBody,
    replyTo: replyToEmail || undefined,
  });

  const providerMessageId = String((sent as { data?: { id?: string } })?.data?.id || '');

  await Promise.all([
    supabase
      .from('email_reply_drafts')
      .update({
        proposed_subject: finalSubject,
        proposed_body: finalBody,
        edited_by_user: payload.body ? true : draft.edited_by_user,
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        send_provider: 'resend',
        provider_message_id: providerMessageId || null,
      })
      .eq('id', draft.id)
      .eq('user_id', userId),
    supabase
      .from('email_messages')
      .update({
        response_status: 'sent',
        response_required: false,
        ai_action: 'classer',
        archived: true,
      })
      .eq('id', id)
      .eq('user_id', userId),
    supabase
      .from('email_processing_logs')
      .insert({
        user_id: userId,
        message_id: id,
        event_type: 'reply_sent',
        level: 'info',
        message: 'Reponse envoyee via module email assistant',
        payload: {
          to: replyTarget,
          reply_to_email: replyToEmail || null,
          subject: finalSubject,
          provider_message_id: providerMessageId || null,
          ai_baseline_subject: aiBaselineSubject,
          ai_baseline_body: aiBaselineBody,
          final_subject: finalSubject,
          final_body: finalBody,
          edited_by_user: editedByUser,
        },
      }),
  ]);

  return NextResponse.json({
    success: true,
    provider_message_id: providerMessageId || null,
  });
}

async function getAuthenticatedUserEmail(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return '';

  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get() { return undefined; },
        set() {},
        remove() {},
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser(authHeader.slice(7));

  return normalizeEmail(user?.email);
}

function resolveReplyTargetFromMessage(message: Record<string, unknown>): string {
  const headers = message.headers;
  const body = String(message.body_text || message.body_html || '');

  const headerCandidates = [
    ...extractHeaderValues(headers, 'reply-to'),
    ...extractHeaderValues(headers, 'x-original-from'),
    ...extractHeaderValues(headers, 'x-forwarded-from'),
  ];

  for (const value of headerCandidates) {
    const email = extractSingleEmail(value);
    if (email) return email;
  }

  const bodySender = extractOriginalSenderFromBody(body);
  if (bodySender) return bodySender;

  return normalizeEmail(message.sender_email) || '';
}

function extractOriginalSenderFromBody(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(from|de|expediteur)\s*:\s*(.+)$/i);
    if (!match?.[2]) continue;
    const email = extractSingleEmail(match[2]);
    if (email) return email;
  }

  return '';
}

function extractHeaderValues(headers: unknown, targetName: string): string[] {
  const wanted = normalizeText(targetName).toLowerCase();
  if (!wanted || !headers) return [];

  if (typeof headers === 'string') {
    return headers
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([^:]+)\s*:\s*(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match?.[1] && match?.[2]))
      .filter((match) => normalizeText(match[1]).toLowerCase() === wanted)
      .map((match) => normalizeText(match[2]))
      .filter(Boolean);
  }

  if (Array.isArray(headers)) {
    return headers
      .flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Record<string, unknown>;
        const name = normalizeText(record.name || record.key || record.header).toLowerCase();
        if (name !== wanted) return [];
        const value = normalizeText(record.value || record.content);
        return value ? [value] : [];
      })
      .filter(Boolean);
  }

  if (typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    return Object.entries(record)
      .filter(([key]) => normalizeText(key).toLowerCase() === wanted)
      .flatMap(([, value]) => {
        if (Array.isArray(value)) return value.map((entry) => normalizeText(entry)).filter(Boolean);
        const normalized = normalizeText(value);
        return normalized ? [normalized] : [];
      })
      .filter(Boolean);
  }

  return [];
}

function extractSingleEmail(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const bracket = raw.match(/<([^>]+)>/);
  if (bracket?.[1]) return normalizeEmail(bracket[1]) || '';

  const simple = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (simple?.[0]) return normalizeEmail(simple[0]) || '';

  return '';
}

function normalizeEmail(value: unknown): string {
  const email = normalizeText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
