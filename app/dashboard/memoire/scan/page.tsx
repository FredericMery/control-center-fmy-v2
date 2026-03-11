'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useEffect } from 'react';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';

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

type TemplateFieldValues = Record<string, string>;

type MemoryTypeField = {
  id: string;
  label: string;
  type: string;
  order: number;
  options: string[] | null;
};

type MemoryTypeOption = {
  id: string;
  templateId: string;
  name: string;
  description: string;
  isCommunity: boolean;
  fields: MemoryTypeField[];
};

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_');
}

function renderTemplateFieldInput(args: {
  field: MemoryTypeField;
  value: string;
  onChange: (next: string) => void;
}): React.ReactNode {
  const { field, value, onChange } = args;

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
      />
    );
  }

  if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
      >
        <option value="">--</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'rating') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
      >
        <option value="">--</option>
        {[1, 2, 3, 4, 5].map((entry) => (
          <option key={entry} value={String(entry)}>
            {entry}
          </option>
        ))}
      </select>
    );
  }

  const typeMap: Record<string, string> = {
    number: 'number',
    date: 'date',
    email: 'email',
    phone: 'tel',
    url: 'url',
  };

  const inputType = typeMap[field.type] || 'text';

  return (
    <input
      type={inputType}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
    />
  );
}

export default function MemoryScanPage() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [typeOptions, setTypeOptions] = useState<MemoryTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const [validationCode, setValidationCode] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [loadingScan, setLoadingScan] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftContent, setDraftContent] = useState<string>('');
  const [draftTemplateFields, setDraftTemplateFields] = useState<TemplateFieldValues>({});
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);

  const selectedType = useMemo(
    () => typeOptions.find((entry) => entry.id === selectedTypeId) || null,
    [selectedTypeId, typeOptions]
  );

  const activeFields = selectedType?.fields || [];

  const hasScanPrerequisites = Boolean(validationCode.trim() && imageBase64 && selectedTypeId);
  const currentStep = savedMemoryId ? 4 : scanResult ? 3 : hasScanPrerequisites ? 2 : 1;
  const stepItems = [
    { id: 1, label: t('memory.scan.stepChoose') },
    { id: 2, label: t('memory.scan.stepAnalyze') },
    { id: 3, label: t('memory.scan.stepReview') },
    { id: 4, label: t('memory.scan.stepSave') },
  ];

  useEffect(() => {
    let cancelled = false;

    const loadTypes = async () => {
      setLoadingTypes(true);
      try {
        const response = await fetch('/api/memory/types', {
          headers: await getAuthHeaders(false),
        });
        const json = (await response.json()) as { types?: MemoryTypeOption[]; error?: string };

        if (!response.ok) {
          throw new Error(json.error || 'Unable to load memory types');
        }

        if (cancelled) return;
        const next = json.types || [];
        setTypeOptions(next);
        if (next.length > 0) {
          setSelectedTypeId(next[0].id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : t('memory.scan.errors.networkScan'));
        }
      } finally {
        if (!cancelled) {
          setLoadingTypes(false);
        }
      }
    };

    loadTypes();

    return () => {
      cancelled = true;
    };
  }, [t]);

  async function onImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    setImageBase64(base64);
    setSelectedFileName(file.name);
    setSavedMemoryId(null);
    setError(null);
  }

  function getTemplateFieldsFromParsed(parsed: ScanResponse['parsed'], fields: MemoryTypeField[]): TemplateFieldValues {
    const structured = parsed.structured_data || {};
    const nested =
      structured.template_fields && typeof structured.template_fields === 'object'
        ? (structured.template_fields as Record<string, unknown>)
        : {};
    const values: TemplateFieldValues = {};

    for (const field of fields) {
      const key = toFieldKey(field.label);
      const nestedValue = safeString(nested[key]);
      const direct = safeString((structured as Record<string, unknown>)[key]);
      const labelMatch = safeString((structured as Record<string, unknown>)[field.label]);
      values[key] = nestedValue || direct || labelMatch || '';
    }

    return values;
  }

  function prefillDraft(nextResult: ScanResponse) {
    const parsed = nextResult.parsed || {};
    const structured = parsed.structured_data || {};
    const fallbackTitle = t('memory.scan.defaultTitle', { label: nextResult.detectedLabel });
    const parsedTitle = safeString(parsed.title).trim();
    const parsedSummary = safeString(parsed.summary).trim();
    const structuredSummary = safeString((structured as Record<string, unknown>).summary).trim();

    setDraftTitle(parsedTitle || fallbackTitle);
    setDraftContent(parsedSummary || structuredSummary || '');
    setDraftTemplateFields(getTemplateFieldsFromParsed(parsed, activeFields));
  }

  async function runSmartScan() {
    if (!validationCode.trim()) {
      setError(t('memory.scan.errors.validationCode'));
      return;
    }

    if (!selectedType) {
      setError(t('memory.quickAdd.error.selectType'));
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
    setSavedMemoryId(null);

    try {
      const response = await fetch('/api/memory/assistant/scan', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          imageBase64,
          validationCode,
          selectedTemplateId: selectedType.templateId || 'other',
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.scan.errors.scan'));
        return;
      }

      const nextResult = json as ScanResponse;
      setScanResult(nextResult);
      prefillDraft(nextResult);
    } catch {
      setError(t('memory.scan.errors.networkScan'));
    } finally {
      setLoadingScan(false);
    }
  }

  async function saveMemory() {
    if (!scanResult || !selectedType) return;

    if (!draftTitle.trim()) {
      setError(t('memory.scan.errors.titleRequired'));
      return;
    }

    setSavingMemory(true);
    setError(null);
    setSavedMemoryId(null);

    const cleanTemplateFields = Object.fromEntries(
      Object.entries(draftTemplateFields)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0)
    );

    try {
      const response = await fetch('/api/memory/cards', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          validationCode,
          title: draftTitle.trim(),
          type: selectedType.templateId || 'other',
          content: draftContent,
          source: 'assistant_scan',
          source_image: imageBase64,
          structured_data: {
            ...(scanResult.parsed.structured_data || {}),
            detected_type: scanResult.detectedType,
            raw_ocr_text: scanResult.rawText,
            template_id: selectedType.templateId || 'other',
            category_id: selectedType.templateId || 'other',
            theme: selectedType.name,
            memory_type_id: selectedType.id,
            memory_type_name: selectedType.name,
            template_fields: cleanTemplateFields,
          },
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.scan.errors.save'));
        return;
      }

      setSavedMemoryId(json?.memory?.id || null);
    } catch {
      setError(t('memory.scan.errors.networkSave'));
    } finally {
      setSavingMemory(false);
    }
  }

  function resetScan() {
    setImageBase64(null);
    setSelectedFileName('');
    setScanResult(null);
    setDraftTitle('');
    setDraftContent('');
    setDraftTemplateFields({});
    setSavedMemoryId(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">{t('memory.scan.title')}</h1>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">{t('memory.scan.subtitle')}</p>
          </div>
          <Link
            href="/dashboard/memoire"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 sm:text-sm"
          >
            {t('common.back')}
          </Link>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stepItems.map((step) => {
              const isDone = currentStep > step.id;
              const isActive = currentStep === step.id;

              return (
                <div
                  key={step.id}
                  className={`rounded-lg border px-2.5 py-2 text-xs transition ${
                    isActive
                      ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100'
                      : isDone
                        ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                        : 'border-slate-700 bg-slate-800/60 text-slate-400'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.18em]">{t('memory.scan.stepLabel', { id: step.id })}</p>
                  <p className="mt-1 text-[11px] font-medium sm:text-xs">{step.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3.5 space-y-3.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)] sm:p-4 sm:space-y-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">{t('memory.scan.validationCode')}</label>
            <input
              type="password"
              value={validationCode}
              onChange={(e) => setValidationCode(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[13px]"
              placeholder={t('memory.scan.validationCodePlaceholder')}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">{t('memory.scan.targetTemplate')}</label>
            <select
              value={selectedTypeId}
              onChange={(event) => {
                setSelectedTypeId(event.target.value);
                setScanResult(null);
                setDraftTemplateFields({});
                setSavedMemoryId(null);
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[13px] text-white"
            >
              {typeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.isCommunity ? ` (${t('memory.quickAdd.community')})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400">{t('memory.scan.workflowHint')}</p>
          </div>

          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageSelected} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 sm:text-sm"
            >
              {t('memory.scan.chooseImage')}
            </button>
            <p className="text-xs text-slate-400">{selectedFileName || t('memory.scan.noFile')}</p>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
              {selectedType && (
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-1">{selectedType.name}</span>
              )}
              {selectedFileName && (
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-1">{selectedFileName}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={runSmartScan}
            disabled={loadingScan || savingMemory || loadingTypes}
            className="rounded-md bg-emerald-400 px-4 py-1.5 text-xs font-semibold text-black shadow-lg shadow-emerald-900/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {loadingScan ? t('memory.scan.scanning') : t('memory.scan.scanButton')}
          </button>

          {loadingTypes && <p className="text-xs text-slate-400">{t('memory.quickAdd.loadingTypes')}</p>}

          {loadingScan && (
            <div className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-100">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                {t('memory.scan.processingStatus')}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-950/70">
                <div className="h-full w-full animate-pulse bg-gradient-to-r from-emerald-300 via-emerald-100 to-emerald-300" />
              </div>
            </div>
          )}
        </div>

        {error && <div className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

        {scanResult && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 space-y-3.5 shadow-[0_8px_24px_rgba(16,185,129,0.08)] sm:p-5 sm:space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">{t('memory.scan.detectedContent')}</p>
              <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{scanResult.detectedLabel}</h2>
            </div>

            <div className="rounded-lg border border-emerald-300/30 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">{t('memory.scan.reviewStep')}</p>

              <div className="mt-3 space-y-3">
                <label className="block text-xs uppercase tracking-wide text-slate-300">
                  {t('memory.list.editFieldTitle')}
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[13px] text-white"
                  />
                </label>

                <label className="block text-xs uppercase tracking-wide text-slate-300">
                  {t('memory.list.editFieldContent')}
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-[13px] text-white"
                  />
                </label>

                {activeFields.length > 0 && (
                  <div className="rounded-md border border-slate-700 bg-slate-800/40 p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-300">{t('memory.list.editTemplateFields')}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {activeFields.map((field) => {
                        const fieldKey = toFieldKey(field.label);
                        const fieldValue = draftTemplateFields[fieldKey] || '';

                        return (
                          <label key={fieldKey} className="block text-xs uppercase tracking-wide text-slate-400">
                            {field.label}
                            {renderTemplateFieldInput({
                              field,
                              value: fieldValue,
                              onChange: (next) =>
                                setDraftTemplateFields((current) => ({
                                  ...current,
                                  [fieldKey]: next,
                                })),
                            })}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveMemory}
                disabled={savingMemory}
                className="rounded-md bg-emerald-400 px-4 py-1.5 text-xs font-semibold text-black shadow-lg shadow-emerald-900/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
              >
                {savingMemory ? t('notifications.saving') : t('memory.scan.saveCard')}
              </button>
              <button
                type="button"
                onClick={resetScan}
                className="rounded-md border border-slate-500 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 sm:text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>

            {savingMemory && (
              <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 p-3 text-xs text-amber-100">
                <div className="flex items-center gap-2 font-medium">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  {t('memory.scan.savingInProgress')}
                </div>
              </div>
            )}

            {savedMemoryId && (
              <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                <div className="flex items-center gap-2 font-medium">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-300/25 text-[10px] text-emerald-100">
                    ✓
                  </span>
                  {t('memory.scan.saveDone')}
                </div>
              </div>
            )}
          </div>
        )}

        {savedMemoryId && (
          <div className="rounded-xl border border-sky-300/40 bg-sky-500/10 p-4 text-sm text-sky-100">
            {t('memory.scan.savedSuccess')}
            <div className="mt-3 flex gap-3">
              <Link
                href="/dashboard/memoire/list"
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black sm:text-sm"
              >
                {t('memory.scan.returnToCounters')}
              </Link>
              <Link
                href="/dashboard/memoire"
                className="rounded-md border border-slate-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 sm:text-sm"
              >
                {t('memory.scan.backToAssistant')}
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
