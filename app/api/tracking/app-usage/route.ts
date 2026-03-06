import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Enregistre un événement d'usage de l'app
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

    const { event_type, metadata } = await request.json();

    const validEvents = [
      'scan_invoice',
      'upload_expense',
      'generate_ndf',
      'export_csv',
      'view_dashboard',
      'view_expenses',
      'create_ndf',
      'other',
    ];

    if (!event_type || !validEvents.includes(event_type)) {
      return NextResponse.json(
        { error: 'event_type invalide' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Récupérer l'enregistrement d'aujourd'hui ou le créer
    const { data: existing } = await supabase
      .from('app_usage')
      .select('id, count')
      .eq('user_id', userId)
      .eq('event_type', event_type)
      .eq('date', today)
      .single();

    let result;
    if (existing) {
      // Incrémenter le compteur
      result = await supabase
        .from('app_usage')
        .update({ 
          count: existing.count + 1, 
          metadata: metadata || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Créer un nouvel enregistrement
      result = await supabase
        .from('app_usage')
        .insert({
          user_id: userId,
          event_type,
          date: today,
          count: 1,
          metadata: metadata || null,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Erreur enregistrement usage:', result.error);
      return NextResponse.json(
        { error: 'Erreur enregistrement' },
        { status: 500 }
      );
    }

    console.log(`✅ Usage logged: ${event_type} (count: ${result.data.count})`);

    return NextResponse.json({
      success: true,
      usage: result.data,
    });
  } catch (error: any) {
    console.error('Erreur app usage:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * Récupère les stats d'usage de l'app
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

    // Stats d'aujourd'hui par événement
    const { data: todayStats } = await supabase
      .from('app_usage')
      .select('event_type, count')
      .eq('user_id', userId)
      .eq('date', today);

    // Résumé par type
    const summary = todayStats?.reduce((acc: any, stat) => {
      acc[stat.event_type] = stat.count;
      return acc;
    }, {}) || {};

    // Total d'aujourd'hui
    const total = todayStats?.reduce((sum, stat) => sum + stat.count, 0) || 0;

    return NextResponse.json({
      success: true,
      today: {
        summary,
        total,
      },
      date: today,
    });
  } catch (error: any) {
    console.error('Erreur récupération usage stats:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
