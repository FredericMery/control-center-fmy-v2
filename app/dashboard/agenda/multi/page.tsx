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

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export default function AgendaMultiPage() {
  const [days, setDays] = useState<3 | 5 | 7>(5);
  const [anchor, setAnchor] = useState(new Date());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = startOfDay(anchor);
    const end = endOfDay(new Date(anchor.getTime() + (days - 1) * 24 * 60 * 60 * 1000));
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }, [anchor, days]);

  const dayList = useMemo(() => {
    return Array.from({ length: days }).map((_, index) => {
      const day = new Date(anchor.getTime() + index * 24 * 60 * 60 * 1000);
      return day;
    });
  }, [anchor, days]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar/events?startAt=${encodeURIComponent(range.startAt)}&endAt=${encodeURIComponent(range.endAt)}&statuses=confirmed,tentative`, {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Impossible de charger la vue multi-jours');
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
  }, [range.startAt, range.endAt]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <AgendaNav active="multi" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Vue multi-jours</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(new Date(anchor.getTime() - 24 * 60 * 60 * 1000))}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            ←
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => setAnchor(new Date(anchor.getTime() + 24 * 60 * 60 * 1000))}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            →
          </button>
          <div className="mx-2 h-6 w-px bg-white/10" />
          {[3, 5, 7].map((value) => (
            <button
              key={value}
              onClick={() => setDays(value as 3 | 5 | 7)}
              className={`rounded-full px-3 py-1.5 text-xs ${days === value ? 'bg-cyan-300 text-slate-950' : 'border border-white/15 text-slate-200 hover:bg-slate-800'}`}
            >
              {value} jours
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 p-3">
        <div className="flex min-w-max gap-3">
          {dayList.map((day) => {
            const key = dateKey(day);
            const dayStart = startOfDay(day).getTime();
            const dayEnd = endOfDay(day).getTime();
            const dayEvents = events.filter((event) => {
              const start = new Date(event.start_at).getTime();
              const end = new Date(event.end_at).getTime();
              return start <= dayEnd && end >= dayStart;
            });

            return (
              <div key={key} className="w-[280px] shrink-0 rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {day.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                </p>
                <div className="mt-2 space-y-2">
                  {dayEvents.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-slate-500">Aucun RDV</p>
                  ) : (
                    dayEvents.map((event) => (
                      <div
                        key={`${event.id}-${key}`}
                        className={`rounded-lg border px-2.5 py-2 text-xs ${event.planner_type === 'pro' ? 'border-blue-300/30 bg-blue-400/10 text-blue-50' : 'border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-50'}`}
                      >
                        <p className="truncate font-medium">{event.title}</p>
                        <p className="mt-1 text-[11px] opacity-80">
                          {new Date(event.start_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {' - '}
                          {new Date(event.end_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-400">Chargement...</p>}
    </div>
  );
}
