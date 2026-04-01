import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const sourceType = String(request.nextUrl.searchParams.get('source_type') || '').trim();
  const sourceId = String(request.nextUrl.searchParams.get('source_id') || '').trim();
  const sourceIdsRaw = String(request.nextUrl.searchParams.get('source_ids') || '').trim();

  if (!sourceType || (!sourceId && !sourceIdsRaw)) {
    return NextResponse.json({ error: 'source_type et source_id/source_ids requis' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  if (sourceIdsRaw) {
    const sourceIds = sourceIdsRaw
      .split(',')
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, 100);

    if (sourceIds.length === 0) {
      return NextResponse.json({ markersBySource: {} });
    }

    const { data, error } = await supabase
      .from('source_action_markers')
      .select('id,source_id,action_type,action_label,action_comment,created_at')
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .in('source_id', sourceIds)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const markersBySource: Record<string, Array<{
      id: string;
      action_type: string;
      action_label: string;
      action_comment: string;
      created_at: string;
    }>> = {};

    for (const source of sourceIds) {
      markersBySource[source] = [];
    }

    for (const row of data || []) {
      const key = String(row.source_id || '');
      if (!key) continue;
      if (!markersBySource[key]) markersBySource[key] = [];
      markersBySource[key].push({
        id: String(row.id || ''),
        action_type: String(row.action_type || ''),
        action_label: String(row.action_label || ''),
        action_comment: String(row.action_comment || ''),
        created_at: String(row.created_at || ''),
      });
    }

    return NextResponse.json({ markersBySource });
  }

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
