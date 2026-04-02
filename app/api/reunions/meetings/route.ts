import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createMeetingFromPrompt } from '@/lib/reunion/service';

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const supabase = getSupabaseAdminClient();
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || '30'), 1), 200);

  const { data, error } = await supabase
    .from('mod_reunion_meetings')
    .select('id,title,objective,description,meeting_date,status,ai_generated,public_join_path,created_at')
    .eq('user_id', userId)
    .order('meeting_date', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data || [] });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    meetingDate?: string;
    title?: string;
    objective?: string;
    description?: string;
  };

  const supabase = getSupabaseAdminClient();

  const authUser = await supabase.auth.admin.getUserById(userId);
  const createdBy = authUser.data.user?.email || userId;

  const prompt = String(body.prompt || '').trim();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin).replace(/\/$/, '');

  if (prompt) {
    try {
      const created = await createMeetingFromPrompt({
        userId,
        prompt,
        createdBy,
        baseUrl,
      });

      return NextResponse.json({
        meeting: created.meeting,
        ai: created.parsed,
        joinUrl: created.joinUrl,
        joinPath: created.joinPath,
        qrUrl: created.joinQrUrl,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Erreur creation AI' },
        { status: 500 }
      );
    }
  }

  const title = String(body.title || '').trim();
  const meetingDate = String(body.meetingDate || '').trim();
  if (!title || !meetingDate) {
    return NextResponse.json({ error: 'title et meetingDate sont requis' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('mod_reunion_meetings')
    .insert({
      user_id: userId,
      title,
      objective: String(body.objective || '').trim(),
      description: String(body.description || '').trim(),
      created_by: createdBy,
      meeting_date: meetingDate,
      status: 'planned',
      ai_generated: false,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting: data });
}
