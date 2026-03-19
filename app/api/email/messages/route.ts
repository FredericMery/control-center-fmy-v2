import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const { searchParams } = new URL(request.url);
  const action = String(searchParams.get('action') || 'all');
  const responseStatus = String(searchParams.get('response_status') || 'all');
  const archived = searchParams.get('archived');
  const search = String(searchParams.get('search') || '').trim();
  const limit = Math.min(Number(searchParams.get('limit') || 60), 200);

  let query = supabase
    .from('email_messages')
    .select('*, email_reply_drafts(*)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('received_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action !== 'all') query = query.eq('ai_action', action);
  if (responseStatus !== 'all') query = query.eq('response_status', responseStatus);
  if (archived === '1') query = query.eq('archived', true);
  if (archived === '0') query = query.eq('archived', false);
  if (search) {
    query = query.or(
      `subject.ilike.%${search}%,sender_email.ilike.%${search}%,sender_name.ilike.%${search}%,ai_summary.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}
