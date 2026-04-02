import { NextRequest, NextResponse } from 'next/server';
import { runReunionFollowupCron } from '@/lib/reunion/runFollowupCron';

export async function GET(request: NextRequest) {
  try {
    const typeParam = String(request.nextUrl.searchParams.get('type') || 'daily');
    const type = typeParam === 'weekly' ? 'weekly' : 'daily';
    return await runReunionFollowupCron(request, type);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
