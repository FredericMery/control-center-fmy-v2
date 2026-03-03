import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * POST /api/memory/init-templates
 * Initialize predefined memory templates for a user
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Check if already initialized
    const { data: existing } = await supabase
      .from('memory_sections')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ message: 'Templates already initialized' });
    }

    // Create sections for each template
    const sections = Object.values(MEMORY_TEMPLATES).map((template) => ({
      user_id: userId,
      template_id: template.id,
      section_name: template.name,
      description: template.description,
      is_custom: false,
    }));

    const { data: createdSections, error: sectionsError } = await supabase
      .from('memory_sections')
      .insert(sections)
      .select();

    if (sectionsError) throw sectionsError;

    // Create fields for each section
    if (createdSections) {
      for (const section of createdSections) {
        const template = MEMORY_TEMPLATES[section.template_id];
        if (!template) continue;

        const fields = template.fields.map((field, index) => ({
          section_id: section.id,
          field_label: field.label,
          field_type: field.field_type,
          field_order: index,
          is_required: field.is_required || false,
          is_searchable: field.is_searchable || false,
          options: field.options || null,
        }));

        const { error: fieldsError } = await supabase
          .from('memory_fields')
          .insert(fields);

        if (fieldsError) throw fieldsError;
      }
    }

    return NextResponse.json({
      message: 'Templates initialized successfully',
      sections: createdSections,
    });
  } catch (error) {
    console.error('Error initializing templates:', error);
    return NextResponse.json(
      { error: 'Failed to initialize templates' },
      { status: 500 }
    );
  }
}
