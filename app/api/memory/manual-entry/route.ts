import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { createMemory } from '@/lib/memory/memoryService';
import { getPrimaryMemoryPhotoUrl } from '@/lib/memoryPhotoValue';

type FieldValuePayload = {
  label: string;
  value: string;
  type: string;
};

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const title = String(body.title || '').trim();
    const type = String(body.type || 'other').trim() || 'other';
    const memoryTypeId = String(body.memoryTypeId || '').trim();
    const memoryTypeName = String(body.memoryTypeName || '').trim();
    const sectionId = String(body.sectionId || '').trim();
    const description = String(body.description || '').trim();
    const fieldValues = (Array.isArray(body.fieldValues) ? body.fieldValues : []) as FieldValuePayload[];

    if (!title) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const templateFields: Record<string, string> = {};
    const searchableLines: string[] = [];
    let sourceImage: string | null = null;

    for (const field of fieldValues) {
      const label = String(field?.label || '').trim();
      const value = String(field?.value || '').trim();
      const fieldType = String(field?.type || '').trim();
      if (!label || !value) continue;

      const key = toFieldKey(label);
      templateFields[key] = value;
      searchableLines.push(`${label}: ${value}`);

      if (!sourceImage && fieldType === 'url' && /photo|image|affiche/i.test(label)) {
        sourceImage = getPrimaryMemoryPhotoUrl(value);
      }
    }

    const content = searchableLines.join('\n');

    const memory = await createMemory({
      userId,
      title,
      type,
      content,
      source: 'manual_entry',
      sourceImage: sourceImage || undefined,
      structuredData: {
        template_id: type,
        category_id: type,
        theme: memoryTypeName || type,
        memory_type_id: memoryTypeId || null,
        memory_type_name: memoryTypeName || null,
        section_id: sectionId || null,
        section_description: description || null,
        template_fields: templateFields,
      },
    });

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur creation memoire manuelle';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
