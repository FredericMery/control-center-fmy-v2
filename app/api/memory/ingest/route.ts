import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { requireValidationCode, callGoogleVision } from '@/lib/ai/client';
import { parseOcrToMemory } from '@/lib/ai/parserService';
import { resolveRequestLanguage } from '@/lib/i18n/serverLanguage';
import { translateServerMessage } from '@/lib/i18n/serverMessages';
import { createMemory, listMemories } from '@/lib/memory/memoryService';
import { linkMemories } from '@/lib/memory/graphService';

export async function POST(request: NextRequest) {
  const language = resolveRequestLanguage(request);

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: translateServerMessage(language, 'auth.unauthenticated') }, { status: 401 });
    }

    const body = await request.json();
    const validationCode = body?.validationCode as string | undefined;
    const imageBase64 = body?.imageBase64 as string | undefined;

    requireValidationCode(validationCode);

    if (!imageBase64) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.imageRequired') }, { status: 400 });
    }

    const rawText = await callGoogleVision(userId, imageBase64);
    if (!rawText) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.noTextDetected') }, { status: 422 });
    }

    const parsed = await parseOcrToMemory(userId, rawText, language);

    const memory = await createMemory({
      userId,
      title: parsed.title,
      type: parsed.type,
      content: parsed.summary,
      structuredData: {
        ...parsed.structured_data,
        raw_ocr_text: rawText,
      },
      source: 'ocr',
      sourceImage: body?.sourceImage || null,
    });

    const existing = await listMemories(userId, 200);
    const linked: string[] = [];

    for (const suggestion of parsed.suggested_relations) {
      const candidate = existing.find(
        (row) =>
          row.id !== memory.id &&
          row.title.toLowerCase().includes(suggestion.toLowerCase())
      );

      if (candidate) {
        try {
          await linkMemories({
            userId,
            fromMemory: memory.id,
            toMemory: candidate.id,
            relationType: 'suggested',
          });
          linked.push(candidate.id);
        } catch {
          // Ignore duplicate relation attempts.
        }
      }
    }

    return NextResponse.json({
      memory,
      rawText,
      parsed,
      linkedCount: linked.length,
      linkedMemories: linked,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const isValidationError = rawMessage.includes('validation');
    const message = isValidationError
      ? translateServerMessage(language, 'validation.required')
      : translateServerMessage(language, 'memory.errorAssistantScan');
    const status = isValidationError ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
