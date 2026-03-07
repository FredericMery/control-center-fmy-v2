import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { deleteMemory, getMemoryById, updateMemory } from '@/lib/memory/memoryService';
import { requireValidationCode } from '@/lib/ai/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { id } = await context.params;
    const memory = await getMemoryById(userId, id);
    if (!memory) {
      return NextResponse.json({ error: 'Memoire introuvable' }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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
    const validationCode = body?.validationCode as string | undefined;

    requireValidationCode(validationCode);

    const memory = await updateMemory(userId, id, {
      title: body?.title,
      type: body?.type,
      content: body?.content,
      structuredData:
        body?.structured_data && typeof body.structured_data === 'object'
          ? body.structured_data
          : undefined,
      source: body?.source,
      sourceImage: body?.source_image,
      rating: body?.rating,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur mise a jour';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { id } = await context.params;
    await deleteMemory(userId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
