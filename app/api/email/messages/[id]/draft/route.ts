import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { generateReplySuggestionWithAi } from '@/lib/email/assistantService';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const tone = String(body.tone || 'professionnel');

  const supabase = getSupabaseAdminClient();

  const { data: message, error: messageError } = await supabase
    .from('email_messages')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (messageError || !message) {
    return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
  }

  const reply = await generateReplySuggestionWithAi({
    userId,
    senderEmail: String(message.sender_email || ''),
    senderName: String(message.sender_name || ''),
    originalSubject: String(message.subject || ''),
    originalBody: String(message.body_text || message.body_html || ''),
    summary: String(message.ai_summary || ''),
    tone,
  });

  const { data: lastDraft } = await supabase
    .from('email_reply_drafts')
    .select('version')
    .eq('message_id', id)
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = Number(lastDraft?.version || 0) + 1;

  await supabase
    .from('email_reply_drafts')
    .update({ is_current: false })
    .eq('message_id', id)
    .eq('user_id', userId)
    .eq('is_current', true);

  const { data: draft, error: draftError } = await supabase
    .from('email_reply_drafts')
    .insert({
      message_id: id,
      user_id: userId,
      version: nextVersion,
      is_current: true,
      tone,
      language: 'fr',
      proposed_subject: reply.subject,
      proposed_body: reply.body,
      ai_model: 'gpt-4.1-mini',
      ai_confidence: reply.confidence,
      edited_by_user: false,
    })
    .select('*')
    .single();

  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });

  await supabase
    .from('email_messages')
    .update({
      response_status: 'draft_ready',
      response_required: true,
      ai_action: 'repondre',
      ai_status: 'analyzed',
    })
    .eq('id', id)
    .eq('user_id', userId);

  return NextResponse.json({ draft });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { subject?: string; body?: string }
    | null;
  if (!body) return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  const { data: currentDraft } = await supabase
    .from('email_reply_drafts')
    .select('*')
    .eq('message_id', id)
    .eq('user_id', userId)
    .eq('is_current', true)
    .maybeSingle();

  if (!currentDraft) {
    return NextResponse.json({ error: 'Aucun brouillon courant' }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from('email_reply_drafts')
    .update({
      proposed_subject: String(body.subject || currentDraft.proposed_subject || ''),
      proposed_body: String(body.body || currentDraft.proposed_body || ''),
      edited_by_user: true,
    })
    .eq('id', currentDraft.id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ draft: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('email_reply_drafts')
    .delete()
    .eq('message_id', id)
    .eq('user_id', userId)
    .eq('is_current', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from('email_messages')
    .update({ response_status: 'cancelled', response_required: false })
    .eq('id', id)
    .eq('user_id', userId);

  return NextResponse.json({ success: true });
}
