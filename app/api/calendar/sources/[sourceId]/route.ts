import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sourceId } = await params;

    const { data: source, error: sourceError } = await supabase
      .from('calendar_sources')
      .select('id, provider')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (sourceError) throw new Error(sourceError.message);
    if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

    const { error: updateError } = await supabase
      .from('calendar_sources')
      .update({
        is_enabled: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        last_sync_status: 'disconnected',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .eq('user_id', userId);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, provider: source.provider });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
