import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const format = request.nextUrl.searchParams.get('format') || 'csv';

    // Récupérer toutes les dépenses
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', authHeader)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Erreur récupération dépenses' },
        { status: 500 }
      );
    }

    if (format === 'csv') {
      return exportCSV(expenses);
    } else if (format === 'excel') {
      return exportExcel(expenses);
    }

    return NextResponse.json({ error: 'Format non supporté' }, { status: 400 });
  } catch (error) {
    console.error('Erreur export:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

function exportCSV(expenses: any[]) {
  const headers = [
    'Date',
    'Fournisseur',
    'N° Facture',
    'Catégorie',
    'Montant HT',
    'TVA',
    'Montant TTC',
    'Type Paiement',
    'Statut',
  ];

  const rows = expenses.map((e) => [
    new Date(e.created_at).toLocaleDateString('fr-FR'),
    e.vendor || '',
    e.invoice_number || '',
    e.category || '',
    e.amount_ht?.toString() || '',
    e.amount_tva?.toString() || '',
    e.amount_ttc?.toString() || '',
    e.payment_method === 'cb_perso' ? 'CB Perso' : 'CB Pro',
    e.status || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="dépenses.csv"',
    },
  });
}

function exportExcel(expenses: any[]) {
  // Pour la version simple, utiliser CSV
  // Une vraie implémentation utiliserait une librairie comme xlsx
  return exportCSV(expenses);
}
