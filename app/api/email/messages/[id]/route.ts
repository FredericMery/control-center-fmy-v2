import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
  }

  const hasBody = Boolean(String(data.body_text || '').trim() || String(data.body_html || '').trim());
  if (!hasBody && data.external_email_id && process.env.RESEND_API_KEY) {
    try {
      const received = await resend.emails.receiving.get(String(data.external_email_id));
      const receiveData = (received as { data?: Record<string, unknown> | null })?.data || null;
      const bodyText = normalizeText(receiveData?.['text'] || receiveData?.['text_body']);
      const bodyHtml = normalizeText(receiveData?.['html']);

      if (bodyText || bodyHtml) {
        const { data: refreshed } = await supabase
          .from('email_messages')
          .update({
            body_text: bodyText || null,
            body_html: bodyHtml || null,
          })
          .eq('id', id)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (refreshed) {
          return NextResponse.json({ item: refreshed });
        }
      }
    } catch (hydrateError) {
      console.warn('email message get hydrate failed', hydrateError);
    }
  }

  return NextResponse.json({ item: data });
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });

  const allowed = new Set([
    'archived',
    'ai_action',
    'ai_summary',
    'ai_reasoning',
    'ai_category',
    'ai_priority',
    'response_status',
    'response_required',
  ]);

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key)) patch[key] = value;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('email_messages')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
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
    .from('email_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
