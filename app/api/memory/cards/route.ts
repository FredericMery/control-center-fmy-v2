import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { createMemory, listMemories } from '@/lib/memory/memoryService';
import { requireValidationCode } from '@/lib/ai/client';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limitRaw = Number(searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

    const memories = await listMemories(userId, limit);
    return NextResponse.json({ memories, count: memories.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const title = String(body?.title || '').trim();
    const validationCode = body?.validationCode as string | undefined;
    if (!title) {
      return NextResponse.json({ error: 'title requis' }, { status: 400 });
    }

    requireValidationCode(validationCode);

    const memory = await createMemory({
      userId,
      title,
      type: body?.type || 'other',
      content: body?.content || '',
      structuredData:
        body?.structured_data && typeof body.structured_data === 'object'
          ? body.structured_data
          : {},
      source: body?.source || null,
      sourceImage: body?.source_image || null,
      rating: body?.rating ?? null,
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur creation memoire';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
