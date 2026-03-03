import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * GET /api/memory/search?sectionId=...&query=...
 * Search memory items and generate Google search links
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sectionId = searchParams.get('sectionId');
    const query = searchParams.get('query');

    if (!sectionId || !query) {
      return NextResponse.json(
        { error: 'sectionId and query required' },
        { status: 400 }
      );
    }

    // Get section details
    const { data: section } = await supabase
      .from('memory_sections')
      .select('id, template_id, section_name')
      .eq('id', sectionId)
      .single();

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Search items and their values
    const { data: items } = await supabase
      .from('memory_items')
      .select('id, item_title')
      .eq('section_id', sectionId)
      .ilike('item_title', `%${query}%`);

    // Get searchable fields for Google queries
    const { data: fields } = await supabase
      .from('memory_fields')
      .select('id, field_label, is_searchable')
      .eq('section_id', sectionId)
      .eq('is_searchable', true);

    const results = (items || []).map((item) => {
      let googleQuery = query;

      // If searchable fields exist, try to build better query
      if (fields && fields.length > 0) {
        googleQuery = `${item.item_title} ${query}`;
      }

      return {
        id: item.id,
        title: item.item_title,
        googleSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`,
      };
    });

    return NextResponse.json({
      section,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching memory:', error);
    return NextResponse.json(
      { error: 'Failed to search memory' },
      { status: 500 }
    );
  }
}
