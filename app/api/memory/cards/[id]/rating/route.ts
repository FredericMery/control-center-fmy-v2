import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { setMemoryRating } from '@/lib/memory/memoryService';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const rating = Number(body?.rating);

    if (!Number.isFinite(rating)) {
      return NextResponse.json({ error: 'rating invalide' }, { status: 400 });
    }

    const memory = await setMemoryRating(userId, id, rating);
    return NextResponse.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur rating';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
