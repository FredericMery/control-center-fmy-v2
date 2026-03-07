'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type SuggestedAction = {
  id: string;
  label: string;
  description: string;
  usageCount: number;
};

type ScanResponse = {
  detectedType: string;
  detectedLabel: string;
  parsed: {
    title?: string;
    summary?: string;
    structured_data?: Record<string, unknown>;
  };
  rawText: string;
  suggestions: SuggestedAction[];
};

export default function MemoryScanPage() {
  const [validationCode, setValidationCode] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [executedMemoryId, setExecutedMemoryId] = useState<string | null>(null);

  async function onImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    setImageBase64(base64);
    setExecutedMemoryId(null);
  }

  async function runSmartScan() {
    if (!imageBase64) {
      setError('Selectionnez une image.');
      return;
    }

    setError(null);
    setLoadingScan(true);
    setScanResult(null);

    try {
      const response = await fetch('/api/memory/assistant/scan', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          imageBase64,
          validationCode,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || 'Erreur de scan');
        return;
      }

      setScanResult(json as ScanResponse);
    } catch {
      setError('Erreur reseau pendant le scan');
    } finally {
      setLoadingScan(false);
    }
  }

  async function executeAction(actionId: string) {
    if (!scanResult) return;

    setLoadingExecute(true);
    setError(null);
    setExecutedMemoryId(null);

    try {
      const response = await fetch('/api/memory/assistant/execute', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          validationCode,
          actionId,
          detectedType: scanResult.detectedType,
          parsed: scanResult.parsed,
          rawText: scanResult.rawText,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || 'Erreur execution action');
        return;
      }

      setExecutedMemoryId(json?.memory?.id || null);
    } catch {
      setError('Erreur reseau pendant l execution');
    } finally {
      setLoadingExecute(false);
    }
  }

  function resetScan() {
    setImageBase64(null);
    setScanResult(null);
    setExecutedMemoryId(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Scan intelligent</h1>
            <p className="mt-1 text-sm text-slate-300">
              Image -&gt; OCR -&gt; interpretation IA -&gt; suggestion d&apos;action
            </p>
          </div>
          <Link
            href="/dashboard/memoire"
            className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
          >
            Retour
          </Link>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">
              Code validation IA
            </label>
            <input
              type="password"
              value={validationCode}
              onChange={(e) => setValidationCode(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              placeholder="Entrez le code"
            />
          </div>

          <div>
            <input
              type="file"
              accept="image/*"
              onChange={onImageSelected}
              className="block w-full text-sm"
            />
          </div>

          <button
            onClick={runSmartScan}
            disabled={!imageBase64 || !validationCode || loadingScan || loadingExecute}
            className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {loadingScan ? 'Analyse en cours...' : 'Scanner'}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {scanResult && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Detected content</p>
              <h2 className="mt-1 text-2xl font-semibold">{scanResult.detectedLabel}</h2>
            </div>

            <div>
              <p className="text-sm font-medium text-emerald-100">Suggested actions:</p>
              <div className="mt-2 space-y-2">
                {scanResult.suggestions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => executeAction(action.id)}
                    disabled={loadingExecute}
                    className="w-full rounded-md border border-emerald-300/40 bg-emerald-400/10 p-3 text-left hover:bg-emerald-400/20 disabled:opacity-50"
                  >
                    <p className="text-sm font-semibold">{action.label}</p>
                    <p className="text-xs text-emerald-100/90">{action.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={resetScan}
              className="rounded-md border border-slate-500 px-3 py-2 text-sm hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        )}

        {executedMemoryId && (
          <div className="rounded-xl border border-sky-300/40 bg-sky-500/10 p-4 text-sm text-sky-100">
            Action executee. Memoire creee avec succes.
            <div className="mt-3 flex gap-3">
              <Link
                href="/dashboard/memoire/list"
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
              >
                View memories
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
