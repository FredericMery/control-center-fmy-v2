'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';

type SuggestedAction = {
  id: string;
  label: string;
  description: string;
  usageCount: number;
};

type ScanResponse = {
  detectedType: string;
  detectedLabel: string;
  suggestedTemplateId?: string;
  parsed: {
    title?: string;
    summary?: string;
    structured_data?: Record<string, unknown>;
  };
  rawText: string;
  suggestions: SuggestedAction[];
};

export default function MemoryScanPage() {
  const { t } = useI18n();
  const templateOptions = useMemo(
    () => [
      ...Object.entries(MEMORY_TEMPLATES).map(([id, template]) => ({ id, name: template.name })),
      { id: 'other', name: t('memory.scan.templateOther') },
    ],
    [t]
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationCode, setValidationCode] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingExecute, setLoadingExecute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('other');
  const [executedMemoryId, setExecutedMemoryId] = useState<string | null>(null);

  async function onImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    setImageBase64(base64);
    setSelectedFileName(file.name);
    setExecutedMemoryId(null);
    setError(null);
  }

  async function runSmartScan() {
    if (!validationCode.trim()) {
      setError(t('memory.scan.errors.validationCode'));
      return;
    }

    if (!imageBase64) {
      setError(t('memory.scan.errors.imageBeforeScan'));
      fileInputRef.current?.click();
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
        setError(json?.error || t('memory.scan.errors.scan'));
        return;
      }

      const nextResult = json as ScanResponse;
      setScanResult(nextResult);
      setSelectedTemplateId(nextResult.suggestedTemplateId || 'other');
    } catch {
      setError(t('memory.scan.errors.networkScan'));
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
          sourceImage: imageBase64,
          selectedTemplateId,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.scan.errors.execute'));
        return;
      }

      setExecutedMemoryId(json?.memory?.id || null);
    } catch {
      setError(t('memory.scan.errors.networkExecute'));
    } finally {
      setLoadingExecute(false);
    }
  }

  function resetScan() {
    setImageBase64(null);
    setSelectedFileName('');
    setScanResult(null);
    setSelectedTemplateId('other');
    setExecutedMemoryId(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('memory.scan.title')}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {t('memory.scan.subtitle')}
            </p>
          </div>
          <Link
            href="/dashboard/memoire"
            className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
          >
            {t('common.back')}
          </Link>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">
              {t('memory.scan.validationCode')}
            </label>
            <input
              type="password"
              value={validationCode}
              onChange={(e) => setValidationCode(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
              placeholder={t('memory.scan.validationCodePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onImageSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
            >
              {t('memory.scan.chooseImage')}
            </button>
            <p className="text-xs text-slate-400">
              {selectedFileName || t('memory.scan.noFile')}
            </p>
          </div>

          <button
            onClick={runSmartScan}
            disabled={loadingScan || loadingExecute}
            className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {loadingScan ? t('memory.scan.scanning') : t('memory.scan.scanButton')}
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
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">{t('memory.scan.detectedContent')}</p>
              <h2 className="mt-1 text-2xl font-semibold">{scanResult.detectedLabel}</h2>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wide text-emerald-200">
                {t('memory.scan.targetTemplate')}
              </label>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="w-full rounded-md border border-emerald-300/40 bg-slate-900/70 px-3 py-2 text-sm text-white"
              >
                {templateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-emerald-100">{t('memory.scan.suggestedActions')}</p>
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
              {t('common.cancel')}
            </button>
          </div>
        )}

        {executedMemoryId && (
          <div className="rounded-xl border border-sky-300/40 bg-sky-500/10 p-4 text-sm text-sky-100">
            {t('memory.scan.executionSuccess')}
            <div className="mt-3 flex gap-3">
              <Link
                href="/dashboard/memoire/list"
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
              >
                {t('memory.scan.viewMemories')}
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
