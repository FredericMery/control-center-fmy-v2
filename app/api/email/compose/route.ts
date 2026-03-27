import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

type ComposePayload = {
  to: string | string[];
  cc?: string | string[];
  subject?: string;
  body?: string;
  context?: 'pro' | 'perso';
  from_name?: string;
  reply_to_email?: string;
};

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser(authHeader.slice(7));

  return user;
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmails(input: string | string[] | undefined): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : input.split(/[,;]+/);
  return Array.from(new Set(list.map((entry) => normalizeEmail(entry)).filter(isValidEmail)));
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function bodyToHtml(text: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;line-height:1.7;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px"><div style="white-space:pre-wrap">${escapeHtml(text)}</div></body></html>`;
}

async function getProfessionalEmail(userId: string): Promise<string> {
  const { data } = await supabase
    .from('scheduling_preferences')
    .select('professional_email')
    .eq('user_id', userId)
    .maybeSingle();

  return normalizeEmail(data?.professional_email);
}

function resolveReplyToEmail(args: {
  personalEmail: string;
  professionalEmail: string;
  requestedReplyTo: string;
  context: 'pro' | 'perso';
}): string {
  const allowed = new Set([args.personalEmail, args.professionalEmail].filter(Boolean));
  if (args.requestedReplyTo && allowed.has(args.requestedReplyTo)) {
    return args.requestedReplyTo;
  }
  if (args.context === 'pro' && args.professionalEmail) {
    return args.professionalEmail;
  }
  return args.personalEmail;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  let payload: ComposePayload;
  try {
    payload = (await request.json()) as ComposePayload;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const toEmails = normalizeEmails(payload.to);
  const ccEmails = normalizeEmails(payload.cc);
  const subject = String(payload.subject || '').trim().slice(0, 240);
  const body = String(payload.body || '').trim().slice(0, 50000);
  const context = payload.context === 'perso' ? 'perso' : 'pro';

  if (toEmails.length === 0) {
    return NextResponse.json({ error: 'Destinataire invalide' }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: 'Objet requis' }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: 'Corps du message requis' }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 });
  }

  const personalEmail = normalizeEmail(user.email);
  const professionalEmail = await getProfessionalEmail(user.id);
  const replyToEmail = resolveReplyToEmail({
    personalEmail,
    professionalEmail,
    requestedReplyTo: normalizeEmail(payload.reply_to_email),
    context,
  });

  if (!replyToEmail) {
    return NextResponse.json({ error: 'Aucune adresse de reponse disponible' }, { status: 400 });
  }

  const userName =
    String(payload.from_name || (user.user_metadata?.full_name as string) || '').trim() || replyToEmail;

  const fromAddress =
    String(process.env.RESEND_MAIL_FROM || process.env.RESEND_FROM || '').trim() ||
    'Control Center <noreply@meetsync-ai.com>';

  let resendId: string | null = null;
  let sendStatus: 'sent' | 'failed' = 'sent';

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      replyTo: `${userName} <${replyToEmail}>`,
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
      text: body,
      html: bodyToHtml(body),
    });
    resendId = result.data?.id ?? null;
  } catch (error) {
    console.error('[email/compose] Resend error:', error);
    sendStatus = 'failed';
  }

  const { data: saved, error: dbError } = await supabase
    .from('email_outbox')
    .insert({
      user_id: user.id,
      context,
      from_email: replyToEmail,
      from_name: userName !== replyToEmail ? userName : null,
      to_emails: toEmails,
      cc_emails: ccEmails.length > 0 ? ccEmails : null,
      subject,
      body,
      resend_id: resendId,
      status: sendStatus,
    })
    .select('id')
    .single();

  if (dbError) {
    console.error('[email/compose] DB insert error:', dbError.message);
  }

  if (sendStatus === 'failed') {
    return NextResponse.json({ error: "Echec de l'envoi email" }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    id: saved?.id,
    resend_id: resendId,
    reply_to_email: replyToEmail,
  }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 20), 100);
  const offset = Math.max(Number(searchParams.get('offset') || 0), 0);
  const context = searchParams.get('context');

  const professionalEmail = await getProfessionalEmail(user.id);
  let query = supabase
    .from('email_outbox')
    .select('id, context, from_email, from_name, to_emails, cc_emails, subject, status, sent_at, created_at', {
      count: 'exact',
    })
    .eq('user_id', user.id)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (context === 'pro' || context === 'perso') {
    query = query.eq('context', context);
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Erreur base de donnees' }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    sender_options: [
      { type: 'personal', email: normalizeEmail(user.email), label: 'Perso' },
      ...(professionalEmail ? [{ type: 'professional', email: professionalEmail, label: 'Pro' }] : []),
    ],
  });
}