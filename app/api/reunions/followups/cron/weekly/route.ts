import { NextRequest, NextResponse } from 'next/server';
import { runReunionFollowupCron } from '@/lib/reunion/runFollowupCron';

export async function GET(request: NextRequest) {
  try {
    return await runReunionFollowupCron(request, 'weekly');
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
