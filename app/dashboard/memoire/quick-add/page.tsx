'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/LanguageProvider';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useMemoryStore } from '@/store/memoryStore';
import { useAuthStore } from '@/store/authStore';
import { isPhotoLikeField, uploadMemoryPhoto } from '@/lib/memoryPhotos';
import {
  appendMemoryPhotoUrl,
  MAX_MEMORY_PHOTOS,
  parseMemoryPhotoUrls,
  removeMemoryPhotoUrl,
  serializeMemoryPhotoUrls,
} from '@/lib/memoryPhotoValue';

type MemoryTypeField = {
  id: string;
  label: string;
  type: string;
  order: number;
  options: string[] | null;
  required: boolean;
  searchable: boolean;
};

type MemoryTypeOption = {
  id: string;
  sectionId: string | null;
  ownerUserId: string | null;
  templateId: string;
  name: string;
  description: string;
  isCommunity: boolean;
  source: 'template' | 'private' | 'community';
  fields: MemoryTypeField[];
};

type EnsureResponse = {
  sectionId: string;
  fields: MemoryTypeField[];
  cloned: boolean;
};

type SaveState = 'idle' | 'saving' | 'done' | 'error';

const FIELD_TYPE_TO_INPUT: Record<string, string> = {
  number: 'number',
  date: 'date',
  email: 'email',
  phone: 'tel',
  url: 'url',
};

export default function QuickAddMemoryPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const { createItem, setItemValue, fetchItemsBySectionId } = useMemoryStore();

  const [typesLoading, setTypesLoading] = useState(true);
  const [typeOptions, setTypeOptions] = useState<MemoryTypeOption[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const [title, setTitle] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [photoUploadingFieldId, setPhotoUploadingFieldId] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedType = useMemo(
    () => typeOptions.find((entry) => entry.id === selectedTypeId) || null,
    [typeOptions, selectedTypeId]
  );

  const fields = selectedType?.fields || [];

  const photoField = useMemo(
    () => fields.find((field) => field.type === 'url' && isPhotoLikeField(field.label)),
    [fields]
  );

  const requiredPhotoField = useMemo(
    () => fields.find((field) => field.type === 'url' && isPhotoLikeField(field.label) && field.required),
    [fields]
  );

  const currentStep = useMemo(() => {
    if (saveState === 'done') return 5;
    if (saveState === 'saving') return 4;
    if (title.trim() || Object.keys(fieldValues).length > 0) return 3;
    if (selectedTypeId) return 2;
    return 1;
  }, [fieldValues, saveState, selectedTypeId, title]);

  useEffect(() => {
    let cancelled = false;

    const loadTypes = async () => {
      setTypesLoading(true);
      setError(null);
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
        if (!selectedTypeId && next.length > 0) {
          setSelectedTypeId(next[0].id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load memory types');
        }
      } finally {
        if (!cancelled) {
          setTypesLoading(false);
        }
      }
    };

    loadTypes();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTypeId) return;
    setFieldValues({});
    setTitle('');
    setSaveState('idle');
    setSaveProgress(0);
    setSaveMessage('');
    setError(null);
  }, [selectedTypeId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const stepLabels = [
    t('memory.quickAdd.step1'),
    t('memory.quickAdd.step2'),
    t('memory.quickAdd.step3'),
    t('memory.quickAdd.step4'),
    t('memory.quickAdd.step5'),
  ];

  const maxPhotosErrorMessage = t('memory.quickAdd.error.maxPhotos', {
    max: MAX_MEMORY_PHOTOS,
  });

  const setPhotoFieldFromUrls = (fieldId: string, urls: string[]) => {
    if (urls.length <= MAX_MEMORY_PHOTOS && error === maxPhotosErrorMessage) {
      setError(null);
    }

    const limitedUrls = urls.slice(0, MAX_MEMORY_PHOTOS);
    if (urls.length > MAX_MEMORY_PHOTOS) {
      setError(maxPhotosErrorMessage);
    }

    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: serializeMemoryPhotoUrls(limitedUrls) || '',
    }));
  };

  const handlePhotoTextChange = (fieldId: string, rawValue: string) => {
    const urls = rawValue
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
    setPhotoFieldFromUrls(fieldId, urls);
  };

  const handlePhotoRemove = (fieldId: string, photoUrl: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: removeMemoryPhotoUrl(prev[fieldId], photoUrl) || '',
    }));

    if (error === maxPhotosErrorMessage) {
      setError(null);
    }
  };

  const handlePhotoSelect = async (field: MemoryTypeField, file?: File) => {
    if (!file || !user || !selectedTypeId || !selectedType) return;

    const currentPhotos = parseMemoryPhotoUrls(fieldValues[field.id]);
    if (currentPhotos.length >= MAX_MEMORY_PHOTOS) {
      setError(maxPhotosErrorMessage);
      return;
    }

    setError(null);
    setPhotoUploadingFieldId(field.id);
    try {
      const photoUrl = await uploadMemoryPhoto({
        file,
        userId: user.id,
        sectionId: selectedType.sectionId || selectedType.templateId || selectedTypeId,
        fieldId: field.id,
      });
      setFieldValues((prev) => ({
        ...prev,
        [field.id]: appendMemoryPhotoUrl(prev[field.id], photoUrl) || '',
      }));
    } catch (uploadError) {
      console.error('Photo upload failed', uploadError);
      setError(t('memory.quickAdd.error.uploadFailed'));
    } finally {
      setPhotoUploadingFieldId(null);
    }
  };

  const handleSave = async () => {
    if (!selectedType) {
      setError(t('memory.quickAdd.error.selectType'));
      return;
    }

    if (!title.trim()) {
      setError(t('memory.quickAdd.error.titleRequired'));
      return;
    }

    if (requiredPhotoField) {
      const hasPhotoValue = parseMemoryPhotoUrls(fieldValues[requiredPhotoField.id]).length > 0;
      if (!hasPhotoValue) {
        setError(t('memory.quickAdd.error.photoRequired'));
        return;
      }
    }

    setSaveState('saving');
    setSaveProgress(5);
    setSaveMessage(t('memory.quickAdd.progress.creating'));
    setError(null);

    let ensured: EnsureResponse;
    try {
      const ensureResponse = await fetch('/api/memory/types', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'ensure', sectionId: selectedType.id }),
      });
      const ensureJson = (await ensureResponse.json()) as EnsureResponse & { error?: string };
      if (!ensureResponse.ok) {
        throw new Error(ensureJson.error || 'Unable to prepare memory type');
      }
      ensured = ensureJson;
    } catch (ensureError) {
      console.error('Ensure memory type failed', ensureError);
      setSaveState('error');
      setSaveMessage('');
      setError(t('memory.quickAdd.error.createFailed'));
      return;
    }

    const created = await createItem(ensured.sectionId, title.trim());
    if (!created) {
      setSaveState('error');
      setSaveMessage('');
      setError(t('memory.quickAdd.error.createFailed'));
      return;
    }

    const ensuredFieldByLabel = new Map<string, string>();
    for (const field of ensured.fields || []) {
      ensuredFieldByLabel.set(field.label.trim().toLowerCase(), field.id);
    }

    const entries = Object.entries(fieldValues).filter(([, value]) => value.trim().length > 0);
    const totalEntries = entries.length || 1;

    for (let index = 0; index < entries.length; index += 1) {
      const [sourceFieldId, value] = entries[index];
      const sourceField = fields.find((field) => field.id === sourceFieldId);
      if (!sourceField) continue;

      const targetFieldId = ensuredFieldByLabel.get(sourceField.label.trim().toLowerCase());
      if (!targetFieldId) continue;

      setSaveMessage(
        t('memory.quickAdd.progress.fields', {
          current: index + 1,
          total: entries.length,
        })
      );

      await setItemValue(created.id, targetFieldId, value.trim());
      const ratio = (index + 1) / totalEntries;
      setSaveProgress(10 + Math.round(ratio * 75));
    }

    setSaveMessage(t('memory.quickAdd.progress.refresh'));
    await fetchItemsBySectionId(ensured.sectionId);

    // Sync manual entry into AI memories so it appears in global memory modules.
    try {
      const fieldPayload = entries
        .map(([sourceFieldId, value]) => {
          const sourceField = fields.find((field) => field.id === sourceFieldId);
          if (!sourceField) return null;
          return {
            label: sourceField.label,
            value: value.trim(),
            type: sourceField.type,
          };
        })
        .filter(Boolean);

      await fetch('/api/memory/manual-entry', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          type: selectedType.templateId || 'other',
          memoryTypeId: selectedType.id,
          memoryTypeName: selectedType.name,
          sectionId: ensured.sectionId,
          description: selectedType.description,
          fieldValues: fieldPayload,
        }),
      });
    } catch (syncError) {
      console.error('Manual entry sync to memories failed', syncError);
    }

    setSaveProgress(100);
    setSaveMessage(t('memory.quickAdd.progress.done'));
    setSaveState('done');
    setToastMessage(t('memory.quickAdd.toast.saved'));
  };

  const renderFieldInput = (field: MemoryTypeField) => {
    const value = fieldValues[field.id] || '';

    if (field.type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          placeholder={field.label}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="">{t('memory.quickAdd.select')}</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'rating') {
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((score) => {
            const active = Number(value || '0') >= score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => setFieldValues((prev) => ({ ...prev, [field.id]: String(score) }))}
                className={`text-xl ${active ? 'text-amber-300' : 'text-slate-500'} transition`}
              >
                ★
              </button>
            );
          })}
        </div>
      );
    }

    if (field.type === 'url' && isPhotoLikeField(field.label)) {
      const photoUrls = parseMemoryPhotoUrls(value);
      const uploadLimitReached = photoUrls.length >= MAX_MEMORY_PHOTOS;

      return (
        <div className="space-y-2">
          <textarea
            value={photoUrls.join('\n')}
            onChange={(event) => handlePhotoTextChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder={'https://...\nhttps://...'}
            rows={Math.max(2, Math.min(5, photoUrls.length || 2))}
          />

          <p className="text-xs text-slate-400">
            {t('memory.quickAdd.photoCount', { count: photoUrls.length, max: MAX_MEMORY_PHOTOS })}
          </p>

          {photoUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photoUrls.map((photoUrl, index) => (
                <div key={`${photoUrl}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                  <img
                    src={photoUrl}
                    alt={`${field.label} ${index + 1}`}
                    className="h-28 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhotoRemove(field.id, photoUrl)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/85"
                  >
                    {t('memory.quickAdd.removePhoto')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <label
              className={`cursor-pointer rounded-md px-3 py-2 text-xs text-white ${
                uploadLimitReached ? 'bg-slate-800 opacity-50' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {t('memory.quickAdd.photoLibrary')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadLimitReached}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void handlePhotoSelect(field, file);
                }}
              />
            </label>

            <label
              className={`cursor-pointer rounded-md px-3 py-2 text-xs text-white ${
                uploadLimitReached ? 'bg-slate-800 opacity-50' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {t('memory.quickAdd.takePhoto')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploadLimitReached}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void handlePhotoSelect(field, file);
                }}
              />
            </label>

            {photoUploadingFieldId === field.id && (
              <span className="self-center text-xs text-slate-400">{t('memory.quickAdd.uploadingPhoto')}</span>
            )}
          </div>
        </div>
      );
    }

    const inputType = FIELD_TYPE_TO_INPUT[field.type] || 'text';

    return (
      <input
        type={inputType}
        value={value}
        onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder={field.label}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">{t('memory.quickAdd.title')}</h1>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">{t('memory.quickAdd.subtitle')}</p>
          </div>
          <Link
            href="/dashboard/memoire"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-700 sm:text-sm"
          >
            {t('common.back')}
          </Link>
        </div>

        {toastMessage && (
          <div className="fixed left-4 right-4 top-4 z-50 sm:left-auto sm:right-6 sm:top-6 sm:w-[380px]">
            <div
              role="status"
              className="rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-50 shadow-lg backdrop-blur"
            >
              {toastMessage}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {stepLabels.map((step, index) => {
              const stepId = index + 1;
              const active = currentStep === stepId;
              const done = currentStep > stepId;

              return (
                <div
                  key={step}
                  className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                    active
                      ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-100'
                      : done
                        ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                        : 'border-slate-700 bg-slate-800/60 text-slate-400'
                  }`}
                >
                  {step}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">{t('memory.quickAdd.whichMemory')}</label>
            <select
              value={selectedTypeId}
              onChange={(event) => setSelectedTypeId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="">{t('memory.quickAdd.selectType')}</option>
              {typeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.isCommunity ? ` (${t('memory.quickAdd.community')})` : ''}
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="mt-2 text-xs text-slate-400">
                🧠 {selectedType.description || t('memory.quickAdd.customType')}
              </p>
            )}
          </div>

          {selectedTypeId && (
            <>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-wide text-slate-300">{t('memory.quickAdd.cardTitle')}</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder={t('memory.quickAdd.cardTitlePlaceholder')}
                />
              </div>

              {photoField && (
                <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                  {t('memory.quickAdd.photoHint', { field: photoField.label })}
                </div>
              )}

              {requiredPhotoField && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-2">
                  <p className="font-semibold">{t('memory.quickAdd.requiredPhotoTitle')}</p>
                  <p>{t('memory.quickAdd.requiredPhotoText')}</p>
                  <p>{t('memory.quickAdd.photoCount', {
                    count: parseMemoryPhotoUrls(fieldValues[requiredPhotoField.id]).length,
                    max: MAX_MEMORY_PHOTOS,
                  })}</p>
                </div>
              )}

              <div className="space-y-3">
                {fields.map((field) => (
                  <div key={field.id}>
                    <p className="mb-1 text-sm text-slate-200">{field.label}</p>
                    {renderFieldInput(field)}
                  </div>
                ))}

                {!typesLoading && fields.length === 0 && (
                  <p className="text-sm text-amber-300">{t('memory.quickAdd.noFields')}</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || fields.length === 0}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveState === 'saving' ? t('memory.quickAdd.saving') : t('common.save')}
              </button>
            </>
          )}

          {(saveState === 'saving' || saveState === 'done') && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${saveProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-300">
                {saveState === 'saving'
                  ? t('memory.quickAdd.savingProgress', { progress: saveProgress })
                  : t('memory.quickAdd.saved')}
                {saveMessage ? ` - ${saveMessage}` : ''}
              </p>
            </div>
          )}

          {saveState === 'done' && (
            <Link
              href="/dashboard/memoire/list"
              className="inline-block rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100"
            >
              {t('memory.quickAdd.viewInSection')}
            </Link>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
          {typesLoading && <p className="text-xs text-slate-400">{t('memory.quickAdd.loadingTypes')}</p>}
          {selectedTypeId && !typesLoading && <p className="text-xs text-slate-400">{t('memory.quickAdd.loadingFields')}</p>}
        </div>
      </div>
    </div>
  );
}
