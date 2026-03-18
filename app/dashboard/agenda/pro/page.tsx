"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AgendaNav from '@/components/agenda/AgendaNav';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type ProEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string | null;
  source_provider: string;
  status: string;
};

type DisplayProEvent = ProEvent & {
  displayAnchorAt: string;
  isMultiDay: boolean;
  timeLabel: string;
  spanLabel: string | null;
};

function toIsoRange(dateValue: string) {
  const start = new Date(`${dateValue}T00:00:00`);
  const end = new Date(`${dateValue}T23:59:59.999`);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().split('T')[0];
}

function getEventDuration(startAt: string, endAt: string): string {
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${String(rem).padStart(2, '0')}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function isSameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getDisplayEventForDate(event: ProEvent, date: string): DisplayProEvent {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const selectedDay = new Date(`${date}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      ...event,
      displayAnchorAt: event.start_at,
      isMultiDay: false,
      timeLabel: `${new Date(event.start_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${new Date(event.end_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      spanLabel: null,
    };
  }

  if (isSameDay(start, end)) {
    return {
      ...event,
      displayAnchorAt: event.start_at,
      isMultiDay: false,
      timeLabel: `${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      spanLabel: null,
    };
  }

  const isStartDay = isSameDay(start, selectedDay);
  const isEndDay = isSameDay(end, selectedDay);

  let timeLabel = 'Se poursuit';
  let displayAnchorAt = startOfDay(selectedDay).toISOString();

  if (isStartDay) {
    timeLabel = `Débute à ${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    displayAnchorAt = event.start_at;
  } else if (isEndDay) {
    timeLabel = `Se termine à ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return {
    ...event,
    displayAnchorAt,
    isMultiDay: true,
    timeLabel,
    spanLabel: `${formatShortDate(start)} → ${formatShortDate(end)}`,
  };
}

const STATUS_CARD: Record<string, string> = {
  confirmed: 'border-emerald-400/25 bg-emerald-400/8',
  tentative: 'border-amber-400/25 bg-amber-400/8',
  cancelled: 'border-rose-400/20 bg-rose-400/6 opacity-60',
};

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-emerald-400/20 text-emerald-200',
  tentative: 'bg-amber-400/20 text-amber-200',
  cancelled: 'bg-rose-400/20 text-rose-200',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmé',
  tentative: 'Provisoire',
  cancelled: 'Annulé',
};

export default function AgendaProPage() {
  const [date, setDate] = useState(todayInputValue());
  const [events, setEvents] = useState<ProEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<'all' | 'confirmed' | 'tentative' | 'multi'>('all');

  const humanDate = useMemo(() => {
    const today = todayInputValue();
    const tomorrow = addDays(today, 1);
    if (date === today) return "Aujourd'hui";
    if (date === tomorrow) return 'Demain';
    return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [date]);

  const loadForDate = async (nextDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const { startAt, endAt } = toIsoRange(nextDate);
      const params = new URLSearchParams({ startAt, endAt, category: 'pro', statuses: 'confirmed,tentative' });
      const response = await fetch(`/api/calendar/events?${params.toString()}`, {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Impossible de charger les rendez-vous pro');
      setEvents((json.events || []) as ProEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setEvents([]);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    loadForDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateDay = (delta: number) => {
    const newDate = addDays(date, delta);
    setDate(newDate);
    loadForDate(newDate);
  };

  const jumpToDate = (nextDate: string) => {
    setDate(nextDate);
    loadForDate(nextDate);
  };

  const sortedEvents = useMemo(
    () => [...events]
      .map((event) => getDisplayEventForDate(event, date))
      .sort((a, b) => new Date(a.displayAnchorAt).getTime() - new Date(b.displayAnchorAt).getTime()),
    [date, events],
  );

  const filteredEvents = useMemo(() => {
    if (viewFilter === 'confirmed') {
      return sortedEvents.filter((event) => event.status === 'confirmed');
    }
    if (viewFilter === 'tentative') {
      return sortedEvents.filter((event) => event.status === 'tentative');
    }
    if (viewFilter === 'multi') {
      return sortedEvents.filter((event) => event.isMultiDay);
    }
    return sortedEvents;
  }, [sortedEvents, viewFilter]);

  const confirmedCount = sortedEvents.filter((event) => event.status === 'confirmed').length;
  const tentativeCount = sortedEvents.filter((event) => event.status === 'tentative').length;
  const multiDayCount = sortedEvents.filter((event) => event.isMultiDay).length;
  const isToday = date === todayInputValue();
  const firstEvent = filteredEvents[0] || null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <AgendaNav active="pro" />

      <div className="mb-5 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/75">Vue pro</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Rendez-vous business lisibles en un coup d&apos;oeil</h1>
            <p className="mt-1 text-sm capitalize text-slate-300">{humanDate}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/agenda/new"
              className="rounded-lg border border-slate-200/25 bg-slate-100/10 px-3 py-2 text-sm text-slate-100 transition hover:bg-slate-100/20"
            >
              + Nouveau RDV
            </Link>
            <Link
              href="/dashboard/agenda/propositions"
              className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-400/25"
            >
              Propositions
            </Link>
            <button
              onClick={() => navigateDay(-1)}
              disabled={loading}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              ← Prec.
            </button>
            {!isToday && (
              <button
                onClick={() => jumpToDate(todayInputValue())}
                className="rounded-lg border border-white/20 bg-slate-800/60 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-700"
              >
                Aujourd&apos;hui
              </button>
            )}
            <button
              onClick={() => navigateDay(1)}
              disabled={loading}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Suiv. →
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => jumpToDate(todayInputValue())}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => jumpToDate(addDays(todayInputValue(), 1))}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20"
          >
            Demain
          </button>
          <button
            onClick={() => jumpToDate(addDays(todayInputValue(), 7))}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/20"
          >
            Dans 7 jours
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Rendez-vous</p>
          <p className="mt-2 text-3xl font-semibold text-white">{sortedEvents.length}</p>
          <p className="mt-1 text-xs text-slate-500">sur la journee selectionnee</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Confirmes</p>
          <p className="mt-2 text-3xl font-semibold text-white">{confirmedCount}</p>
          <p className="mt-1 text-xs text-slate-500">{tentativeCount} provisoire{tentativeCount > 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Multi-jours</p>
          <p className="mt-2 text-3xl font-semibold text-white">{multiDayCount}</p>
          <p className="mt-1 text-xs text-slate-500">repere immediat sur la journee</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Premier jalon</p>
          <p className="mt-2 text-sm font-semibold text-white">{firstEvent ? firstEvent.title : 'Aucun'}</p>
          <p className="mt-1 text-xs text-slate-500">{firstEvent ? firstEvent.timeLabel : 'Journee libre'}</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Choisir une date
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  loadForDate(e.target.value);
                }}
                className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              onClick={() => loadForDate(date)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                  Chargement
                </>
              ) : (
                'Rafraichir'
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setViewFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs transition ${viewFilter === 'all' ? 'bg-white text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
            >
              Tous
            </button>
            <button
              onClick={() => setViewFilter('confirmed')}
              className={`rounded-full px-3 py-1.5 text-xs transition ${viewFilter === 'confirmed' ? 'bg-emerald-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
            >
              Confirmes
            </button>
            <button
              onClick={() => setViewFilter('tentative')}
              className={`rounded-full px-3 py-1.5 text-xs transition ${viewFilter === 'tentative' ? 'bg-amber-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
            >
              Provisoires
            </button>
            <button
              onClick={() => setViewFilter('multi')}
              className={`rounded-full px-3 py-1.5 text-xs transition ${viewFilter === 'multi' ? 'bg-emerald-400 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
            >
              Multi-jours
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {filteredEvents.length > 0 ? `${filteredEvents.length} rendez-vous` : 'Rendez-vous'}
          </h2>
          {confirmedCount > 0 && (
            <span className="text-xs text-emerald-300">
              {confirmedCount} confirmé{confirmedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading && !hasLoaded ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <div className="h-4 w-48 animate-pulse rounded bg-slate-700/60" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-700/40" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 text-3xl">✅</div>
            <p className="text-sm font-medium text-slate-300">Aucun rendez-vous pour ce filtre</p>
            <p className="mt-1 text-xs text-slate-500">Essayez un autre statut ou une autre date.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-xl border p-3 transition ${event.isMultiDay ? 'border-emerald-300/35 bg-emerald-400/10' : STATUS_CARD[event.status] ?? 'border-white/10 bg-slate-950/60'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{event.title}</p>
                      {event.isMultiDay && (
                        <span className="rounded-full border border-emerald-300/35 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-100">
                          Multi-jours
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-300">
                      <span>{event.timeLabel}</span>
                      <span className="text-slate-500">{getEventDuration(event.start_at, event.end_at)}</span>
                    </div>
                    {event.spanLabel && (
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-emerald-300/80">
                        {event.spanLabel}
                      </p>
                    )}
                    {event.location && (
                      <p className="mt-1 text-xs text-slate-400">📍 {event.location}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[event.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {STATUS_LABELS[event.status] ?? event.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-600">
                      {event.source_provider}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
