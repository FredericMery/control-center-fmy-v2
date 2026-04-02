import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function tokenHash(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = getSupabaseAdminClient();

  const { data: meeting, error } = await supabase
    .from('mod_reunion_meetings')
    .select('id,title,objective,description,meeting_date,status')
    .eq('public_join_token_hash', tokenHash(token))
    .or(`public_join_token_expires_at.is.null,public_join_token_expires_at.gte.${new Date().toISOString()}`)
    .maybeSingle();

  if (error || !meeting) {
    return NextResponse.json({ error: 'Lien de participation invalide ou expire' }, { status: 404 });
  }

  return NextResponse.json({ meeting });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
  };

  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

  const supabase = getSupabaseAdminClient();

  const { data: meeting } = await supabase
    .from('mod_reunion_meetings')
    .select('id,user_id')
    .eq('public_join_token_hash', tokenHash(token))
    .or(`public_join_token_expires_at.is.null,public_join_token_expires_at.gte.${new Date().toISOString()}`)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Lien de participation invalide ou expire' }, { status: 404 });
  }

  const { data: participant, error: insertError } = await supabase
    .from('mod_reunion_participants')
    .insert({
      user_id: meeting.user_id,
      meeting_id: meeting.id,
      name,
      email: String(body.email || '').trim() || null,
      phone: String(body.phone || '').trim() || null,
      role: 'participant',
      source: 'qr',
    })
    .select('id,name,email,phone,created_at')
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ participant });
}
