'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/LanguageProvider';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useAuthStore } from '@/store/authStore';
import { useMemoryStore } from '@/store/memoryStore';

type FieldTypeOption = {
  value: string;
};

type DraftTypeField = {
  id: string;
  label: string;
  type: string;
  options: string;
  required: boolean;
  searchable: boolean;
};

const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  { value: 'text' },
  { value: 'textarea' },
  { value: 'number' },
  { value: 'date' },
  { value: 'url' },
  { value: 'email' },
  { value: 'phone' },
  { value: 'select' },
  { value: 'tags' },
  { value: 'location' },
  { value: 'rating' },
];

function newDraftField(): DraftTypeField {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    type: 'text',
    options: '',
    required: false,
    searchable: false,
  };
}

export default function MemorySettingsPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const {
    sections,
    fields,
    items,
    fetchSections,
    fetchItemsBySectionId,
    addField,
    loadingSections,
    loadingItems,
  } = useMemoryStore();

  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldOptions, setFieldOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [searchable, setSearchable] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showCreateType, setShowCreateType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [newTypeCommunity, setNewTypeCommunity] = useState(false);
  const [newTypeFields, setNewTypeFields] = useState<DraftTypeField[]>([newDraftField()]);

  useEffect(() => {
    if (user) {
      fetchSections();
    }
  }, [user, fetchSections]);

  useEffect(() => {
    if (!selectedSectionId) return;
    fetchItemsBySectionId(selectedSectionId);
    setStatus(null);
    setError(null);
  }, [selectedSectionId, fetchItemsBySectionId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const sectionFields = useMemo(
    () => fields
      .filter((field) => field.section_id === selectedSectionId)
      .sort((a, b) => a.field_order - b.field_order),
    [fields, selectedSectionId]
  );

  const sectionItemsCount = useMemo(
    () => items.filter((item) => item.section_id === selectedSectionId).length,
    [items, selectedSectionId]
  );

  const handleSaveField = async () => {
    if (!selectedSectionId) {
      setError(t('settings.memoryZone.error.selectType'));
      return;
    }

    if (!fieldLabel.trim()) {
      setError(t('settings.memoryZone.error.fieldNameRequired'));
      return;
    }

    setSaving(true);
    setProgress(10);
    setStatus(t('settings.memoryZone.progress.createField'));
    setError(null);

    const parsedOptions =
      fieldType === 'select' || fieldType === 'tags'
        ? fieldOptions
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : null;

    const created = await addField(selectedSectionId, {
      field_label: fieldLabel.trim(),
      field_type: fieldType,
      field_order: sectionFields.length,
      is_required: required,
      is_searchable: searchable,
      options: parsedOptions,
    });

    if (!created) {
      setSaving(false);
      setProgress(0);
      setStatus(null);
      setError(t('settings.memoryZone.error.addFailed'));
      return;
    }

    setProgress(55);
    setStatus(t('settings.memoryZone.progress.updating'));

    await fetchItemsBySectionId(selectedSectionId);

    setProgress(100);
    setStatus(t('settings.memoryZone.progress.done'));
    setSaving(false);
    setShowForm(false);
    setToastMessage(t('settings.memoryZone.toast.saved'));

    setFieldLabel('');
    setFieldType('text');
    setFieldOptions('');
    setRequired(false);
    setSearchable(false);
  };

  const handleCreateType = async () => {
    const sanitizedName = newTypeName.trim();
    if (!sanitizedName) {
      setError(t('settings.memoryZone.error.fieldNameRequired'));
      return;
    }

    const normalizedFields = newTypeFields
      .map((field) => ({
        ...field,
        label: field.label.trim(),
        optionsList:
          field.type === 'select' || field.type === 'tags'
            ? field.options
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
            : null,
      }))
      .filter((field) => field.label.length > 0);

    if (normalizedFields.length === 0) {
      setError(t('settings.memoryZone.noFields'));
      return;
    }

    setSaving(true);
    setProgress(15);
    setStatus(t('settings.memoryZone.progress.createField'));
    setError(null);

    try {
      const response = await fetch('/api/memory/types', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'create',
          name: sanitizedName,
          description: newTypeDescription.trim(),
          isCommunity: newTypeCommunity,
          templateId: 'other',
          fields: normalizedFields.map((field) => ({
            label: field.label,
            type: field.type,
            options: field.optionsList,
            required: field.required,
            searchable: field.searchable,
          })),
        }),
      });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || 'Unable to create memory type');
      }

      setProgress(65);
      setStatus(t('settings.memoryZone.progress.updating'));

      await fetchSections();

      setProgress(100);
      setStatus(t('settings.memoryZone.progress.done'));
      setToastMessage(t('settings.memoryZone.toast.saved'));
      setShowCreateType(false);

      setNewTypeName('');
      setNewTypeDescription('');
      setNewTypeCommunity(false);
      setNewTypeFields([newDraftField()]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('settings.memoryZone.error.addFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 text-blue-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('settings.memoryZone.title')}</h1>
          <p className="text-sm text-gray-600">{t('settings.memoryZone.subtitle')}</p>
        </div>
        <Link href="/dashboard/settings" className="rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-800">
          {t('settings.memoryZone.backToMain')}
        </Link>
      </div>

      {toastMessage && (
        <div className="fixed left-4 right-4 top-4 z-50 sm:left-auto sm:right-6 sm:top-6 sm:w-[380px]">
          <div role="status" className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('settings.memoryZone.title')}</h2>
          <button
            type="button"
            onClick={() => setShowCreateType((prev) => !prev)}
            className="rounded-lg bg-blue-900 px-3 py-2 text-sm text-white"
          >
            {t('settings.memoryZone.create.button')}
          </button>
        </div>

        {showCreateType && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-blue-900">{t('settings.memoryZone.create.name')}</label>
              <input
                value={newTypeName}
                onChange={(event) => setNewTypeName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                placeholder={t('settings.memoryZone.create.namePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-blue-900">{t('settings.memoryZone.create.description')}</label>
              <input
                value={newTypeDescription}
                onChange={(event) => setNewTypeDescription(event.target.value)}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                placeholder={t('settings.memoryZone.create.descriptionPlaceholder')}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-blue-950">
              <input
                type="checkbox"
                checked={newTypeCommunity}
                onChange={(event) => setNewTypeCommunity(event.target.checked)}
              />
              {t('settings.memoryZone.create.communityLabel')}
            </label>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-blue-900">{t('settings.memoryZone.create.fieldsDefinition')}</p>
              {newTypeFields.map((field, index) => (
                <div key={field.id} className="rounded-lg border border-blue-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-blue-900">{t('settings.memoryZone.create.fieldN', { index: index + 1 })}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setNewTypeFields((prev) => prev.filter((entry) => entry.id !== field.id))
                      }
                      className="text-xs text-red-700"
                      disabled={newTypeFields.length <= 1}
                    >
                      {t('settings.memoryZone.create.removeField')}
                    </button>
                  </div>

                  <input
                    value={field.label}
                    onChange={(event) =>
                      setNewTypeFields((prev) =>
                        prev.map((entry) => (entry.id === field.id ? { ...entry, label: event.target.value } : entry))
                      )
                    }
                    className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
                    placeholder={t('settings.memoryZone.create.fieldNamePlaceholder')}
                  />

                  <select
                    value={field.type}
                    onChange={(event) =>
                      setNewTypeFields((prev) =>
                        prev.map((entry) => (entry.id === field.id ? { ...entry, type: event.target.value } : entry))
                      )
                    }
                    className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`settings.memoryZone.fieldType.${option.value}`)}
                      </option>
                    ))}
                  </select>

                  {(field.type === 'select' || field.type === 'tags') && (
                    <input
                      value={field.options}
                      onChange={(event) =>
                        setNewTypeFields((prev) =>
                          prev.map((entry) => (entry.id === field.id ? { ...entry, options: event.target.value } : entry))
                        )
                      }
                      className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm"
                      placeholder={t('settings.memoryZone.optionsPlaceholder')}
                    />
                  )}

                  <div className="flex gap-4 text-sm text-blue-950">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setNewTypeFields((prev) =>
                            prev.map((entry) =>
                              entry.id === field.id ? { ...entry, required: event.target.checked } : entry
                            )
                          )
                        }
                      />
                      {t('settings.memoryZone.requiredField')}
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.searchable}
                        onChange={(event) =>
                          setNewTypeFields((prev) =>
                            prev.map((entry) =>
                              entry.id === field.id ? { ...entry, searchable: event.target.checked } : entry
                            )
                          )
                        }
                      />
                      {t('settings.memoryZone.searchableField')}
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setNewTypeFields((prev) => [...prev, newDraftField()])}
                className="rounded-lg border border-blue-300 px-3 py-2 text-sm text-blue-900"
              >
                {t('settings.memoryZone.create.addField')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCreateType}
              disabled={saving}
              className="rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {saving ? t('settings.memoryZone.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
        <label className="block text-sm font-medium text-gray-700">{t('settings.memoryZone.memoryType')}</label>
        <select
          value={selectedSectionId}
          onChange={(event) => setSelectedSectionId(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">{t('settings.memoryZone.select')}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.section_name}
            </option>
          ))}
        </select>

        {loadingSections && <p className="text-xs text-gray-500">{t('settings.memoryZone.loadingTypes')}</p>}
      </div>

      {selectedSectionId && (
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('settings.memoryZone.fieldsListTitle')}</h2>
            <button
              type="button"
              onClick={() => setShowForm((prev) => !prev)}
              className="rounded-lg bg-blue-900 px-3 py-2 text-sm text-white"
            >
              {showForm ? t('common.cancel') : t('settings.memoryZone.addFieldButton')}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200">
            {sectionFields.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">{t('settings.memoryZone.noFields')}</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {sectionFields.map((field) => (
                  <li key={field.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span>{field.field_label}</span>
                    <span className="text-xs text-gray-500">
                      {field.field_type}
                      {field.is_required ? ` | ${t('settings.memoryZone.flag.required')}` : ''}
                      {field.is_searchable ? ` | ${t('settings.memoryZone.flag.search')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showForm && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-blue-900">{t('settings.memoryZone.fieldDefinition')}</h3>

              <div>
                <label className="block text-xs uppercase tracking-wide text-blue-900">{t('settings.memoryZone.fieldName')}</label>
                <input
                  value={fieldLabel}
                  onChange={(event) => setFieldLabel(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                  placeholder={t('settings.memoryZone.fieldNamePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-blue-900">{t('settings.memoryZone.fieldType')}</label>
                <select
                  value={fieldType}
                  onChange={(event) => setFieldType(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                >
                  {FIELD_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(`settings.memoryZone.fieldType.${option.value}`)}
                    </option>
                  ))}
                </select>
              </div>

              {(fieldType === 'select' || fieldType === 'tags') && (
                <div>
                  <label className="block text-xs uppercase tracking-wide text-blue-900">{t('settings.memoryZone.options')}</label>
                  <input
                    value={fieldOptions}
                    onChange={(event) => setFieldOptions(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
                    placeholder={t('settings.memoryZone.optionsPlaceholder')}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-blue-950">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
                  {t('settings.memoryZone.requiredField')}
                </label>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={searchable} onChange={(event) => setSearchable(event.target.checked)} />
                  {t('settings.memoryZone.searchableField')}
                </label>
              </div>

              <button
                type="button"
                onClick={handleSaveField}
                disabled={saving}
                className="rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving ? t('settings.memoryZone.saving') : t('settings.memoryZone.saveElements')}
              </button>
            </div>
          )}

          {(saving || progress === 100) && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-800 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-600">{t('settings.memoryZone.progressLabel', { progress })}</p>
            </div>
          )}

          <p className="text-xs text-gray-500">
            {loadingItems ? t('settings.memoryZone.updatingNow') : t('settings.memoryZone.cardsCount', { count: sectionItemsCount })}
          </p>

          {status && <p className="text-sm text-green-700">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
