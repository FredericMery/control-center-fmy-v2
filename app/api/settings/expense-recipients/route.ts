import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('expense_recipients')
      .select('id, name, destination, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Erreur chargement destinataires depenses' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, recipients: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: string;
      destination?: string;
    };

    const name = String(body.name || '').trim();
    const destination = String(body.destination || '').trim();

    if (!name || !destination) {
      return NextResponse.json(
        { error: 'Nom destinataire et destinataire requis' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('expense_recipients')
      .insert({
        user_id: userId,
        name: name.slice(0, 120),
        destination: destination.slice(0, 180),
      })
      .select('id, name, destination, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Erreur creation destinataire depense' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      recipient: data,
      message: 'Destinataire depense cree',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const recipientId = String(request.nextUrl.searchParams.get('id') || '').trim();
    if (!recipientId) {
      return NextResponse.json({ error: 'ID destinataire requis' }, { status: 400 });
    }

    const { error } = await supabase
      .from('expense_recipients')
      .delete()
      .eq('id', recipientId)
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json(
        { error: 'Erreur suppression destinataire depense' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Destinataire supprime' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
