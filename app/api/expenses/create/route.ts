import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceData } from '@/lib/vision/extractInvoice';
import { sendExpenseEmail } from '@/lib/email/resendService';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { requireValidationCode } from '@/lib/ai/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const {
      image,
      paymentMethod,
      validationCode,
      reason,
      recipientName,
      recipientDestination,
    } = await request.json();

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

    // Ce module utilise l'IA (Vision + GPT), donc code obligatoire.
    requireValidationCode(validationCode);

    // 1. Pipeline IA: OCR Vision -> Analyse GPT -> Donnees structurees
    console.log('📄 Extraction IA des données de la facture...');
    const invoiceData = await extractInvoiceData(image, userId);
    console.log('✅ Données IA extraites:', invoiceData);

    // 2. Générer un ID unique pour la dépense
    const expenseId = crypto.randomUUID();
    const timestamp = Date.now();
    const filename = `${userId}_${timestamp}_${expenseId.substring(0, 8)}.jpg`;

    // 3. Uploader l'image dans Supabase Storage
    let base64Data = image;
    
    // Nettoyer le base64
    if (image.includes(',')) {
      base64Data = image.split(',')[1];
    }
    
    // Vérifier que c'est du base64 valide
    if (!base64Data || base64Data.length < 100) {
      return NextResponse.json(
        { error: 'Image invalide ou trop petite' },
        { status: 400 }
      );
    }
    
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`📤 Upload de l'image vers Supabase Storage... (${buffer.length} bytes, filename: ${filename})`);
    
    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(filename, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Erreur upload:', uploadError);
      return NextResponse.json(
        { error: toUserFacingExpenseError(uploadError?.message) },
        { status: 500 }
      );
    }

    console.log('✅ Image uploadée avec succès');

    // 4. Récupérer l'URL de l'image
    const {
      data: { publicUrl },
    } = supabase.storage.from('expense-receipts').getPublicUrl(filename);

    // 5. Déterminer le statut selon méthode + eligibilite NDF detectee par IA
    const status =
      paymentMethod === 'cb_perso' && invoiceData.ndf_eligible
        ? 'pending_ndf'
        : 'pending';

    const normalizedReason = String(reason || '').trim().slice(0, 80);
    const normalizedRecipientName = String(recipientName || '').trim().slice(0, 120);
    const normalizedRecipientDestination = String(recipientDestination || '').trim().slice(0, 180);
    const expenseType = normalizedReason || invoiceData.expense_type || invoiceData.category || 'autre';

    let emailSent = false;

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
            userId,
            to: settings.email,
            vendor: invoiceData.vendor || 'Fournisseur',
            amountHt: invoiceData.amount_ht || 0,
            amountTax: invoiceData.amount_tva || 0,
            amountTtc: invoiceData.amount_ttc || 0,
            expenseType,
            invoiceNumber: invoiceData.invoice_number || undefined,
            invoiceDate: invoiceData.invoice_date || undefined,
            photoUrl: publicUrl,
          });
          emailSent = true;
        }
      } catch (emailError) {
        console.error('Erreur envoi email:', emailError);
        emailSent = false;
      }
    }

    const aiContext = [
      invoiceData.description || '',
      normalizedReason ? `Reason utilisateur=${normalizedReason}` : '',
      normalizedRecipientName ? `Destinataire nom=${normalizedRecipientName}` : '',
      normalizedRecipientDestination ? `Destinataire=${normalizedRecipientDestination}` : '',
      `EMAIL_SENT=${emailSent ? 'true' : 'false'}`,
      `IA categorie=${invoiceData.category || 'autre'}`,
      `IA expense_type=${invoiceData.expense_type || 'autre'}`,
      `IA ndf_eligible=${invoiceData.ndf_eligible ? 'true' : 'false'}`,
      `IA confidence=${invoiceData.confidence ?? 'null'}`,
      `IA review=${invoiceData.needs_review ? 'true' : 'false'}`,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 255);

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
        category: expenseType,
        description: aiContext,
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

    // 7. Mettre a jour le report du mois en cours.
    await syncCurrentMonthReport(userId);

    return NextResponse.json({
      success: true,
      expense: data,
      ai: {
        pipeline: 'vision+gpt',
        ndf_eligible: invoiceData.ndf_eligible,
        confidence: invoiceData.confidence,
        needs_review: invoiceData.needs_review,
      },
      message: paymentMethod === 'cb_perso' 
        ? invoiceData.ndf_eligible
          ? 'Dépense IA enregistrée pour la note de frais'
          : 'Dépense IA enregistrée, verification manuelle recommandee'
        : 'Facture analysee par IA et envoyee à la comptabilité',
    });
  } catch (error: unknown) {
    console.error('❌ Erreur API complète:', error);
    return NextResponse.json(
      {
        error: toUserFacingExpenseError(
          error instanceof Error ? error.message : 'Erreur serveur'
        ),
      },
      { status: 500 }
    );
  }
}

function toUserFacingExpenseError(message: string): string {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return 'Erreur serveur lors du traitement de la depense';

  if (lower.includes('code de validation ia invalide')) {
    return 'Code de validation IA invalide';
  }

  if (
    lower.includes('did not match the expected pattern') ||
    lower.includes('expected pattern')
  ) {
    return 'Format d image non reconnu. Utilisez une photo JPG, PNG ou WEBP.';
  }

  if (lower.includes('google vision') || lower.includes('vision')) {
    return 'Erreur lecture IA de la facture. Reessayez avec une photo plus nette.';
  }

  if (lower.includes('openai')) {
    return 'Erreur analyse IA. Reessayez dans quelques instants.';
  }

  if (lower.includes('storage') || lower.includes('upload')) {
    return 'Erreur upload de la photo. Reessayez avec une image plus legere.';
  }

  return raw;
}

async function syncCurrentMonthReport(userId: string) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10) + 'T23:59:59.999Z';

  const { data: monthExpenses } = await supabase
    .from('expenses')
    .select('amount_ht, amount_tva, amount_ttc')
    .eq('user_id', userId)
    .gte('created_at', monthStart)
    .lte('created_at', monthEnd);

  const totals = (monthExpenses || []).reduce(
    (acc, expense) => {
      acc.ht += Number(expense.amount_ht || 0);
      acc.tva += Number(expense.amount_tva || 0);
      acc.ttc += Number(expense.amount_ttc || 0);
      return acc;
    },
    { ht: 0, tva: 0, ttc: 0 }
  );

  const { data: existing } = await supabase
    .from('ndf_reports')
    .select('id, status')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('ndf_reports')
      .update({
        total_ht: totals.ht,
        total_tva: totals.tva,
        total_ttc: totals.ttc,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('ndf_reports')
      .insert({
        user_id: userId,
        month,
        year,
        total_ht: totals.ht,
        total_tva: totals.tva,
        total_ttc: totals.ttc,
        status: 'draft',
      });
  }
}
