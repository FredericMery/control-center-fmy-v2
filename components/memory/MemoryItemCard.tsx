'use client';

import { useState, useEffect } from 'react';
import { useMemoryStore } from '@/store/memoryStore';
import type { Database } from '@/types/database';

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

  return (
    <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-lg font-light text-white hover:text-gray-200 transition-colors text-left"
          >
            {item.item_title || 'Untitled'}
          </button>
          {!expanded && previewValues.length > 0 && (
            <div className="mt-2 space-y-1">
              {previewValues.map((val) => {
                const field = fields.find((f) => f.id === val.field_id);
                return (
                  <div key={val.id} className="text-xs text-gray-500">
                    <span className="text-gray-600">{field?.field_label}: </span>
                    {val.field_value}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            {editing ? '✓' : '✎'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
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
