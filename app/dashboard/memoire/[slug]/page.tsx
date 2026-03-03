'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMemoryStore } from '@/store/memoryStore';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';
import MemoryItemForm from '../../../../components/memory/MemoryItemForm';
import MemoryItemCard from '../../../../components/memory/MemoryItemCard';

export default function MemorySectionPage() {
  const router = useRouter();
  const params = useParams();
  const sectionId = params.slug as string;
  const { user } = useAuthStore();
  const {
    items,
    sections,
    fields,
    loadingItems,
    loadingSections,
    fetchSections,
    fetchItemsBySectionId,
    createItem,
    deleteItem,
    getFieldsBySectionId,
  } = useMemoryStore();

  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const section = sections.find((s) => s.id === sectionId);
  const template = section?.template_id ? MEMORY_TEMPLATES[section.template_id] : null;
  const sectionFields = fields.filter((f) => f.section_id === sectionId);
  const sectionItems = items.filter((i) => i.section_id === sectionId);

  // Filter items by search query
  const filteredItems = searchQuery
    ? sectionItems.filter((item) =>
        item.item_title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sectionItems;

  useEffect(() => {
    if (user) {
      fetchSections();
    }
  }, [user, fetchSections]);

  useEffect(() => {
    if (sectionId && user) {
      console.log(`[MemorySectionPage] Loading section ${sectionId}`);
      fetchItemsBySectionId(sectionId);
    }
  }, [sectionId, user, fetchItemsBySectionId]);
  
  // Debug: log fields count
  useEffect(() => {
    console.log(`[MemorySectionPage] Section fields count: ${sectionFields.length}`, sectionFields);
  }, [sectionFields]);

  const handleAddItem = async (title: string, fieldValues: Record<string, string>) => {
    setCreateError(null);
    
    if (sectionFields.length === 0) {
      setCreateError('⚠️ Aucun champ défini pour cette section. Contacte le support.');
      console.error('Cannot create item: no fields defined for section', sectionId);
      return;
    }
    
    // Create the item
    const created = await createItem(sectionId, title);
    if (!created) {
      setCreateError('Impossible de créer la carte. Vérifie les droits RLS / section.');
      return;
    }

    // Save all field values
    const { setItemValue } = useMemoryStore.getState();
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      if (value && value.trim()) {
        await setItemValue(created.id, fieldId, value);
      }
    }
    
    setShowForm(false);
    
    // Refresh the items to show the new one with values
    await fetchItemsBySectionId(sectionId);
  };

  if (loadingSections && !section) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-400">Loading section...</p>
        </div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white text-sm transition-colors mb-4"
          >
            ← Back
          </button>
          <p className="text-gray-400">Section not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Back
          </button>
          <div className="text-4xl">{template?.icon || '📝'}</div>
          <div>
            <h1 className="text-3xl font-light text-white">{section.section_name}</h1>
            {template?.description && (
              <p className="text-sm text-gray-400">{template.description}</p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-600"
          />
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-light hover:bg-gray-100 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Item'}
          </button>
        </div>

        {/* Add Item Form */}
        {showForm && (
          <>
            <MemoryItemForm
              sectionId={sectionId}
              fields={sectionFields}
              onAdd={handleAddItem}
              onCancel={() => setShowForm(false)}
            />
            {createError && (
              <p className="-mt-4 mb-4 text-sm text-red-400">{createError}</p>
            )}
          </>
        )}

        {/* Items List */}
        {loadingItems ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-400">Loading items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-400 mb-2">
              {searchQuery ? 'No items match your search' : 'No items yet'}
            </p>
            <p className="text-sm text-gray-500">
              {!searchQuery && 'Add your first item to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <MemoryItemCard
                key={item.id}
                item={item}
                fields={sectionFields}
                onDelete={() => deleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
