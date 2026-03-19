import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();

  const [
    { count: total },
    { count: toReply },
    { count: drafts },
    { count: sent },
    { count: archived },
    { data: latest },
  ] = await Promise.all([
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('ai_action', 'repondre').eq('response_required', true).is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('response_status', 'draft_ready').is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('response_status', 'sent').is('deleted_at', null),
    supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('archived', true).is('deleted_at', null),
    supabase
      .from('email_messages')
      .select('id,subject,sender_email,received_at,ai_action,response_status')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  return NextResponse.json({
    stats: {
      total: total || 0,
      to_reply: toReply || 0,
      drafts_ready: drafts || 0,
      sent: sent || 0,
      archived: archived || 0,
    },
    latest: latest || [],
  });
}
