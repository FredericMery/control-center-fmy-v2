"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type SourceRow = {
  id: string;
  provider: string;
  label: string;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error?: string | null;
};

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
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [email, setEmail] = useState('');
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [inboundLogs, setInboundLogs] = useState<InboundCalendarLog[]>([]);
  const [aliases, setAliases] = useState<EmailAlias[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingInboundLogs, setLoadingInboundLogs] = useState(false);
  const [loadingAliases, setLoadingAliases] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [activeSourceActionId, setActiveSourceActionId] = useState<string | null>(null);
  const [activeDeletingAliasId, setActiveDeletingAliasId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const oauthMessage = useMemo(() => {
    const connected = searchParams.get('connected');
    const oauthError = searchParams.get('error');

    if (connected === 'microsoft') {
      return { type: 'success' as const, message: 'Calendrier Microsoft connecte avec succes.' };
    }

    if (!oauthError) return null;

    const map: Record<string, string> = {
      oauth_denied: 'Connexion Microsoft annulee.',
      oauth_invalid: 'Reponse OAuth invalide.',
      oauth_state: 'Session OAuth invalide ou expiree. Reessayez.',
      oauth_callback: 'Echec du callback Microsoft. Verifiez la configuration OAuth.',
    };

    return {
      type: 'error' as const,
      message: map[oauthError] || 'Erreur de connexion Microsoft.',
    };
  }, [searchParams]);

  useEffect(() => {
    if (!user?.email) return;
    setEmail(user.email);
  }, [user?.email]);

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

  const loadSources = async () => {
    setLoadingSources(true);
    setError(null);
    try {
      const response = await fetch('/api/calendar/sources', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de charger les sources agenda');
      }

      setSources((json.sources || []) as SourceRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSources([]);
    } finally {
      setLoadingSources(false);
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
    loadSources();
    loadInboundLogs();
    loadAliases();
  }, []);

  const connectMicrosoft = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsConnecting(true);

    try {
      const params = new URLSearchParams({
        redirectPath: '/dashboard/settings/calendar',
      });

      if (email.trim()) {
        params.set('loginHint', email.trim());
      }

      const response = await fetch(`/api/calendar/connect/microsoft?${params.toString()}`, {
        headers: await getAuthHeaders(false),
      });

      const json = await response.json();
      if (!response.ok || !json?.authorizationUrl) {
        throw new Error(json?.error || 'Impossible de lancer la connexion Microsoft');
      }

      window.location.assign(json.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsConnecting(false);
    }
  };

  const syncSourceNow = async (sourceId: string) => {
    setError(null);
    setSuccessMessage(null);
    setActiveSourceActionId(sourceId);

    try {
      const response = await fetch(`/api/calendar/sources/${sourceId}/sync`, {
        method: 'POST',
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Synchronisation impossible');
      }

      setSuccessMessage(`Synchronisation terminee (${Number(json?.synced || 0)} element(s)).`);
      await loadSources();
      await loadInboundLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setActiveSourceActionId(null);
    }
  };

  const disconnectSource = async (sourceId: string) => {
    setError(null);
    setSuccessMessage(null);
    setActiveSourceActionId(sourceId);

    try {
      const response = await fetch(`/api/calendar/sources/${sourceId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Deconnexion impossible');
      }

      setSuccessMessage('Source Microsoft deconnectee.');
      await loadSources();
      await loadInboundLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setActiveSourceActionId(null);
    }
  };

  const microsoftSources = sources.filter((source) => source.provider === 'microsoft');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Calendrier professionnel</h1>
          <p className="text-sm text-slate-300">Connectez Microsoft 365 pour synchroniser vos rendez-vous pro dans Supabase.</p>
        </div>
        <Link
          href="/dashboard/agenda/pro"
          className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/25"
        >
          Ouvrir la vue RDV pro
        </Link>
      </div>

      {oauthMessage && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            oauthMessage.type === 'success'
              ? 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
              : 'border border-rose-400/40 bg-rose-400/10 text-rose-100'
          }`}
        >
          {oauthMessage.message}
        </div>
      )}

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

      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-base font-semibold text-white">Connexion Microsoft 365</h2>
        <p className="mt-1 text-xs text-slate-400">
          Pour la securite Microsoft, le mot de passe n\'est jamais saisi dans l\'application: il est demande uniquement sur la page Microsoft.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Adresse email professionnelle
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@entreprise.com"
              className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            onClick={connectMicrosoft}
            disabled={isConnecting}
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-60"
          >
            {isConnecting ? 'Connexion...' : 'Connecter Microsoft'}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Etat de synchronisation</h2>

        {loadingSources ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : microsoftSources.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune source Microsoft connectee pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {microsoftSources.map((source) => (
              <div key={source.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <p className="text-sm font-medium text-white">{source.label}</p>
                <p className="text-xs text-slate-300">
                  Derniere synchro: {source.last_sync_at ? new Date(source.last_sync_at).toLocaleString('fr-FR') : 'jamais'}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-cyan-200">
                  {source.last_sync_status || 'inconnu'}
                </p>
                {source.last_sync_error && <p className="text-xs text-rose-300">{source.last_sync_error}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => syncSourceNow(source.id)}
                    disabled={activeSourceActionId === source.id}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {activeSourceActionId === source.id ? 'Traitement...' : 'Synchroniser maintenant'}
                  </button>

                  <button
                    onClick={() => disconnectSource(source.id)}
                    disabled={activeSourceActionId === source.id}
                    className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
                  >
                    Deconnecter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
