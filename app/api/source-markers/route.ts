import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const sourceType = String(request.nextUrl.searchParams.get('source_type') || '').trim();
  const sourceId = String(request.nextUrl.searchParams.get('source_id') || '').trim();

  if (!sourceType || !sourceId) {
    return NextResponse.json({ error: 'source_type et source_id requis' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('source_action_markers')
    .select('id,action_type,action_label,action_comment,created_at')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ markers: data || [] });
}
