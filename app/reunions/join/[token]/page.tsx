"use client";

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type PublicMeeting = {
  id: string;
  title: string;
  objective?: string;
  meeting_date: string;
  status: string;
};

export default function PublicJoinMeetingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMeeting = useCallback(async () => {
    if (!token) return;

    const res = await fetch(`/api/reunions/join/${token}`);
    const json = (await res.json().catch(() => ({}))) as { meeting?: PublicMeeting; error?: string };

    if (!res.ok) {
      setError(json.error || 'Lien invalide');
      return;
    }

    setMeeting(json.meeting || null);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadMeeting();
  }, [token, loadMeeting]);

  async function join() {
    if (!token || !name.trim()) return;
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/reunions/join/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
    });

    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error || 'Inscription impossible');
      return;
    }

    setStatus('Tu es bien inscrit(e) a la reunion.');
    setName('');
    setEmail('');
    setPhone('');
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_80%_20%,#1f4d40_0%,#0a1514_42%,#050708_100%)] text-white p-4">
      <div className="max-w-xl mx-auto mt-10 rounded-3xl border border-emerald-300/30 bg-black/35 p-6 backdrop-blur-xl">
        <p className="text-xs text-emerald-200/90 uppercase tracking-[0.18em]">Meeting Join</p>
        <h1 className="text-2xl font-semibold mt-2">{meeting?.title || 'Chargement...'}</h1>
        {meeting ? (
          <p className="text-sm text-white/80 mt-2">
            {new Date(meeting.meeting_date).toLocaleString('fr-FR')} - {meeting.objective || 'Sans objectif'}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          <input
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
            placeholder="Ton nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
            placeholder="Ton email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
            placeholder="Ton telephone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <button
            onClick={join}
            disabled={!name.trim()}
            className="w-full rounded-xl bg-emerald-400 text-slate-950 font-semibold py-2 disabled:opacity-50"
          >
            Participer
          </button>

          {status ? <p className="text-emerald-200 text-sm">{status}</p> : null}
          {error ? <p className="text-red-300 text-sm">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
