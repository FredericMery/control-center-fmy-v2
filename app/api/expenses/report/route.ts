import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const end = `${new Date(year, month, 0).toISOString().slice(0, 10)}T23:59:59.999Z`;
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const now = new Date();
    const month = Number(request.nextUrl.searchParams.get('month') || now.getMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get('year') || now.getFullYear());

    const { start, end } = getMonthRange(year, month);

    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('id, invoice_date, category, amount_ht, amount_tva, amount_ttc, payment_method, vendor, status, created_at, description')
      .eq('user_id', userId)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (expensesError) {
      return NextResponse.json({ error: 'Erreur chargement report depenses' }, { status: 500 });
    }

    const totals = (expenses || []).reduce(
      (acc, expense) => {
        acc.totalHt += Number(expense.amount_ht || 0);
        acc.totalTax += Number(expense.amount_tva || 0);
        acc.totalTtc += Number(expense.amount_ttc || 0);
        return acc;
      },
      { totalHt: 0, totalTax: 0, totalTtc: 0 }
    );

    const rows = (expenses || []).map((expense) => {
      const description = String(expense.description || '');
      const emailSent = /EMAIL_SENT=true/i.test(description);
      const recipientNameMatch = description.match(/Destinataire nom=([^|]+)/i);
      const recipientDestinationMatch = description.match(/Destinataire=([^|]+)/i);
      return {
        ...expense,
        email_sent: emailSent,
        recipient_name: recipientNameMatch?.[1]?.trim() || null,
        recipient_destination: recipientDestinationMatch?.[1]?.trim() || null,
      };
    });

    const { data: reportRow } = await supabase
      .from('ndf_reports')
      .select('id, total_ht, total_tva, total_ttc, status')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    return NextResponse.json({
      month,
      year,
      rows,
      totals: {
        totalHt: Number(reportRow?.total_ht ?? totals.totalHt),
        totalTax: Number(reportRow?.total_tva ?? totals.totalTax),
        totalTtc: Number(reportRow?.total_ttc ?? totals.totalTtc),
        status: reportRow?.status || 'draft',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
