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

type ViewMode = '1day' | '5days';

const PLANNING_HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 07:00 – 18:xx

const PROVIDER_SHORT: Record<string, string> = {
  microsoft: 'MS',
  google: 'GG',
  blackwaves: 'BW',
  manual: 'TR',
  hplus: 'INT',
};

const PROVIDER_TEXT_COLOR: Record<string, string> = {
  microsoft: 'text-sky-300',
  google: 'text-red-300',
  blackwaves: 'text-violet-300',
  manual: 'text-amber-300',
  hplus: 'text-emerald-300',
};

function isoDaysFromNow(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isMultiDay(event: AgendaEventLike): boolean {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  return toDateKey(start) !== toDateKey(end);
}

function getEventsForDaySlot(
  events: AgendaEventLike[],
  dateKey: string,
  hour: number,
): AgendaEventLike[] {
  const slotStart = new Date(`${dateKey}T${String(hour).padStart(2, '0')}:00:00`).getTime();
  const slotEnd = new Date(`${dateKey}T${String(hour + 1).padStart(2, '0')}:00:00`).getTime();
  return events.filter((event) => {
    if (isMultiDay(event)) return false;
    const start = new Date(event.start_at).getTime();
    const end = new Date(event.end_at).getTime();
    return start < slotEnd && end > slotStart;
  });
}

function EventChip({ event }: { event: AgendaEventLike }) {
  const isPro = event.planner_type === 'pro';
  const isPerso = event.planner_type === 'perso';
  const chipClass = isPro
    ? 'border-blue-300/40 bg-blue-400/15 text-blue-100'
    : isPerso
    ? 'border-fuchsia-300/40 bg-fuchsia-400/15 text-fuchsia-100'
    : 'border-slate-500/30 bg-slate-700/40 text-slate-200';
  const timeClass = isPro ? 'text-blue-200/80' : isPerso ? 'text-fuchsia-200/80' : 'text-slate-400';
  const shortCode = PROVIDER_SHORT[event.source_provider] ?? event.source_provider.toUpperCase().slice(0, 3);
  const srcColor = PROVIDER_TEXT_COLOR[event.source_provider] ?? 'text-slate-400';
  return (
    <div className={`rounded-md border px-2 py-1 text-xs ${chipClass}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="truncate font-medium leading-tight">{event.title}</p>
        <span className={`shrink-0 text-[9px] font-bold uppercase ${srcColor}`}>{shortCode}</span>
      </div>
      <p className={`text-[10px] ${timeClass}`}>
        {formatTime(event.start_at)} – {formatTime(event.end_at)}
      </p>
    </div>
  );
}

function SlotCell({
  events,
  rowKey,
  className = '',
}: {
  events: AgendaEventLike[];
  rowKey: string;
  className?: string;
}) {
  if (events.length === 0) {
    return <span className={`text-xs text-slate-700 ${className}`}>–</span>;
  }
  return (
    <div className={`space-y-1 ${className}`}>
      {events.map((e) => (
        <EventChip key={`${rowKey}-${e.id}`} event={e} />
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

export default function AgendaPage() {
  const { loading, error, events, sources, loadEvents, loadSources } = useAgendaStore();
  const [viewMode, setViewMode] = useState<ViewMode>('1day');
  const [planningDate, setPlanningDate] = useState<string>(() => toDateKey(new Date()));
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    loadSources();
    loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14));
  }, [loadEvents, loadSources]);

  useEffect(() => {
    const update = () => setCurrentTime(Date.now());
    update();
    const id = window.setInterval(update, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Days to render (1 or 5)
  const displayDays = useMemo((): string[] => {
    if (viewMode === '1day') return [planningDate];
    return Array.from({ length: 5 }, (_, i) => addDaysToKey(planningDate, i));
  }, [viewMode, planningDate]);

  // Multi-day events spanning the visible period (shown in banner, NOT in hourly grid)
  const multiDayEvents = useMemo((): AgendaEventLike[] => {
    const periodStart = new Date(`${displayDays[0]}T00:00:00`).getTime();
    const periodEnd = new Date(`${displayDays[displayDays.length - 1]}T23:59:59.999`).getTime();
    const seen = new Set<string>();
    return events.filter((event) => {
      if (!isMultiDay(event) || seen.has(event.id)) return false;
      const s = new Date(event.start_at).getTime();
      const e = new Date(event.end_at).getTime();
      if (s <= periodEnd && e >= periodStart) {
        seen.add(event.id);
        return true;
      }
      return false;
    });
  }, [events, displayDays]);

  const todayCount = useMemo(() => {
    const today = toDateKey(new Date());
    return events.filter((e) => toDateKey(new Date(e.start_at)) === today).length;
  }, [events]);

  const activeNowCount = useMemo(() => {
    if (currentTime === null) return 0;
    return events.filter((e) => {
      const s = new Date(e.start_at).getTime();
      const en = new Date(e.end_at).getTime();
      return s <= currentTime && en >= currentTime;
    }).length;
  }, [currentTime, events]);

  const nextEvent = useMemo(() => {
    if (currentTime === null) return null;
    return [...events]
      .filter((e) => new Date(e.end_at).getTime() >= currentTime)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0] ?? null;
  }, [currentTime, events]);

  const gridCols = viewMode === '1day' ? '80px 1fr 1fr' : `80px repeat(5, 1fr)`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <AgendaNav active="overview" />

      {/* Header */}
      <div className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Agenda intelligent</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              Suivi clair des rendez-vous, y compris sur plusieurs jours
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              {' · '}
              {nextEvent
                ? `prochain jalon : ${nextEvent.title} à ${formatTime(nextEvent.start_at)}`
                : 'aucun rendez-vous à venir sur la période'}
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
              Vue pro
            </Link>
            <Link
              href="/dashboard/agenda/propositions"
              className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/25"
            >
              Propositions
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
        <StatCard
          label="Sources actives"
          value={sources.filter((s) => s.is_enabled).length}
          sub={`${sources.length} configurée${sources.length > 1 ? 's' : ''}`}
        />
        <StatCard label="Aujourd'hui" value={todayCount} sub="rendez-vous" />
        <StatCard label="En cours" value={activeNowCount} sub="rendez-vous actuellement ouverts" />
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Multi-jours</p>
          <p className="mt-2 text-3xl font-semibold text-white">{multiDayEvents.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Synchronisation…
              </span>
            ) : (
              `${events.length} événements distincts sur 14 jours`
            )}
          </p>
        </div>
      </div>

      {/* Planning */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Planning horaire</h2>
            <p className="mt-0.5 text-xs text-slate-500">07h – 19h · événements multi-jours affichés en haut</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-white/10 bg-slate-950/60 p-0.5 text-xs">
              <button
                onClick={() => setViewMode('1day')}
                className={`rounded-md px-3 py-1.5 transition ${
                  viewMode === '1day' ? 'bg-slate-200 font-medium text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                1 jour
              </button>
              <button
                onClick={() => setViewMode('5days')}
                className={`rounded-md px-3 py-1.5 transition ${
                  viewMode === '5days' ? 'bg-slate-200 font-medium text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                5 jours
              </button>
            </div>
            <input
              type="date"
              value={planningDate}
              onChange={(e) => setPlanningDate(e.target.value)}
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

        {/* Legend */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/8 pb-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-400/70" />
            PRO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-fuchsia-400/70" />
            PERSO
          </span>
          <span className="h-3.5 w-px bg-white/10" />
          <span>
            <span className="font-bold text-sky-300">MS</span> Microsoft
          </span>
          <span>
            <span className="font-bold text-red-300">GG</span> Google
          </span>
          <span>
            <span className="font-bold text-emerald-300">INT</span> Interne
          </span>
          <span>
            <span className="font-bold text-amber-300">TR</span> Transfert
          </span>
          <span>
            <span className="font-bold text-violet-300">BW</span> Blackwaves
          </span>
        </div>

        {/* Multi-day banner — shown above the hourly grid */}
        {multiDayEvents.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300/25 bg-amber-400/8 px-3 py-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-300/80">
              Événements multi-jours actifs sur la période
            </p>
            <div className="flex flex-wrap gap-2">
              {multiDayEvents.map((event) => {
                const isPro = event.planner_type === 'pro';
                const isPerso = event.planner_type === 'perso';
                const chipClass = isPro
                  ? 'border-blue-300/40 bg-blue-400/15 text-blue-100'
                  : isPerso
                  ? 'border-fuchsia-300/40 bg-fuchsia-400/15 text-fuchsia-100'
                  : 'border-slate-500/30 bg-slate-700/40 text-slate-200';
                const shortCode =
                  PROVIDER_SHORT[event.source_provider] ?? event.source_provider.toUpperCase().slice(0, 3);
                const srcColor = PROVIDER_TEXT_COLOR[event.source_provider] ?? 'text-slate-400';
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${chipClass}`}
                  >
                    <span className="font-medium">{event.title}</span>
                    <span className={`text-[9px] font-bold uppercase ${srcColor}`}>{shortCode}</span>
                    <span className="text-[10px] opacity-60">
                      {new Date(event.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      {' → '}
                      {new Date(event.end_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hourly grid */}
        {loading && events.length === 0 ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-700/40" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="overflow-hidden rounded-xl border border-white/10"
              style={{ minWidth: viewMode === '5days' ? 640 : undefined }}
            >
              {/* Column headers */}
              <div
                className="grid border-b border-white/10 bg-slate-950/80 px-3 py-2 text-xs uppercase tracking-wide text-slate-400"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span>Heure</span>
                {viewMode === '1day' ? (
                  <>
                    <span className="text-blue-200">RDV PRO</span>
                    <span className="text-fuchsia-200">RDV PERSO</span>
                  </>
                ) : (
                  displayDays.map((day) => {
                    const d = new Date(`${day}T00:00:00`);
                    const isToday = day === toDateKey(new Date());
                    return (
                      <div key={day} className={`text-center ${isToday ? 'text-cyan-300' : ''}`}>
                        <div className="font-semibold capitalize">
                          {d.toLocaleDateString('fr-FR', { weekday: 'short' })}
                        </div>
                        <div className="text-[10px] font-normal opacity-75">
                          {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Hour rows */}
              {PLANNING_HOURS.map((hour) => (
                <div
                  key={hour}
                  className="grid border-b border-white/5 px-3 py-2 last:border-0"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <span className="pt-0.5 text-sm text-slate-300">
                    {String(hour).padStart(2, '0')}:00
                  </span>

                  {viewMode === '1day' ? (
                    <>
                      <SlotCell
                        events={getEventsForDaySlot(events, displayDays[0], hour).filter(
                          (e) => e.planner_type === 'pro',
                        )}
                        rowKey={`${hour}-pro`}
                        className="pr-1.5"
                      />
                      <SlotCell
                        events={getEventsForDaySlot(events, displayDays[0], hour).filter(
                          (e) => e.planner_type !== 'pro',
                        )}
                        rowKey={`${hour}-perso`}
                      />
                    </>
                  ) : (
                    displayDays.map((day) => (
                      <SlotCell
                        key={day}
                        events={getEventsForDaySlot(events, day, hour)}
                        rowKey={`${hour}-${day}`}
                        className="px-0.5"
                      />
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

