import { createClient } from '@supabase/supabase-js';
import { mapProviderEventToNormalized, upsertNormalizedEvents } from '@/lib/calendar/eventService';
import { CalendarSource } from '@/lib/calendar/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BLACKWAVES_TABLE = process.env.BLACKWAVES_EVENTS_TABLE || 'blackwaves_events';

type BlackwavesRow = {
  id: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  timezone?: string | null;
  status?: string | null;
  category?: string | null;
  organizer_email?: string | null;
  meeting_url?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
};

export async function ensureBlackwavesSource(userId: string): Promise<CalendarSource> {
  const { data: existing } = await supabase
    .from('calendar_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'blackwaves')
    .maybeSingle();

  if (existing) return existing as CalendarSource;

  const { data, error } = await supabase
    .from('calendar_sources')
    .insert({
      user_id: userId,
      provider: 'blackwaves',
      label: 'BlackWaves',
      sync_mode: 'read',
      is_enabled: true,
      metadata: { table: BLACKWAVES_TABLE },
    })
    .select('*')
    .single();

  if (error) throw new Error(`Unable to create BlackWaves source: ${error.message}`);
  return data as CalendarSource;
}

export function mapBlackwavesEventToNormalizedEvent(args: {
  userId: string;
  sourceId: string;
  row: BlackwavesRow;
}) {
  const { userId, sourceId, row } = args;

  return mapProviderEventToNormalized({
    userId,
    sourceId,
    sourceProvider: 'blackwaves',
    sourceEventId: String(row.id),
    payload: {
      title: row.title || 'BlackWaves Event',
      description: row.description,
      location: row.location,
      start_at: row.start_at,
      end_at: row.end_at,
      timezone: row.timezone || 'Europe/Paris',
      status: row.status || 'confirmed',
      category: row.category || 'blackwaves',
      organizer_email: row.organizer_email,
      meeting_url: row.meeting_url,
      external_etag: row.updated_at,
      raw: row,
    },
    defaults: {
      is_read_only: true,
      is_blocking: true,
      event_type: 'competition',
      priority: 2,
      category: row.category || 'blackwaves',
    },
  });
}

export async function upsertBlackwavesEvents(userId: string, sourceId: string, rows: BlackwavesRow[]) {
  const normalized = rows.map((row) => mapBlackwavesEventToNormalizedEvent({ userId, sourceId, row }));
  return upsertNormalizedEvents(normalized);
}

export async function syncBlackwavesCalendar(userId: string) {
  const source = await ensureBlackwavesSource(userId);

  const syncRun = await supabase
    .from('calendar_sync_runs')
    .insert({ source_id: source.id, status: 'running' })
    .select('id')
    .single();

  const syncRunId = syncRun.data?.id;

  try {
    const { data: rows, error } = await supabase
      .from(BLACKWAVES_TABLE)
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`BlackWaves table read failed (${BLACKWAVES_TABLE}): ${error.message}`);
    }

    const activeRows = (rows || []).filter((row: BlackwavesRow) => !row.deleted_at);
    const result = await upsertBlackwavesEvents(userId, source.id, activeRows as BlackwavesRow[]);

    await supabase
      .from('calendar_sources')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
      })
      .eq('id', source.id);

    if (syncRunId) {
      await supabase
        .from('calendar_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'success',
          items_created: result.created,
          items_updated: result.updated,
          items_skipped: result.skipped,
        })
        .eq('id', syncRunId);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BlackWaves sync error';

    await supabase
      .from('calendar_sources')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        last_sync_error: message,
      })
      .eq('id', source.id);

    if (syncRunId) {
      await supabase
        .from('calendar_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          error_message: message,
        })
        .eq('id', syncRunId);
    }

    throw error;
  }
}
