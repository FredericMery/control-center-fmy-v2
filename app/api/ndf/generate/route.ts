import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // 1. Récupérer toutes les dépenses CB Perso du mois
    const { data: expenses, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', authHeader)
      .eq('payment_method', 'cb_perso')
      .eq('status', 'pending_ndf')
      .order('invoice_date', { ascending: true });

    if (fetchError) {
      return NextResponse.json(
        { error: 'Erreur récupération dépenses' },
        { status: 500 }
      );
    }

    if (!expenses || expenses.length === 0) {
      return NextResponse.json(
        { error: 'Aucune dépense à soumettre' },
        { status: 400 }
      );
    }

    // 2. Calculer les totaux
    const total_ht = expenses.reduce((sum, e) => sum + (e.amount_ht || 0), 0);
    const total_tva = expenses.reduce((sum, e) => sum + (e.amount_tva || 0), 0);
    const total_ttc = expenses.reduce((sum, e) => sum + (e.amount_ttc || 0), 0);

    // 3. Créer la note de frais
    const { data: ndf, error: ndfError } = await supabase
      .from('ndf_reports')
      .insert({
        user_id: authHeader,
        month,
        year,
        total_ht,
        total_tva,
        total_ttc,
        status: 'submitted',
      })
      .select()
      .single();

    if (ndfError) {
      return NextResponse.json(
        { error: 'Erreur création note de frais' },
        { status: 500 }
      );
    }

    // 4. Mettre à jour le statut des dépenses
    await supabase
      .from('expenses')
      .update({ status: 'submitted' })
      .eq('user_id', authHeader)
      .eq('payment_method', 'cb_perso')
      .eq('status', 'pending_ndf');

    // 5. TODO: Générer PDF et envoyer email

    return NextResponse.json({
      success: true,
      ndf,
      expenses_count: expenses.length,
      totals: {
        ht: total_ht,
        tva: total_tva,
        ttc: total_ttc,
      },
    });
  } catch (error) {
    console.error('Erreur API NDF:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
