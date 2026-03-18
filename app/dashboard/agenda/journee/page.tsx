"use client";

import { useEffect, useMemo, useState } from 'react';
import AgendaNav from '@/components/agenda/AgendaNav';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type EventItem = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  planner_type?: 'pro' | 'perso';
};

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function toKey(date: Date): string {
  return formatDateInput(date);
}

function isFrenchHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const easter = getEasterSunday(year);

  const fixed = new Set([
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-05-08`,
    `${year}-07-14`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);

  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  const pentecostMonday = new Date(easter);
  pentecostMonday.setDate(pentecostMonday.getDate() + 50);

  fixed.add(toKey(easterMonday));
  fixed.add(toKey(ascension));
  fixed.add(toKey(pentecostMonday));

  return fixed.has(formatDateInput(date));
}

export default function AgendaDayPlanPage() {
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const startAt = new Date(`${date}T00:00:00`).toISOString();
      const endAt = new Date(`${date}T23:59:59.999`).toISOString();
      const response = await fetch(`/api/calendar/events?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}&statuses=confirmed,tentative`, {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Chargement impossible');
      setEvents((json.events || []) as EventItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const dayDate = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
  const holiday = isFrenchHoliday(dayDate);

  const occupiedPlanifiableHours = useMemo(() => {
    const dayStart = new Date(`${date}T09:00:00`).getTime();
    const dayEnd = new Date(`${date}T17:00:00`).getTime();

    const occupiedMinutes = events.reduce((acc, event) => {
      const start = Math.max(new Date(event.start_at).getTime(), dayStart);
      const end = Math.min(new Date(event.end_at).getTime(), dayEnd);
      if (end <= start) return acc;
      return acc + (end - start) / 60000;
    }, 0);

    return occupiedMinutes / 60;
  }, [date, events]);

  const planifiableHours = isWeekend || holiday ? 0 : 7;
  const freeHours = Math.max(0, planifiableHours - occupiedPlanifiableHours);
  const availabilityPct = planifiableHours === 0 ? 0 : Math.round((freeHours / planifiableHours) * 100);

  const availabilityColor = availabilityPct < 30
    ? 'text-rose-200 bg-rose-400/15 border-rose-300/30'
    : availabilityPct < 60
      ? 'text-amber-200 bg-amber-400/15 border-amber-300/30'
      : 'text-emerald-200 bg-emerald-400/15 border-emerald-300/30';

  const hourlyRows = useMemo(() => {
    return Array.from({ length: 12 }).map((_, index) => {
      const hour = index + 7;
      const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();
      const slotEnd = new Date(`${date}T${String(hour + 1).padStart(2, '0')}:00:00`).getTime();

      const blockingEvents = events.filter((event) => {
        const start = new Date(event.start_at).getTime();
        const end = new Date(event.end_at).getTime();
        return start < slotEnd && end > slotStart;
      });

      return {
        hour,
        nonAvailable: blockingEvents,
      };
    });
  }, [date, events]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <AgendaNav active="dayplan" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Disponibilite journee</h1>
          <p className="mt-1 text-sm text-slate-400">Indicateur 9h-17h (pause de 1h), colonne NON DISPONIBLE vs DISPONIBLE.</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      )}

      <div className="mb-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Disponibilite</p>
        <div className={`mt-2 inline-flex rounded-xl border px-3 py-2 text-sm font-semibold ${availabilityColor}`}>
          {availabilityPct}% ({freeHours.toFixed(1)}h libres / {planifiableHours}h planifiables)
        </div>
        {(isWeekend || holiday) && (
          <p className="mt-2 text-xs text-slate-400">Jour exclu du calcul automatique (week-end ou ferie).</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
        <div className="grid grid-cols-[90px_1fr_1fr] border-b border-white/10 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
          <span>Heure</span>
          <span>NON DISPONIBLE</span>
          <span>DISPONIBLE</span>
        </div>

        {hourlyRows.map((row) => (
          <div key={row.hour} className="grid grid-cols-[90px_1fr_1fr] border-b border-white/5 px-3 py-2 text-sm">
            <span className="text-slate-300">{String(row.hour).padStart(2, '0')}:00</span>
            <div className="pr-2">
              {row.nonAvailable.length === 0 ? (
                <span className="text-slate-600">-</span>
              ) : (
                <div className="space-y-1">
                  {row.nonAvailable.map((event) => (
                    <div key={`${row.hour}-${event.id}`} className="rounded-md border border-rose-300/25 bg-rose-400/10 px-2 py-1 text-xs text-rose-100">
                      {event.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              {row.nonAvailable.length > 0 ? (
                <span className="text-slate-600">-</span>
              ) : (
                <div className="rounded-md border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">
                  Disponible
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="mt-3 text-sm text-slate-400">Chargement...</p>}
    </div>
  );
}
