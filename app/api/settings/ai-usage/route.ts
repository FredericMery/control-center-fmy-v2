import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function getMonthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();

    const [{ data: allLogs, error: allError }, { data: monthLogs, error: monthError }] =
      await Promise.all([
        supabase
          .from('ai_usage_logs')
          .select('provider, service, tokens_used, cost_estimate, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('ai_usage_logs')
          .select('tokens_used, cost_estimate')
          .eq('user_id', userId)
          .gte('created_at', getMonthStartIso())
          .limit(1000),
      ]);

    if (allError || monthError) {
      return NextResponse.json(
        { error: allError?.message || monthError?.message || 'Erreur stats IA' },
        { status: 500 }
      );
    }

    const totalTokens = (allLogs || []).reduce((acc, row) => acc + (row.tokens_used || 0), 0);
    const totalCost = (allLogs || []).reduce(
      (acc, row) => acc + Number(row.cost_estimate || 0),
      0
    );
    const monthlyTokens = (monthLogs || []).reduce((acc, row) => acc + (row.tokens_used || 0), 0);
    const monthlyCost = (monthLogs || []).reduce(
      (acc, row) => acc + Number(row.cost_estimate || 0),
      0
    );

    return NextResponse.json({
      totals: {
        tokens: totalTokens,
        costEstimate: Number(totalCost.toFixed(6)),
      },
      thisMonth: {
        tokens: monthlyTokens,
        costEstimate: Number(monthlyCost.toFixed(6)),
      },
      logs: allLogs || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
