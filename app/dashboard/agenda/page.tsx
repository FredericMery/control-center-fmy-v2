"use client";

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAgendaStore } from '@/store/agendaStore';

function isoDaysFromNow(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function getDayLabel(startAt: string): string {
  const date = new Date(startAt);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === tomorrow.toDateString()) return 'Demain';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getEventDuration(startAt: string, endAt: string): string {
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${String(rem).padStart(2, '0')}`;
}

const PROVIDER_DOT: Record<string, string> = {
  microsoft: 'bg-blue-500',
  google: 'bg-red-500',
  blackwaves: 'bg-emerald-500',
  manual: 'bg-purple-500',
  hplus: 'bg-amber-500',
};

export default function AgendaPage() {
  const { loading, error, events, sources, loadEvents, loadSources } = useAgendaStore();

  useEffect(() => {
    loadSources();
    loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14));
  }, [loadEvents, loadSources]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return events.filter((e) => new Date(e.start_at).toDateString() === today).length;
  }, [events]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof events> = {};
    events.forEach((event) => {
      const key = new Date(event.start_at).toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return Object.entries(groups).sort(
      ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
    );
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agenda Intelligent</h1>
          <p className="text-sm text-slate-400 capitalize">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/agenda/pro"
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25"
          >
            Vue pro
          </Link>
          <Link
            href="/dashboard/agenda/assistant"
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
          >
            Assistant IA
          </Link>
          <Link
            href="/dashboard/agenda/connecteurs"
            className="rounded-xl border border-white/15 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Connecteurs
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Sources actives</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {sources.filter((s) => s.is_enabled).length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {sources.length} configurée{sources.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Aujourd&apos;hui</p>
          <p className="mt-2 text-3xl font-semibold text-white">{todayCount}</p>
          <p className="mt-1 text-xs text-slate-500">rendez-vous</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">À venir (14j)</p>
          <p className="mt-2 text-3xl font-semibold text-white">{events.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Synchronisation…
              </span>
            ) : (
              'événements total'
            )}
          </p>
        </div>
      </div>

      {/* Events list */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Prochains rendez-vous</h2>
          <button
            onClick={() => loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14))}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
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

        {loading && events.length === 0 ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3.5 w-28 animate-pulse rounded bg-slate-700/60" />
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="h-4 w-52 animate-pulse rounded bg-slate-700/60" />
                  <div className="mt-2 h-3 w-36 animate-pulse rounded bg-slate-700/40" />
                </div>
              </div>
            ))}
          </div>
        ) : groupedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 text-4xl">📅</div>
            <p className="text-sm font-medium text-slate-300">Aucun événement sur cette période</p>
            <p className="mt-1 text-xs text-slate-500">
              Connectez un calendrier pour voir vos rendez-vous
            </p>
            <Link
              href="/dashboard/agenda/connecteurs"
              className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Connecter un calendrier
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedEvents.map(([dayKey, dayEvents]) => (
              <div key={dayKey}>
                {/* Day separator */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {getDayLabel(dayEvents[0].start_at)}
                  </span>
                  <span className="flex-1 border-t border-white/8" />
                  <span className="text-xs text-slate-600">
                    {dayEvents.length} RDV
                  </span>
                </div>

                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 transition hover:border-white/20 hover:bg-slate-900/60"
                    >
                      {/* Provider dot */}
                      <div className="mt-1 shrink-0">
                        <span
                          className={`block h-2.5 w-2.5 rounded-full ${PROVIDER_DOT[event.source_provider] ?? 'bg-slate-500'}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{event.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                          <span>
                            {formatTime(event.start_at)} – {formatTime(event.end_at)}
                          </span>
                          <span className="text-slate-600">
                            {getEventDuration(event.start_at, event.end_at)}
                          </span>
                          <span className="uppercase tracking-wide text-slate-600">
                            {event.source_provider}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
