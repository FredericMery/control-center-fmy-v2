import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createInternalEvent, listCalendarEvents } from '@/lib/calendar/eventService';
import { getProfessionalEmailsForUser, inferPlannerTypeFromOrganizer } from '@/lib/calendar/plannerType';

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

    const { searchParams } = new URL(request.url);
    const startAt = searchParams.get('startAt');
    const endAt = searchParams.get('endAt');
    const category = searchParams.get('category') || undefined;
    const plannerType = searchParams.get('plannerType') as 'pro' | 'perso' | null;
    const sourceProviders = (searchParams.get('sourceProviders') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const statuses = (searchParams.get('statuses') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (!startAt || !endAt) {
      return NextResponse.json({ error: 'startAt and endAt are required' }, { status: 400 });
    }

    const events = await listCalendarEvents({
      userId,
      startAt,
      endAt,
      category,
      sourceProviders,
      status: statuses,
    });
    const professionalEmails = await getProfessionalEmailsForUser(supabase, userId);

    const taggedEvents = events.map((event) => {
      const computedPlannerType =
        (event as { planner_type?: 'pro' | 'perso' | null }).planner_type ||
        inferPlannerTypeFromOrganizer(event.organizer_email, professionalEmails);
      return {
        ...event,
        planner_type: computedPlannerType,
      };
    });

    const filtered = plannerType
      ? taggedEvents.filter((event) => event.planner_type === plannerType)
      : taggedEvents;

    return NextResponse.json({ events: filtered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const event = body?.event;

    if (!event) {
      return NextResponse.json({ error: 'event is required' }, { status: 400 });
    }

    const requestedType = String(event.type || event.planner_type || '').toLowerCase();
    const plannerType: 'pro' | 'perso' = requestedType === 'pro' ? 'pro' : 'perso';
    const professionalEmails = await getProfessionalEmailsForUser(supabase, userId);
    const professionalEmail = professionalEmails[0] || null;

    const created = await createInternalEvent(userId, {
      user_id: userId,
      source_provider: 'hplus',
      title: String(event.title || 'Meeting'),
      description: event.description ? String(event.description) : null,
      location: event.location ? String(event.location) : null,
      start_at: String(event.startAt || event.start_at),
      end_at: String(event.endAt || event.end_at),
      timezone: String(event.timezone || 'Europe/Paris'),
      attendees: Array.isArray(event.attendees) ? event.attendees : [],
      is_blocking: event.isBlocking ?? true,
      status: event.status || 'confirmed',
      organizer_email: event.organizer_email ? String(event.organizer_email) : plannerType === 'pro' ? professionalEmail : null,
      category: plannerType,
      event_type: plannerType === 'pro' ? 'meeting' : 'personal',
      raw_payload: {
        ...event,
        planner_type: plannerType,
      },
    });

    return NextResponse.json({ ok: true, event: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
