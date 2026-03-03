import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Check user
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError) {
      return NextResponse.json({ error: 'User check failed', details: userError }, { status: 401 });
    }

    // Try to insert a test section
    const testSection = {
      user_id: user.user?.id,
      template_id: 'wines',
      section_name: 'Test Section',
      description: 'Test',
    };

    const { data: sectionData, error: sectionError } = await supabase
      .from('memory_sections')
      .insert([testSection])
      .select()
      .single();

    if (sectionError) {
      return NextResponse.json({
        error: 'Failed to create section',
        details: sectionError,
        section: testSection,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: user.user?.id,
      section: sectionData,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
