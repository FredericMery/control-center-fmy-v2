import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 GET /api/settings/emails - Récupération paramètres...');
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('❌ Non authentifié');
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('✅ User authentifié:', userId);

    // Récupérer les email_settings de l'utilisateur
    const { data, error } = await supabase
      .from('email_settings')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return NextResponse.json(
        { error: 'Erreur récupération paramètres' },
        { status: 500 }
      );
    }

    console.log('✅ Paramètres récupérés:', data?.length || 0);
    return NextResponse.json({
      success: true,
      settings: data || [],
    });
  } catch (error: any) {
    console.error('❌ Erreur API GET:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('🔍 PUT /api/settings/emails - Sauvegarde paramètres...');
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('❌ Non authentifié');
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('✅ User authentifié:', userId);

    const { type, email } = await request.json();
    console.log('📧 Données reçues:', { type, email });

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

    console.log('🔍 Setting existant?', existing ? 'Oui' : 'Non');

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
      console.error('❌ Erreur Supabase:', result.error);
      return NextResponse.json(
        { error: 'Erreur sauvegarde' },
        { status: 500 }
      );
    }

    console.log('✅ Setting sauvegardé avec succès');
    return NextResponse.json({
      success: true,
      setting: result.data,
      message: `Email ${type} mis à jour`,
    });
  } catch (error: any) {
    console.error('❌ Erreur API PUT:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
