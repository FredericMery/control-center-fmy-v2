import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNDFHTML } from '@/lib/email/generateNDFPDF';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
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
      .eq('user_id', userId)
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
        user_id: userId,
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
      .eq('user_id', userId)
      .eq('payment_method', 'cb_perso')
      .eq('status', 'pending_ndf');

    // 5. Générer PDF et stocker
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthName = monthNames[month - 1];

    try {
      const htmlContent = generateNDFHTML({
        reportId: ndf.id,
        month: monthName,
        year,
        total_ht,
        total_tva,
        total_ttc,
        expenses: expenses.map(e => ({
          invoice_number: e.invoice_number,
          invoice_date: e.invoice_date,
          vendor: e.vendor,
          amount_ht: e.amount_ht || 0,
          amount_tva: e.amount_tva || 0,
          amount_ttc: e.amount_ttc || 0,
          category: e.category || 'Non catégorisée',
        })),
        employee: 'FM', // À adapter
        createdAt: ndf.created_at,
      });

      // Uploader le PDF HTML en Supabase Storage (pour accès futur)
      const buffer = Buffer.from(htmlContent, 'utf-8');
      const pdfFileName = `ndf_${year}_${month.toString().padStart(2, '0')}_${ndf.id.substring(0, 8)}.html`;
      
      await supabase.storage
        .from('expense-receipts')
        .upload(`ndf-reports/${pdfFileName}`, buffer, {
          contentType: 'text/html',
          upsert: false,
        });

      // Mettre à jour le chemin du PDF dans la base
      await supabase
        .from('ndf_reports')
        .update({ pdf_url: `ndf-reports/${pdfFileName}` })
        .eq('id', ndf.id);
    } catch (pdfError) {
      console.error('Erreur génération PDF:', pdfError);
      // Continuer même si PDF échoue
    }

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
