"use client";

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AgendaNav from '@/components/agenda/AgendaNav';
import { getAuthHeaders } from '@/lib/auth/clientSession';

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function AgendaNewEventPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'pro' | 'perso'>('pro');
  const [date, setDate] = useState(todayDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [participants, setParticipants] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participantList = useMemo(
    () => participants.split(',').map((email) => email.trim()).filter(Boolean),
    [participants]
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const localStart = new Date(`${date}T${startTime}:00`);
    const localEnd = new Date(`${date}T${endTime}:00`);

    if (!title.trim()) {
      setError('Le titre est obligatoire.');
      return;
    }
    if (Number.isNaN(localStart.getTime()) || Number.isNaN(localEnd.getTime())) {
      setError('Date/heure invalide.');
      return;
    }
    if (localEnd <= localStart) {
      setError('L\'heure de fin doit etre apres l\'heure de debut.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          event: {
            title,
            type,
            startAt: localStart.toISOString(),
            endAt: localEnd.toISOString(),
            attendees: participantList.map((email) => ({ email })),
            status: 'confirmed',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
          },
        }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Creation impossible');

      router.push(type === 'pro' ? '/dashboard/agenda/pro' : '/dashboard/agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <AgendaNav active="overview" />

      <h1 className="text-2xl font-semibold text-white">Nouveau rendez-vous</h1>
      <p className="mt-1 text-sm text-slate-400">Choisissez PRO ou PERSO avant la creation.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-200">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'pro' | 'perso')}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            >
              <option value="pro">PRO</option>
              <option value="perso">PERSO</option>
            </select>
          </label>

          <label className="text-sm text-slate-200">
            Titre
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
              placeholder={type === 'pro' ? 'Reunion client' : 'Rendez-vous perso'}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-200">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>

          <label className="text-sm text-slate-200">
            Debut
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>

          <label className="text-sm text-slate-200">
            Fin
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            />
          </label>
        </div>

        <label className="text-sm text-slate-200">
          Participants (emails, separes par virgule)
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-white"
            placeholder="alice@entreprise.com, bob@entreprise.com"
          />
        </label>

        {type === 'pro' && (
          <p className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">
            En mode PRO, l&apos;email professionnel configure dans les preferences est ajoute automatiquement comme organisateur.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50"
          >
            {loading ? 'Creation...' : 'Creer le rendez-vous'}
          </button>
        </div>
      </form>
    </div>
  );
}
