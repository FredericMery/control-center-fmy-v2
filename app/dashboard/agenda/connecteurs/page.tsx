"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAgendaStore } from '@/store/agendaStore';
import { getAuthHeaders } from '@/lib/auth/clientSession';

export default function AgendaConnecteursPage() {
  const { loading, error, sources, loadSources, syncSource } = useAgendaStore();
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const oauthErrorMessage = useMemo(() => {
    const oauthError = searchParams.get('error');
    if (!oauthError) return null;

    switch (oauthError) {
      case 'oauth_denied':
        return 'Connexion Microsoft annulee.';
      case 'oauth_invalid':
        return 'Reponse OAuth invalide.';
      case 'oauth_state':
        return 'Session OAuth invalide ou expiree. Reessayez.';
      case 'oauth_callback':
        return 'Echec du callback Microsoft. Verifiez la configuration OAuth.';
      default:
        return 'Erreur de connexion Microsoft.';
    }
  }, [searchParams]);

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
      if (!response.ok) {
        throw new Error(json?.error || 'Impossible de lancer la connexion Microsoft');
      }

      if (!json?.authorizationUrl) {
        throw new Error('URL d\'autorisation Microsoft manquante');
      }

      window.location.assign(json.authorizationUrl);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsConnectingMicrosoft(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">Connecteurs agenda</h1>
      <p className="mt-1 text-sm text-slate-300">Connectez et synchronisez vos calendriers.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {(oauthErrorMessage || connectError) && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {oauthErrorMessage || connectError}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Microsoft 365</p>
            <p className="text-xs text-slate-300">OAuth Graph API (lecture/ecriture)</p>
          </div>
          <button
            onClick={connectMicrosoft}
            disabled={isConnectingMicrosoft}
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
          >
            {isConnectingMicrosoft ? 'Connexion...' : 'Connecter Microsoft'}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-base font-semibold text-white">Sources configurees</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune source connectee pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div>
                  <p className="text-sm font-medium text-white">{source.label}</p>
                  <p className="text-xs uppercase tracking-wide text-cyan-200">{source.provider}</p>
                  <p className="text-xs text-slate-400">
                    Derniere sync: {source.last_sync_at ? new Date(source.last_sync_at).toLocaleString('fr-FR') : 'jamais'}
                  </p>
                </div>
                <button
                  onClick={() => syncSource(source.id)}
                  disabled={loading}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Synchroniser
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
