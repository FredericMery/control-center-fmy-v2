"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type MeetingRow = {
  id: string;
  title: string;
  objective: string;
  meeting_date: string;
  status: 'planned' | 'ongoing' | 'completed';
  ai_generated: boolean;
  public_join_path?: string | null;
};

type CreationPreview = {
  meetingId: string;
  joinUrl: string;
  qrUrl: string;
};

export default function ReunionsPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [kpi, setKpi] = useState({ late: 0, upcoming: 0, completed: 0 });
  const [creationPreview, setCreationPreview] = useState<CreationPreview | null>(null);

  const upcomingMeetings = useMemo(() => {
    const now = Date.now();
    return meetings.filter((meeting) => new Date(meeting.meeting_date).getTime() > now);
  }, [meetings]);

  useEffect(() => {
    void loadMeetings();
  }, []);

  async function loadMeetings() {
    setError(null);
    try {
      const res = await fetch('/api/reunions/meetings?limit=60', {
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as { meetings?: MeetingRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || 'Erreur chargement reunions');

      const rows = json.meetings || [];
      setMeetings(rows);

      const now = Date.now();
      const completed = rows.filter((row) => row.status === 'completed').length;
      const upcoming = rows.filter((row) => new Date(row.meeting_date).getTime() > now).length;
      setKpi({ completed, upcoming, late: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur reseau');
    }
  }

  async function createWithAi() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/reunions/meetings', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ prompt: cleanPrompt }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        meeting?: MeetingRow;
        error?: string;
        joinUrl?: string;
        qrUrl?: string;
      };

      if (!res.ok) throw new Error(json.error || 'Erreur creation reunion');

      const joinUrl = String(json.joinUrl || '').trim();
      const qrUrl = String(json.qrUrl || '').trim();
      if (json.meeting?.id && joinUrl && qrUrl) {
        setCreationPreview({
          meetingId: json.meeting.id,
          joinUrl,
          qrUrl,
        });
      }

      setPrompt('');
      await loadMeetings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur creation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#16324f_0%,#0b1220_45%,#05070f_100%)] p-4 md:p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-cyan-400/20 bg-black/30 p-6 backdrop-blur-xl">
          <p className="text-cyan-300 text-sm tracking-[0.2em] uppercase">Meeting Intelligence</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold">Un seul point d entree. Tout le reste est automatique.</h1>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-3 md:p-4">
            <label className="block text-sm text-cyan-100/90 mb-2">✨ Ask AI</label>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-cyan-300"
                placeholder="Create a meeting with Marc and Stephane tomorrow at 10am about Renault project"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                onClick={createWithAi}
                disabled={loading || !prompt.trim()}
                className="rounded-xl bg-cyan-400 text-slate-950 px-5 py-3 font-semibold disabled:opacity-40"
              >
                {loading ? 'Creation...' : 'Lancer'}
              </button>
            </div>
            {error ? <p className="mt-3 text-red-300 text-sm">{error}</p> : null}
          </div>
        </section>

        {creationPreview ? (
          <section className="rounded-3xl border border-emerald-300/30 bg-emerald-500/10 p-5">
            <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <div>
                <p className="text-sm text-emerald-200">Flashcode de participation pret</p>
                <p className="text-xs text-white/80 mt-1 break-all">{creationPreview.joinUrl}</p>
                <Link
                  href={`/dashboard/reunions/${creationPreview.meetingId}`}
                  className="inline-flex mt-3 text-sm text-emerald-200 underline"
                >
                  Ouvrir la reunion
                </Link>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white p-2 w-fit">
                <img
                  src={creationPreview.qrUrl}
                  alt="QR code de participation"
                  className="w-40 h-40"
                />
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard label="Reunions prevues" value={String(kpi.upcoming)} tone="cyan" />
          <KpiCard label="Reunions terminees" value={String(kpi.completed)} tone="emerald" />
          <KpiCard label="Actions en retard" value={String(kpi.late)} tone="amber" />
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/35 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium">Reunions</h2>
            <span className="text-xs text-cyan-100/80">{upcomingMeetings.length} a venir</span>
          </div>

          <div className="mt-4 space-y-3">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/dashboard/reunions/${meeting.id}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 hover:border-cyan-300/50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{meeting.title}</p>
                    <p className="text-sm text-white/70 mt-1">{meeting.objective || 'Sans objectif'}</p>
                    <p className="text-xs text-cyan-100/90 mt-2">
                      {new Date(meeting.meeting_date).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right space-y-2">
                    <StatusPill status={meeting.status} />
                    {meeting.ai_generated ? <p className="text-xs text-cyan-300">AI-first</p> : null}
                  </div>
                </div>
              </Link>
            ))}

            {meetings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-white/70">
                Aucune reunion pour le moment. Ecris une phrase dans Ask AI pour demarrer.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: 'cyan' | 'emerald' | 'amber' }) {
  const toneClass =
    tone === 'emerald'
      ? 'from-emerald-500/30 to-emerald-300/5 border-emerald-300/30'
      : tone === 'amber'
      ? 'from-amber-500/25 to-amber-200/5 border-amber-300/30'
      : 'from-cyan-500/30 to-cyan-200/5 border-cyan-300/30';

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClass} p-4`}>
      <p className="text-sm text-white/80">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: 'planned' | 'ongoing' | 'completed' }) {
  const style =
    status === 'completed'
      ? 'bg-emerald-400/20 text-emerald-200 border-emerald-300/40'
      : status === 'ongoing'
      ? 'bg-amber-400/20 text-amber-200 border-amber-300/40'
      : 'bg-sky-400/20 text-sky-200 border-sky-300/40';

  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${style}`}>{status}</span>;
}
