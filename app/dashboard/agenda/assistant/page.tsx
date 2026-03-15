"use client";

import { FormEvent, useState } from 'react';
import { useAgendaStore } from '@/store/agendaStore';

export default function AgendaAssistantPage() {
  const { loading, error, proposal, askScheduler, confirmSlot } = useAgendaStore();
  const [prompt, setPrompt] = useState('Planifie un point de 45 min avec paul@blackwaves.fr et amina@alhenaservices.com semaine prochaine en matinée');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await askScheduler(prompt);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">Assistant de planification</h1>
      <p className="mt-1 text-sm text-slate-300">Decrivez votre besoin et l&apos;IA propose les meilleurs creneaux.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white"
          placeholder="Ex: planifie un rendez-vous de 30 min avec..."
        />

        <div className="mt-3 flex items-center justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
          >
            Proposer des creneaux
          </button>
        </div>
      </form>

      {proposal && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <h2 className="text-base font-semibold text-white">{proposal.title}</h2>
          <p className="mt-1 text-xs text-slate-400">Selectionnez un creneau pour confirmer.</p>

          <div className="mt-3 space-y-2">
            {proposal.slots.slice(0, 6).map((slot) => (
              <div key={`${slot.startAt}-${slot.endAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div>
                  <p className="text-sm text-white">{new Date(slot.startAt).toLocaleString('fr-FR')}</p>
                  <p className="text-xs text-slate-300">{new Date(slot.endAt).toLocaleString('fr-FR')}</p>
                  <p className="text-[11px] text-cyan-200">Score {slot.score}</p>
                </div>
                <button
                  onClick={() => confirmSlot(slot)}
                  className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/25"
                >
                  Confirmer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
