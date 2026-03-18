"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AgendaNav from '@/components/agenda/AgendaNav';
import { useAgendaStore } from '@/store/agendaStore';
import { getAuthHeaders } from '@/lib/auth/clientSession';

export default function AgendaConnecteursPage() {
  const { loading, error, sources, loadSources, syncSource } = useAgendaStore();
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const oauthErrorMessage = useMemo(() => {
    const oauthError = searchParams.get('error');
    if (!oauthError) return null;
    const messages: Record<string, string> = {
      oauth_denied: 'Connexion Microsoft annulée.',
      oauth_invalid: 'Réponse OAuth invalide.',
      oauth_state: 'Session OAuth invalide ou expirée. Réessayez.',
      oauth_callback: 'Échec du callback Microsoft. Vérifiez la configuration OAuth.',
    };
    return messages[oauthError] ?? 'Erreur de connexion Microsoft.';
  }, [searchParams]);

  const justConnected = searchParams.get('connected');

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const connectMicrosoft = async () => {
    setConnectError(null);
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetch('/api/calendar/connect/microsoft?redirectPath=/dashboard/agenda/connecteurs', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'Impossible de lancer la connexion Microsoft');
      if (!json?.authorizationUrl) throw new Error("URL d'autorisation Microsoft manquante");
      window.location.assign(json.authorizationUrl);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsConnectingMicrosoft(false);
    }
  };

  const handleSync = async (sourceId: string) => {
    setSyncingId(sourceId);
    await syncSource(sourceId);
    setSyncingId(null);
  };

  const enabledCount = sources.filter((s) => s.is_enabled).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <AgendaNav active="connectors" />

      <h1 className="text-2xl font-semibold text-white">Connecteurs agenda</h1>
      <p className="mt-1 text-sm text-slate-400">Connectez et synchronisez vos calendriers.</p>

      {/* Banners */}
      {justConnected && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          ✓ Calendrier <span className="font-medium capitalize">{justConnected}</span> connecté avec succès.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      {(oauthErrorMessage || connectError) && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {oauthErrorMessage ?? connectError}
        </div>
      )}

      {/* Connectors */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Ajouter une source</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-lg">
              🏢
            </div>
            <div>
              <p className="text-sm font-medium text-white">Microsoft 365</p>
              <p className="text-xs text-slate-400">OAuth Graph API · lecture/écriture</p>
            </div>
          </div>
          <button
            onClick={connectMicrosoft}
            disabled={isConnectingMicrosoft}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
          >
            {isConnectingMicrosoft ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-cyan-300 border-t-transparent" />
                Connexion…
              </>
            ) : (
              'Connecter Microsoft'
            )}
          </button>
        </div>
      </div>

      {/* Sources list */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Sources configurées</h2>
          {enabledCount > 0 && (
            <span className="text-xs text-emerald-300">
              {enabledCount} active{enabledCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading && sources.length === 0 ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-700/60" />
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-700/40" />
              </div>
            ))}
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 text-3xl">🔗</div>
            <p className="text-sm text-slate-400">Aucune source connectée pour le moment.</p>
            <p className="mt-1 text-xs text-slate-500">Connectez Microsoft 365 ci-dessus pour commencer.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 transition hover:border-white/20"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${source.is_enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{source.label}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{source.provider}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sync :{' '}
                      {source.last_sync_at
                        ? new Date(source.last_sync_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : 'jamais'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleSync(source.id)}
                  disabled={loading || syncingId === source.id}
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {syncingId === source.id ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                      Sync…
                    </>
                  ) : (
                    'Synchroniser'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
