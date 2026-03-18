"use client";

import { FormEvent, useState } from 'react';
import AgendaNav from '@/components/agenda/AgendaNav';
import { useAgendaStore } from '@/store/agendaStore';

const EXAMPLE_PROMPTS = [
  'Point 30 min avec paul@blackwaves.fr demain matin',
  'Réunion de 45 min avec amina@alhena.com semaine prochaine',
  'Call d\'1h avec toute l\'équipe vendredi après-midi',
];

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(score * 100)));
  const color = pct >= 80 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-slate-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-500">{pct}%</span>
    </div>
  );
}

export default function AgendaAssistantPage() {
  const { loading, error, proposal, askScheduler, confirmSlot } = useAgendaStore();
  const [prompt, setPrompt] = useState('');
  const [confirmedSlot, setConfirmedSlot] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setConfirmedSlot(null);
    await askScheduler(prompt);
  };

  const handleConfirm = async (slot: Parameters<typeof confirmSlot>[0]) => {
    await confirmSlot(slot);
    setConfirmedSlot(`${slot.startAt}-${slot.endAt}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <AgendaNav active="assistant" />

      <h1 className="text-2xl font-semibold text-white">Assistant de planification</h1>
      <p className="mt-1 text-sm text-slate-400">Décrivez votre besoin en langage naturel, l&apos;IA propose les meilleurs créneaux.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400/40 focus:outline-none"
          placeholder="Ex : réunion de 45 min avec paul@example.com vendredi matin…"
        />

        {/* Example chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-lg border border-white/10 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-white/20 hover:text-slate-200"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end">
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-cyan-300 border-t-transparent" />
                Analyse en cours…
              </>
            ) : (
              'Proposer des créneaux'
            )}
          </button>
        </div>
      </form>

      {proposal && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">{proposal.title}</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {proposal.slots.length} créneau{proposal.slots.length > 1 ? 'x' : ''} proposé{proposal.slots.length > 1 ? 's' : ''} — sélectionnez-en un pour confirmer.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {proposal.slots.slice(0, 6).map((slot) => {
              const key = `${slot.startAt}-${slot.endAt}`;
              const isConfirmed = confirmedSlot === key;
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-3 transition ${isConfirmed ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-slate-950/60 hover:border-white/20'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white capitalize">
                        {new Date(slot.startAt).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        {', '}
                        {new Date(slot.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(slot.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ScoreBar score={slot.score} />
                        {slot.reasons && slot.reasons.length > 0 && (
                          <span className="text-[11px] text-slate-500">{slot.reasons[0]}</span>
                        )}
                      </div>
                    </div>
                    {isConfirmed ? (
                      <span className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-200">
                        ✓ Confirmé
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConfirm(slot)}
                        disabled={loading}
                        className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
