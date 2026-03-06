interface ExtractedInvoiceData {
  invoice_number: string | null;
  invoice_date: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  vendor: string | null;
  description: string | null;
}

/**
 * Extrait les données d'une facture via Google Vision API REST
 * @param base64Image - Image en base64
 * @returns Données extraites de la facture
 */
export async function extractInvoiceData(base64Image: string): Promise<ExtractedInvoiceData> {
  try {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      console.error('❌ GOOGLE_VISION_API_KEY non configurée');
      return getEmptyResult();
    }

    // Nettoyer le base64 si nécessaire
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const request = {
      requests: [
        {
          image: {
            content: cleanBase64,
          },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION' },
          ],
        },
      ],
    };

    console.log('🔍 Appel Google Vision API...');
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Google Vision API error:', errorText);
      return getEmptyResult();
    }

    console.log('✅ Réponse Google Vision reçue');

    const result = await response.json();
    const fullTextAnnotation = result.responses?.[0]?.fullTextAnnotation;
    
    if (!fullTextAnnotation?.text) {
      return getEmptyResult();
    }

    const text = fullTextAnnotation.text.toLowerCase();

    return {
      invoice_number: extractInvoiceNumber(text),
      invoice_date: extractInvoiceDate(text),
      amount_ht: extractAmountHT(text),
      amount_tva: extractAmountTVA(text),
      amount_ttc: extractAmountTTC(text),
      vendor: extractVendor(text),
      description: extractDescription(text),
    };
  } catch (error) {
    console.error('Erreur Google Vision:', error);
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
  };
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
