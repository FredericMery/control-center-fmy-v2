import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { askMemoryAgent } from '@/lib/ai/agentService';
import { requireValidationCode } from '@/lib/ai/client';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const question = String(body?.question || '').trim();
    const validationCode = body?.validationCode as string | undefined;

    if (!question) {
      return NextResponse.json({ error: 'question requise' }, { status: 400 });
    }

    requireValidationCode(validationCode);

    const result = await askMemoryAgent({
      userId,
      question,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur agent memoire';
    const status = message.includes('validation') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
