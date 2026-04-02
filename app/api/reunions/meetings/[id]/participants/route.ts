import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
    role?: 'organizer' | 'participant' | 'decision_maker';
    source?: 'manual' | 'qr' | 'ai';
  };

  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('mod_reunion_participants')
    .insert({
      user_id: userId,
      meeting_id: id,
      name,
      email: String(body.email || '').trim() || null,
      phone: String(body.phone || '').trim() || null,
      role: body.role || 'participant',
      source: body.source || 'manual',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ participant: data });
}
