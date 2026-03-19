import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

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
