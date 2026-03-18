function getPartsInTimeZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 0);

  return { year, month, day };
}

function parseOffsetMinutes(offsetLabel: string): number {
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const offset = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';
  return parseOffsetMinutes(offset);
}

export function zonedDateTimeToUtcIso(dayKey: string, hhmm: string, timeZone: string): string {
  const [year, month, day] = dayKey.split('-').map((value) => Number(value));
  const [hour, minute] = hhmm.split(':').map((value) => Number(value));

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  const utcDate = new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
  return utcDate.toISOString();
}

export function listDayKeysInRange(rangeStartIso: string, rangeEndIso: string, timeZone: string): string[] {
  const start = new Date(rangeStartIso);
  const end = new Date(rangeEndIso);
  const keys = new Set<string>();

  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    const parts = getPartsInTimeZone(cursor, timeZone);
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    keys.add(key);
  }

  return [...keys].sort();
}
