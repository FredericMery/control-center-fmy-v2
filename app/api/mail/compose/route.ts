import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { Resend } from 'resend';

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

type ComposePayload = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  context?: 'pro' | 'perso';
  from_name?: string;
};

async function getUserFromToken(token: string) {
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
  );
  const { data: { user } } = await authClient.auth.getUser(token);
  return user;
}

function normalizeEmails(input: string | string[] | undefined): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : input.split(/[,;]+/);
  return list
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function bodyToHtml(text: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;line-height:1.7;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px"><div style="white-space:pre-wrap">${escapeHtml(text)}</div></body></html>`;
}

/** POST /api/mail/compose — compose & send an email */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const user = await getUserFromToken(authHeader.slice(7));
  if (!user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let payload: ComposePayload;
  try {
    payload = (await request.json()) as ComposePayload;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const toEmails = normalizeEmails(payload.to);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: 'Destinataire invalide' }, { status: 400 });
  }

  const subject = String(payload.subject || '').trim().slice(0, 240);
  const bodyText = String(payload.body || '').trim().slice(0, 50_000);

  if (!subject) {
    return NextResponse.json({ error: 'Objet requis' }, { status: 400 });
  }
  if (!bodyText) {
    return NextResponse.json({ error: 'Corps du message requis' }, { status: 400 });
  }

  const ccEmails = normalizeEmails(payload.cc);
  const context = payload.context === 'perso' ? 'perso' : 'pro';
  const userEmail = user.email!;
  const userName =
    String(payload.from_name || (user.user_metadata?.full_name as string) || '').trim() ||
    userEmail;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 });
  }

  const fromAddress =
    String(process.env.RESEND_MAIL_FROM || process.env.RESEND_FROM || '').trim() ||
    'Control Center <noreply@meetsync-ai.com>';

  let resendId: string | null = null;
  let sendStatus: 'sent' | 'failed' = 'sent';

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      replyTo: `${userName} <${userEmail}>`,
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject,
      text: bodyText,
      html: bodyToHtml(bodyText),
    });
    resendId = result.data?.id ?? null;
  } catch (err) {
    console.error('[mail/compose] Resend error:', err);
    sendStatus = 'failed';
  }

  // Save to mail_compose regardless of send outcome (for audit trail)
  const { data: saved, error: dbError } = await supabase
    .from('mail_compose')
    .insert({
      user_id: user.id,
      context,
      from_email: userEmail,
      from_name: userName !== userEmail ? userName : null,
      to_emails: toEmails,
      cc_emails: ccEmails.length > 0 ? ccEmails : null,
      subject,
      body: bodyText,
      resend_id: resendId,
      status: sendStatus,
    })
    .select('id')
    .single();

  if (dbError) {
    console.error('[mail/compose] DB insert error:', dbError.message);
  }

  if (sendStatus === 'failed') {
    return NextResponse.json({ error: "Échec de l'envoi email" }, { status: 502 });
  }

  return NextResponse.json({ success: true, id: saved?.id, resend_id: resendId }, { status: 201 });
}

/** GET /api/mail/compose — list sent emails */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const user = await getUserFromToken(authHeader.slice(7));
  if (!user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 30), 100);
  const offset = Number(searchParams.get('offset') || 0);
  const context = searchParams.get('context');

  let query = supabase
    .from('mail_compose')
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
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0 });
}
