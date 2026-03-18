import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSchedulingPreferences } from '@/lib/calendar/availability';

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

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const preferences = await getSchedulingPreferences(userId);
    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const payload = {
      user_id: userId,
      day_start_time: String(body?.day_start_time || '09:00'),
      day_end_time: String(body?.day_end_time || '18:00'),
      lunch_start_time: body?.lunch_start_time ? String(body.lunch_start_time) : null,
      lunch_end_time: body?.lunch_end_time ? String(body.lunch_end_time) : null,
      minimum_buffer_minutes: Number(body?.minimum_buffer_minutes || 15),
      max_meetings_per_day: Number(body?.max_meetings_per_day || 6),
      default_meeting_duration_minutes: Number(body?.default_meeting_duration_minutes || 60),
      allow_meetings_on_weekends: Boolean(body?.allow_meetings_on_weekends),
      preferred_focus_blocks: Array.isArray(body?.preferred_focus_blocks) ? body.preferred_focus_blocks : [],
      protected_time_blocks: Array.isArray(body?.protected_time_blocks) ? body.protected_time_blocks : [],
      preferred_meeting_windows: Array.isArray(body?.preferred_meeting_windows) ? body.preferred_meeting_windows : [],
      avoid_back_to_back: body?.avoid_back_to_back ?? true,
      timezone: String(body?.timezone || 'Europe/Paris'),
      professional_email: body?.professional_email ? String(body.professional_email).toLowerCase() : null,
      holiday_country: body?.holiday_country ? String(body.holiday_country).toUpperCase() : 'FR',
      metadata: body?.metadata || {},
    };

    const { data, error } = await supabase
      .from('scheduling_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ preferences: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
