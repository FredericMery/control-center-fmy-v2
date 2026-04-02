import { callOpenAiAudioTranscription } from '@/lib/ai/client';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const DEFAULT_AUDIO_BUCKET = 'meeting-recordings';
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024;
const WHISPER_SAFE_DIRECT_LIMIT_BYTES = 24 * 1024 * 1024;
const WHISPER_CHUNK_BYTES = 20 * 1024 * 1024;
const WHISPER_CHUNK_OVERLAP_BYTES = 256 * 1024;

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

function inferFileExtension(fileName: string, contentType: string) {
  const lower = String(fileName || '').toLowerCase();
  const extMatch = lower.match(/\.([a-z0-9]{2,5})$/i);
  if (extMatch?.[1]) return extMatch[1];

  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'm4a';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('webm')) return 'webm';
  if (contentType.includes('ogg')) return 'ogg';
  return 'mp3';
}

function buildAudioChunks(file: File): File[] {
  const chunks: File[] = [];
  const contentType = inferAudioType(file);
  const extension = inferFileExtension(file.name, contentType);

  let start = 0;
  let index = 0;

  while (start < file.size) {
    const end = Math.min(start + WHISPER_CHUNK_BYTES, file.size);
    const chunkBlob = file.slice(start, end, contentType);
    const chunkFile = new File(
      [chunkBlob],
      `${sanitizeName(file.name || 'meeting-audio')}.part-${index + 1}.${extension}`,
      { type: contentType }
    );
    chunks.push(chunkFile);

    if (end >= file.size) break;
    start = Math.max(0, end - WHISPER_CHUNK_OVERLAP_BYTES);
    index += 1;
  }

  return chunks;
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
  const prompt = 'Transcribe this meeting audio accurately and keep speaker intent.';

  if (args.file.size <= WHISPER_SAFE_DIRECT_LIMIT_BYTES) {
    const response = await callOpenAiAudioTranscription({
      userId: args.userId,
      file: args.file,
      model: 'whisper-1',
      language: args.language,
      prompt,
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

  // Fallback for large files: split best-effort into overlapping chunks.
  const chunks = buildAudioChunks(args.file);
  const transcripts: string[] = [];
  const languageCounts = new Map<string, number>();

  for (const chunk of chunks) {
    try {
      const response = await callOpenAiAudioTranscription({
        userId: args.userId,
        file: chunk,
        model: 'whisper-1',
        language: args.language,
        prompt,
      });

      const text = String(response?.text || '').trim();
      if (text) {
        transcripts.push(text);
      }

      const lang = String(response?.language || '').trim();
      if (lang) {
        languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
      }
    } catch {
      // Keep best-effort behavior: one failing chunk should not cancel all results.
    }
  }

  if (transcripts.length === 0) {
    throw new Error('Transcription impossible pour ce fichier audio');
  }

  let language: string | null = null;
  if (languageCounts.size > 0) {
    const sorted = Array.from(languageCounts.entries()).sort((a, b) => b[1] - a[1]);
    language = sorted[0][0];
  }

  return {
    transcript: transcripts.join('\n\n'),
    language,
    duration: null,
  };
}
