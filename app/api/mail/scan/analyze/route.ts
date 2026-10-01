import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { analyzeMailText } from '@/lib/mail/analyzeMailText';

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const fullText = String(body.full_text || '').trim();
  if (!fullText) {
    return NextResponse.json({ ai_analysis: null });
  }

  try {
    return NextResponse.json({ ai_analysis: await analyzeMailText(userId, fullText) });
  } catch (error) {
    console.error('POST /api/mail/scan/analyze error:', error);
    return NextResponse.json({ ai_analysis: null });
  }
}
