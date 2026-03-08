import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceData, extractInvoiceDataFromPdf } from '@/lib/vision/extractInvoice';
import { sendExpenseEmail } from '@/lib/email/resendService';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { requireValidationCode } from '@/lib/ai/client';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseUploadPayload(request);

    if (!payload.paymentMethod) {
      return NextResponse.json(
        { error: 'Fichier et méthode de paiement requis' },
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
    requireValidationCode(payload.validationCode);

    console.log('FILE TYPE:', payload.detectedMime);
    console.log('FILE SIZE:', payload.fileSize);
    console.log('BUFFER LENGTH:', payload.buffer.length);

    if (!ALLOWED_TYPES.has(payload.detectedMime)) {
      return NextResponse.json(
        { error: 'Format non supporte. Utilisez JPG/PNG/WEBP/HEIC/HEIF ou PDF.' },
        { status: 400 }
      );
    }

    if (!payload.buffer.length) {
      return NextResponse.json(
        { error: 'Fichier vide ou corrompu' },
        { status: 400 }
      );
    }

    const isPdf = payload.sourceMime === 'application/pdf' || payload.detectedMime === 'application/pdf';
    const base64Payload = payload.buffer.toString('base64');
    const imageDataUrl = `data:${payload.detectedMime};base64,${base64Payload}`;

    // 1. Pipeline IA: OCR/PDF -> Analyse GPT -> Donnees structurees
    console.log('📄 Extraction IA des données de la facture...');
    const invoiceData = isPdf
      ? payload.detectedMime === 'application/pdf'
        ? await extractInvoiceDataFromPdf(base64Payload, userId)
        : await extractInvoiceData(imageDataUrl, userId)
      : await extractInvoiceData(imageDataUrl, userId);
    console.log('✅ Données IA extraites:', invoiceData);

    // 2. Générer un ID unique pour la dépense
    const expenseId = crypto.randomUUID();
    const timestamp = Date.now();
    const safeShortId = expenseId.substring(0, 8);
    const extension = getExtensionForMime(payload.detectedMime);
    const filename = `${userId}/${timestamp}-${safeShortId}.${extension}`;

    // 3. Uploader l'image dans Supabase Storage
    console.log(`📤 Upload de l'image vers Supabase Storage... (${payload.buffer.length} bytes, filename: ${filename})`);
    
    let publicUrl: string | null = null;
    let uploadWarning = '';

    const primaryUpload = await supabase.storage
      .from('expense-receipts')
      .upload(filename, payload.buffer, {
        contentType: payload.detectedMime,
        upsert: false,
      });

    if (primaryUpload.error) {
      console.error('❌ Erreur upload primaire:', primaryUpload.error);

      // Fallback iPhone/webview: chemin + type ultra permissifs.
      const fallbackName = `${userId}/${timestamp}-${safeShortId}.bin`;
      const fallbackUpload = await supabase.storage
        .from('expense-receipts')
        .upload(fallbackName, payload.buffer, {
          contentType: 'application/octet-stream',
          upsert: false,
        });

      if (fallbackUpload.error) {
        console.error('❌ Erreur upload fallback:', fallbackUpload.error);
        uploadWarning = toUserFacingExpenseError(fallbackUpload.error.message);
      } else {
        const {
          data: { publicUrl: fallbackPublicUrl },
        } = supabase.storage.from('expense-receipts').getPublicUrl(fallbackName);
        publicUrl = fallbackPublicUrl;
      }
    } else {
      const {
        data: { publicUrl: uploadedPublicUrl },
      } = supabase.storage.from('expense-receipts').getPublicUrl(filename);
      publicUrl = uploadedPublicUrl;
    }

    if (publicUrl) {
      console.log('✅ Image uploadée avec succès');
    } else {
      console.warn('⚠️ Upload photo ignore, creation depense continue');
    }

    // 5. Déterminer le statut selon méthode + eligibilite NDF detectee par IA
    const status =
      payload.paymentMethod === 'cb_perso' && invoiceData.ndf_eligible
        ? 'pending_ndf'
        : 'pending';

    // Certains tickets PDF n'exposent pas de vendeur exploitable; on force une valeur pour respecter la contrainte DB.
    const safeVendor = String(invoiceData.vendor || '').trim() || (isPdf ? 'Fournisseur PDF' : 'Fournisseur inconnu');

    const normalizedReason = String(payload.reason || '').trim().slice(0, 80);
    const normalizedRecipientName = String(payload.recipientName || '').trim().slice(0, 120);
    const normalizedRecipientDestination = String(payload.recipientDestination || '').trim().slice(0, 180);
    const expenseType = normalizedReason || invoiceData.expense_type || invoiceData.category || 'autre';
    const normalizedAmounts = normalizeExpenseAmounts({
      amountHt: invoiceData.amount_ht,
      amountTva: invoiceData.amount_tva,
      amountTtc: invoiceData.amount_ttc,
    });

    if (normalizedAmounts.amountTtc === null) {
      throw new ApiError('Aucun montant detecte sur le justificatif. Verifiez le PDF puis reessayez.', 400);
    }

    let emailSent = false;
    let emailErrorMessage = '';

    if (payload.paymentMethod === 'cb_pro') {
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
            amountHt: normalizedAmounts.amountHt || 0,
            amountTax: normalizedAmounts.amountTva || 0,
            amountTtc: normalizedAmounts.amountTtc || 0,
            expenseType,
            invoiceNumber: invoiceData.invoice_number || undefined,
            invoiceDate: invoiceData.invoice_date || undefined,
            photoUrl: publicUrl || undefined,
          });
          emailSent = true;
        }
      } catch (emailError) {
        console.error('Erreur envoi email:', emailError);
        emailSent = false;
        emailErrorMessage = emailError instanceof Error ? emailError.message : 'Erreur envoi email';
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
        payment_method: payload.paymentMethod,
        invoice_number: invoiceData.invoice_number,
        invoice_date: invoiceData.invoice_date,
        vendor: safeVendor,
        amount_ht: normalizedAmounts.amountHt,
        amount_tva: normalizedAmounts.amountTva,
        amount_ttc: normalizedAmounts.amountTtc,
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
      message: payload.paymentMethod === 'cb_perso' 
        ? invoiceData.ndf_eligible
          ? 'Dépense IA enregistrée pour la note de frais'
          : 'Dépense IA enregistrée, verification manuelle recommandee'
        : 'Facture analysee par IA et envoyee à la comptabilité',
      email: {
        attempted: payload.paymentMethod === 'cb_pro',
        sent: emailSent,
        error: emailSent ? null : emailErrorMessage || null,
      },
      upload: {
        photoStored: Boolean(publicUrl),
        warning: uploadWarning || null,
      },
    });
  } catch (error: unknown) {
    console.error('❌ Erreur API complète:', error);
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json(
      {
        error: toUserFacingExpenseError(
          error instanceof Error ? error.message : 'Erreur serveur'
        ),
      },
      { status }
    );
  }
}

type ParsedUploadPayload = {
  buffer: Buffer;
  detectedMime: string;
  sourceMime: string;
  fileSize: number;
  paymentMethod: string;
  validationCode: string;
  reason: string;
  recipientName: string;
  recipientDestination: string;
};

async function parseUploadPayload(request: NextRequest): Promise<ParsedUploadPayload> {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new ApiError('Upload multipart invalide ou corrompu', 400);
    }

    const file = formData.get('file');
    if (!isFileLike(file)) {
      throw new ApiError('Fichier manquant dans la requete', 400);
    }

    const detectedMime = normalizeMimeType(file.type || inferMimeTypeFromFilename(file.name));
    const sourceMimeRaw = String(formData.get('sourceMime') || '').trim();
    const sourceMime = sourceMimeRaw ? normalizeMimeType(sourceMimeRaw) : '';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    return {
      buffer,
      detectedMime,
      sourceMime,
      fileSize: Number(file.size || buffer.length || 0),
      paymentMethod: String(formData.get('paymentMethod') || '').trim(),
      validationCode: String(formData.get('validationCode') || '').trim(),
      reason: String(formData.get('reason') || '').trim(),
      recipientName: String(formData.get('recipientName') || '').trim(),
      recipientDestination: String(formData.get('recipientDestination') || '').trim(),
    };
  }

  // Compatibilite PWA/cache: accepte encore l'ancien payload JSON pour ne pas casser les clients iPhone non rafraichis.
  let legacy: any;
  try {
    legacy = await request.json();
  } catch {
    throw new ApiError('Payload non reconnu. Rechargez la page puis reessayez.', 400);
  }

  const image = String(legacy?.image || '').trim();
  if (!image) {
    throw new ApiError('Image manquante dans la requete', 400);
  }

  const [header, payload = ''] = image.split(',');
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const detectedMime = normalizeMimeType(mimeMatch?.[1] || 'image/jpeg');
  const buffer = Buffer.from(payload || image, 'base64');

  return {
    buffer,
    detectedMime,
    sourceMime: '',
    fileSize: Number(buffer.length || 0),
    paymentMethod: String(legacy?.paymentMethod || '').trim(),
    validationCode: String(legacy?.validationCode || '').trim(),
    reason: String(legacy?.reason || '').trim(),
    recipientName: String(legacy?.recipientName || '').trim(),
    recipientDestination: String(legacy?.recipientDestination || '').trim(),
  };
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value) return false;
  if (typeof value === 'string') return false;

  const candidate = value as Partial<File>;
  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string'
  );
}

function normalizeExpenseAmounts(input: {
  amountHt: number | null;
  amountTva: number | null;
  amountTtc: number | null;
}): {
  amountHt: number | null;
  amountTva: number | null;
  amountTtc: number | null;
} {
  let amountHt = toNullableAmount(input.amountHt);
  let amountTva = toNullableAmount(input.amountTva);
  let amountTtc = toNullableAmount(input.amountTtc);

  // Regle metier: si un seul montant est trouve, on le considere comme TTC.
  if (amountTtc === null) {
    if (amountHt !== null && amountTva !== null) {
      amountTtc = roundMoney(amountHt + amountTva);
    } else if (amountHt !== null) {
      amountTtc = amountHt;
    } else if (amountTva !== null) {
      amountTtc = amountTva;
    }
  }

  if (amountTtc !== null && amountHt === null && amountTva === null) {
    amountHt = amountTtc;
    amountTva = 0;
  } else if (amountTtc !== null && amountHt !== null && amountTva === null) {
    amountTva = Math.max(0, roundMoney(amountTtc - amountHt));
  } else if (amountTtc !== null && amountHt === null && amountTva !== null) {
    amountHt = Math.max(0, roundMoney(amountTtc - amountTva));
  }

  return { amountHt, amountTva, amountTtc };
}

function toNullableAmount(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return roundMoney(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
    lower.includes('expected pattern') ||
    lower.includes('string did not match')
  ) {
    return 'Format non reconnu. Utilisez une photo (JPG, PNG, WEBP, HEIC/HEIF) ou un PDF.';
  }

  if (lower.includes('invalid') && (lower.includes('image') || lower.includes('content'))) {
    return 'Le fichier fourni ne peut pas etre traite. Reessayez avec un fichier image/PDF valide.';
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

function normalizeMimeType(mimeType: unknown): string {
  const raw = String(mimeType || '').toLowerCase().trim();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'application/x-pdf') return 'application/pdf';
  return raw;
}

function inferMimeTypeFromFilename(name: string): string {
  const lower = String(name || '').toLowerCase().trim();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

function getExtensionForMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
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
