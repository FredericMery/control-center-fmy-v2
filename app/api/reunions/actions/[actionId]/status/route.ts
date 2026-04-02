import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ actionId: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { actionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: 'todo' | 'in_progress' | 'done' | 'late';
    updatedBy?: string;
  };

  const newStatus = body.status;
  if (!newStatus) return NextResponse.json({ error: 'status requis' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  const { data: current, error: currentError } = await supabase
    .from('mod_reunion_actions')
    .select('id,status')
    .eq('id', actionId)
    .eq('user_id', userId)
    .single();

  if (currentError || !current) {
    return NextResponse.json({ error: currentError?.message || 'Action introuvable' }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('mod_reunion_actions')
    .update({ status: newStatus })
    .eq('id', actionId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from('mod_reunion_action_logs').insert({
    user_id: userId,
    action_id: actionId,
    previous_status: current.status,
    new_status: newStatus,
    updated_by: String(body.updatedBy || userId),
  });

  return NextResponse.json({ action: updated });
}
