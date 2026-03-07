'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';

type SubscriptionFeatures = {
  memory?: boolean;
  ai?: boolean;
};

export default function MemorePage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [canAccessAiBrain, setCanAccessAiBrain] = useState(false);

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const response = await fetch('/api/settings/subscription', {
          headers: await getAuthHeaders(false),
        });
        const json = await response.json();

        if (!response.ok) {
          setCanAccessAiBrain(false);
          return;
        }

        const features = (json?.subscription?.features || {}) as SubscriptionFeatures;
        setCanAccessAiBrain(Boolean(features.memory && features.ai));
      } catch {
        setCanAccessAiBrain(false);
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-700 bg-slate-900/60 p-6">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (!canAccessAiBrain) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-xl border border-amber-400/40 bg-amber-500/10 p-6 space-y-3">
          <h1 className="text-2xl font-semibold">{t('memory.aiBrainLocked')}</h1>
          <p className="text-sm text-amber-100">
            {t('memory.accessRequired')}
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-block rounded-md bg-white px-3 py-2 text-sm text-black"
          >
            {t('memory.goToSettings')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">{t('memory.assistantTitle')}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {t('memory.assistantSubtitle')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/dashboard/memoire/scan"
            className="rounded-xl border border-emerald-300/60 bg-emerald-500/15 p-6 hover:bg-emerald-500/25 transition"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">{t('memory.assistantCardTag')}</p>
            <h2 className="mt-2 text-2xl font-semibold">{t('memory.assistantScan')}</h2>
            <p className="mt-2 text-sm text-slate-200">
              {t('memory.assistantScanDescription')}
            </p>
          </Link>

          <Link
            href="/dashboard/memoire/list"
            className="rounded-xl border border-slate-500/60 bg-slate-700/20 p-6 hover:bg-slate-700/35 transition"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{t('memory.knowledgeTag')}</p>
            <h2 className="mt-2 text-2xl font-semibold">{t('memory.viewMemories')}</h2>
            <p className="mt-2 text-sm text-slate-200">
              {t('memory.viewMemoriesDescription')}
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
