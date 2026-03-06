import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendExpenseEmailParams {
  to: string;
  vendor: string;
  amount: number;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  photoUrl?: string;
}

/**
 * Envoie une facture CB Pro par email via Resend
 */
export async function sendExpenseEmail({
  to,
  vendor,
  amount,
  invoiceNumber,
  invoiceDate,
  photoUrl,
}: SendExpenseEmailParams) {
  try {
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@meetsync-ai.com',
      to,
      subject: `Facture - ${vendor}`,
      html: generateExpenseEmailHTML({
        vendor,
        amount,
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

function generateExpenseEmailHTML({
  vendor,
  amount,
  invoiceNumber,
  invoiceDate,
}: Omit<SendExpenseEmailParams, 'to' | 'photoUrl'>) {
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
            <p>Bonjour,</p>
            <p>Veuillez trouver ci-joint le justificatif d'une dépense effectuée avec la carte bancaire professionnelle.</p>
            
            <div class="details">
              <strong>Fournisseur:</strong> ${vendor}<br>
              <strong>Montant TTC:</strong> ${amount.toFixed(2)} €<br>
              ${invoiceNumber ? `<strong>N° Facture:</strong> ${invoiceNumber}<br>` : ''}
              ${invoiceDate ? `<strong>Date:</strong> ${new Date(invoiceDate).toLocaleDateString('fr-FR')}<br>` : ''}
            </div>

            <p>Je vous en souhaite bonne réception.</p>
            <p>Cordialement,<br>
            <strong>FM</strong></p>
          </div>

          <div class="footer">
            <p>Cet email a été généré automatiquement par Control Center</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
