import { useState } from 'react';
import type { Database } from '@/types/database';

type MemoryField = Database['public']['Tables']['memory_fields']['Row'];

interface MemoryItemFormProps {
  sectionId: string;
  fields: MemoryField[];
  onAdd: (title: string) => Promise<void>;
  onCancel: () => void;
}

export default function MemoryItemForm({
  sectionId,
  fields,
  onAdd,
  onCancel,
}: MemoryItemFormProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onAdd(title);
      setTitle('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 mb-6 bg-gray-800 border border-gray-700 rounded-lg">
      <h3 className="text-lg font-light text-white mb-4">Add New Item</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item title..."
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex-1 px-4 py-2 bg-white text-black rounded-lg text-sm font-light hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-light hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
