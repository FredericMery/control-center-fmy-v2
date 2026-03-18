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

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const PROVIDER_LABEL: Record<string, string> = {
  microsoft: 'Microsoft',
  google: 'Google',
  blackwaves: 'Blackwaves',
  manual: 'Transfert',
  hplus: 'Interne',
};

export default function AgendaPage() {
  const { loading, error, events, sources, loadEvents, loadSources } = useAgendaStore();
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedPlannerType, setSelectedPlannerType] = useState<'all' | 'pro' | 'perso'>('all');
  const [selectedLens, setSelectedLens] = useState<'all' | 'active' | 'multi'>('all');
  const [planningDate, setPlanningDate] = useState<string>(() => toDateInputValue(new Date()));
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

  const planningDayEvents = useMemo(() => {
    const dayStart = new Date(`${planningDate}T00:00:00`).getTime();
    const dayEnd = new Date(`${planningDate}T23:59:59.999`).getTime();

    return filteredDisplayEvents
      .filter((event) => {
        const eventStart = new Date(event.start_at).getTime();
        const eventEnd = new Date(event.end_at).getTime();
        return eventStart <= dayEnd && eventEnd >= dayStart;
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [filteredDisplayEvents, planningDate]);

  const planningRows = useMemo(() => {
    return Array.from({ length: 12 }).map((_, index) => {
      const hour = index + 7;
      const slotStart = new Date(`${planningDate}T${String(hour).padStart(2, '0')}:00:00`).getTime();
      const slotEnd = new Date(`${planningDate}T${String(hour + 1).padStart(2, '0')}:00:00`).getTime();

      const slotEvents = planningDayEvents.filter((event) => {
        const start = new Date(event.start_at).getTime();
        const end = new Date(event.end_at).getTime();
        return start < slotEnd && end > slotStart;
      });

      return {
        hour,
        pro: slotEvents.filter((event) => event.planner_type === 'pro'),
        perso: slotEvents.filter((event) => event.planner_type === 'perso'),
      };
    });
  }, [planningDate, planningDayEvents]);

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

      {/* Planning view */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Planning lisible par creneau horaire</h2>
            <p className="mt-1 text-xs text-slate-500">
              Lecture directe des disponibilites entre 07h et 19h.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={planningDate}
              onChange={(event) => setPlanningDate(event.target.value)}
              className="rounded-lg border border-white/15 bg-slate-950/70 px-3 py-1.5 text-xs text-white"
            />
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
        ) : planningDayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 text-4xl">📅</div>
            <p className="text-sm font-medium text-slate-300">Aucun evenement pour ce filtre</p>
            <p className="mt-1 text-xs text-slate-500">
              Ajustez la source ou repassez sur la vue complete.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[90px_1fr_1fr] border-b border-white/10 bg-slate-950/80 px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
              <span>Heure</span>
              <span className="text-blue-200">RDV PRO</span>
              <span className="text-fuchsia-200">RDV PERSO</span>
            </div>

            {planningRows.map((row) => (
              <div key={row.hour} className="grid grid-cols-[90px_1fr_1fr] border-b border-white/5 px-3 py-2">
                <span className="text-sm text-slate-300">{String(row.hour).padStart(2, '0')}:00</span>

                <div className="pr-2">
                  {row.pro.length === 0 ? (
                    <span className="text-xs text-slate-600">-</span>
                  ) : (
                    <div className="space-y-1">
                      {row.pro.map((event) => (
                        <div key={`${row.hour}-pro-${event.id}`} className="rounded-md border border-blue-300/30 bg-blue-400/10 px-2 py-1 text-xs text-blue-100">
                          <p className="truncate">{event.title}</p>
                          <p className="text-[10px] text-blue-200/85">{formatTime(event.start_at)} - {formatTime(event.end_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  {row.perso.length === 0 ? (
                    <span className="text-xs text-slate-600">-</span>
                  ) : (
                    <div className="space-y-1">
                      {row.perso.map((event) => (
                        <div key={`${row.hour}-perso-${event.id}`} className="rounded-md border border-fuchsia-300/30 bg-fuchsia-400/10 px-2 py-1 text-xs text-fuchsia-100">
                          <p className="truncate">{event.title}</p>
                          <p className="text-[10px] text-fuchsia-200/85">{formatTime(event.start_at)} - {formatTime(event.end_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
