"use client";

import { useMemo, useState } from 'react';
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
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AgendaProPage() {
  const [date, setDate] = useState(todayInputValue());
  const [events, setEvents] = useState<ProEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const humanDate = useMemo(() => {
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
      const params = new URLSearchParams({
        startAt,
        endAt,
        category: 'pro',
        statuses: 'confirmed,tentative',
      });

      const response = await fetch(`/api/calendar/events?${params.toString()}`, {
        headers: await getAuthHeaders(false),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de charger les rendez-vous pro');
      }

      setEvents((json.events || []) as ProEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Rendez-vous pro</h1>
          <p className="text-sm text-slate-300">Choisissez une date pour afficher vos rendez-vous professionnels.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/agenda/connecteurs"
            className="rounded-xl border border-white/15 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Connecteurs
          </Link>
          <Link
            href="/dashboard/settings/calendar"
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
          >
            Parametres pro
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            onClick={() => loadForDate(date)}
            disabled={loading}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Chargement...' : 'Afficher mes RDV pro'}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-400">Date selectionnee: {humanDate}</p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Resultats</h2>

        {events.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun rendez-vous pro sur cette date.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-sm font-medium text-white">{event.title}</p>
                <p className="text-xs text-slate-300">
                  {new Date(event.start_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {' - '}
                  {new Date(event.end_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {event.location && <p className="text-xs text-slate-400">{event.location}</p>}
                <p className="mt-1 text-[11px] uppercase tracking-wide text-cyan-200">
                  {event.source_provider} • {event.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
