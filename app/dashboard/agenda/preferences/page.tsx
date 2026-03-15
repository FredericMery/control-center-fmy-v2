"use client";

import { FormEvent, useEffect, useRef } from 'react';
import { useAgendaStore } from '@/store/agendaStore';

export default function AgendaPreferencesPage() {
  const { loading, error, preferences, loadPreferences, savePreferences } = useAgendaStore();

  const dayStartRef = useRef<HTMLInputElement | null>(null);
  const dayEndRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef<HTMLInputElement | null>(null);
  const durationRef = useRef<HTMLInputElement | null>(null);
  const weekendRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await savePreferences({
      day_start_time: dayStartRef.current?.value || '09:00',
      day_end_time: dayEndRef.current?.value || '18:00',
      minimum_buffer_minutes: Number(bufferRef.current?.value || 15),
      default_meeting_duration_minutes: Number(durationRef.current?.value || 60),
      allow_meetings_on_weekends: Boolean(weekendRef.current?.checked),
    });
  };

  const dayStartDefault = String(preferences?.day_start_time || '09:00').slice(0, 5);
  const dayEndDefault = String(preferences?.day_end_time || '18:00').slice(0, 5);
  const bufferDefault = Number(preferences?.minimum_buffer_minutes || 15);
  const durationDefault = Number(preferences?.default_meeting_duration_minutes || 60);
  const weekendDefault = Boolean(preferences?.allow_meetings_on_weekends);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">Preferences de planification</h1>
      <p className="mt-1 text-sm text-slate-300">Definissez vos regles de disponibilite.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <form
        key={preferences ? JSON.stringify(preferences) : 'defaults'}
        onSubmit={onSubmit}
        className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-200">
            Debut de journee
            <input
              ref={dayStartRef}
              type="time"
              defaultValue={dayStartDefault}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>

          <label className="text-sm text-slate-200">
            Fin de journee
            <input
              ref={dayEndRef}
              type="time"
              defaultValue={dayEndDefault}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-200">
            Buffer minimum (minutes)
            <input
              ref={bufferRef}
              type="number"
              min={0}
              max={120}
              defaultValue={bufferDefault}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>

          <label className="text-sm text-slate-200">
            Duree defaut (minutes)
            <input
              ref={durationRef}
              type="number"
              min={15}
              step={15}
              max={240}
              defaultValue={durationDefault}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            ref={weekendRef}
            type="checkbox"
            defaultChecked={weekendDefault}
            className="h-4 w-4 rounded border-white/20 bg-slate-900"
          />
          Autoriser des reunions le week-end
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
        >
          Enregistrer
        </button>
      </form>
    </div>
  );
}
