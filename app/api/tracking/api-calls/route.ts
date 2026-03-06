import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Enregistre un appel API utilisateur
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const { api_type } = await request.json();

    if (!api_type || !['google_vision', 'resend', 'other'].includes(api_type)) {
      return NextResponse.json(
        { error: 'api_type invalide' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Récupérer l'enregistrement d'aujourd'hui ou le créer
    const { data: existing } = await supabase
      .from('api_calls')
      .select('id, count')
      .eq('user_id', userId)
      .eq('api_type', api_type)
      .eq('date', today)
      .single();

    let result;
    if (existing) {
      // Incrémenter le compteur
      result = await supabase
        .from('api_calls')
        .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Créer un nouvel enregistrement
      result = await supabase
        .from('api_calls')
        .insert({
          user_id: userId,
          api_type,
          date: today,
          count: 1,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Erreur enregistrement API call:', result.error);
      return NextResponse.json(
        { error: 'Erreur enregistrement' },
        { status: 500 }
      );
    }

    console.log(`✅ API call recorded: ${api_type} (count: ${result.data.count})`);

    return NextResponse.json({
      success: true,
      call: result.data,
    });
  } catch (error: any) {
    console.error('Erreur API calls:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * Récupère les stats des appels API
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];

    // Stats d'aujourd'hui
    const { data: todayStats } = await supabase
      .from('api_calls')
      .select('api_type, count')
      .eq('user_id', userId)
      .eq('date', today);

    // Stats du mois
    const { data: monthStats } = await supabase
      .from('api_calls')
      .select('api_type, count')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', today);

    // Sommer par type
    const todayByType = todayStats?.reduce((acc: any, stat) => {
      acc[stat.api_type] = (acc[stat.api_type] || 0) + stat.count;
      return acc;
    }, {}) || {};

    const monthByType = monthStats?.reduce((acc: any, stat) => {
      acc[stat.api_type] = (acc[stat.api_type] || 0) + stat.count;
      return acc;
    }, {}) || {};

    return NextResponse.json({
      success: true,
      today: todayByType,
      month: monthByType,
      totals: {
        today: Object.values(todayByType).reduce((a: any, b: any) => a + b, 0),
        month: Object.values(monthByType).reduce((a: any, b: any) => a + b, 0),
      },
    });
  } catch (error: any) {
    console.error('Erreur récupération stats:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
