import { supabase } from '@/lib/supabase/client';

const MEMORY_PHOTOS_BUCKET = 'memory-photos';

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export async function uploadMemoryPhoto(params: {
  file: File;
  userId: string;
  sectionId: string;
  fieldId: string;
}): Promise<string> {
  const { file, userId, sectionId, fieldId } = params;
  const safeName = sanitizeFileName(file.name || `photo-${Date.now()}.jpg`);
  const path = `${userId}/${sectionId}/${fieldId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(MEMORY_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(MEMORY_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function isPhotoLikeField(fieldLabel: string): boolean {
  const l = fieldLabel.toLowerCase();
  return l.includes('photo') || l.includes('image') || l.includes('affiche');
}
