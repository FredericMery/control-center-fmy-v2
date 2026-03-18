"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AgendaNav from '@/components/agenda/AgendaNav';
import { useAgendaStore } from '@/store/agendaStore';

type AgendaEventLike = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  source_provider: string;
  status: string;
  planner_type?: 'pro' | 'perso';
};

type DisplayAgendaEvent = AgendaEventLike & {
  displayDateKey: string;
  displayAnchorAt: string;
  isMultiDay: boolean;
  timeLabel: string;
  spanLabel: string | null;
};

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

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

function getEventDuration(startAt: string, endAt: string): string {
  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${String(rem).padStart(2, '0')}`;
}

function expandEventForDisplay(event: AgendaEventLike): DisplayAgendaEvent[] {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  if (isSameDay(start, end)) {
    return [
      {
        ...event,
        displayDateKey: start.toDateString(),
        displayAnchorAt: event.start_at,
        isMultiDay: false,
        timeLabel: `${formatTime(event.start_at)} – ${formatTime(event.end_at)}`,
        spanLabel: null,
      },
    ];
  }

  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
  const segments: DisplayAgendaEvent[] = [];

  for (let index = 0; index < totalDays; index += 1) {
    const day = new Date(startDay);
    day.setDate(startDay.getDate() + index);
    const isFirst = index === 0;
    const isLast = index === totalDays - 1;

    let timeLabel = 'Se poursuit';
    if (isFirst) {
      timeLabel = `Débute à ${formatTime(event.start_at)}`;
    } else if (isLast) {
      timeLabel = `Se termine à ${formatTime(event.end_at)}`;
    }

    if (isFirst && isLast) {
      timeLabel = `${formatTime(event.start_at)} – ${formatTime(event.end_at)}`;
    }

    const spanLabel = `Jour ${index + 1}/${totalDays} • ${formatShortDate(start)} → ${formatShortDate(end)}`;
    const displayAnchorAt = isFirst ? event.start_at : startOfDay(day).toISOString();

    segments.push({
      ...event,
      displayDateKey: day.toDateString(),
      displayAnchorAt,
      isMultiDay: true,
      timeLabel,
      spanLabel,
    });
  }

  return segments;
}

const PROVIDER_DOT: Record<string, string> = {
  microsoft: 'bg-blue-500',
  google: 'bg-red-500',
  blackwaves: 'bg-emerald-500',
  manual: 'bg-purple-500',
  hplus: 'bg-amber-500',
};

const PROVIDER_LABEL: Record<string, string> = {
  microsoft: 'Microsoft',
  google: 'Google',
  blackwaves: 'Blackwaves',
  manual: 'Transfert',
  hplus: 'Interne',
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirme',
  tentative: 'Provisoire',
  cancelled: 'Annule',
};

export default function AgendaPage() {
  const { loading, error, events, sources, loadEvents, loadSources } = useAgendaStore();
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedPlannerType, setSelectedPlannerType] = useState<'all' | 'pro' | 'perso'>('all');
  const [selectedLens, setSelectedLens] = useState<'all' | 'active' | 'multi'>('all');
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    loadSources();
    loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14));
  }, [loadEvents, loadSources]);

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(Date.now());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const displayEvents = useMemo(() => {
    return events.flatMap((event) => expandEventForDisplay(event));
  }, [events]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return displayEvents.filter((event) => event.displayDateKey === today).length;
  }, [displayEvents]);

  const activeNowCount = useMemo(() => {
    if (currentTime === null) return 0;
    return new Set(
      events
        .filter((event) => {
          const start = new Date(event.start_at).getTime();
          const end = new Date(event.end_at).getTime();
          return start <= currentTime && end >= currentTime;
        })
        .map((event) => event.id)
    ).size;
  }, [currentTime, events]);

  const multiDayCount = useMemo(() => {
    return new Set(displayEvents.filter((event) => event.isMultiDay).map((event) => event.id)).size;
  }, [displayEvents]);

  const nextEvent = useMemo(() => {
    if (currentTime === null) return null;
    return [...events]
      .filter((event) => new Date(event.end_at).getTime() >= currentTime)
      .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())[0] || null;
  }, [currentTime, events]);

  const providerOptions = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.source_provider))).sort();
  }, [events]);

  const filteredDisplayEvents = useMemo(() => {
    return displayEvents.filter((event) => {
      if (selectedProvider !== 'all' && event.source_provider !== selectedProvider) {
        return false;
      }
      if (selectedPlannerType !== 'all' && event.planner_type !== selectedPlannerType) {
        return false;
      }
      if (selectedLens === 'active') {
        if (currentTime === null) return false;
        const start = new Date(event.start_at).getTime();
        const end = new Date(event.end_at).getTime();
        return start <= currentTime && end >= currentTime;
      }
      if (selectedLens === 'multi') {
        return event.isMultiDay;
      }
      return true;
    });
  }, [currentTime, displayEvents, selectedLens, selectedPlannerType, selectedProvider]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, DisplayAgendaEvent[]> = {};
    filteredDisplayEvents.forEach((event) => {
      const key = event.displayDateKey;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return Object.entries(groups)
      .map(([key, dayEvents]) => [
        key,
        [...dayEvents].sort(
          (left, right) => new Date(left.displayAnchorAt).getTime() - new Date(right.displayAnchorAt).getTime(),
        ),
      ] as const)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  }, [filteredDisplayEvents]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <AgendaNav active="overview" />

      <div className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Agenda intelligent</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Suivi clair des rendez-vous, y compris sur plusieurs jours</h1>
            <p className="mt-2 text-sm text-slate-300">
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {nextEvent
                ? `prochain jalon : ${nextEvent.title} a ${formatTime(nextEvent.start_at)}`
                : 'aucun rendez-vous a venir sur la periode'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/agenda/new"
              className="rounded-xl border border-slate-200/25 bg-slate-100/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-100/20"
            >
              + Nouveau RDV
            </Link>
            <Link
              href="/dashboard/agenda/pro"
              className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25"
            >
              Ouvrir la vue pro
            </Link>
            <Link
              href="/dashboard/agenda/propositions"
              className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/25"
            >
              Propositions en cours
            </Link>
            <Link
              href="/dashboard/agenda/assistant"
              className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Planifier avec l&apos;IA
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <p className="text-xs uppercase tracking-wide text-slate-400">En cours</p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeNowCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            rendez-vous actuellement ouverts
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Multi-jours</p>
          <p className="mt-2 text-3xl font-semibold text-white">{multiDayCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Synchronisation…
              </span>
            ) : (
              `${events.length} evenements distincts sur 14 jours`
            )}
          </p>
        </div>
      </div>

      {/* Events list */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Prochains rendez-vous</h2>
            <p className="mt-1 text-xs text-slate-500">
              Filtre en direct par source et par type de suivi.
            </p>
          </div>
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
              'Rafraichir'
            )}
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-white/8 pb-4">
          <button
            onClick={() => setSelectedLens('all')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedLens === 'all' ? 'bg-white text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            Tous
          </button>
          <button
            onClick={() => setSelectedLens('active')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedLens === 'active' ? 'bg-cyan-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            En cours
          </button>
          <button
            onClick={() => setSelectedLens('multi')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedLens === 'multi' ? 'bg-cyan-400/90 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            Multi-jours
          </button>
          <div className="mx-1 h-8 w-px bg-white/8" />
          <button
            onClick={() => setSelectedPlannerType('all')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedPlannerType === 'all' ? 'bg-slate-200 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            PRO + PERSO
          </button>
          <button
            onClick={() => setSelectedPlannerType('pro')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedPlannerType === 'pro' ? 'bg-blue-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            PRO
          </button>
          <button
            onClick={() => setSelectedPlannerType('perso')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedPlannerType === 'perso' ? 'bg-fuchsia-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            PERSO
          </button>
          <div className="mx-1 h-8 w-px bg-white/8" />
          <button
            onClick={() => setSelectedProvider('all')}
            className={`rounded-full px-3 py-1.5 text-xs transition ${selectedProvider === 'all' ? 'bg-slate-200 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
          >
            Toutes les sources
          </button>
          {providerOptions.map((provider) => (
            <button
              key={provider}
              onClick={() => setSelectedProvider(provider)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${selectedProvider === provider ? 'bg-slate-200 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/20'}`}
            >
              {PROVIDER_LABEL[provider] ?? provider}
            </button>
          ))}
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
            <p className="text-sm font-medium text-slate-300">Aucun evenement pour ce filtre</p>
            <p className="mt-1 text-xs text-slate-500">
              Ajustez la source ou repassez sur la vue complete.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedEvents.map(([dayKey, dayEvents]) => (
              <div key={dayKey}>
                {/* Day separator */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {getDayLabel(dayEvents[0].displayAnchorAt)}
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
                      className={`flex items-start gap-3 rounded-xl border p-3 transition hover:bg-slate-900/60 ${event.planner_type === 'pro' ? 'border-blue-300/25 bg-blue-400/5 hover:border-blue-300/40' : event.planner_type === 'perso' ? 'border-fuchsia-300/25 bg-fuchsia-400/5 hover:border-fuchsia-300/40' : event.isMultiDay ? 'border-cyan-300/25 bg-cyan-400/5 hover:border-cyan-300/40' : 'border-white/10 bg-slate-950/60 hover:border-white/20'}`}
                    >
                      {/* Provider dot */}
                      <div className="mt-1 shrink-0">
                        <span
                          className={`block h-2.5 w-2.5 rounded-full ${PROVIDER_DOT[event.source_provider] ?? 'bg-slate-500'}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">{event.title}</p>
                          {event.isMultiDay && (
                            <span className="rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-100">
                              Multi-jours
                            </span>
                          )}
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                            {STATUS_LABEL[event.status] ?? event.status}
                          </span>
                          {event.planner_type && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${event.planner_type === 'pro' ? 'bg-blue-400/15 text-blue-100' : 'bg-fuchsia-400/15 text-fuchsia-100'}`}>
                              {event.planner_type === 'pro' ? 'PRO' : 'PERSO'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                          <span>{event.timeLabel}</span>
                          <span className="text-slate-600">
                            {getEventDuration(event.start_at, event.end_at)}
                          </span>
                          <span className="uppercase tracking-wide text-slate-600">
                            {PROVIDER_LABEL[event.source_provider] ?? event.source_provider}
                          </span>
                        </div>
                        {event.spanLabel && (
                          <p className="mt-1 text-[11px] uppercase tracking-wide text-cyan-300/80">
                            {event.spanLabel}
                          </p>
                        )}
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
