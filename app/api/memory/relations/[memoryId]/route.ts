import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getMemoryRelations } from '@/lib/memory/graphService';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ memoryId: string }> }
) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { memoryId } = await context.params;
    const relations = await getMemoryRelations(userId, memoryId);

    return NextResponse.json({
      memoryId,
      count: relations.length,
      relations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement relations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
