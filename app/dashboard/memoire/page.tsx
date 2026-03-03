'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useMemoryStore } from '@/store/memoryStore';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';
import Link from 'next/link';

export default function MemorePage() {
  const { user } = useAuthStore();
  const { sections, loadingSections, fetchSections } = useMemoryStore();
  const [showNewSection, setShowNewSection] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchSections();
    }
  }, [user, fetchSections]);

  const handleCreateSection = async (templateId: string) => {
    if (!user) return;

    setCreating(true);
    setCreateError(null);
    
    try {
      const { createSection } = useMemoryStore.getState();
      const name = customName || MEMORY_TEMPLATES[templateId]?.name;

      console.log('🚀 Starting section creation:', { templateId, name, userId: user.id });
      
      const newSection = await createSection(templateId, name);
      
      if (!newSection) {
        console.error('❌ createSection returned null');
        setCreateError('Failed to create collection. Check console for details.');
        setCreating(false);
        return;
      }

      console.log('✅ Section created:', newSection);

      // Refresh sections to show the new collection
      await fetchSections();
      setShowNewSection(false);
      setSelectedTemplate(null);
      setCustomName('');
    } catch (err) {
      console.error('💥 Exception during section creation:', err);
      setCreateError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const templates = Object.values(MEMORY_TEMPLATES);

  // Group sections by template
  const userSections = sections.filter((s) => s.template_id && !s.is_custom);
  const customSections = sections.filter((s) => s.is_custom);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-light text-white mb-2">📚 Mémoire</h1>
            <p className="text-gray-400 text-sm">Organize and remember what matters</p>
          </div>
          <button
            onClick={() => setShowNewSection(!showNewSection)}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-light hover:bg-gray-100 transition-colors"
          >
            {showNewSection ? 'Cancel' : '+ New Collection'}
          </button>
        </div>

        {/* New Section Selection */}
        {showNewSection && (
          <div className="mb-8 p-6 bg-gray-900/50 border border-gray-700 rounded-lg">
            <h3 className="text-lg font-light text-white mb-4">Choose a template</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`p-4 rounded-lg text-center transition-all ${
                    selectedTemplate === template.id
                      ? 'bg-white text-black border-2 border-white'
                      : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-3xl mb-2">{template.icon}</div>
                  <div className="text-sm font-light">{template.name}</div>
                </button>
              ))}
            </div>

            {selectedTemplate && (
              <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                <label className="block text-sm text-gray-300 mb-2">
                  Collection name (optional)
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={MEMORY_TEMPLATES[selectedTemplate]?.name}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                />
                {createError && (
                  <p className="text-sm text-red-400 mt-3">{createError}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleCreateSection(selectedTemplate)}
                    disabled={creating}
                    className="flex-1 px-4 py-2 bg-white text-black rounded text-sm font-light hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTemplate(null);
                      setCustomName('');
                      setCreateError(null);
                    }}
                    className="px-4 py-2 bg-gray-700 text-white rounded text-sm font-light hover:bg-gray-600 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sections Grid */}
        {loadingSections ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : userSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-400 mb-4">No collections yet</p>
            <p className="text-sm text-gray-500">Create your first collection to get started</p>
          </div>
        ) : (
          <>
            {/* User Collections */}
            {userSections.length > 0 && (
              <div>
                <h2 className="text-lg font-light text-white mb-4">Collections</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userSections.map((section) => {
                    const template = section.template_id
                      ? MEMORY_TEMPLATES[section.template_id]
                      : null;

                    return (
                      <Link
                        key={section.id}
                        href={`/dashboard/memoire/${section.id}`}
                        className="group p-5 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg transition-all hover:border-gray-600 cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="text-3xl">{template?.icon || '📝'}</div>
                          <div className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                            {section.items_count || 0} items
                          </div>
                        </div>
                        <h3 className="text-lg font-light text-white mb-1 group-hover:text-gray-100 transition-colors">
                          {section.section_name}
                        </h3>
                        {section.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {section.description}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Collections */}
            {customSections.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-light text-white mb-4">Custom Collections</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customSections.map((section) => (
                    <Link
                      key={section.id}
                      href={`/dashboard/memoire/${section.id}`}
                      className="group p-5 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg transition-all hover:border-gray-600 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-3xl">📝</div>
                        <div className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                          {section.items_count || 0} items
                        </div>
                      </div>
                      <h3 className="text-lg font-light text-white mb-1 group-hover:text-gray-100 transition-colors">
                        {section.section_name}
                      </h3>
                      {section.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {section.description}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
