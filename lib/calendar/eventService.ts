import { createClient } from '@supabase/supabase-js';
import { CalendarEvent, CalendarEventInput, NormalizedEvent } from '@/lib/calendar/types';
import { normalizeProviderEvent } from '@/lib/calendar/normalizer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function upsertNormalizedEvents(events: NormalizedEvent[]): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  if (events.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const { error } = await supabase.from('calendar_events').upsert(events, {
    onConflict: 'source_provider,source_event_id,user_id',
  });

  if (error) {
    throw new Error(`Failed to upsert normalized events: ${error.message}`);
  }

  return { created: events.length, updated: 0, skipped: 0 };
}

export async function listCalendarEvents(args: {
  userId: string;
  startAt: string;
  endAt: string;
  sourceProviders?: string[];
  status?: string[];
  category?: string;
}): Promise<CalendarEvent[]> {
  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', args.userId)
    .is('deleted_at', null)
    .gte('start_at', args.startAt)
    .lte('end_at', args.endAt)
    .order('start_at', { ascending: true });

  if (args.sourceProviders && args.sourceProviders.length > 0) {
    query = query.in('source_provider', args.sourceProviders);
  }
  if (args.status && args.status.length > 0) {
    query = query.in('status', args.status);
  }
  if (args.category) {
    query = query.eq('category', args.category);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as CalendarEvent[];
}

export async function createInternalEvent(userId: string, input: CalendarEventInput): Promise<CalendarEvent> {
  const payload: CalendarEventInput = {
    ...input,
    user_id: userId,
    source_provider: 'hplus',
    source_id: input.source_id ?? null,
    is_read_only: false,
    raw_payload: input.raw_payload || {},
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as CalendarEvent;
}

export async function updateInternalEvent(userId: string, eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarEvent> {
  const { data: current, error: currentError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (currentError || !current) {
    throw new Error('Event not found');
  }

  if (current.source_provider !== 'hplus') {
    throw new Error('Only internal events can be directly updated here');
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as CalendarEvent;
}

export async function deleteInternalEvent(userId: string, eventId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('calendar_events')
    .select('source_provider')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (currentError || !current) {
    throw new Error('Event not found');
  }

  if (current.source_provider !== 'hplus') {
    throw new Error('Only internal events can be deleted here');
  }

  const { error } = await supabase
    .from('calendar_events')
    .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
    .eq('id', eventId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function duplicateInternalEvent(userId: string, eventId: string): Promise<CalendarEvent> {
  const { data: source, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single();

  if (error || !source) throw new Error('Event not found');

  const start = new Date(source.start_at);
  const end = new Date(source.end_at);
  start.setDate(start.getDate() + 7);
  end.setDate(end.getDate() + 7);

  return createInternalEvent(userId, {
    ...source,
    title: `${source.title} (copie)`,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    source_provider: 'hplus',
    source_event_id: null,
  });
}

export function mapProviderEventToNormalized(args: {
  userId: string;
  sourceId: string | null;
  sourceProvider: NormalizedEvent['source_provider'];
  sourceEventId: string;
  payload: Record<string, unknown>;
  defaults?: Partial<NormalizedEvent>;
}): NormalizedEvent {
  return normalizeProviderEvent(args);
}
