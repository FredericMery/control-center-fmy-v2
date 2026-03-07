import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { requireValidationCode } from '@/lib/ai/client';
import { searchMemoriesByQuery } from '@/lib/memory/memoryService';

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

/**
 * POST /api/memory/search
 * AI vector search over the new memories table.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const query = String(body?.query || '').trim();
    const limit = Number(body?.limit || 10);
    const validationCode = body?.validationCode as string | undefined;

    if (!query) {
      return NextResponse.json({ error: 'query est requis' }, { status: 400 });
    }

    requireValidationCode(validationCode);

    const results = await searchMemoriesByQuery({
      userId,
      query,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 30) : 10,
    });

    return NextResponse.json({
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error in AI memory search:', error);
    const message = error instanceof Error ? error.message : 'Failed to search memory';
    const status = message.includes('validation') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
