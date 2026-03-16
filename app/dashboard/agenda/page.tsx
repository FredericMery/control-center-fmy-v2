"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { useAgendaStore } from '@/store/agendaStore';

function isoDaysFromNow(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

export default function AgendaPage() {
  const { loading, error, events, sources, loadEvents, loadSources } = useAgendaStore();

  useEffect(() => {
    loadSources();
    loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14));
  }, [loadEvents, loadSources]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agenda Intelligent</h1>
          <p className="text-sm text-slate-300">Vue unifiee de vos evenements et connecteurs.</p>
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
            Assistant
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

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Sources actives</p>
          <p className="mt-2 text-3xl font-semibold text-white">{sources.filter((s) => s.is_enabled).length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Evenements a venir</p>
          <p className="mt-2 text-3xl font-semibold text-white">{events.length}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Etat</p>
          <p className="mt-2 text-sm text-cyan-100">{loading ? 'Synchronisation...' : 'Pret'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Prochains rendez-vous</h2>
          <button
            onClick={() => loadEvents(isoDaysFromNow(-1), isoDaysFromNow(14))}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
          >
            Rafraichir
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun evenement sur cette periode.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 20).map((event) => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-sm font-medium text-white">{event.title}</p>
                <p className="text-xs text-slate-300">
                  {new Date(event.start_at).toLocaleString('fr-FR')} - {new Date(event.end_at).toLocaleString('fr-FR')}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-cyan-200">{event.source_provider}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
