import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncBlackwavesCalendar } from '@/lib/calendar/connectors/blackwaves';
import { syncMicrosoftCalendar } from '@/lib/calendar/connectors/microsoft';

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sourceId } = await params;

    const { data: source, error } = await supabase
      .from('calendar_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

    let synced = 0;

    if (source.provider === 'blackwaves') {
      const result = await syncBlackwavesCalendar(userId);
      synced = Number(result.created || 0) + Number(result.updated || 0);
    } else if (source.provider === 'microsoft') {
      const result = await syncMicrosoftCalendar({ userId, sourceId });
      synced = Number(result.created || 0) + Number(result.updated || 0);
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${source.provider}` }, { status: 400 });
    }

    await supabase
      .from('calendar_sources')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', sourceId)
      .eq('user_id', userId);

    return NextResponse.json({ ok: true, synced });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
