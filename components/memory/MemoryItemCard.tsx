'use client';

import { useState, useEffect } from 'react';
import { useMemoryStore } from '@/store/memoryStore';
import type { Database } from '../../types/database';
import { isPhotoLikeField } from '@/lib/memoryPhotos';
import { useAuthStore } from '@/store/authStore';
import { uploadMemoryPhoto } from '@/lib/memoryPhotos';
import {
  appendMemoryPhotoUrl,
  MAX_MEMORY_PHOTOS,
  parseMemoryPhotoUrls,
  removeMemoryPhotoUrl,
} from '@/lib/memoryPhotoValue';

type MemoryItem = Database['public']['Tables']['memory_items']['Row'];
type MemoryField = Database['public']['Tables']['memory_fields']['Row'];

interface MemoryItemCardProps {
  item: MemoryItem;
  fields: MemoryField[];
  onDelete: () => void;
}

export default function MemoryItemCard({
  item,
  fields,
  onDelete,
}: MemoryItemCardProps) {
  const { getValuesByItemId, setItemValue, updateItem } = useMemoryStore();
  const { user } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.item_title || '');
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const itemValues = getValuesByItemId(item.id);

  useEffect(() => {
    const newValues: Record<string, string | null> = {};
    fields.forEach((field) => {
      const value = itemValues.find((v) => v.field_id === field.id);
      newValues[field.id] = value?.field_value || '';
    });
    setValues(newValues);
  }, [item.id, fields, itemValues]);

  useEffect(() => {
    setTitle(item.item_title || '');
  }, [item.item_title]);

  const handleSaveField = async (fieldId: string, value: string) => {
    await setItemValue(item.id, fieldId, value || null);
  };

  const handleSaveTitle = async (nextTitle: string) => {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle || trimmedTitle === (item.item_title || '')) {
      setTitle(item.item_title || '');
      return;
    }

    await updateItem(item.id, { item_title: trimmedTitle });
  };

  const handleToggleEditing = () => {
    setEditing((prev) => {
      const next = !prev;
      if (next) {
        setExpanded(true);
      }
      return next;
    });
  };

  // Find photo field value
  const photoField = fields.find(f => f.field_type === 'url' && isPhotoLikeField(f.field_label));
  const photoValue = photoField ? itemValues.find(v => v.field_id === photoField.id)?.field_value : null;
  const photoUrls = parseMemoryPhotoUrls(photoValue);
  const mainPhotoUrl = photoUrls[0] || null;

  const handlePhotoUpload = async (file?: File) => {
    if (!file || !user || !photoField) return;
    if (photoUrls.length >= MAX_MEMORY_PHOTOS) {
      setPhotoError(`Maximum ${MAX_MEMORY_PHOTOS} photos pour cette fiche.`);
      return;
    }

    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadMemoryPhoto({
        file,
        userId: user.id,
        sectionId: item.section_id,
        fieldId: photoField.id,
      });
      const nextValue = appendMemoryPhotoUrl(photoValue, publicUrl) || '';
      await setItemValue(item.id, photoField.id, nextValue || null);
      setValues((prev) => ({ ...prev, [photoField.id]: nextValue }));
    } catch (error) {
      console.error('Photo upload failed:', error);
      setPhotoError('Upload photo impossible. Vérifie le bucket memory-photos.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoRemove = async (photoUrl: string) => {
    if (!photoField) return;

    setPhotoError(null);
    const nextValue = removeMemoryPhotoUrl(photoValue, photoUrl) || '';
    await setItemValue(item.id, photoField.id, nextValue || null);
    setValues((prev) => ({ ...prev, [photoField.id]: nextValue }));
  };
  
  // Non-photo fields for display
  const infoFields = fields.filter(f => !(f.field_type === 'url' && isPhotoLikeField(f.field_label)));
  
  // Count filled vs total fields
  const filledCount = itemValues.filter(v => v.field_value && v.field_value.trim()).length;
  const totalCount = fields.length;
  const createdAtLabel = formatCreatedAt(item.created_at);

  return (
    <>
      {/* Photo Modal */}
      {showPhotoModal && photoUrls.length > 0 && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setShowPhotoModal(false)}
        >
          <button
            onClick={() => setShowPhotoModal(false)}
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 transition-colors"
          >
            ×
          </button>
          <div
            className="max-h-full w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-medium text-white">{photoUrls.length > 1 ? 'Photos' : 'Photo'}</h4>
              <span className="text-xs text-slate-400">{photoUrls.length}/{MAX_MEMORY_PHOTOS}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {photoUrls.map((photoUrl, index) => (
                <img
                  key={`${photoUrl}-${index}`}
                  src={photoUrl}
                  alt={`${item.item_title || 'Photo'} ${index + 1}`}
                  className="max-h-[70vh] w-full rounded-lg object-contain"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900 to-slate-800/90 shadow-lg transition-all hover:border-cyan-500/40 hover:shadow-cyan-500/10">
        {/* Vue réduite : Layout horizontal avec info à gauche et photo à droite */}
        {!expanded && (
          <div className="p-4 sm:p-5 flex gap-4">
            {/* Partie gauche : Informations */}
            <div className="flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium text-white hover:text-cyan-100 transition-colors">
                  {item.item_title || 'Sans titre'}
                </h3>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                  Cree le {createdAtLabel}
                </span>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                  {filledCount}/{totalCount} remplis
                </span>
                <span className="text-xs text-slate-500">▶</span>
              </div>
              
              {/* Affichage de toutes les valeurs saisies */}
              {itemValues.length > 0 ? (
                <div className="space-y-2">
                  {itemValues.map((val) => {
                    const field = fields.find((f) => f.id === val.field_id);
                    // Skip photo fields
                    if (field && field.field_type === 'url' && isPhotoLikeField(field.field_label)) return null;
                    if (!val.field_value || !field) return null;
                    return (
                      <div key={val.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2.5 py-2 text-xs">
                        <span className="font-medium text-slate-400">{field.field_label}: </span>
                        <span className="text-slate-200">
                          {field.field_type === 'rating' ? (
                            <span className="inline-flex gap-0.5 ml-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span
                                  key={star}
                                  className={`text-sm ${
                                    parseInt(val.field_value || '0') >= star 
                                      ? 'text-yellow-400' 
                                      : 'text-slate-600'
                                  }`}
                                >
                                  ⭐
                                </span>
                              ))}
                            </span>
                          ) : (
                            val.field_value
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">Aucune information saisie</p>
              )}
            </div>

            {/* Partie droite : Photo cliquable */}
            {mainPhotoUrl && (
              <div 
                className="h-28 w-28 sm:h-36 sm:w-36 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-700 hover:border-cyan-500 transition-all bg-slate-900"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPhotoModal(true);
                }}
              >
                <img
                  src={mainPhotoUrl}
                  alt={item.item_title || 'Photo'}
                  className="h-full w-full object-cover hover:scale-105 transition-transform"
                />
                {photoUrls.length > 1 && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-[11px] text-white">
                    +{photoUrls.length - 1}
                  </span>
                )}
              </div>
            )}

            {/* Boutons Edit/Delete */}
            <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={handleToggleEditing}
                className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title={editing ? 'Terminer l\'édition' : 'Modifier'}
              >
                {editing ? '✓' : '✎'}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Vue étendue : Header avec titre */}
        {expanded && (
          <div className="border-b border-slate-700/70 p-4 pb-3 sm:p-5 sm:pb-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                {editing ? (
                  <input
                    type="text"
                    value={title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={(e) => void handleSaveTitle(e.target.value)}
                    placeholder="Sans titre"
                    className="w-full max-w-md rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xl font-medium text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                ) : (
                  <h3 className="text-xl font-medium text-white hover:text-cyan-100 transition-colors">
                    {item.item_title || 'Sans titre'}
                  </h3>
                )}
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                  {filledCount}/{totalCount} remplis
                </span>
                <span className="text-xs text-slate-500">▼</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleToggleEditing}
                  className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  title={editing ? 'Terminer l\'édition' : 'Modifier'}
                >
                  {editing ? '✓' : '✎'}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:text-red-300 hover:bg-red-900/30 transition-colors"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">Date de creation : {createdAtLabel}</p>
          </div>
        )}

        {/* Expanded View - 2 colonnes */}
        {expanded && (
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Colonne gauche: Informations */}
              <div className="lg:col-span-2 space-y-3">
                {infoFields.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun champ défini</p>
                ) : (
                  infoFields.map((field) => (
                    <div key={field.id} className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        {field.field_label}
                      </label>
                      {editing ? (
                        field.field_type === 'textarea' ? (
                          <textarea
                            value={values[field.id] || ''}
                            onChange={(e) =>
                              setValues({ ...values, [field.id]: e.target.value })
                            }
                            onBlur={(e) =>
                              handleSaveField(field.id, e.target.value)
                            }
                            placeholder={field.field_label}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
                            rows={3}
                          />
                        ) : field.field_type === 'select' && field.options ? (
                          <select
                            value={values[field.id] || ''}
                            onChange={(e) => {
                              setValues({ ...values, [field.id]: e.target.value });
                              handleSaveField(field.id, e.target.value);
                            }}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          >
                            <option value="">Sélectionner...</option>
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.field_type === 'rating' ? (
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => {
                                  const newValue = star.toString();
                                  setValues({ ...values, [field.id]: newValue });
                                  handleSaveField(field.id, newValue);
                                }}
                                className={`text-2xl ${
                                  parseInt(values[field.id] || '0') >= star 
                                    ? 'text-yellow-400' 
                                    : 'text-slate-600'
                                } hover:text-yellow-300 transition-colors`}
                              >
                                ⭐
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input
                            type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                            value={values[field.id] || ''}
                            onChange={(e) =>
                              setValues({ ...values, [field.id]: e.target.value })
                            }
                            onBlur={(e) =>
                              handleSaveField(field.id, e.target.value)
                            }
                            placeholder={field.field_label}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          />
                        )
                      ) : (
                        <div className="rounded-lg bg-slate-950/50 px-3 py-2 text-sm text-white">
                          {values[field.id] ? (
                            field.field_type === 'rating' ? (
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={`text-xl ${
                                      parseInt(values[field.id] || '0') >= star 
                                        ? 'text-yellow-400' 
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    ⭐
                                  </span>
                                ))}
                              </div>
                            ) : field.field_type === 'url' ? (
                              <a
                                href={values[field.id] || ''}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-300 hover:text-cyan-200 underline"
                              >
                                {values[field.id]}
                              </a>
                            ) : (
                              values[field.id]
                            )
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Colonne droite: Photo */}
              {photoField && (photoUrls.length > 0 || editing) && (
                <div className="lg:col-span-1">
                  <div className="sticky top-4 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                      {photoUrls.length > 1 ? 'Photos' : 'Photo'}
                    </label>
                    <p className="mb-3 text-xs text-slate-400">{photoUrls.length}/{MAX_MEMORY_PHOTOS} photos</p>

                    {editing && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        <label className={`rounded-md px-3 py-2 text-xs text-white ${photoUrls.length >= MAX_MEMORY_PHOTOS ? 'bg-slate-800 opacity-50' : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'}`}>
                          Ajouter depuis la bibliotheque
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={photoUrls.length >= MAX_MEMORY_PHOTOS || uploadingPhoto}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              void handlePhotoUpload(file);
                            }}
                          />
                        </label>
                        <label className={`rounded-md px-3 py-2 text-xs text-white ${photoUrls.length >= MAX_MEMORY_PHOTOS ? 'bg-slate-800 opacity-50' : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'}`}>
                          Prendre une photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={photoUrls.length >= MAX_MEMORY_PHOTOS || uploadingPhoto}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              void handlePhotoUpload(file);
                            }}
                          />
                        </label>
                        {uploadingPhoto && <span className="self-center text-xs text-slate-400">Upload...</span>}
                      </div>
                    )}

                    {photoError && <p className="mb-3 text-xs text-red-300">{photoError}</p>}

                    {photoUrls.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        {photoUrls.map((photoUrl, index) => (
                          <div key={`${photoUrl}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                            <button
                              type="button"
                              className="block w-full"
                              onClick={() => setShowPhotoModal(true)}
                            >
                              <img
                                src={photoUrl}
                                alt={`${item.item_title || 'Photo'} ${index + 1}`}
                                className="h-44 w-full object-cover"
                              />
                            </button>
                            {editing && (
                              <button
                                type="button"
                                onClick={() => void handlePhotoRemove(photoUrl)}
                                className="absolute right-2 top-2 rounded bg-black/75 px-2 py-1 text-[11px] text-white hover:bg-black/90"
                              >
                                Retirer
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Aucune photo</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function formatCreatedAt(value: string | null): string {
  if (!value) return 'date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
