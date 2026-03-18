import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateScheduleProposal } from '@/lib/calendar/aiScheduler';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const prompt = String(body?.prompt || '').trim();
    const periodStartAt = body?.period?.startAt ? String(body.period.startAt) : null;
    const periodEndAt = body?.period?.endAt ? String(body.period.endAt) : null;
    const durationMinutes = Number(body?.durationMinutes || 0) || null;
    const participants = Array.isArray(body?.participants)
      ? body.participants.map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean)
      : [];
    const proposalMode = String(body?.mode || 'proposal') === 'direct' ? 'direct' : 'proposal';
    const targetEventType = String(body?.eventType || 'pro') === 'perso' ? 'perso' : 'pro';

    const computedPrompt = prompt || [
      `Rendez-vous ${targetEventType}`,
      durationMinutes ? `${durationMinutes} min` : '',
      participants.length > 0 ? `avec ${participants.join(', ')}` : '',
    ].filter(Boolean).join(' ');

    if (!computedPrompt) {
      return NextResponse.json({ error: 'prompt or structured fields are required' }, { status: 400 });
    }

    const explicitRange = periodStartAt && periodEndAt
      ? { startAt: periodStartAt, endAt: periodEndAt }
      : body?.startAt && body?.endAt
        ? { startAt: String(body.startAt), endAt: String(body.endAt) }
      : undefined;

    const { intent, proposal } = await generateScheduleProposal(userId, computedPrompt, explicitRange);

    const intentWithOverrides = {
      ...intent,
      durationMinutes: durationMinutes || intent.durationMinutes,
      attendees: participants.length > 0 ? participants : intent.attendees,
      dateRange: explicitRange || intent.dateRange,
      category: targetEventType,
    };

    const topSlots = (proposal.rankedSlots || []).slice(0, 3);

    const { data, error } = await supabase
      .from('scheduling_requests')
      .insert({
        user_id: userId,
        request_text: computedPrompt,
        parsed_intent: intentWithOverrides,
        requested_duration_minutes: intentWithOverrides.durationMinutes,
        requested_date_range: intentWithOverrides.dateRange,
        requested_attendees: intentWithOverrides.attendees,
        proposed_slots: topSlots,
        status: 'proposed',
        workflow_status: 'created',
        progression: 20,
        proposal_mode: proposalMode,
        target_event_type: targetEventType,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      requestId: data.id,
      intent: intentWithOverrides,
      proposal: {
        ...proposal,
        rankedSlots: topSlots,
      },
      mode: proposalMode,
      targetEventType,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
