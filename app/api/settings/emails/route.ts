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
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // Récupérer les email_settings de l'utilisateur
    const { data, error } = await supabase
      .from('email_settings')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json(
        { error: 'Erreur récupération paramètres' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: data || [],
    });
  } catch (error) {
    console.error('Erreur API:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { type, email } = await request.json();

    if (!type || !email) {
      return NextResponse.json(
        { error: 'Type et email requis' },
        { status: 400 }
      );
    }

    // Valider le type
    if (!['facture', 'ndf'].includes(type)) {
      return NextResponse.json(
        { error: 'Type invalide (facture ou ndf)' },
        { status: 400 }
      );
    }

    // Vérifier si le setting existe déjà
    const { data: existing } = await supabase
      .from('email_settings')
      .select('id')
      .eq('user_id', userId)
      .eq('type', type)
      .single();

    let result;
    if (existing) {
      // Mettre à jour
      result = await supabase
        .from('email_settings')
        .update({ email })
        .eq('user_id', userId)
        .eq('type', type)
        .select()
        .single();
    } else {
      // Créer
      result = await supabase
        .from('email_settings')
        .insert({
          user_id: userId,
          type,
          email,
        })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json(
        { error: 'Erreur sauvegarde' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      setting: result.data,
      message: `Email ${type} mis à jour`,
    });
  } catch (error) {
    console.error('Erreur API:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
