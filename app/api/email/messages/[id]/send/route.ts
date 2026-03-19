import { NextRequest, NextResponse } from 'next/server';
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
  if (!message.sender_email) {
    return NextResponse.json({ error: 'Destinataire email introuvable' }, { status: 400 });
  }

  const finalSubject = String(payload.subject || draft.proposed_subject || message.subject || 'Reponse');
  const finalBody = String(payload.body || draft.proposed_body || '').trim();

  if (!finalBody) {
    return NextResponse.json({ error: 'Le contenu de reponse est vide' }, { status: 400 });
  }

  const sent = await sendPreparedReplyEmail({
    to: String(message.sender_email),
    cc: Array.isArray(message.cc_emails) ? (message.cc_emails as string[]) : [],
    subject: finalSubject,
    body: finalBody,
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
          to: message.sender_email,
          subject: finalSubject,
          provider_message_id: providerMessageId || null,
        },
      }),
  ]);

  return NextResponse.json({
    success: true,
    provider_message_id: providerMessageId || null,
  });
}
