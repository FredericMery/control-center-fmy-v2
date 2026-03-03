'use client';

import { useState, useEffect } from 'react';
import { useMemoryStore } from '@/store/memoryStore';
import type { Database } from '../../types/database';

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

  const previewValues = itemValues.slice(0, 2);
  
  // Count filled vs total fields
  const filledCount = itemValues.filter(v => v.field_value && v.field_value.trim()).length;
  const totalCount = fields.length;

  return (
    <div 
      className="p-4 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-light text-white hover:text-gray-200 transition-colors">
              {item.item_title || 'Sans titre'}
            </h3>
            <span className="text-xs text-gray-500">
              {filledCount}/{totalCount} remplis
            </span>
            <span className="text-xs text-gray-600">
              {expanded ? '▼' : '▶'}
            </span>
          </div>
          {!expanded && previewValues.length > 0 && (
            <div className="mt-2 space-y-1">
              {previewValues.map((val) => {
                const field = fields.find((f) => f.id === val.field_id);
                if (!val.field_value) return null;
                return (
                  <div key={val.id} className="text-xs text-gray-400">
                    <span className="text-gray-500">{field?.field_label}: </span>
                    <span className="text-gray-300">{val.field_value}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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

      {/* Expanded View */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-gray-500">No fields defined for this section</p>
          ) : (
            fields.map((field) => (
              <div key={field.id}>
                <label className="block text-xs text-gray-400 mb-1">
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
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white transition-colors resize-none"
                      rows={2}
                    />
                  ) : (
                    <input
                      type={field.field_type === 'number' ? 'number' : 'text'}
                      value={values[field.id] || ''}
                      onChange={(e) =>
                        setValues({ ...values, [field.id]: e.target.value })
                      }
                      onBlur={(e) =>
                        handleSaveField(field.id, e.target.value)
                      }
                      placeholder={field.field_label}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                    />
                  )
                ) : (
                  <div className="text-sm text-gray-300">
                    {values[field.id] || (
                      <span className="text-gray-600 italic">—</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
