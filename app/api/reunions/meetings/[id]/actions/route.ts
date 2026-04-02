import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    assigned_to?: string;
    assigned_email?: string;
    deadline?: string;
    priority?: 'low' | 'medium' | 'high';
    status?: 'todo' | 'in_progress' | 'done' | 'late';
    ai_score_importance?: number;
    ai_score_urgency?: number;
  };

  const title = String(body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mod_reunion_actions')
    .insert({
      user_id: userId,
      meeting_id: id,
      title,
      description: String(body.description || '').trim(),
      assigned_to: String(body.assigned_to || '').trim() || null,
      assigned_email: String(body.assigned_email || '').trim() || null,
      deadline: String(body.deadline || '').trim() || null,
      priority: body.priority || 'medium',
      status: body.status || 'todo',
      ai_score_importance: Math.max(1, Math.min(10, Number(body.ai_score_importance) || 5)),
      ai_score_urgency: Math.max(1, Math.min(10, Number(body.ai_score_urgency) || 5)),
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('mod_reunion_action_logs').insert({
    user_id: userId,
    action_id: data.id,
    previous_status: null,
    new_status: data.status,
    updated_by: userId,
  });

  return NextResponse.json({ action: data });
}
