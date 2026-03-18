"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type InboundCalendarLog = {
  id: string;
  sender_email: string | null;
  subject: string | null;
  event_uid: string | null;
  status: 'processed' | 'skipped' | 'error';
  message: string | null;
  created_at: string;
};

type EmailAlias = {
  id: string;
  email_alias: string;
  is_active: boolean;
  created_at: string;
};

export default function CalendarSettingsPage() {
  const [inboundLogs, setInboundLogs] = useState<InboundCalendarLog[]>([]);
  const [aliases, setAliases] = useState<EmailAlias[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [loadingInboundLogs, setLoadingInboundLogs] = useState(false);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [activeDeletingAliasId, setActiveDeletingAliasId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAliases = async () => {
    setLoadingAliases(true);
    try {
      const response = await fetch('/api/calendar/aliases', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de charger les aliases');
      }
      setAliases((json.aliases || []) as EmailAlias[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setAliases([]);
    } finally {
      setLoadingAliases(false);
    }
  };

  const addAlias = async () => {
    const trimmed = newAliasInput.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Entrez une adresse email valide');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsAddingAlias(true);

    try {
      const response = await fetch('/api/calendar/aliases', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ email: trimmed }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible d\'ajouter l\'alias');
      }
      setNewAliasInput('');
      setSuccessMessage('Email ajouté avec succès.');
      await loadAliases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsAddingAlias(false);
    }
  };

  const deleteAlias = async (aliasId: string) => {
    setError(null);
    setSuccessMessage(null);
    setActiveDeletingAliasId(aliasId);

    try {
      const response = await fetch(`/api/calendar/aliases?id=${aliasId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de supprimer l\'alias');
      }
      setSuccessMessage('Email supprimé.');
      await loadAliases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setActiveDeletingAliasId(null);
    }
  };

  const loadInboundLogs = async () => {
    setLoadingInboundLogs(true);
    try {
      const response = await fetch('/api/calendar/inbound/logs', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de charger les logs inbound');
      }

      setInboundLogs((json.logs || []) as InboundCalendarLog[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setInboundLogs([]);
    } finally {
      setLoadingInboundLogs(false);
    }
  };

  useEffect(() => {
    loadInboundLogs();
    loadAliases();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Calendrier professionnel</h1>
          <p className="text-sm text-slate-300">Gerez vos imports email agenda et vos adresses de reception.</p>
        </div>
        <Link
          href="/dashboard/agenda/pro"
          className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25"
        >
          Ouvrir la vue RDV pro
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {successMessage}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-base font-semibold text-white">Mes adresses email pour les invitations</h2>
        <p className="mt-1 text-xs text-slate-400">
          Enregistrez vos adresses email professionnelles et personnelles pour recevoir automatiquement les invitations agenda.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="email"
            value={newAliasInput}
            onChange={(e) => setNewAliasInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') addAlias();
            }}
            placeholder="email@entreprise.com"
            className="flex-1 rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-500"
          />
          <button
            onClick={addAlias}
            disabled={isAddingAlias || !newAliasInput.trim()}
            className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
          >
            {isAddingAlias ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>

        {loadingAliases ? (
          <p className="mt-3 text-sm text-slate-400">Chargement...</p>
        ) : aliases.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Aucune adresse enregistrée pour le moment.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {aliases.map((alias) => (
              <div key={alias.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-2.5">
                <div>
                  <p className="text-sm font-medium text-white">{alias.email_alias}</p>
                  <p className="text-xs text-slate-500">
                    Ajouté le {new Date(alias.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <button
                  onClick={() => deleteAlias(alias.id)}
                  disabled={activeDeletingAliasId === alias.id}
                  className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-2.5 py-1 text-xs text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
                >
                  {activeDeletingAliasId === alias.id ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Derniers imports email agenda</h2>
          <button
            onClick={loadInboundLogs}
            disabled={loadingInboundLogs}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loadingInboundLogs ? 'Chargement...' : 'Rafraichir'}
          </button>
        </div>

        {loadingInboundLogs ? (
          <p className="text-sm text-slate-400">Chargement des logs...</p>
        ) : inboundLogs.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun log inbound pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {inboundLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-300">
                    {new Date(log.created_at).toLocaleString('fr-FR')}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-cyan-200">{log.status}</p>
                </div>
                <p className="text-sm text-white">{log.subject || '(sans objet)'}</p>
                <p className="text-xs text-slate-400">Expediteur: {log.sender_email || 'inconnu'}</p>
                {log.event_uid && <p className="text-xs text-slate-400">UID: {log.event_uid}</p>}
                {log.message && <p className="text-xs text-amber-300">{log.message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
