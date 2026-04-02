import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateFollowupInsightWithAi } from '@/lib/reunion/aiService';

export async function generateFollowups(args: {
  userId?: string;
  type: 'daily' | 'weekly';
}) {
  const supabase = getSupabaseAdminClient();

  let meetingsQuery = supabase
    .from('mod_reunion_meetings')
    .select('id, user_id, title, meeting_date, status')
    .order('meeting_date', { ascending: false })
    .limit(250);

  if (args.userId) {
    meetingsQuery = meetingsQuery.eq('user_id', args.userId);
  }

  const { data: meetings, error: meetingsError } = await meetingsQuery;
  if (meetingsError) throw new Error(meetingsError.message);

  const results: Array<{
    meetingId: string;
    userId: string;
    content: string;
    lateCount: number;
  }> = [];

  for (const meeting of meetings || []) {
    const { data: actions } = await supabase
      .from('mod_reunion_actions')
      .select('id, title, assigned_to, assigned_email, status, priority, deadline')
      .eq('meeting_id', meeting.id)
      .eq('user_id', meeting.user_id);

    const now = new Date();
    const normalizedActions = (actions || []).map((row) => {
      const isLate =
        row.status !== 'done' &&
        row.deadline &&
        new Date(`${row.deadline}T23:59:59.000Z`).getTime() < now.getTime();

      return {
        ...row,
        computed_status: isLate ? 'late' : row.status,
      };
    });

    const lateCount = normalizedActions.filter((action) => action.computed_status === 'late').length;
    const inProgressCount = normalizedActions.filter((action) => action.computed_status === 'in_progress').length;
    const doneCount = normalizedActions.filter((action) => action.computed_status === 'done').length;

    const byAssignee = new Map<string, { late: number; progress: number }>();
    for (const action of normalizedActions) {
      const key = String(action.assigned_to || action.assigned_email || 'Unassigned').trim();
      const current = byAssignee.get(key) || { late: 0, progress: 0 };
      if (action.computed_status === 'late') current.late += 1;
      if (action.computed_status === 'in_progress') current.progress += 1;
      byAssignee.set(key, current);
    }

    const ai = await generateFollowupInsightWithAi({
      userId: meeting.user_id,
      payload: {
        meeting,
        totals: {
          all: normalizedActions.length,
          late: lateCount,
          inProgress: inProgressCount,
          done: doneCount,
        },
        byAssignee: Array.from(byAssignee.entries()).map(([name, value]) => ({
          name,
          lateCount: value.late,
          inProgressCount: value.progress,
        })),
      },
    });

    const completionRate = normalizedActions.length > 0
      ? Math.round((doneCount / normalizedActions.length) * 100)
      : 0;

    const content = [
      ai.summary || 'Suivi automatique de reunion.',
      `${lateCount} action(s) en retard.`,
      `${inProgressCount} action(s) en cours.`,
      `Taux de completion: ${completionRate}%`,
    ].join(' ');

    await supabase.from('mod_reunion_followups').insert({
      user_id: meeting.user_id,
      meeting_id: meeting.id,
      type: args.type,
      content,
    });

    results.push({
      meetingId: String(meeting.id),
      userId: String(meeting.user_id),
      content,
      lateCount,
    });
  }

  return results;
}
