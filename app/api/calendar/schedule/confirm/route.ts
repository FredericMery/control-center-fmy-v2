import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMicrosoftEvent } from '@/lib/calendar/connectors/microsoft';
import { createInternalEvent } from '@/lib/calendar/eventService';

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
    type ParsedIntentPayload = {
      titleSuggestion?: string;
      attendees?: string[];
      requestText?: string;
    };

    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const requestId = String(body?.requestId || '');
    const slot = body?.slot;

    if (!requestId || !slot?.startAt || !slot?.endAt) {
      return NextResponse.json({ error: 'requestId and slot are required' }, { status: 400 });
    }

    const { data: reqData, error: reqError } = await supabase
      .from('scheduling_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', userId)
      .maybeSingle();

    if (reqError) throw new Error(reqError.message);
    if (!reqData) return NextResponse.json({ error: 'Scheduling request not found' }, { status: 404 });

    const parsedIntent = (reqData.parsed_intent || {}) as ParsedIntentPayload;
    const title = String(parsedIntent.titleSuggestion || 'Meeting');
    const participants = Array.isArray(parsedIntent.attendees)
      ? parsedIntent.attendees
      : [];

    const { data: source } = await supabase
      .from('calendar_sources')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .eq('is_enabled', true)
      .order('updated_at', { ascending: false })
      .maybeSingle();

    if (source?.access_token) {
      await createMicrosoftEvent({
        accessToken: source.access_token,
        calendarId: source.external_calendar_id || undefined,
        title,
        startAt: String(slot.startAt),
        endAt: String(slot.endAt),
        timezone: 'Europe/Paris',
        attendees: participants.map((email: string) => ({ email })),
        description: String(parsedIntent.requestText || ''),
      });
    }

    const internalEvent = await createInternalEvent(userId, {
      user_id: userId,
      source_provider: 'hplus',
      title,
      description: String(parsedIntent.requestText || ''),
      start_at: String(slot.startAt),
      end_at: String(slot.endAt),
      timezone: 'Europe/Paris',
      attendees: participants.map((email: string) => ({ email })),
      is_blocking: true,
      status: 'confirmed',
      created_by_ai: true,
      raw_payload: { requestId },
    });

    await supabase
      .from('scheduling_requests')
      .update({
        selected_slot: slot,
        status: 'confirmed',
        linked_event_id: internalEvent.id,
      })
      .eq('id', requestId)
      .eq('user_id', userId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
