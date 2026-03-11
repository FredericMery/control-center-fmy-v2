'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/LanguageProvider';
import { useAuthStore } from '@/store/authStore';
import { useMemoryStore } from '@/store/memoryStore';
import { isPhotoLikeField, uploadMemoryPhoto } from '@/lib/memoryPhotos';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';
import type { Database } from '@/types/database';

type MemoryField = Database['public']['Tables']['memory_fields']['Row'];
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
  const {
    sections,
    fields,
    items,
    loadingSections,
    loadingItems,
    fetchSections,
    fetchItemsBySectionId,
    createItem,
    setItemValue,
  } = useMemoryStore();

  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [title, setTitle] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [photoUploadingFieldId, setPhotoUploadingFieldId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchSections();
    }
  }, [user, fetchSections]);

  useEffect(() => {
    if (selectedSectionId) {
      fetchItemsBySectionId(selectedSectionId);
      setFieldValues({});
      setTitle('');
      setSaveState('idle');
      setSaveProgress(0);
      setSaveMessage('');
      setError(null);
    }
  }, [selectedSectionId, fetchItemsBySectionId]);

  const selectedSection = sections.find((section) => section.id === selectedSectionId);
  const selectedTemplate = selectedSection?.template_id
    ? MEMORY_TEMPLATES[selectedSection.template_id]
    : null;

  const sectionFields = useMemo(
    () => fields.filter((field) => field.section_id === selectedSectionId),
    [fields, selectedSectionId]
  );

  const sectionItemsCount = useMemo(
    () => items.filter((item) => item.section_id === selectedSectionId).length,
    [items, selectedSectionId]
  );

  const photoField = useMemo(
    () => sectionFields.find((field) => field.field_type === 'url' && isPhotoLikeField(field.field_label)),
    [sectionFields]
  );

  const currentStep = useMemo(() => {
    if (saveState === 'done') return 5;
    if (saveState === 'saving') return 4;
    if (title.trim() || Object.keys(fieldValues).length > 0) return 3;
    if (selectedSectionId) return 2;
    return 1;
  }, [fieldValues, saveState, selectedSectionId, title]);

  const stepLabels = [
    t('memory.quickAdd.step1'),
    t('memory.quickAdd.step2'),
    t('memory.quickAdd.step3'),
    t('memory.quickAdd.step4'),
    t('memory.quickAdd.step5'),
  ];

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handlePhotoSelect = async (field: MemoryField, file?: File) => {
    if (!file || !user || !selectedSectionId) return;

    setError(null);
    setPhotoUploadingFieldId(field.id);

    try {
      const photoUrl = await uploadMemoryPhoto({
        file,
        userId: user.id,
        sectionId: selectedSectionId,
        fieldId: field.id,
      });

      setFieldValues((prev) => ({
        ...prev,
        [field.id]: photoUrl,
      }));
    } catch (uploadError) {
      console.error('Photo upload failed', uploadError);
      setError(t('memory.quickAdd.error.uploadFailed'));
    } finally {
      setPhotoUploadingFieldId(null);
    }
  };

  const handleSave = async () => {
    if (!selectedSectionId) {
      setError(t('memory.quickAdd.error.selectType'));
      return;
    }

    if (!title.trim()) {
      setError(t('memory.quickAdd.error.titleRequired'));
      return;
    }

    setSaveState('saving');
    setSaveProgress(5);
    setSaveMessage(t('memory.quickAdd.progress.creating'));
    setError(null);

    const createdItem = await createItem(selectedSectionId, title.trim());
    if (!createdItem) {
      setSaveState('error');
      setSaveMessage('');
      setError(t('memory.quickAdd.error.createFailed'));
      return;
    }

    const entries = Object.entries(fieldValues).filter(([, value]) => value && value.trim());
    const totalEntries = entries.length || 1;

    for (let index = 0; index < entries.length; index += 1) {
      const [fieldId, value] = entries[index];
      setSaveMessage(
        t('memory.quickAdd.progress.fields', {
          current: index + 1,
          total: entries.length,
        })
      );
      await setItemValue(createdItem.id, fieldId, value.trim());
      const ratio = (index + 1) / totalEntries;
      setSaveProgress(10 + Math.round(ratio * 75));
    }

    setSaveMessage(t('memory.quickAdd.progress.refresh'));
    await fetchItemsBySectionId(selectedSectionId);
    setSaveProgress(100);
    setSaveMessage(t('memory.quickAdd.progress.done'));
    setSaveState('done');
    setToastMessage(t('memory.quickAdd.toast.saved'));
  };

  const renderFieldInput = (field: MemoryField) => {
    const value = fieldValues[field.id] || '';

    if (field.field_type === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          placeholder={field.field_label}
        />
      );
    }

    if (field.field_type === 'select') {
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

    if (field.field_type === 'rating') {
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

    if (field.field_type === 'url' && isPhotoLikeField(field.field_label)) {
      return (
        <div className="space-y-2">
          <input
            type="url"
            value={value}
            onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            placeholder="https://..."
          />

          {value && (
            <img
              src={value}
              alt={field.field_label}
              className="h-36 w-full rounded-lg border border-slate-700 object-cover"
            />
          )}

          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md bg-slate-700 px-3 py-2 text-xs text-white hover:bg-slate-600">
              {t('memory.quickAdd.photoLibrary')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handlePhotoSelect(field, event.target.files?.[0])}
              />
            </label>

            <label className="cursor-pointer rounded-md bg-slate-700 px-3 py-2 text-xs text-white hover:bg-slate-600">
              {t('memory.quickAdd.takePhoto')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handlePhotoSelect(field, event.target.files?.[0])}
              />
            </label>

            {photoUploadingFieldId === field.id && (
              <span className="self-center text-xs text-slate-400">{t('memory.quickAdd.uploadingPhoto')}</span>
            )}
          </div>
        </div>
      );
    }

    const inputType = FIELD_TYPE_TO_INPUT[field.field_type] || 'text';

    return (
      <input
        type={inputType}
        value={value}
        onChange={(event) => setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        placeholder={field.field_label}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">{t('memory.quickAdd.title')}</h1>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">
              {t('memory.quickAdd.subtitle')}
            </p>
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
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="">{t('memory.quickAdd.selectType')}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.section_name}
                </option>
              ))}
            </select>
            {selectedSection && (
              <p className="mt-2 text-xs text-slate-400">
                {selectedTemplate?.icon || '🧠'} {selectedTemplate?.description || selectedSection.description || t('memory.quickAdd.customType')}
              </p>
            )}
          </div>

          {selectedSectionId && (
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
                  {t('memory.quickAdd.photoHint', { field: photoField.field_label })}
                </div>
              )}

              <div className="space-y-3">
                {sectionFields.map((field) => (
                  <div key={field.id}>
                    <p className="mb-1 text-sm text-slate-200">{field.field_label}</p>
                    {renderFieldInput(field)}
                  </div>
                ))}

                {!loadingItems && sectionFields.length === 0 && (
                  <p className="text-sm text-amber-300">
                    {t('memory.quickAdd.noFields')}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || sectionFields.length === 0}
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

          {saveState === 'done' && selectedSectionId && (
            <Link
              href={`/dashboard/memoire/${selectedSectionId}`}
              className="inline-block rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100"
            >
              {t('memory.quickAdd.viewInSection')}
            </Link>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
          {loadingSections && <p className="text-xs text-slate-400">{t('memory.quickAdd.loadingTypes')}</p>}
          {selectedSectionId && loadingItems && <p className="text-xs text-slate-400">{t('memory.quickAdd.loadingFields')}</p>}
          {selectedSectionId && !loadingItems && (
            <p className="text-xs text-slate-400">{t('memory.quickAdd.sectionCardsCount', { count: sectionItemsCount })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
