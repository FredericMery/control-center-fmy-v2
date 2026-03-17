"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

function getEventDuration(startAt: string, endAt: string): string {
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${String(rem).padStart(2, '0')}`;
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

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events],
  );

  const confirmedCount = sortedEvents.filter((e) => e.status === 'confirmed').length;
  const isToday = date === todayInputValue();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      {/* Nav tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/agenda" className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          Vue générale
        </Link>
        <Link href="/dashboard/agenda/pro" className="rounded-lg border border-emerald-300/30 bg-emerald-500/25 px-3 py-1.5 text-xs font-medium text-emerald-100">
          Vue pro
        </Link>
        <Link href="/dashboard/agenda/assistant" className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/25">
          Assistant
        </Link>
        <Link href="/dashboard/agenda/connecteurs" className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          Connecteurs
        </Link>
        <Link href="/dashboard/agenda/preferences" className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          Préférences
        </Link>
      </div>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Rendez-vous pro</h1>
          <p className="mt-0.5 text-sm capitalize text-slate-300">{humanDate}</p>
        </div>
        {/* Day navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDay(-1)}
            disabled={loading}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            ← Préc.
          </button>
          {!isToday && (
            <button
              onClick={() => { const t = todayInputValue(); setDate(t); loadForDate(t); }}
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

      {/* Date picker */}
      <div className="mb-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Choisir une date
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); loadForDate(e.target.value); }}
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
              'Rafraîchir'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {/* Events */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {sortedEvents.length > 0
              ? `${sortedEvents.length} rendez-vous`
              : 'Rendez-vous'}
          </h2>
          {confirmedCount > 0 && (
            <span className="text-xs text-emerald-300">
              {confirmedCount} confirmé{confirmedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading && !hasLoaded ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <div className="h-4 w-48 animate-pulse rounded bg-slate-700/60" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-700/40" />
              </div>
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 text-3xl">✅</div>
            <p className="text-sm font-medium text-slate-300">Aucun rendez-vous pro</p>
            <p className="mt-1 text-xs text-slate-500">Journée libre !</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-xl border p-3 transition ${STATUS_CARD[event.status] ?? 'border-white/10 bg-slate-950/60'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{event.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-300">
                      <span>
                        {new Date(event.start_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(event.end_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-slate-500">{getEventDuration(event.start_at, event.end_at)}</span>
                    </div>
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
