import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { linkMemories } from '@/lib/memory/graphService';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const fromMemory = String(body?.from_memory || '').trim();
    const toMemory = String(body?.to_memory || '').trim();
    const relationType = String(body?.relation_type || '').trim();

    if (!fromMemory || !toMemory || !relationType) {
      return NextResponse.json(
        { error: 'from_memory, to_memory et relation_type sont requis' },
        { status: 400 }
      );
    }

    const relation = await linkMemories({
      userId,
      fromMemory,
      toMemory,
      relationType,
    });

    return NextResponse.json({ relation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur relation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
