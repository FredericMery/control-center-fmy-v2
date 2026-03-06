import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Récupère les stats du mois courant pour un utilisateur
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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthStartStr = monthStart.toISOString().split('T')[0];
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    // Récupérer les stats API calls du mois
    const { data: apiCalls, error: apiError } = await supabase
      .from('api_calls')
      .select('api_type, count')
      .eq('user_id', userId)
      .gte('date', monthStartStr)
      .lte('date', monthEndStr);

    if (apiError) {
      console.error('Erreur récupération stats API:', apiError);
      return NextResponse.json(
        { error: 'Erreur récupération stats' },
        { status: 500 }
      );
    }

    // Agrégrer par api_type
    const stats = (apiCalls || []).reduce(
      (acc, row) => {
        acc[row.api_type] = (acc[row.api_type] || 0) + row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      month: now.toISOString().split('T')[0],
      stats: {
        google_vision: stats.google_vision || 0,
        resend: stats.resend || 0,
        other: stats.other || 0,
      },
    });
  } catch (error) {
    console.error('Erreur endpoint monthly-stats:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
