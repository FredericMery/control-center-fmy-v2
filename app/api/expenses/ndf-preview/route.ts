import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as {
      month?: number;
      year?: number;
      email?: string;
    };

    const now = new Date();
    const month = Number(body.month || now.getMonth() + 1);
    const year = Number(body.year || now.getFullYear());
    const providedEmail = String(body.email || '').trim();

    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(year) || year < 2000) {
      return NextResponse.json({ error: 'Mois/annee invalides' }, { status: 400 });
    }

    const { start, end } = getMonthRange(year, month);

    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('id, invoice_number, invoice_date, vendor, amount_ht, amount_tva, amount_ttc, category, photo_url, status, created_at')
      .eq('user_id', userId)
      .eq('payment_method', 'cb_perso')
      .gte('created_at', start)
      .lte('created_at', end)
      .in('status', ['pending_ndf', 'pending'])
      .order('created_at', { ascending: true });

    if (expensesError) {
      return NextResponse.json({ error: 'Erreur recuperation depenses CB Perso' }, { status: 500 });
    }

    const rows = expenses || [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucune depense CB Perso pour cette periode' }, { status: 400 });
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalHt += Number(row.amount_ht || 0);
        acc.totalTax += Number(row.amount_tva || 0);
        acc.totalTtc += Number(row.amount_ttc || 0);
        return acc;
      },
      { totalHt: 0, totalTax: 0, totalTtc: 0 }
    );

    const { data: setting } = await supabase
      .from('email_settings')
      .select('email')
      .eq('user_id', userId)
      .eq('type', 'ndf')
      .maybeSingle();

    const toEmail = providedEmail || String(setting?.email || '').trim();

    const subject = `Note de frais ${String(month).padStart(2, '0')}/${year}`;
    const bodyText = [
      'Bonjour,',
      '',
      `Veuillez trouver ci-joint ma note de frais pour ${String(month).padStart(2, '0')}/${year}.`,
      '',
      `Total HT: ${totals.totalHt.toFixed(2)} EUR`,
      `Total Taxe: ${totals.totalTax.toFixed(2)} EUR`,
      `Total TTC: ${totals.totalTtc.toFixed(2)} EUR`,
      `Nombre de justificatifs: ${rows.length}`,
      '',
      'Cordialement,',
    ].join('\n');

    return NextResponse.json({
      success: true,
      draft: {
        month,
        year,
        to: toEmail,
        subject,
        bodyText,
      },
      expenses: rows,
      totals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const end = `${new Date(year, month, 0).toISOString().slice(0, 10)}T23:59:59.999Z`;
  return { start, end };
}
