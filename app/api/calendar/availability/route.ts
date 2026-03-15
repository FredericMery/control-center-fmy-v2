import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFreeSlots, getSchedulingPreferences, rankSlots } from '@/lib/calendar/availability';
import { ParsedSchedulingIntent } from '@/lib/calendar/types';

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
    const startAt = String(body?.startAt || '');
    const endAt = String(body?.endAt || '');
    const durationMinutes = Number(body?.durationMinutes || 60);

    if (!startAt || !endAt) {
      return NextResponse.json({ error: 'startAt and endAt are required' }, { status: 400 });
    }

    const preferences = await getSchedulingPreferences(userId);
    const slots = await getFreeSlots(userId, { startAt, endAt }, preferences, durationMinutes);

    const intent: ParsedSchedulingIntent = {
      requestText: 'Availability query',
      titleSuggestion: 'Availability query',
      attendees: [],
      durationMinutes,
      dateRange: { startAt, endAt },
      hardConstraints: [],
      softPreferences: [],
      targetSourceProvider: 'hplus',
    };

    const ranked = rankSlots(slots, intent, preferences).slice(0, 100);

    return NextResponse.json({ slots: ranked, preferences });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
