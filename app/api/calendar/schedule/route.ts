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

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const explicitRange = body?.startAt && body?.endAt
      ? { startAt: String(body.startAt), endAt: String(body.endAt) }
      : undefined;

    const { intent, proposal } = await generateScheduleProposal(userId, prompt, explicitRange);

    const { data, error } = await supabase
      .from('scheduling_requests')
      .insert({
        user_id: userId,
        request_text: prompt,
        parsed_intent: intent,
        requested_duration_minutes: intent.durationMinutes,
        requested_date_range: intent.dateRange,
        requested_attendees: intent.attendees,
        proposed_slots: proposal.rankedSlots,
        status: 'proposed',
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ requestId: data.id, intent, proposal });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
