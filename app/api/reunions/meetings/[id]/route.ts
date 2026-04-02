import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await context.params;
  const supabase = getSupabaseAdminClient();

  const [{ data: meeting, error: meetingError }, { data: participants }, { data: records }, { data: actions }] = await Promise.all([
    supabase
      .from('mod_reunion_meetings')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('mod_reunion_participants')
      .select('*')
      .eq('meeting_id', id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('mod_reunion_records')
      .select('*')
      .eq('meeting_id', id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mod_reunion_actions')
      .select('*')
      .eq('meeting_id', id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (meetingError) return NextResponse.json({ error: meetingError.message }, { status: 404 });

  return NextResponse.json({
    meeting,
    participants: participants || [],
    records: records || [],
    actions: actions || [],
  });
}
