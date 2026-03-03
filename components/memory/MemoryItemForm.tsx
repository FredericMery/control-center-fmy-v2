import { useState } from 'react';
import type { Database } from '../../types/database';

type MemoryField = Database['public']['Tables']['memory_fields']['Row'];

interface MemoryItemFormProps {
  sectionId: string;
  fields: MemoryField[];
  onAdd: (title: string, fieldValues: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

export default function MemoryItemForm({
  sectionId,
  fields,
  onAdd,
  onCancel,
}: MemoryItemFormProps) {
  const [title, setTitle] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onAdd(title, fieldValues);
      setTitle('');
      setFieldValues({});
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: MemoryField) => {
    const value = fieldValues[field.id] || '';
    
    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
            placeholder={field.field_label}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white transition-colors resize-none"
            rows={3}
          />
        );
      
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-white transition-colors"
          >
            <option value="">Sélectionner...</option>
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      case 'rating':
        return (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setFieldValues({ ...fieldValues, [field.id]: star.toString() })}
                className={`text-2xl ${parseInt(value) >= star ? 'text-yellow-400' : 'text-gray-600'} hover:text-yellow-300 transition-colors`}
              >
                ⭐
              </button>
            ))}
          </div>
        );
      
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
            placeholder={field.field_label}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
          />
        );
      
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
            placeholder={field.field_label}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
          />
        );
    }
  };

  return (
    <div className="p-6 mb-6 bg-gray-800 border border-gray-700 rounded-lg">
      <h3 className="text-lg font-light text-white mb-4">Nouvelle fiche</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Titre principal */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Titre <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Châteauneuf-du-Pape 2015"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
            autoFocus
          />
        </div>

        {/* Tous les champs du template */}
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-sm text-gray-400 mb-1">
              {field.field_label}
              {field.is_required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {renderField(field)}
          </div>
        ))}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex-1 px-4 py-2 bg-white text-black rounded-lg text-sm font-light hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Création...' : 'Créer la fiche'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-light hover:bg-gray-600 transition-colors"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
