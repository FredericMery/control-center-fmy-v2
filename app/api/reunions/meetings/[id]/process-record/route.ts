import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { processMeetingRecordFromTranscript } from '@/lib/reunion/service';
import { transcribeAudioWithWhisper, uploadMeetingAudio, validateAudioFile } from '@/lib/reunion/audioPipeline';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await context.params;

  const contentType = String(request.headers.get('content-type') || '');
  let transcript = '';
  let audioUrl: string | undefined;
  let whisperMeta: { language: string | null; duration: number | null } | null = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    transcript = String(formData.get('transcript') || '').trim();
    const audio = formData.get('audio');

    if (audio instanceof File && audio.size > 0) {
      validateAudioFile(audio);

      const [uploadResult, transcription] = await Promise.all([
        uploadMeetingAudio({
          userId,
          meetingId: id,
          file: audio,
        }),
        transcribeAudioWithWhisper({
          userId,
          file: audio,
          language: 'fr',
        }),
      ]);

      audioUrl = uploadResult.audioUrl;
      whisperMeta = {
        language: transcription.language,
        duration: transcription.duration,
      };

      if (!transcript) {
        transcript = transcription.transcript;
      }
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as {
      transcript?: string;
      audioUrl?: string;
    };
    transcript = String(body.transcript || '').trim();
    audioUrl = String(body.audioUrl || '').trim() || undefined;
  }

  if (!transcript) {
    return NextResponse.json({ error: 'transcript requis (ou fichier audio)' }, { status: 400 });
  }

  try {
    const output = await processMeetingRecordFromTranscript({
      userId,
      meetingId: id,
      transcript,
      audioUrl,
    });

    return NextResponse.json({
      ...output,
      audioUrl: audioUrl || null,
      whisper: whisperMeta,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur processing' },
      { status: 500 }
    );
  }
}
