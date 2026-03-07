import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { askMemoryAgent } from '@/lib/ai/agentService';
import { requireValidationCode } from '@/lib/ai/client';
import { resolveRequestLanguage } from '@/lib/i18n/serverLanguage';
import { translateServerMessage } from '@/lib/i18n/serverMessages';

export async function POST(request: NextRequest) {
  const language = resolveRequestLanguage(request);

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: translateServerMessage(language, 'auth.unauthenticated') }, { status: 401 });
    }

    const body = await request.json();
    const question = String(body?.question || '').trim();
    const validationCode = body?.validationCode as string | undefined;

    if (!question) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.questionRequired') }, { status: 400 });
    }

    requireValidationCode(validationCode);

    const result = await askMemoryAgent({
      userId,
      question,
      language,
    });

    return NextResponse.json(result);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const isValidationError = rawMessage.includes('validation');
    const message = isValidationError
      ? translateServerMessage(language, 'validation.required')
      : translateServerMessage(language, 'memory.errorAgent');
    const status = isValidationError ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
