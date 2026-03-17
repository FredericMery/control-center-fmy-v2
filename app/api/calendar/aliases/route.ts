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

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('user_email_aliases')
      .select('id, email_alias, is_active, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ aliases: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    // Vérifier s'il existe déjà
    const { data: existing, error: checkErr } = await supabase
      .from('user_email_aliases')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('email_alias', email)
      .maybeSingle();

    if (checkErr) throw new Error(checkErr.message);

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json({ error: 'Cet email est déjà enregistré' }, { status: 409 });
      }
      // Réactiver un ancien alias
      const { data, error: upErr } = await supabase
        .from('user_email_aliases')
        .update({ is_active: true })
        .eq('id', existing.id)
        .select('id, email_alias, is_active, created_at')
        .single();

      if (upErr) throw new Error(upErr.message);
      return NextResponse.json({ alias: data });
    }

    // Créer un nouveau
    const { data, error: insErr } = await supabase
      .from('user_email_aliases')
      .insert({
        user_id: userId,
        email_alias: email,
        is_active: true,
      })
      .select('id, email_alias, is_active, created_at')
      .single();

    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ alias: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const aliasId = searchParams.get('id');

    if (!aliasId) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    // Soft delete (is_active = false)
    const { error } = await supabase
      .from('user_email_aliases')
      .update({ is_active: false })
      .eq('id', aliasId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
