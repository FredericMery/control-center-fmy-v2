import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const me = String(searchParams.get('me') || '').trim().toLowerCase();

  const [
    { count: total },
    { count: toReply },
    { count: drafts },
    { count: sent },
    { count: archived },
    inboundRowsResult,
    { data: latest },
  ] = await Promise.all([
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('ai_action', 'repondre').eq('response_required', true).is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('response_status', 'draft_ready').is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('response_status', 'sent').is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('archived', true).is('deleted_at', null),
    me
      ? supabase
          .from('email_messages')
          .select('to_emails,cc_emails')
          .eq('user_id', userId)
          .eq('direction', 'inbound')
          .is('deleted_at', null)
      : Promise.resolve({ data: [] } as { data: Array<{ to_emails?: string[] | null; cc_emails?: string[] | null }> | null }),
    supabase
      .from('email_messages')
      .select('id,subject,sender_email,received_at,ai_action,response_status')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  const inboundRows = (inboundRowsResult.data || []) as Array<{ to_emails?: string[] | null; cc_emails?: string[] | null }>;
  const addressedToMe = me
    ? inboundRows.filter((row) => includesEmail(row.to_emails, me)).length
    : 0;
  const copiedMe = me
    ? inboundRows.filter((row) => includesEmail(row.cc_emails, me)).length
    : 0;

  return NextResponse.json({
    stats: {
      total: total || 0,
      to_reply: toReply || 0,
      drafts_ready: drafts || 0,
      sent: sent || 0,
      archived: archived || 0,
      addressed_to_me: addressedToMe || 0,
      copied_me: copiedMe || 0,
    },
    latest: latest || [],
  });
}

function includesEmail(values: string[] | null | undefined, target: string): boolean {
  if (!Array.isArray(values) || !target) return false;
  const normalizedTarget = target.trim().toLowerCase();
  return values.some((entry) => String(entry || '').trim().toLowerCase() === normalizedTarget);
}
