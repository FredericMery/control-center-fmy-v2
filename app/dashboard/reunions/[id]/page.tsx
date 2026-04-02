"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type Meeting = {
  id: string;
  title: string;
  objective: string;
  description: string;
  meeting_date: string;
  status: 'planned' | 'ongoing' | 'completed';
};

type Participant = {
  id: string;
  name: string;
  email?: string | null;
  role: 'organizer' | 'participant' | 'decision_maker';
  source: 'manual' | 'qr' | 'ai';
};

type Action = {
  id: string;
  title: string;
  description: string;
  assigned_to?: string | null;
  assigned_email?: string | null;
  deadline?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done' | 'late';
};

type RecordRow = {
  id: string;
  transcript?: string | null;
  cleaned_transcript?: string | null;
  ai_summary?: string | null;
  ai_key_points?: string[];
  ai_decisions?: string[];
  ai_risks?: string[];
  ai_open_questions?: string[];
};

export default function ReunionDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [transcriptInput, setTranscriptInput] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [collapsedTranscript, setCollapsedTranscript] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const latestRecord = useMemo(() => records[0] || null, [records]);

  const load = useCallback(async () => {
    if (!meetingId) return;
    setError(null);

    const res = await fetch(`/api/reunions/meetings/${meetingId}`, {
      headers: await getAuthHeaders(false),
    });

    const json = (await res.json().catch(() => ({}))) as {
      meeting?: Meeting;
      participants?: Participant[];
      actions?: Action[];
      records?: RecordRow[];
      error?: string;
    };

    if (!res.ok) {
      setError(json.error || 'Erreur chargement');
      return;
    }

    setMeeting(json.meeting || null);
    setParticipants(json.participants || []);
    setActions(json.actions || []);
    setRecords(json.records || []);
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;
    void load();
  }, [meetingId, load]);

  async function processTranscript() {
    if (!meetingId || (!transcriptInput.trim() && !audioFile)) return;
    setProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      if (transcriptInput.trim()) {
        formData.append('transcript', transcriptInput.trim());
      }
      if (audioFile) {
        formData.append('audio', audioFile);
      }

      const res = await fetch(`/api/reunions/meetings/${meetingId}/process-record`, {
        method: 'POST',
        headers: await getAuthHeaders(false),
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erreur process transcript');

      setTranscriptInput('');
      setAudioFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setProcessing(false);
    }
  }

  async function toggleAction(actionId: string, current: Action['status']) {
    const next = current === 'done' ? 'in_progress' : 'done';

    const res = await fetch(`/api/reunions/actions/${actionId}/status`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ status: next }),
    });

    if (!res.ok) return;
    await load();
  }

  if (!meeting) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6">
        <p>{error || 'Chargement...'}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(150deg,#071021_0%,#0d1a34_40%,#0a1324_100%)] text-white p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-6">
          <p className="text-cyan-200/90 text-sm">{new Date(meeting.meeting_date).toLocaleString('fr-FR')}</p>
          <h1 className="mt-1 text-3xl font-semibold">{meeting.title}</h1>
          <p className="mt-3 text-white/85">{latestRecord?.ai_summary || meeting.objective || 'Resume en attente'}</p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
          <article className="rounded-2xl border border-white/10 bg-black/30 p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-medium">Actions</h2>
              <span className="text-xs text-white/70">Toggle rapide: done / in progress</span>
            </div>
            <div className="mt-3 space-y-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => toggleAction(action.id, action.status)}
                  className={`w-full text-left rounded-xl border p-3 transition ${statusStyle(action.status)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{action.title}</p>
                      <p className="text-sm opacity-90 mt-1">{action.description || 'Sans description'}</p>
                      <p className="text-xs opacity-80 mt-1">
                        {action.assigned_to || action.assigned_email || 'Non assigne'}
                        {action.deadline ? ` - deadline ${action.deadline}` : ''}
                      </p>
                    </div>
                    <span className="text-xs uppercase">{action.status}</span>
                  </div>
                </button>
              ))}

              {actions.length === 0 ? (
                <p className="text-white/65 text-sm">Aucune action. Colle une transcription pour extraction automatique.</p>
              ) : null}
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <h3 className="font-medium">Participants</h3>
              <div className="mt-3 space-y-2">
                {participants.map((person) => (
                  <div key={person.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <p className="text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-white/70">{person.email || 'Sans email'} - {person.role}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <h3 className="font-medium">Pipeline IA</h3>
              <textarea
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                placeholder="Colle la transcription brute ici..."
                className="mt-3 w-full min-h-36 rounded-xl border border-white/15 bg-black/40 p-3 text-sm outline-none focus:border-cyan-300"
              />
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="mt-3 block w-full rounded-xl border border-white/15 bg-black/40 p-2 text-xs"
              />
              {audioFile ? (
                <p className="mt-2 text-xs text-cyan-200">Audio selectionne: {audioFile.name}</p>
              ) : null}
              <button
                onClick={processTranscript}
                disabled={processing || (!transcriptInput.trim() && !audioFile)}
                className="mt-3 w-full rounded-xl bg-cyan-400 text-slate-950 font-semibold py-2 disabled:opacity-40"
              >
                {processing ? 'Analyse en cours...' : 'Audio/Transcript -> Insight -> Actions'}
              </button>
              {error ? <p className="text-red-300 text-xs mt-2">{error}</p> : null}
            </section>
          </aside>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <button
            className="text-sm text-cyan-200"
            onClick={() => setCollapsedTranscript((prev) => !prev)}
          >
            {collapsedTranscript ? 'Afficher la transcription' : 'Masquer la transcription'}
          </button>

          {!collapsedTranscript ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-white/70 mb-1">Brute</p>
                <p className="text-sm whitespace-pre-wrap">{latestRecord?.transcript || 'Aucune transcription'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-xs text-white/70 mb-1">Nettoyee</p>
                <p className="text-sm whitespace-pre-wrap">{latestRecord?.cleaned_transcript || 'Aucune transcription nettoyee'}</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function statusStyle(status: Action['status']) {
  if (status === 'done') return 'border-emerald-300/40 bg-emerald-500/20';
  if (status === 'in_progress') return 'border-orange-300/50 bg-orange-500/20';
  if (status === 'late') return 'border-red-300/60 bg-red-500/20';
  return 'border-cyan-300/30 bg-cyan-500/10';
}
