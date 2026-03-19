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
type HourCell =
  | { type: 'empty' }
  | { type: 'covered' }
  | { type: 'start'; event: AgendaEventLike; span: number };

const PLANNING_HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 – 22:xx

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSpanEndTime(event: AgendaEventLike): number {
  const start = new Date(event.start_at).getTime();
  const endDate = new Date(event.end_at);
  const end = endDate.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return end;

  // Calendar feeds often store end at 00:00 as exclusive end date.
  if (
    end > start &&
    endDate.getHours() === 0 &&
    endDate.getMinutes() === 0 &&
    endDate.getSeconds() === 0 &&
    endDate.getMilliseconds() === 0
  ) {
    return end - 1;
  }

  return end;
}

function isCancelledEvent(event: AgendaEventLike): boolean {
  const status = (event.status || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  return (
    status.includes('cancel') ||
    status.includes('annul') ||
    title.includes('annule') ||
    title.includes('annulé') ||
    title.startsWith('cancelled:') ||
    title.startsWith('canceled:')
  );
}

function isMultiDay(event: AgendaEventLike): boolean {
  const start = new Date(event.start_at);
  const end = new Date(getSpanEndTime(event));
  return toDateKey(start) !== toDateKey(end);
}

function isPresenceAllDay(event: AgendaEventLike): boolean {
  const start = new Date(event.start_at).getTime();
  const end = new Date(event.end_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  return end - start > 5 * 60 * 60 * 1000;
}

function buildHourColumnCells(events: AgendaEventLike[], dateKey: string): HourCell[] {
  const hourMs = 60 * 60 * 1000;
  const gridStart = new Date(`${dateKey}T07:00:00`).getTime();
  const gridEnd = new Date(`${dateKey}T23:00:00`).getTime();
  const cells: HourCell[] = Array.from({ length: 16 }, () => ({ type: 'empty' }));

  const candidates = events
    .filter((event) => !isMultiDay(event) && !isPresenceAllDay(event))
    .filter((event) => {
      const start = new Date(event.start_at).getTime();
      const end = new Date(event.end_at).getTime();
      return end > gridStart && start < gridEnd;
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  for (const event of candidates) {
    const rawStart = new Date(event.start_at).getTime();
    const rawEnd = new Date(event.end_at).getTime();
    const start = Math.max(rawStart, gridStart);
    const end = Math.min(rawEnd, gridEnd);
    if (end <= start) continue;

    const startIdx = Math.max(0, Math.min(15, Math.floor((start - gridStart) / hourMs)));
    const endExclusive = Math.max(start + 1, end);
    const endIdxExclusive = Math.max(
      startIdx + 1,
      Math.min(16, Math.ceil((endExclusive - gridStart) / hourMs))
    );
    const span = endIdxExclusive - startIdx;

    let overlaps = false;
    for (let i = startIdx; i < endIdxExclusive; i += 1) {
      if (cells[i].type !== 'empty') {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    cells[startIdx] = { type: 'start', event, span };
    for (let i = startIdx + 1; i < endIdxExclusive; i += 1) {
      cells[i] = { type: 'covered' };
    }
  }

  return cells;
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
    <button type="button" className={`w-full rounded-md border px-2 py-1 text-left text-xs ${chipClass}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="truncate font-medium leading-tight">{event.title}</p>
        <span className={`shrink-0 text-[9px] font-bold uppercase ${srcColor}`}>{shortCode}</span>
      </div>
      <p className={`text-[10px] ${timeClass}`}>
        {formatTime(event.start_at)} – {formatTime(event.end_at)}
      </p>
    </button>
  );
}

function SlotCell({
  events,
  rowKey,
  onSelect,
  className = '',
}: {
  events: AgendaEventLike[];
  rowKey: string;
  onSelect: (event: AgendaEventLike) => void;
  className?: string;
}) {
  if (events.length === 0) {
    return <span className={`text-xs text-slate-700 ${className}`}>–</span>;
  }
  return (
    <div className={`space-y-1 ${className}`}>
      {events.map((e) => (
        <div key={`${rowKey}-${e.id}`} onClick={() => onSelect(e)}>
          <EventChip event={e} />
        </div>
      ))}
    </div>
  );
}

function EventCellButton({ event, onSelect }: { event: AgendaEventLike; onSelect: (event: AgendaEventLike) => void }) {
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
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={`h-full w-full rounded-md border px-2 py-1 text-left text-xs ${chipClass}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="truncate font-medium leading-tight">{event.title}</p>
        <span className={`shrink-0 text-[9px] font-bold uppercase ${srcColor}`}>{shortCode}</span>
      </div>
      <p className={`text-[10px] ${timeClass}`}>
        {formatTime(event.start_at)} – {formatTime(event.end_at)}
      </p>
    </button>
  );
}

export default function AgendaPage() {
  const { loading, error, events, loadEvents, loadSources } = useAgendaStore();
  const [viewMode, setViewMode] = useState<ViewMode>('1day');
  const [planningDate, setPlanningDate] = useState<string>(() => toDateKey(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<AgendaEventLike | null>(null);

  useEffect(() => {
    loadSources();
    loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14));
  }, [loadEvents, loadSources]);

  // Days to render (1 or 5)
  const displayDays = useMemo((): string[] => {
    if (viewMode === '1day') return [planningDate];
    return Array.from({ length: 5 }, (_, i) => addDaysToKey(planningDate, i));
  }, [viewMode, planningDate]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => !isCancelledEvent(event));
  }, [events]);

  // Events shown in the multi row: real multi-day OR long presence (> 5h)
  const multiDayEvents = useMemo((): AgendaEventLike[] => {
    const periodStart = new Date(`${displayDays[0]}T00:00:00`).getTime();
    const periodEnd = new Date(`${displayDays[displayDays.length - 1]}T23:59:59.999`).getTime();
    const seen = new Set<string>();
    return visibleEvents.filter((event) => {
      if ((!isMultiDay(event) && !isPresenceAllDay(event)) || seen.has(event.id)) return false;
      const s = new Date(event.start_at).getTime();
      const e = getSpanEndTime(event);
      if (s <= periodEnd && e >= periodStart) {
        seen.add(event.id);
        return true;
      }
      return false;
    });
  }, [visibleEvents, displayDays]);

  const multiDaySpans = useMemo(() => {
    if (viewMode !== '5days') return [] as Array<{ event: AgendaEventLike; startIdx: number; endIdx: number }>;
    const firstDayMs = new Date(`${displayDays[0]}T00:00:00`).getTime();
    const dayMs = 86400000;

    return multiDayEvents
      .map((event) => {
        const startKey = toDateKey(new Date(event.start_at));
        const endKey = toDateKey(new Date(getSpanEndTime(event)));
        const startMs = new Date(`${startKey}T00:00:00`).getTime();
        const endMs = new Date(`${endKey}T00:00:00`).getTime();
        const rawStart = Math.floor((startMs - firstDayMs) / dayMs);
        const rawEnd = Math.floor((endMs - firstDayMs) / dayMs);
        const startIdx = Math.max(0, rawStart);
        const endIdx = Math.min(displayDays.length - 1, rawEnd);
        return { event, startIdx, endIdx };
      })
      .filter((item) => item.startIdx <= item.endIdx)
      .sort((a, b) => {
        if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
        return b.endIdx - a.endIdx;
      });
  }, [displayDays, multiDayEvents, viewMode]);

  const oneDayProCells = useMemo(() => {
    if (viewMode !== '1day') return [] as HourCell[];
    return buildHourColumnCells(
      visibleEvents.filter((event) => event.planner_type === 'pro'),
      displayDays[0]
    );
  }, [displayDays, viewMode, visibleEvents]);

  const oneDayPersoCells = useMemo(() => {
    if (viewMode !== '1day') return [] as HourCell[];
    return buildHourColumnCells(
      visibleEvents.filter((event) => event.planner_type !== 'pro'),
      displayDays[0]
    );
  }, [displayDays, viewMode, visibleEvents]);

  const fiveDayCellsByDay = useMemo(() => {
    if (viewMode !== '5days') return {} as Record<string, HourCell[]>;
    return displayDays.reduce<Record<string, HourCell[]>>((acc, day) => {
      acc[day] = buildHourColumnCells(visibleEvents, day);
      return acc;
    }, {});
  }, [displayDays, viewMode, visibleEvents]);

  const gridCols = viewMode === '1day' ? '80px 1fr 1fr' : `80px repeat(5, 1fr)`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <AgendaNav active="overview" />

      {/* Header */}
      <div className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Agenda intelligent</p>
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

      {/* Planning */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Planning horaire</h2>
            <p className="mt-0.5 text-xs text-slate-500">07h – 22h · événements multi-jours affichés en haut</p>
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

        {/* Hourly grid */}
        {loading && visibleEvents.length === 0 ? (
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

              {/* Multi-day row (between date header and 07:00 row) */}
              {multiDayEvents.length > 0 && (
                <div
                  className="grid border-b border-white/10 bg-amber-400/5 px-3 py-2"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <span className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
                    Multi
                  </span>

                  {viewMode === '1day' ? (
                    <>
                      <SlotCell
                        events={multiDayEvents.filter((e) => e.planner_type === 'pro')}
                        rowKey="multi-pro"
                        onSelect={setSelectedEvent}
                        className="pr-1.5"
                      />
                      <SlotCell
                        events={multiDayEvents.filter((e) => e.planner_type !== 'pro')}
                        rowKey="multi-perso"
                        onSelect={setSelectedEvent}
                      />
                    </>
                  ) : (
                    <div className="col-span-5 grid grid-cols-5 gap-1">
                      {multiDaySpans.map((item, idx) => {
                        const event = item.event;
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
                          <button
                            type="button"
                            key={`multi-${event.id}-${idx}`}
                            className={`rounded-md border px-2 py-1 text-left text-xs ${chipClass}`}
                            style={{ gridColumn: `${item.startIdx + 1} / ${item.endIdx + 2}` }}
                            onClick={() => setSelectedEvent(event)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-medium">{event.title}</p>
                              <span className={`shrink-0 text-[9px] font-bold uppercase ${srcColor}`}>{shortCode}</span>
                            </div>
                            <p className="text-[10px] opacity-75">
                              {new Date(event.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                              {' → '}
                              {new Date(getSpanEndTime(event)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Hour rows (rowSpan merge for long blocks) */}
              <table className="w-full table-fixed border-collapse">
                <tbody>
                  {PLANNING_HOURS.map((hour, idx) => (
                    <tr key={hour} className="border-b border-white/5 last:border-0">
                      <td className="w-20 px-3 py-2 align-top text-sm text-slate-300">
                        {String(hour).padStart(2, '0')}:00
                      </td>

                      {viewMode === '1day' ? (
                        <>
                          {oneDayProCells[idx]?.type === 'covered' ? null : oneDayProCells[idx]?.type === 'start' ? (
                            <td rowSpan={oneDayProCells[idx].span} className="px-1.5 py-2 align-top">
                              <EventCellButton event={oneDayProCells[idx].event} onSelect={setSelectedEvent} />
                            </td>
                          ) : (
                            <td className="px-1.5 py-2 align-top text-xs text-slate-700">–</td>
                          )}

                          {oneDayPersoCells[idx]?.type === 'covered' ? null : oneDayPersoCells[idx]?.type === 'start' ? (
                            <td rowSpan={oneDayPersoCells[idx].span} className="px-1.5 py-2 align-top">
                              <EventCellButton event={oneDayPersoCells[idx].event} onSelect={setSelectedEvent} />
                            </td>
                          ) : (
                            <td className="px-1.5 py-2 align-top text-xs text-slate-700">–</td>
                          )}
                        </>
                      ) : (
                        displayDays.map((day) => {
                          const cells = fiveDayCellsByDay[day] || [];
                          const cell = cells[idx];
                          if (cell?.type === 'covered') return null;
                          if (cell?.type === 'start') {
                            return (
                              <td key={day} rowSpan={cell.span} className="px-1 py-2 align-top">
                                <EventCellButton event={cell.event} onSelect={setSelectedEvent} />
                              </td>
                            );
                          }
                          return (
                            <td key={day} className="px-1 py-2 align-top text-xs text-slate-700">–</td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={() => setSelectedEvent(null)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Détail rendez-vous</p>
                <h3 className="mt-1 text-xl font-semibold text-white">{selectedEvent.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-2 text-sm text-slate-200">
              <p>
                <span className="text-slate-400">Début: </span>
                {formatDateTime(selectedEvent.start_at)}
              </p>
              <p>
                <span className="text-slate-400">Fin: </span>
                {formatDateTime(selectedEvent.end_at)}
              </p>
              <p>
                <span className="text-slate-400">Source: </span>
                {selectedEvent.source_provider}
              </p>
              <p>
                <span className="text-slate-400">Statut: </span>
                {selectedEvent.status || 'n/a'}
              </p>
              <p>
                <span className="text-slate-400">Type: </span>
                {selectedEvent.planner_type ?? 'non défini'}
              </p>
              <p>
                <span className="text-slate-400">Durée: </span>
                {Math.max(0, Math.round((new Date(selectedEvent.end_at).getTime() - new Date(selectedEvent.start_at).getTime()) / 60000))} min
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

