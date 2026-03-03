import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * DELETE /api/memory/bulk
 * Bulk delete operations (items, sections)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { type, ids } = await request.json();

    if (!type || !ids || ids.length === 0) {
      return NextResponse.json(
        { error: 'type and ids array required' },
        { status: 400 }
      );
    }

    if (type === 'items') {
      // Delete items (cascade will handle values)
      const { error } = await supabase
        .from('memory_items')
        .delete()
        .in('id', ids);

      if (error) throw error;

      return NextResponse.json({
        message: `Deleted ${ids.length} items`,
        count: ids.length,
      });
    } else if (type === 'sections') {
      // Delete sections (cascade will handle fields and items)
      const { error } = await supabase
        .from('memory_sections')
        .delete()
        .in('id', ids);

      if (error) throw error;

      return NextResponse.json({
        message: `Deleted ${ids.length} sections`,
        count: ids.length,
      });
    }

    return NextResponse.json(
      { error: 'Invalid bulk delete type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in bulk delete:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk delete' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/bulk
 * Bulk update operations
 */
export async function POST(request: NextRequest) {
  try {
    const { type, updates } = await request.json();

    if (!type || !updates) {
      return NextResponse.json(
        { error: 'type and updates required' },
        { status: 400 }
      );
    }

    if (type === 'values') {
      // Bulk update item values
      const results = await Promise.all(
        updates.map((update: any) =>
          supabase
            .from('memory_item_values')
            .update({ field_value: update.value })
            .eq('id', update.id)
        )
      );

      return NextResponse.json({
        message: `Updated ${updates.length} values`,
        count: updates.length,
      });
    }

    return NextResponse.json(
      { error: 'Invalid bulk update type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in bulk update:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk update' },
      { status: 500 }
    );
  }
}
