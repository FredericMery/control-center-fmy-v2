import { createClient } from '@supabase/supabase-js';
import { BusyBlock, DateRange, ParsedSchedulingIntent, RankedSlot, SchedulingPreferences } from '@/lib/calendar/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sanitizeCalendarEventTitle(value: unknown): string {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  let title = raw;
  for (let i = 0; i < 5; i += 1) {
    const next = title.replace(/^\s*(re|fwd?|tr)\s*:\s*/i, '').trim();
    if (next === title) break;
    title = next;
  }

  const invitationMatch = title.match(/invitation\s+a\s+l[’']?evenement\s+suivant\s*[:\-]\s*(.+)$/i);
  if (invitationMatch?.[1]) {
    title = invitationMatch[1].trim();
  }

  const modifiedMatch = title.match(/l[’']?evenement\s+(.+?)\s+a\s+ete\s+modifie/i);
  if (modifiedMatch?.[1]) {
    title = modifiedMatch[1].trim();
  }

  return title.replace(/^[-:\s]+|[-:\s]+$/g, '').trim();
}

function toDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date value');
  return d;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseTimeOnDate(date: Date, time: string): Date {
  const [hh, mm] = String(time || '00:00').split(':').map((v) => Number(v));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hh || 0, mm || 0, 0, 0));
}

export async function getSchedulingPreferences(userId: string): Promise<SchedulingPreferences> {
  const { data } = await supabase
    .from('scheduling_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return data as SchedulingPreferences;

  return {
    user_id: userId,
    day_start_time: '09:00:00',
    day_end_time: '18:00:00',
    lunch_start_time: '12:30:00',
    lunch_end_time: '13:30:00',
    minimum_buffer_minutes: 15,
    max_meetings_per_day: 6,
    default_meeting_duration_minutes: 60,
    allow_meetings_on_weekends: false,
    preferred_focus_blocks: [],
    protected_time_blocks: [],
    preferred_meeting_windows: [],
    avoid_back_to_back: true,
    timezone: 'Europe/Paris',
    metadata: {},
  };
}

export async function getBusyBlocks(userId: string, range: DateRange): Promise<BusyBlock[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, start_at, end_at, title, is_blocking, status')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('status', ['confirmed', 'tentative'])
    .eq('is_blocking', true)
    .lt('start_at', range.endAt)
    .gt('end_at', range.startAt)
    .order('start_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    startAt: String(row.start_at),
    endAt: String(row.end_at),
    sourceEventId: String(row.id),
    label: sanitizeCalendarEventTitle(row.title) || String(row.title || ''),
  }));
}

export function mergeBusyBlocks(blocks: BusyBlock[]): BusyBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime());
  const merged: BusyBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (toDate(current.startAt).getTime() <= toDate(last.endAt).getTime()) {
      if (toDate(current.endAt).getTime() > toDate(last.endAt).getTime()) {
        last.endAt = current.endAt;
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function applyBuffers(blocks: BusyBlock[], preferences: SchedulingPreferences): BusyBlock[] {
  const buffer = Math.max(0, Number(preferences.minimum_buffer_minutes || 0));
  if (buffer === 0) return blocks;

  return blocks.map((block) => ({
    ...block,
    startAt: addMinutes(toDate(block.startAt), -buffer).toISOString(),
    endAt: addMinutes(toDate(block.endAt), buffer).toISOString(),
  }));
}

function includeProtectedAndLunchBlocks(
  range: DateRange,
  preferences: SchedulingPreferences,
  blocks: BusyBlock[]
): BusyBlock[] {
  const start = toDate(range.startAt);
  const end = toDate(range.endAt);
  const output = [...blocks];

  for (let d = new Date(start); d < end; d = addMinutes(d, 24 * 60)) {
    const dayStart = parseTimeOnDate(d, String(preferences.day_start_time).slice(0, 5));
    const dayEnd = parseTimeOnDate(d, String(preferences.day_end_time).slice(0, 5));

    if (preferences.lunch_start_time && preferences.lunch_end_time) {
      output.push({
        startAt: parseTimeOnDate(d, String(preferences.lunch_start_time).slice(0, 5)).toISOString(),
        endAt: parseTimeOnDate(d, String(preferences.lunch_end_time).slice(0, 5)).toISOString(),
        isProtected: true,
        label: 'Lunch break',
      });
    }

    const protectedBlocks = Array.isArray(preferences.protected_time_blocks)
      ? preferences.protected_time_blocks
      : [];

    for (const block of protectedBlocks) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      const from = String(b.startTime || '');
      const to = String(b.endTime || '');
      if (!from || !to) continue;
      output.push({
        startAt: parseTimeOnDate(d, from).toISOString(),
        endAt: parseTimeOnDate(d, to).toISOString(),
        isProtected: true,
        label: String(b.label || 'Protected block'),
      });
    }

    output.push({
      startAt: addMinutes(dayStart, -24 * 60).toISOString(),
      endAt: dayStart.toISOString(),
      isProtected: true,
      label: 'Outside working hours',
    });
    output.push({
      startAt: dayEnd.toISOString(),
      endAt: addMinutes(dayEnd, 24 * 60).toISOString(),
      isProtected: true,
      label: 'Outside working hours',
    });
  }

  return output;
}

export async function getFreeSlots(
  userId: string,
  range: DateRange,
  preferences: SchedulingPreferences,
  durationMinutes = 60
): Promise<RankedSlot[]> {
  const busy = await getBusyBlocks(userId, range);
  const withBuffers = applyBuffers(busy, preferences);
  const augmented = includeProtectedAndLunchBlocks(range, preferences, withBuffers);
  const merged = mergeBusyBlocks(augmented);

  const rangeStart = toDate(range.startAt);
  const rangeEnd = toDate(range.endAt);

  const slots: RankedSlot[] = [];
  let cursor = rangeStart;

  for (const block of merged) {
    const blockStart = toDate(block.startAt);
    const blockEnd = toDate(block.endAt);

    if (blockStart > cursor) {
      let slotStart = new Date(cursor);
      while (addMinutes(slotStart, durationMinutes) <= blockStart) {
        slots.push({
          startAt: slotStart.toISOString(),
          endAt: addMinutes(slotStart, durationMinutes).toISOString(),
          score: 0,
          reasons: [],
        });
        slotStart = addMinutes(slotStart, 15);
      }
    }

    if (blockEnd > cursor) {
      cursor = blockEnd;
    }
  }

  while (addMinutes(cursor, durationMinutes) <= rangeEnd) {
    slots.push({
      startAt: cursor.toISOString(),
      endAt: addMinutes(cursor, durationMinutes).toISOString(),
      score: 0,
      reasons: [],
    });
    cursor = addMinutes(cursor, 15);
  }

  return slots;
}

export function rankSlots(
  slots: RankedSlot[],
  schedulingIntent: ParsedSchedulingIntent,
  preferences: SchedulingPreferences
): RankedSlot[] {
  const preferredWindows = Array.isArray(preferences.preferred_meeting_windows)
    ? preferences.preferred_meeting_windows
    : [];

  return slots
    .map((slot) => {
      const start = toDate(slot.startAt);
      let score = 100;
      const reasons: string[] = [];

      if (!preferences.allow_meetings_on_weekends) {
        const day = start.getUTCDay();
        if (day === 0 || day === 6) {
          score -= 60;
          reasons.push('Weekend penalized');
        }
      }

      const hour = start.getUTCHours();
      if (hour >= 17) {
        score -= 20;
        reasons.push('Late meeting penalty');
      }

      const hasWindowPreference = preferredWindows.some((window) => {
        if (!window || typeof window !== 'object') return false;
        const w = window as Record<string, unknown>;
        const from = String(w.startTime || '');
        const to = String(w.endTime || '');
        if (!from || !to) return false;
        const startHour = Number(from.split(':')[0]);
        const endHour = Number(to.split(':')[0]);
        return hour >= startHour && hour < endHour;
      });
      if (hasWindowPreference) {
        score += 15;
        reasons.push('Preferred window boost');
      }

      if (schedulingIntent.softPreferences.some((p) => p.toLowerCase().includes('matin')) && hour < 12) {
        score += 10;
        reasons.push('Morning preference boost');
      }

      return { ...slot, score, reasons };
    })
    .sort((a, b) => b.score - a.score || toDate(a.startAt).getTime() - toDate(b.startAt).getTime());
}
