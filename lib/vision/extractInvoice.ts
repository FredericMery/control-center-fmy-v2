import { callGoogleVision, callOpenAi } from '@/lib/ai/client';

interface ExtractedInvoiceData {
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  vendor: string | null;
  description: string | null;
  category: string | null;
  expense_type: string | null;
  ndf_eligible: boolean;
  confidence: number | null;
  needs_review: boolean;
  raw_text: string | null;
}

/**
 * Pipeline depense: Scan -> Vision OCR -> GPT analyse -> champs structures
 * @param base64Image - Image en base64
 * @param userId - utilisateur pour logs IA
 * @returns Données extraites de la facture
 */
export async function extractInvoiceData(base64Image: string, userId: string): Promise<ExtractedInvoiceData> {
  try {
    const rawText = await callGoogleVision(userId, base64Image);
    if (!rawText) {
      return getEmptyResult();
    }

    const text = rawText.toLowerCase();
    const fallback = {
      invoice_number: extractInvoiceNumber(text),
      invoice_date: extractInvoiceDate(text),
      amount_ht: extractAmountHT(text),
      amount_tva: extractAmountTVA(text),
      amount_ttc: extractAmountTTC(text),
      vendor: extractVendor(text),
      description: extractDescription(text),
      category: inferCategory(text),
      expense_type: inferCategory(text),
      ndf_eligible: true,
      confidence: null,
      needs_review: false,
      raw_text: rawText,
    };

    const aiParsed = await parseInvoiceWithGpt(userId, rawText);

    const invoiceDate = normalizeIsoDate(aiParsed.invoice_date || fallback.invoice_date);
    const amountTtc = parseMaybeNumber(aiParsed.amount_ttc) ?? fallback.amount_ttc;
    const amountHt = parseMaybeNumber(aiParsed.amount_ht) ?? fallback.amount_ht;
    const amountTva = parseMaybeNumber(aiParsed.amount_tva) ?? fallback.amount_tva;

    const safeCategory = String(aiParsed.category || fallback.category || 'Non catégorisée').slice(0, 80);
    const safeExpenseType = String(aiParsed.expense_type || safeCategory || 'autre').slice(0, 80);
    const confidence = clampConfidence(aiParsed.confidence);

    const ndfEligible =
      typeof aiParsed.ndf_eligible === 'boolean' ? aiParsed.ndf_eligible : fallback.ndf_eligible;

    const needsReview =
      typeof aiParsed.needs_review === 'boolean'
        ? aiParsed.needs_review
        : confidence !== null && confidence < 0.6;

    return {
      invoice_number: String(aiParsed.invoice_number || fallback.invoice_number || '').trim() || null,
      invoice_date: invoiceDate,
      amount_ht: amountHt,
      amount_tva: amountTva,
      amount_ttc: amountTtc,
      vendor: String(aiParsed.vendor || fallback.vendor || '').trim() || null,
      description: String(aiParsed.description || fallback.description || '').trim() || null,
      category: safeCategory,
      expense_type: safeExpenseType,
      ndf_eligible: ndfEligible,
      confidence,
      needs_review: needsReview,
      raw_text: rawText,
    };
  } catch (error) {
    console.error('Erreur pipeline OCR + IA:', error);
    return getEmptyResult();
  }
}

function getEmptyResult(): ExtractedInvoiceData {
  return {
    invoice_number: null,
    invoice_date: null,
    amount_ht: null,
    amount_tva: null,
    amount_ttc: null,
    vendor: null,
    description: null,
    category: 'Non catégorisée',
    expense_type: 'autre',
    ndf_eligible: true,
    confidence: null,
    needs_review: true,
    raw_text: null,
  };
}

async function parseInvoiceWithGpt(userId: string, rawText: string): Promise<Record<string, unknown>> {
  const model = 'gpt-4.1-mini';
  const prompt = [
    'Analyse ce texte OCR de facture/de ticket professionnel.',
    'Retourne uniquement un JSON valide avec ces cles:',
    '{',
    '  "invoice_number": string|null,',
    '  "invoice_date": string|null,',
    '  "amount_ht": number|null,',
    '  "amount_tva": number|null,',
    '  "amount_ttc": number|null,',
    '  "vendor": string|null,',
    '  "description": string|null,',
    '  "category": string|null,',
    '  "expense_type": string|null,',
    '  "ndf_eligible": boolean,',
    '  "confidence": number|null,',
    '  "needs_review": boolean',
    '}',
    '',
    'Regles:',
    '- invoice_date au format YYYY-MM-DD si possible',
    '- category et expense_type parmi: repas, transport, hotel, abonnement, fournitures, logiciel, autre',
    '- ndf_eligible=false si depense manifestement perso/non remboursable',
    '- confidence entre 0 et 1',
    '',
    'OCR:',
    rawText,
  ].join('\n');

  const response = await callOpenAi({
    userId,
    service: 'responses',
    model,
    body: {
      model,
      input: [
        {
          role: 'system',
          content: 'Tu es un extracteur strict. Retour JSON uniquement.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    },
  });

  const content =
    response?.output?.[0]?.content?.[0]?.text ||
    response?.output_text ||
    '{}';

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseMaybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const slash = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const dd = slash[1].padStart(2, '0');
    const mm = slash[2].padStart(2, '0');
    const yyyy = slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function clampConfidence(value: unknown): number | null {
  const n = parseMaybeNumber(value);
  if (n === null) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Number(n.toFixed(3));
}

function inferCategory(text: string): string {
  if (/restaurant|brasserie|bar|cafe|repas|dejeuner|diner/.test(text)) return 'repas';
  if (/uber|sncf|taxi|parking|peage|metro|train|avion/.test(text)) return 'transport';
  if (/hotel|booking|airbnb/.test(text)) return 'hotel';
  if (/amazon|fourniture|papeterie|bureau/.test(text)) return 'fournitures';
  if (/saas|subscription|abonnement|licence|software/.test(text)) return 'logiciel';
  return 'autre';
}

// ============================================
// FONCTIONS D'EXTRACTION
// ============================================

function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /(?:facture|invoice|n°|no|num)\s*[:\s]*([a-z0-9\-\/]+)/i,
    /^[a-z0-9\-\/]{5,20}$/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().toUpperCase();
    }
  }
  return null;
}

function extractInvoiceDate(text: string): string | null {
  const datePatterns = [
    /(?:date|du)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parts = match[0].split(/[\/\-]/);
      if (parts.length === 3) {
        const [first, second, third] = parts;
        if (third.length === 4) {
          return `${third}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
        } else if (first.length === 4) {
          return `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
        }
      }
    }
  }
  return null;
}

function extractAmountTTC(text: string): number | null {
  const patterns = [
    /(?:total\s*ttc|ttc|total)\s*[:\s]*([0-9]{1,10}[.,][0-9]{2})/i,
    /([0-9]{1,10}[.,][0-9]{2})\s*€/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  return null;
}

function extractAmountHT(text: string): number | null {
  const patterns = [
    /(?:total\s*ht|ht|sous\s*total|subtotal)\s*[:\s]*([0-9]{1,10}[.,][0-9]{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  return null;
}

function extractAmountTVA(text: string): number | null {
  const patterns = [
    /(?:tva|vat|tax)\s*[:\s]*([0-9]{1,10}[.,][0-9]{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  return null;
}

function extractVendor(text: string): string | null {
  const lines = text.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 2 && firstLine.length < 100) {
      return firstLine;
    }
  }
  return null;
}

function extractDescription(text: string): string | null {
  const lines = text.split('\n').slice(0, 3).join(' ');
  return lines.length > 10 ? lines.substring(0, 255) : null;
}
