import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendMeetingSummaryEmail } from '@/lib/email/reunionEmails';
import {
  cleanTranscriptWithAi,
  computeMeetingOptimizationWithAi,
  extractActionsWithAi,
  parseMeetingPromptWithAi,
  understandMeetingWithAi,
} from '@/lib/reunion/aiService';
import { buildMeetingJoinPath, createMeetingJoinToken } from '@/lib/reunion/token';

export async function createMeetingFromPrompt(args: {
  userId: string;
  prompt: string;
  createdBy: string;
  baseUrl: string;
}) {
  const supabase = getSupabaseAdminClient();
  const parsed = await parseMeetingPromptWithAi({ userId: args.userId, prompt: args.prompt });
  const token = createMeetingJoinToken();
  const joinPath = buildMeetingJoinPath(token.rawToken);

  const { data: meeting, error } = await supabase
    .from('mod_reunion_meetings')
    .insert({
      user_id: args.userId,
      title: parsed.title,
      objective: parsed.objective,
      description: parsed.description,
      created_by: args.createdBy,
      meeting_date: parsed.meetingDateIso,
      status: 'planned',
      ai_generated: true,
      public_join_token_hash: token.tokenHash,
      public_join_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      public_join_path: joinPath,
    })
    .select('*')
    .single();

  if (error || !meeting?.id) {
    throw new Error(error?.message || 'Impossible de creer la reunion');
  }

  const participants = parsed.participants.map((participant) => ({
    user_id: args.userId,
    meeting_id: meeting.id,
    name: participant.name,
    email: participant.email || null,
    role: 'participant',
    source: 'ai',
  }));

  if (participants.length > 0) {
    await supabase.from('mod_reunion_participants').insert(participants);
  }

  await supabase.from('mod_reunion_participants').insert({
    user_id: args.userId,
    meeting_id: meeting.id,
    name: 'Organisateur',
    role: 'organizer',
    source: 'manual',
  });

  return {
    meeting,
    parsed,
    joinToken: token.rawToken,
    joinPath,
    joinUrl: `${args.baseUrl}${joinPath}`,
    joinQrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(`${args.baseUrl}${joinPath}`)}`,
  };
}

export async function processMeetingRecordFromTranscript(args: {
  userId: string;
  meetingId: string;
  transcript: string;
  audioUrl?: string;
}) {
  const supabase = getSupabaseAdminClient();
  const cleaned = await cleanTranscriptWithAi({ userId: args.userId, transcript: args.transcript });
  const understanding = await understandMeetingWithAi({
    userId: args.userId,
    transcript: cleaned || args.transcript,
  });

  const actions = await extractActionsWithAi({
    userId: args.userId,
    transcript: cleaned || args.transcript,
  });

  const { data: record, error: recordError } = await supabase
    .from('mod_reunion_records')
    .insert({
      user_id: args.userId,
      meeting_id: args.meetingId,
      audio_url: args.audioUrl || null,
      transcript: args.transcript,
      cleaned_transcript: cleaned,
      ai_summary: understanding.executiveSummary,
      ai_key_points: understanding.keyPoints,
      ai_decisions: understanding.decisions,
      ai_risks: understanding.risks,
      ai_open_questions: understanding.openQuestions,
    })
    .select('*')
    .single();

  if (recordError) throw new Error(recordError.message);

  if (actions.length > 0) {
    const rows = actions.map((action) => ({
      user_id: args.userId,
      meeting_id: args.meetingId,
      title: action.title,
      description: action.description,
      assigned_to: action.assigned_to || null,
      assigned_email: action.assigned_email || null,
      deadline: action.deadline || null,
      priority: action.priority,
      status: 'todo',
      ai_score_importance: action.importance_score,
      ai_score_urgency: action.urgency_score,
    }));

    await supabase.from('mod_reunion_actions').insert(rows);
  }

  const { data: meetingActions } = await supabase
    .from('mod_reunion_actions')
    .select('id, title, assigned_to, deadline, status, priority, ai_score_importance, ai_score_urgency')
    .eq('meeting_id', args.meetingId)
    .eq('user_id', args.userId)
    .order('created_at', { ascending: false });

  const optimization = await computeMeetingOptimizationWithAi({
    userId: args.userId,
    payload: {
      summary: understanding.executiveSummary,
      actionCount: meetingActions?.length || 0,
      actions: meetingActions || [],
      decisions: understanding.decisions,
      risks: understanding.risks,
    },
  });

  const { data: meeting } = await supabase
    .from('mod_reunion_meetings')
    .select('title, meeting_date')
    .eq('id', args.meetingId)
    .eq('user_id', args.userId)
    .maybeSingle();

  const { data: participants } = await supabase
    .from('mod_reunion_participants')
    .select('email')
    .eq('meeting_id', args.meetingId)
    .eq('user_id', args.userId)
    .not('email', 'is', null);

  const recipients = (participants || [])
    .map((row) => String(row.email || '').trim())
    .filter(Boolean);

  if (meeting && recipients.length > 0) {
    try {
      await sendMeetingSummaryEmail({
        to: recipients,
        meetingTitle: String(meeting.title || 'Reunion'),
        meetingDateIso: String(meeting.meeting_date || new Date().toISOString()),
        summary: understanding.executiveSummary,
        decisions: understanding.decisions,
        actions: (meetingActions || []).map((item) => ({
          title: String(item.title || ''),
          assigned_to: String(item.assigned_to || ''),
          deadline: item.deadline ? String(item.deadline) : null,
        })),
      });
    } catch {
      // Non bloquant: la generation du compte-rendu reste prioritaire.
    }
  }

  return {
    record,
    understanding,
    extractedActions: actions,
    optimization,
  };
}
