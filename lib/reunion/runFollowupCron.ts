import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendMeetingReminderEmail } from '@/lib/email/reunionEmails';
import { generateFollowups } from '@/lib/reunion/followupService';

export function isReunionCronAuthorized(request: NextRequest): boolean {
  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader === '1') return true;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return Boolean(process.env.REUNION_FOLLOWUP_CRON_SECRET && token === process.env.REUNION_FOLLOWUP_CRON_SECRET);
}

export async function runReunionFollowupCron(request: NextRequest, type: 'daily' | 'weekly') {
  if (!isReunionCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const followups = await generateFollowups({ type });
  const supabase = getSupabaseAdminClient();

  const report: Array<{ meetingId: string; sent: boolean; reason?: string }> = [];
  const groupedCriticalByUser = new Map<
    string,
    { lateActions: number; meetings: number }
  >();

  for (const row of followups) {
    if (row.lateCount > 0) {
      const current = groupedCriticalByUser.get(row.userId) || { lateActions: 0, meetings: 0 };
      groupedCriticalByUser.set(row.userId, {
        lateActions: current.lateActions + row.lateCount,
        meetings: current.meetings + 1,
      });
    }

    const { data: participants } = await supabase
      .from('mod_reunion_participants')
      .select('email')
      .eq('meeting_id', row.meetingId)
      .eq('user_id', row.userId)
      .not('email', 'is', null);

    const recipients = (participants || [])
      .map((p) => String(p.email || '').trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      report.push({ meetingId: row.meetingId, sent: false, reason: 'no-recipients' });
      continue;
    }

    try {
      await sendMeetingReminderEmail({
        to: recipients,
        subjectLabel: 'Suivi actions',
        message: row.content,
      });
      report.push({ meetingId: row.meetingId, sent: true });
    } catch (error) {
      report.push({
        meetingId: row.meetingId,
        sent: false,
        reason: error instanceof Error ? error.message : 'send-failed',
      });
    }
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  for (const [userId, value] of groupedCriticalByUser.entries()) {
    const refKey = `reunion-critical-${type}-${dayKey}`;
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('ref_key', refKey)
      .limit(1);

    if (existing && existing.length > 0) {
      continue;
    }

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'reunion_followup',
      ref_key: refKey,
      title: 'Suivi reunion critique',
      message: `${value.lateActions} action(s) critique(s) en retard sur ${value.meetings} reunion(s).`,
      read: false,
    });
  }

  return NextResponse.json({ ok: true, type, count: followups.length, report });
}
