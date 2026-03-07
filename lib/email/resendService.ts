import { Resend } from 'resend';
import { callOpenAi } from '@/lib/ai/client';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendExpenseEmailParams {
  userId: string;
  to: string;
  vendor: string;
  amountHt: number;
  amountTax: number;
  amountTtc: number;
  expenseType: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  photoUrl?: string;
}

/**
 * Envoie une facture CB Pro par email via Resend
 */
export async function sendExpenseEmail({
  userId,
  to,
  vendor,
  amountHt,
  amountTax,
  amountTtc,
  expenseType,
  invoiceNumber,
  invoiceDate,
  photoUrl,
}: SendExpenseEmailParams) {
  try {
    const aiBody = await generateExpenseEmailBodyWithAi({
      userId,
      vendor,
      expenseType,
      amountHt,
      amountTax,
      amountTtc,
      invoiceNumber,
      invoiceDate,
    });

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@meetsync-ai.com',
      to,
      subject: `Facture - ${vendor}`,
      html: generateExpenseEmailHTML({
        aiBody,
        vendor,
        amountHt,
        amountTax,
        amountTtc,
        expenseType,
        invoiceNumber,
        invoiceDate,
      }),
      attachments: photoUrl
        ? [
            {
              filename: 'facture.pdf',
              path: photoUrl,
            },
          ]
        : undefined,
    });

    return response;
  } catch (error) {
    console.error('Erreur Resend:', error);
    throw error;
  }
}

async function generateExpenseEmailBodyWithAi(args: {
  userId: string;
  vendor: string;
  expenseType: string;
  amountHt: number;
  amountTax: number;
  amountTtc: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
}): Promise<string> {
  const model = 'gpt-4.1-mini';
  const prompt = [
    'Rédige un email professionnel en français pour la comptabilité.',
    'Contexte: transmission d un justificatif de dépense CB Pro.',
    'Le texte doit être clair, court, poli, sans markdown.',
    'Inclure explicitement les champs: Date / type / HT / Taxe / TTC.',
    '',
    `Fournisseur: ${args.vendor}`,
    `Date: ${args.invoiceDate || 'N/A'}`,
    `Type: ${args.expenseType}`,
    `HT: ${args.amountHt.toFixed(2)} EUR`,
    `Taxe: ${args.amountTax.toFixed(2)} EUR`,
    `TTC: ${args.amountTtc.toFixed(2)} EUR`,
    `Numero facture: ${args.invoiceNumber || 'N/A'}`,
  ].join('\n');

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: 'Tu rédiges des emails pro en français. Réponse texte brut uniquement.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
    });

    const content =
      response?.output?.[0]?.content?.[0]?.text ||
      response?.output_text ||
      '';

    const clean = String(content).trim();
    if (clean.length > 20) return clean.slice(0, 2400);
    return '';
  } catch {
    return '';
  }
}

function generateExpenseEmailHTML({
  aiBody,
  vendor,
  amountHt,
  amountTax,
  amountTtc,
  expenseType,
  invoiceNumber,
  invoiceDate,
}: Omit<SendExpenseEmailParams, 'to' | 'photoUrl' | 'userId'> & { aiBody: string }) {
  const fallbackBody = [
    'Bonjour,',
    '',
    'Veuillez trouver ci-joint le justificatif d une depense effectuee avec la carte bancaire professionnelle.',
    '',
    `Date: ${invoiceDate ? new Date(invoiceDate).toLocaleDateString('fr-FR') : 'N/A'}`,
    `Type: ${expenseType}`,
    `HT: ${amountHt.toFixed(2)} EUR`,
    `Taxe: ${amountTax.toFixed(2)} EUR`,
    `TTC: ${amountTtc.toFixed(2)} EUR`,
    invoiceNumber ? `Numero facture: ${invoiceNumber}` : '',
    `Fournisseur: ${vendor}`,
    '',
    'Merci.',
  ]
    .filter(Boolean)
    .join('<br>');

  const aiBodyHtml = aiBody
    ? aiBody
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('<br>')
    : fallbackBody;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
          .content { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .details { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 10px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Justificatif de dépense CB Pro</h1>
          </div>

          <div class="content">
            <p>${aiBodyHtml}</p>
            
            <div class="details">
              <strong>Fournisseur:</strong> ${vendor}<br>
              <strong>Date:</strong> ${invoiceDate ? new Date(invoiceDate).toLocaleDateString('fr-FR') : 'N/A'}<br>
              <strong>Type:</strong> ${expenseType}<br>
              <strong>Montant HT:</strong> ${amountHt.toFixed(2)} €<br>
              <strong>Taxe:</strong> ${amountTax.toFixed(2)} €<br>
              <strong>Montant TTC:</strong> ${amountTtc.toFixed(2)} €<br>
              ${invoiceNumber ? `<strong>N° Facture:</strong> ${invoiceNumber}<br>` : ''}
            </div>
          </div>

          <div class="footer">
            <p>Cet email a été généré automatiquement par Control Center</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
