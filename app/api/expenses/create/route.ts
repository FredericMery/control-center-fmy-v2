import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceData } from '@/lib/vision/extractInvoice';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { image, paymentMethod } = await request.json();

    if (!image || !paymentMethod) {
      return NextResponse.json(
        { error: 'Image et méthode de paiement requises' },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur depuis la session
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 1. Extraire les données de la facture via Google Vision
    const invoiceData = await extractInvoiceData(image);

    // 2. Générer un ID unique pour la dépense
    const expenseId = crypto.randomUUID();

    // 3. Uploader l'image dans Supabase Storage
    const base64Data = image.split(',')[1] || image;
    const buffer = Buffer.from(base64Data, 'base64');
    
    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(`${expenseId}.jpg`, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Erreur upload:', uploadError);
      return NextResponse.json(
        { error: 'Erreur lors de l\'upload de l\'image' },
        { status: 500 }
      );
    }

    // 4. Récupérer l'URL de l'image
    const {
      data: { publicUrl },
    } = supabase.storage.from('expense-receipts').getPublicUrl(`${expenseId}.jpg`);

    // 5. Déterminer le statut selon la méthode de paiement
    const status = paymentMethod === 'cb_perso' ? 'pending_ndf' : 'pending';

    // 6. Créer la dépense dans Supabase
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id: expenseId,
        user_id: authHeader, // À adapter selon ta gestion d'auth
        payment_method: paymentMethod,
        invoice_number: invoiceData.invoice_number,
        invoice_date: invoiceData.invoice_date,
        vendor: invoiceData.vendor,
        amount_ht: invoiceData.amount_ht,
        amount_tva: invoiceData.amount_tva,
        amount_ttc: invoiceData.amount_ttc,
        category: 'À catégoriser',
        description: invoiceData.description,
        photo_url: publicUrl,
        status,
        currency: 'EUR',
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur création dépense:', error);
      return NextResponse.json(
        { error: 'Erreur lors de la création de la dépense' },
        { status: 500 }
      );
    }

    // 7. Si CB Pro → envoyer email automatiquement
    if (paymentMethod === 'cb_pro') {
      // À implémenter : envoi email via Resend
    }

    return NextResponse.json({
      success: true,
      expense: data,
      message: paymentMethod === 'cb_perso' 
        ? 'Dépense enregistrée pour la note de frais'
        : 'Facture envoyée à la comptabilité',
    });
  } catch (error) {
    console.error('Erreur API:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
