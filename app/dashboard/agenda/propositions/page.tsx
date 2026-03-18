"use client";

import { useEffect, useMemo, useState } from 'react';
import AgendaNav from '@/components/agenda/AgendaNav';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type ProposalItem = {
  id: string;
  request_text: string;
  status: string;
  workflow_status: 'created' | 'sent' | 'relanced' | 'confirmed';
  progression: number;
  proposal_mode: 'direct' | 'proposal';
  target_event_type: 'pro' | 'perso';
  first_sent_at: string | null;
  last_relance_at: string | null;
  next_relance_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<ProposalItem['workflow_status'], string> = {
  created: 'Cree',
  sent: 'Envoye',
  relanced: 'Relance',
  confirmed: 'Confirme',
};

const STATUS_COLOR: Record<ProposalItem['workflow_status'], string> = {
  created: 'bg-slate-500',
  sent: 'bg-cyan-500',
  relanced: 'bg-amber-500',
  confirmed: 'bg-emerald-500',
};

export default function AgendaProposalsPage() {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relancingId, setRelancingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/calendar/proposals', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Impossible de charger les propositions');
      setItems((json.proposals || []) as ProposalItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRelance = async (requestId: string) => {
    setRelancingId(requestId);
    setError(null);
    try {
      const response = await fetch('/api/calendar/proposals', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ requestId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Relance impossible');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setRelancingId(null);
    }
  };

  const summary = useMemo(() => {
    return {
      total: items.length,
      sent: items.filter((item) => item.workflow_status === 'sent').length,
      relanced: items.filter((item) => item.workflow_status === 'relanced').length,
      confirmed: items.filter((item) => item.workflow_status === 'confirmed').length,
    };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <AgendaNav active="proposals" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Propositions en cours</h1>
          <p className="mt-1 text-sm text-slate-400">Suivi des demandes IA de 0 a 100% avec relance manuelle.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Chargement...' : 'Rafraichir'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
          <p className="mt-2 text-3xl font-semibold text-white">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Envoye</p>
          <p className="mt-2 text-3xl font-semibold text-cyan-200">{summary.sent}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Relance</p>
          <p className="mt-2 text-3xl font-semibold text-amber-200">{summary.relanced}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Confirme</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-200">{summary.confirmed}</p>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
            Aucune proposition active.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{item.request_text}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                    <span>{item.target_event_type}</span>
                    <span>{item.proposal_mode}</span>
                    <span>{STATUS_LABEL[item.workflow_status]}</span>
                  </div>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300">
                  {new Date(item.updated_at).toLocaleString('fr-FR')}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full ${STATUS_COLOR[item.workflow_status]}`}
                  style={{ width: `${Math.max(0, Math.min(100, item.progression || 0))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">Progression: {item.progression}%</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.workflow_status !== 'confirmed' && (
                  <button
                    onClick={() => handleRelance(item.id)}
                    disabled={relancingId === item.id}
                    className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-400/25 disabled:opacity-50"
                  >
                    {relancingId === item.id ? 'Relance...' : 'Relancer'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
