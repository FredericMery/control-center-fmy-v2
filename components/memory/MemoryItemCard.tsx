'use client';

import { useState, useEffect } from 'react';
import { useMemoryStore } from '@/store/memoryStore';
import type { Database } from '../../types/database';
import { isPhotoLikeField } from '@/lib/memoryPhotos';

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
  const { getValuesByItemId, setItemValue } = useMemoryStore();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const itemValues = getValuesByItemId(item.id);

  useEffect(() => {
    const newValues: Record<string, string | null> = {};
    fields.forEach((field) => {
      const value = itemValues.find((v) => v.field_id === field.id);
      newValues[field.id] = value?.field_value || '';
    });
    setValues(newValues);
  }, [item.id, fields, itemValues]);

  const handleSaveField = async (fieldId: string, value: string) => {
    setLoading(true);
    try {
      await setItemValue(item.id, fieldId, value || null);
    } finally {
      setLoading(false);
    }
  };

  // Find photo field value
  const photoField = fields.find(f => f.field_type === 'url' && isPhotoLikeField(f.field_label));
  const photoValue = photoField ? itemValues.find(v => v.field_id === photoField.id)?.field_value : null;
  
  // Non-photo fields for display
  const infoFields = fields.filter(f => !(f.field_type === 'url' && isPhotoLikeField(f.field_label)));
  
  // Preview values (non-photo fields)
  const previewValues = itemValues
    .filter(v => {
      const field = fields.find(f => f.id === v.field_id);
      return field && !(field.field_type === 'url' && isPhotoLikeField(field.field_label));
    })
    .slice(0, 2);
  
  // Count filled vs total fields
  const filledCount = itemValues.filter(v => v.field_value && v.field_value.trim()).length;
  const totalCount = fields.length;

  return (
    <>
      {/* Photo Modal */}
      {showPhotoModal && photoValue && (
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
          <img
            src={photoValue}
            alt={item.item_title || 'Photo'}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div 
        className="bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-all overflow-hidden"
      >
        {/* Vue réduite : Layout horizontal avec info à gauche et photo à droite */}
        {!expanded && (
          <div className="p-4 flex gap-4">
            {/* Partie gauche : Informations */}
            <div className="flex-1 cursor-pointer" onClick={() => setExpanded(!expanded)}>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-light text-white hover:text-gray-200 transition-colors">
                  {item.item_title || 'Sans titre'}
                </h3>
                <span className="text-xs text-gray-500">
                  {filledCount}/{totalCount} remplis
                </span>
                <span className="text-xs text-gray-600">▶</span>
              </div>
              
              {/* Affichage de toutes les valeurs saisies */}
              {itemValues.length > 0 ? (
                <div className="space-y-1.5">
                  {itemValues.map((val) => {
                    const field = fields.find((f) => f.id === val.field_id);
                    // Skip photo fields
                    if (field && field.field_type === 'url' && isPhotoLikeField(field.field_label)) return null;
                    if (!val.field_value || !field) return null;
                    return (
                      <div key={val.id} className="text-xs">
                        <span className="text-gray-500 font-medium">{field.field_label}: </span>
                        <span className="text-gray-300">
                          {field.field_type === 'rating' ? (
                            <span className="inline-flex gap-0.5 ml-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span
                                  key={star}
                                  className={`text-sm ${
                                    parseInt(val.field_value || '0') >= star 
                                      ? 'text-yellow-400' 
                                      : 'text-gray-600'
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
                <p className="text-xs text-gray-500 italic">Aucune information saisie</p>
              )}
            </div>

            {/* Partie droite : Photo cliquable */}
            {photoValue && (
              <div 
                className="w-48 h-48 flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-indigo-500 transition-all bg-gray-900"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPhotoModal(true);
                }}
              >
                <img
                  src={photoValue}
                  alt={item.item_title || 'Photo'}
                  className="w-full h-full object-contain hover:scale-105 transition-transform"
                />
              </div>
            )}

            {/* Boutons Edit/Delete */}
            <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setEditing(!editing)}
                className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title={editing ? 'Terminer l\'édition' : 'Modifier'}
              >
                {editing ? '✓' : '✎'}
              </button>
              <button
                onClick={onDelete}
                className="text-xs px-2 py-1 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Vue étendue : Header avec titre */}
        {expanded && (
          <div className="p-4 pb-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <h3 className="text-lg font-light text-white hover:text-gray-200 transition-colors">
                  {item.item_title || 'Sans titre'}
                </h3>
                <span className="text-xs text-gray-500">
                  {filledCount}/{totalCount} remplis
                </span>
                <span className="text-xs text-gray-600">▼</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title={editing ? 'Terminer l\'édition' : 'Modifier'}
                >
                  {editing ? '✓' : '✎'}
                </button>
                <button
                  onClick={onDelete}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expanded View - 2 colonnes */}
        {expanded && (
          <div className="p-4 pt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonne gauche: Informations */}
              <div className="lg:col-span-2 space-y-3">
                {infoFields.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucun champ défini</p>
                ) : (
                  infoFields.map((field) => (
                    <div key={field.id} className="bg-gray-900/50 p-3 rounded-lg">
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
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
                                    : 'text-gray-600'
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
                        <div className="text-sm text-white">
                          {values[field.id] ? (
                            field.field_type === 'rating' ? (
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={`text-xl ${
                                      parseInt(values[field.id] || '0') >= star 
                                        ? 'text-yellow-400' 
                                        : 'text-gray-600'
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
                                className="text-indigo-400 hover:text-indigo-300 underline"
                              >
                                {values[field.id]}
                              </a>
                            ) : (
                              values[field.id]
                            )
                          ) : (
                            <span className="text-gray-600 italic">—</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Colonne droite: Photo */}
              {photoValue && (
                <div className="lg:col-span-1">
                  <div className="sticky top-4">
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Photo
                    </label>
                    <div 
                      className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-indigo-500 transition-all"
                      onClick={() => setShowPhotoModal(true)}
                    >
                      <img
                        src={photoValue}
                        alt={item.item_title || 'Photo'}
                        className="w-full h-64 object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                        <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">
                          🔍 Voir en grand
                        </span>
                      </div>
                    </div>
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
