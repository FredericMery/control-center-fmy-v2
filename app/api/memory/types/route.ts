import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';

type TypeFieldPayload = {
  label?: string;
  type?: string;
  options?: string[] | null;
  required?: boolean;
  searchable?: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeFields(input: unknown): TypeFieldPayload[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((field) => {
      const raw = field as TypeFieldPayload;
      const label = String(raw.label || '').trim();
      const type = String(raw.type || 'text').trim().toLowerCase();
      const options = Array.isArray(raw.options)
        ? raw.options.map((o) => String(o || '').trim()).filter(Boolean)
        : null;

      if (!label) return null;
      return {
        label,
        type: type || 'text',
        options,
        required: Boolean(raw.required),
        searchable: Boolean(raw.searchable),
      } as Required<TypeFieldPayload>;
    })
    .filter((entry): entry is Required<TypeFieldPayload> => Boolean(entry));
}

async function listAvailableTypes(userId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: sections, error: sectionsError } = await supabase
    .from('memory_sections')
    .select('id, user_id, template_id, section_name, description, is_custom, is_community, created_at')
    .or(`user_id.eq.${userId},is_community.eq.true`)
    .order('created_at', { ascending: true });

  if (sectionsError) {
    throw sectionsError;
  }

  const sectionIds = (sections || []).map((section) => section.id);
  const { data: fields, error: fieldsError } = await supabase
    .from('memory_fields')
    .select('id, section_id, field_label, field_type, field_order, is_required, is_searchable, options')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('field_order', { ascending: true });

  if (fieldsError) {
    throw fieldsError;
  }

  const fieldsBySection = new Map<string, any[]>();
  for (const field of fields || []) {
    const list = fieldsBySection.get(field.section_id) || [];
    list.push(field);
    fieldsBySection.set(field.section_id, list);
  }

  const templateEntries = Object.values(MEMORY_TEMPLATES).map((template) => {
    const existing = (sections || []).find((section) => section.template_id === template.id && section.user_id === userId);
    return {
      id: existing?.id || `template:${template.id}`,
      sectionId: existing?.id || null,
      ownerUserId: existing?.user_id || null,
      templateId: template.id,
      name: template.name,
      description: template.description,
      isCommunity: false,
      source: 'template',
      fields: existing
        ? (fieldsBySection.get(existing.id) || []).map((field) => ({
            id: field.id,
            label: field.field_label,
            type: field.field_type,
            order: field.field_order,
            required: field.is_required,
            searchable: field.is_searchable,
            options: field.options || null,
          }))
        : template.fields.map((field, index) => ({
            id: `template-field:${template.id}:${index}`,
            label: field.label,
            type: field.field_type,
            order: index,
            required: Boolean(field.is_required),
            searchable: Boolean(field.is_searchable),
            options: field.options || null,
          })),
    };
  });

  const customEntries = (sections || [])
    .filter((section) => !section.template_id || !MEMORY_TEMPLATES[section.template_id])
    .map((section) => ({
      id: section.id,
      sectionId: section.id,
      ownerUserId: section.user_id,
      templateId: section.template_id || 'other',
      name: section.section_name,
      description: section.description || '',
      isCommunity: Boolean(section.is_community),
      source: section.is_community ? 'community' : 'private',
      fields: (fieldsBySection.get(section.id) || []).map((field) => ({
        id: field.id,
        label: field.field_label,
        type: field.field_type,
        order: field.field_order,
        required: field.is_required,
        searchable: field.is_searchable,
        options: field.options || null,
      })),
    }));

  return [...templateEntries, ...customEntries];
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const types = await listAvailableTypes(userId);
    return NextResponse.json({ types });
  } catch (error) {
    console.error('GET /api/memory/types error', error);
    return NextResponse.json({ error: 'Unable to load memory types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const supabase = getSupabaseAdminClient();

    if (action === 'create') {
      const name = String(body.name || '').trim();
      const description = String(body.description || '').trim();
      const isCommunity = Boolean(body.isCommunity);
      const templateId = String(body.templateId || 'other').trim() || 'other';
      const fields = sanitizeFields(body.fields);

      if (!name) {
        return NextResponse.json({ error: 'Type name required' }, { status: 400 });
      }

      if (fields.length === 0) {
        return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
      }

      const slug = `${slugify(name) || 'memory-type'}-${Date.now().toString(36)}`;

      const { data: section, error: sectionError } = await supabase
        .from('memory_sections')
        .insert([
          {
            user_id: userId,
            template_id: templateId,
            section_name: name,
            description: description || null,
            is_custom: true,
            is_community: isCommunity,
            slug,
          },
        ])
        .select('id, user_id, template_id, section_name, description, is_community')
        .single();

      if (sectionError || !section) {
        throw sectionError || new Error('Failed to create section');
      }

      const fieldsToInsert = fields.map((field, index) => ({
        section_id: section.id,
        field_label: field.label,
        field_type: field.type,
        field_order: index,
        is_required: Boolean(field.required),
        is_searchable: Boolean(field.searchable),
        options: field.options || null,
      }));

      const { data: insertedFields, error: fieldsError } = await supabase
        .from('memory_fields')
        .insert(fieldsToInsert)
        .select('id, section_id, field_label, field_type, field_order, is_required, is_searchable, options')
        .order('field_order', { ascending: true });

      if (fieldsError) {
        throw fieldsError;
      }

      return NextResponse.json({
        type: {
          id: section.id,
          sectionId: section.id,
          ownerUserId: section.user_id,
          templateId: section.template_id || 'other',
          name: section.section_name,
          description: section.description || '',
          isCommunity: Boolean(section.is_community),
          source: section.is_community ? 'community' : 'private',
          fields: (insertedFields || []).map((field) => ({
            id: field.id,
            label: field.field_label,
            type: field.field_type,
            order: field.field_order,
            required: field.is_required,
            searchable: field.is_searchable,
            options: field.options || null,
          })),
        },
      });
    }

    if (action === 'ensure') {
      const selectedId = String(body.sectionId || body.typeId || '').trim();
      if (!selectedId) {
        return NextResponse.json({ error: 'sectionId required' }, { status: 400 });
      }

      if (selectedId.startsWith('template:')) {
        const templateId = selectedId.replace('template:', '').trim();
        const template = MEMORY_TEMPLATES[templateId];
        if (!template) {
          return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
        }

        const { data: existing } = await supabase
          .from('memory_sections')
          .select('id')
          .eq('user_id', userId)
          .eq('template_id', templateId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          const { data: existingFields } = await supabase
            .from('memory_fields')
            .select('id, field_label, field_type, field_order, is_required, is_searchable, options')
            .eq('section_id', existing.id)
            .order('field_order', { ascending: true });

          return NextResponse.json({
            sectionId: existing.id,
            fields: (existingFields || []).map((field) => ({
              id: field.id,
              label: field.field_label,
              type: field.field_type,
              order: field.field_order,
              required: field.is_required,
              searchable: field.is_searchable,
              options: field.options || null,
            })),
            cloned: false,
          });
        }

        const slug = `${slugify(template.name) || 'template'}-${Date.now().toString(36)}`;
        const { data: createdSection, error: createSectionError } = await supabase
          .from('memory_sections')
          .insert([
            {
              user_id: userId,
              template_id: template.id,
              section_name: template.name,
              description: template.description,
              is_custom: false,
              is_community: false,
              slug,
            },
          ])
          .select('id')
          .single();

        if (createSectionError || !createdSection) {
          throw createSectionError || new Error('Cannot create template section');
        }

        const { data: insertedFields, error: insertedFieldsError } = await supabase
          .from('memory_fields')
          .insert(
            template.fields.map((field, index) => ({
              section_id: createdSection.id,
              field_label: field.label,
              field_type: field.field_type,
              field_order: index,
              is_required: Boolean(field.is_required),
              is_searchable: Boolean(field.is_searchable),
              options: field.options || null,
            }))
          )
          .select('id, field_label, field_type, field_order, is_required, is_searchable, options')
          .order('field_order', { ascending: true });

        if (insertedFieldsError) {
          throw insertedFieldsError;
        }

        return NextResponse.json({
          sectionId: createdSection.id,
          fields: (insertedFields || []).map((field) => ({
            id: field.id,
            label: field.field_label,
            type: field.field_type,
            order: field.field_order,
            required: field.is_required,
            searchable: field.is_searchable,
            options: field.options || null,
          })),
          cloned: true,
        });
      }

      const { data: sourceSection, error: sourceError } = await supabase
        .from('memory_sections')
        .select('id, user_id, template_id, section_name, description')
        .eq('id', selectedId)
        .single();

      if (sourceError || !sourceSection) {
        return NextResponse.json({ error: 'Unknown section' }, { status: 404 });
      }

      if (sourceSection.user_id === userId) {
        const { data: ownFields } = await supabase
          .from('memory_fields')
          .select('id, field_label, field_type, field_order, is_required, is_searchable, options')
          .eq('section_id', sourceSection.id)
          .order('field_order', { ascending: true });

        return NextResponse.json({
          sectionId: sourceSection.id,
          fields: (ownFields || []).map((field) => ({
            id: field.id,
            label: field.field_label,
            type: field.field_type,
            order: field.field_order,
            required: field.is_required,
            searchable: field.is_searchable,
            options: field.options || null,
          })),
          cloned: false,
        });
      }

      const { data: alreadyCloned } = await supabase
        .from('memory_sections')
        .select('id')
        .eq('user_id', userId)
        .eq('section_name', sourceSection.section_name)
        .eq('template_id', sourceSection.template_id || 'other')
        .limit(1)
        .maybeSingle();

      if (alreadyCloned?.id) {
        const { data: clonedFields } = await supabase
          .from('memory_fields')
          .select('id, field_label, field_type, field_order, is_required, is_searchable, options')
          .eq('section_id', alreadyCloned.id)
          .order('field_order', { ascending: true });

        return NextResponse.json({
          sectionId: alreadyCloned.id,
          fields: (clonedFields || []).map((field) => ({
            id: field.id,
            label: field.field_label,
            type: field.field_type,
            order: field.field_order,
            required: field.is_required,
            searchable: field.is_searchable,
            options: field.options || null,
          })),
          cloned: false,
        });
      }

      const slug = `${slugify(sourceSection.section_name) || 'memory-type'}-${Date.now().toString(36)}`;
      const { data: clonedSection, error: clonedSectionError } = await supabase
        .from('memory_sections')
        .insert([
          {
            user_id: userId,
            template_id: sourceSection.template_id || 'other',
            section_name: sourceSection.section_name,
            description: sourceSection.description || null,
            is_custom: true,
            is_community: false,
            slug,
          },
        ])
        .select('id')
        .single();

      if (clonedSectionError || !clonedSection) {
        throw clonedSectionError || new Error('Cannot clone section');
      }

      const { data: sourceFields, error: sourceFieldsError } = await supabase
        .from('memory_fields')
        .select('field_label, field_type, field_order, is_required, is_searchable, options')
        .eq('section_id', sourceSection.id)
        .order('field_order', { ascending: true });

      if (sourceFieldsError) {
        throw sourceFieldsError;
      }

      const { data: clonedFields, error: clonedFieldsError } = await supabase
        .from('memory_fields')
        .insert(
          (sourceFields || []).map((field) => ({
            section_id: clonedSection.id,
            field_label: field.field_label,
            field_type: field.field_type,
            field_order: field.field_order,
            is_required: field.is_required,
            is_searchable: field.is_searchable,
            options: field.options || null,
          }))
        )
        .select('id, field_label, field_type, field_order, is_required, is_searchable, options')
        .order('field_order', { ascending: true });

      if (clonedFieldsError) {
        throw clonedFieldsError;
      }

      return NextResponse.json({
        sectionId: clonedSection.id,
        fields: (clonedFields || []).map((field) => ({
          id: field.id,
          label: field.field_label,
          type: field.field_type,
          order: field.field_order,
          required: field.is_required,
          searchable: field.is_searchable,
          options: field.options || null,
        })),
        cloned: true,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/memory/types error', error);
    return NextResponse.json({ error: 'Unable to handle memory type action' }, { status: 500 });
  }
}
