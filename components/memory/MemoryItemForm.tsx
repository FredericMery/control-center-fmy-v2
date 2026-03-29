import { useState } from 'react';
import type { Database } from '../../types/database';
import { useAuthStore } from '@/store/authStore';
import { isPhotoLikeField, uploadMemoryPhoto } from '@/lib/memoryPhotos';
import { incrementOcrUsageCount } from '@/lib/ocrUsage';
import {
  appendMemoryPhotoUrl,
  MAX_MEMORY_PHOTOS,
  parseMemoryPhotoUrls,
  removeMemoryPhotoUrl,
  serializeMemoryPhotoUrls,
} from '@/lib/memoryPhotoValue';

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
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingScanFile, setPendingScanFile] = useState<File | null>(null);

  const maxPhotosErrorMessage = `Maximum ${MAX_MEMORY_PHOTOS} photos pour ce champ.`;

  const photoField = fields.find(
    (f) => f.field_type === 'url' && isPhotoLikeField(f.field_label)
  );

  const handleAuthSubmit = async () => {
    if (!authCode.trim()) {
      setAuthError('Code requis');
      return;
    }

    if (!pendingScanFile) {
      setShowAuthModal(false);
      return;
    }

    await performScan(pendingScanFile, authCode);
    setShowAuthModal(false);
    setAuthCode('');
    setAuthError(null);
    setPendingScanFile(null);
  };

  const handleScanPhoto = async (file?: File) => {
    if (!file) return;

    setScanError(null);
    setPendingScanFile(file);
    setShowAuthModal(true);
    setAuthCode('');
    setAuthError(null);
  };

  const performScan = async (file: File, code: string) => {
    setScanError(null);
    setScanInfo(null);
    setScanning(true);

    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
        reader.readAsDataURL(file);
      });

      const response = await fetch('/api/memory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          authCode: code,
          fields: fields.map((f) => ({
            id: f.id,
            field_label: f.field_label,
            field_type: f.field_type,
            options: f.options,
          })),
        }),
      });

      incrementOcrUsageCount();

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Scan OCR impossible');
      }

      if (data?.suggestedTitle) {
        setTitle((prev) => (prev.trim() ? prev : data.suggestedTitle));
      }

      if (data?.mappedValues) {
        setFieldValues((prev) => ({ ...prev, ...data.mappedValues }));
      }

      if (photoField && user) {
        const currentPhotos = parseMemoryPhotoUrls(fieldValues[photoField.id]);
        setUploadingFieldId(photoField.id);
        if (currentPhotos.length < MAX_MEMORY_PHOTOS) {
          const publicUrl = await uploadMemoryPhoto({
            file,
            userId: user.id,
            sectionId,
            fieldId: photoField.id,
          });
          setFieldValues((prev) => ({
            ...prev,
            [photoField.id]: appendMemoryPhotoUrl(prev[photoField.id], publicUrl) || '',
          }));
        } else {
          setUploadError(maxPhotosErrorMessage);
        }
      }

      setScanInfo(
        `Scan terminé : ${data?.filledCount || 0} champ(s) pré-rempli(s). Vérifie les valeurs avant de créer la fiche.`
      );
    } catch (error) {
      console.error('OCR scan failed:', error);
      setScanError(
        error instanceof Error ? error.message : 'Scan OCR impossible'
      );
    } finally {
      setUploadingFieldId(null);
      setScanning(false);
    }
  };

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

    const setPhotoFieldFromUrls = (urls: string[]) => {
      const limitedUrls = urls.slice(0, MAX_MEMORY_PHOTOS);
      if (urls.length > MAX_MEMORY_PHOTOS) {
        setUploadError(maxPhotosErrorMessage);
      } else if (uploadError === maxPhotosErrorMessage) {
        setUploadError(null);
      }

      setFieldValues((prev) => ({
        ...prev,
        [field.id]: serializeMemoryPhotoUrls(limitedUrls) || '',
      }));
    };

    const handlePhotoFile = async (file?: File) => {
      if (!file || !user) return;
      const currentPhotos = parseMemoryPhotoUrls(fieldValues[field.id]);
      if (currentPhotos.length >= MAX_MEMORY_PHOTOS) {
        setUploadError(maxPhotosErrorMessage);
        return;
      }

      setUploadError(null);
      setUploadingFieldId(field.id);
      try {
        const publicUrl = await uploadMemoryPhoto({
          file,
          userId: user.id,
          sectionId,
          fieldId: field.id,
        });
        setFieldValues((prev) => ({
          ...prev,
          [field.id]: appendMemoryPhotoUrl(prev[field.id], publicUrl) || '',
        }));
      } catch (error) {
        console.error('Photo upload failed:', error);
        setUploadError('Upload photo impossible. Vérifie le bucket Supabase "memory-photos" et ses policies.');
      } finally {
        setUploadingFieldId(null);
      }
    };
    
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

      case 'url':
        if (isPhotoLikeField(field.field_label)) {
          const photoUrls = parseMemoryPhotoUrls(value);
          const uploadLimitReached = photoUrls.length >= MAX_MEMORY_PHOTOS;

          return (
            <div className="space-y-2">
              <textarea
                value={photoUrls.join('\n')}
                onChange={(e) => {
                  const nextUrls = e.target.value
                    .split('\n')
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  setPhotoFieldFromUrls(nextUrls);
                }}
                placeholder={'https://...\nhttps://...'}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-white transition-colors"
                rows={Math.max(2, Math.min(5, photoUrls.length || 2))}
              />

              <p className="text-xs text-gray-400">{photoUrls.length}/{MAX_MEMORY_PHOTOS} photos</p>

              {photoUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photoUrls.map((photoUrl, index) => (
                    <div key={`${photoUrl}-${index}`} className="relative overflow-hidden rounded border border-gray-700 bg-gray-900">
                      <img
                        src={photoUrl}
                        alt={`${field.field_label} ${index + 1}`}
                        className="h-28 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFieldValues((prev) => ({
                            ...prev,
                            [field.id]: removeMemoryPhotoUrl(prev[field.id], photoUrl) || '',
                          }));
                          if (uploadError === maxPhotosErrorMessage) {
                            setUploadError(null);
                          }
                        }}
                        className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/85"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <label
                  className={`px-3 py-2 text-white text-xs rounded cursor-pointer transition-colors ${
                    uploadLimitReached ? 'bg-gray-800 opacity-50' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  📁 Bibliothèque
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadLimitReached}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      void handlePhotoFile(file);
                    }}
                  />
                </label>

                <label
                  className={`px-3 py-2 text-white text-xs rounded cursor-pointer transition-colors ${
                    uploadLimitReached ? 'bg-gray-800 opacity-50' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  📷 Prendre une photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploadLimitReached}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      void handlePhotoFile(file);
                    }}
                  />
                </label>

                {uploadingFieldId === field.id && (
                  <span className="text-xs text-gray-400 self-center">Upload...</span>
                )}
              </div>
            </div>
          );
        }

        return (
          <input
            type="url"
            value={value}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.id]: e.target.value })}
            placeholder="https://..."
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
      
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 w-96 max-w-full">
            <h4 className="text-lg font-light text-white mb-4">Code d&apos;authentification OCR</h4>
            <p className="text-xs text-gray-400 mb-4">Entrez le code pour déverrouiller le scan OCR</p>
            <input
              type="password"
              value={authCode}
              onChange={(e) => {
                setAuthCode(e.target.value);
                setAuthError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAuthSubmit();
                }
              }}
              placeholder="Code..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all mb-3"
              autoFocus
            />
            {authError && <p className="text-xs text-red-400 mb-3">{authError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAuthSubmit}
                className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors"
              >
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthCode('');
                  setAuthError(null);
                  setPendingScanFile(null);
                }}
                className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">
            OCR: prends une photo et on essaie de pré-remplir automatiquement les champs.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded cursor-pointer transition-colors">
              📁 Scanner depuis la bibliothèque
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleScanPhoto(e.target.files?.[0])}
              />
            </label>
            <label className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded cursor-pointer transition-colors">
              📷 Prendre et scanner
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleScanPhoto(e.target.files?.[0])}
              />
            </label>
            {scanning && (
              <span className="text-xs text-gray-400 self-center">Analyse OCR en cours...</span>
            )}
          </div>
          {scanError && <p className="text-xs text-red-400 mt-2">{scanError}</p>}
          {scanInfo && <p className="text-xs text-emerald-400 mt-2">{scanInfo}</p>}
        </div>

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

        {uploadError && (
          <p className="text-sm text-red-400">{uploadError}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || scanning || !title.trim()}
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
