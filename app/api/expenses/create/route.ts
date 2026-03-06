import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceData } from '@/lib/vision/extractInvoice';
import { sendExpenseEmail } from '@/lib/email/resendService';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

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
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 1. Extraire les données de la facture via Google Vision
    console.log('📄 Extraction des données de la facture...');
    const invoiceData = await extractInvoiceData(image);
    console.log('✅ Données extraites:', invoiceData);

    // 2. Générer un ID unique pour la dépense
    const expenseId = crypto.randomUUID();

    // 3. Uploader l'image dans Supabase Storage
    const base64Data = image.split(',')[1] || image;
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('📤 Upload de l\'image vers Supabase Storage...');
    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(`${expenseId}.jpg`, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Erreur upload:', uploadError);
      return NextResponse.json(
        { error: `Erreur upload: ${uploadError.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Image uploadée avec succès');

    // 4. Récupérer l'URL de l'image
    const {
      data: { publicUrl },
    } = supabase.storage.from('expense-receipts').getPublicUrl(`${expenseId}.jpg`);

    // 5. Déterminer le statut selon la méthode de paiement
    const status = paymentMethod === 'cb_perso' ? 'pending_ndf' : 'pending';

    // 6. Créer la dépense dans Supabase
    console.log('💾 Création de la dépense en base...');
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id: expenseId,
        user_id: userId,
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
      console.error('❌ Erreur création dépense:', error);
      return NextResponse.json(
        { error: `Erreur création: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Dépense créée avec succès:', data.id);

    // 7. Si CB Pro → envoyer email automatiquement
    if (paymentMethod === 'cb_pro') {
      try {
        // Récupérer l'email du destinataire depuis email_settings
        const { data: settings } = await supabase
          .from('email_settings')
          .select('email')
          .eq('type', 'facture')
          .eq('user_id', userId)
          .single();

        if (settings?.email) {
          await sendExpenseEmail({
            to: settings.email,
            vendor: invoiceData.vendor || 'Fournisseur',
            amount: invoiceData.amount_ttc || 0,
            invoiceNumber: invoiceData.invoice_number || undefined,
            invoiceDate: invoiceData.invoice_date || undefined,
            photoUrl: publicUrl,
          });
        }
      } catch (emailError) {
        console.error('Erreur envoi email:', emailError);
        // Continuer même si email échoue
      }
    }

    return NextResponse.json({
      success: true,
      expense: data,
      message: paymentMethod === 'cb_perso' 
        ? 'Dépense enregistrée pour la note de frais'
        : 'Facture envoyée à la comptabilité',
    });
  } catch (error: any) {
    console.error('❌ Erreur API complète:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
