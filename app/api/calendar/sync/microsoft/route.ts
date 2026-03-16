import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncMicrosoftCalendar } from '@/lib/calendar/connectors/microsoft';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCronAuthorized(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader === '1') return true;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return Boolean(process.env.CALENDAR_SYNC_CRON_SECRET && token === process.env.CALENDAR_SYNC_CRON_SECRET);
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = Number(new URL(request.url).searchParams.get('limit') || '100');
    const batchLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100;

    const { data: sources, error: sourceError } = await supabase
      .from('calendar_sources')
      .select('id, user_id')
      .eq('provider', 'microsoft')
      .eq('is_enabled', true)
      .not('refresh_token', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(batchLimit);

    if (sourceError) throw new Error(sourceError.message);

    const report = {
      total: Number(sources?.length || 0),
      success: 0,
      failed: 0,
      details: [] as Array<{ sourceId: string; userId: string; status: 'success' | 'failed'; message?: string }>,
    };

    for (const source of sources || []) {
      try {
        await syncMicrosoftCalendar({ userId: source.user_id, sourceId: source.id });
        report.success += 1;
        report.details.push({ sourceId: source.id, userId: source.user_id, status: 'success' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        report.failed += 1;
        report.details.push({ sourceId: source.id, userId: source.user_id, status: 'failed', message });
      }
    }

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
