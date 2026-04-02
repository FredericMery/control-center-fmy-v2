import { callOpenAiAudioTranscription } from '@/lib/ai/client';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const DEFAULT_AUDIO_BUCKET = 'meeting-recordings';
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
]);

function sanitizeName(name: string) {
  return String(name || 'meeting-audio')
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function inferAudioType(file: File) {
  if (file.type && ALLOWED_AUDIO_TYPES.has(file.type)) {
    return file.type;
  }

  const lowerName = String(file.name || '').toLowerCase();
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.m4a')) return 'audio/mp4';
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.webm')) return 'audio/webm';
  if (lowerName.endsWith('.ogg')) return 'audio/ogg';
  return file.type || 'audio/mpeg';
}

export function validateAudioFile(file: File) {
  if (!file || !(file instanceof File)) {
    throw new Error('Fichier audio invalide');
  }

  if (file.size <= 0) {
    throw new Error('Fichier audio vide');
  }

  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    throw new Error('Fichier audio trop volumineux (max 100 Mo)');
  }

  const contentType = inferAudioType(file);
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    throw new Error('Format audio non supporte');
  }

  return contentType;
}

export async function uploadMeetingAudio(args: {
  userId: string;
  meetingId: string;
  file: File;
}) {
  const supabase = getSupabaseAdminClient();
  const contentType = validateAudioFile(args.file);

  const bucket = process.env.SUPABASE_MEETING_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
  const safeName = sanitizeName(args.file.name || `audio-${Date.now()}.mp3`);
  const storagePath = `${args.userId}/${args.meetingId}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await args.file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Erreur upload audio');
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(signedError?.message || 'Impossible de signer URL audio');
  }

  return {
    audioUrl: signedData.signedUrl,
    storagePath,
    bucket,
  };
}

export async function transcribeAudioWithWhisper(args: {
  userId: string;
  file: File;
  language?: string;
}) {
  const response = await callOpenAiAudioTranscription({
    userId: args.userId,
    file: args.file,
    model: 'whisper-1',
    language: args.language,
    prompt: 'Transcribe this meeting audio accurately and keep speaker intent.',
  });

  const text = String(response?.text || '').trim();
  if (!text) {
    throw new Error('Transcription vide');
  }

  return {
    transcript: text,
    language: response?.language || null,
    duration: Number(response?.duration || 0) || null,
  };
}
