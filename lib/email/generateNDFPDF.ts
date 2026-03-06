/**
 * Génère un PDF pour la Note de Frais
 * Format: HTML2PDF client-side ou serveur via pdfkit
 */

export interface NDFExpense {
  invoice_number?: string;
  invoice_date?: string;
  vendor: string;
  amount_ht: number;
  amount_tva: number;
  amount_ttc: number;
  category: string;
}

export interface NDFReportData {
  reportId: string;
  month: string;
  year: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  expenses: NDFExpense[];
  employee: string;
  createdAt: string;
}

/**
 * Génère le HTML pour le PDF NDF
 */
export function generateNDFHTML(data: NDFReportData): string {
  const expenseRows = data.expenses
    .map(
      (exp) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">
        ${exp.invoice_date ? new Date(exp.invoice_date).toLocaleDateString('fr-FR') : 'N/A'}
      </td>
      <td style="border: 1px solid #ddd; padding: 10px;">${exp.vendor}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: center;">
        ${exp.invoice_number || '-'}
      </td>
      <td style="border: 1px solid #ddd; padding: 10px;">${exp.category}</td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">
        ${exp.amount_ht.toFixed(2)} €
      </td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">
        ${exp.amount_tva.toFixed(2)} €
      </td>
      <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">
        ${exp.amount_ttc.toFixed(2)} €
      </td>
    </tr>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Note de Frais - ${data.month} ${data.year}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
          line-height: 1.6;
          padding: 40px;
          background: #fff;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 20px;
        }
        .header h1 {
          font-size: 28px;
          color: #667eea;
          margin-bottom: 10px;
        }
        .header p {
          font-size: 14px;
          color: #666;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
        }
        .info-item {
          font-size: 14px;
        }
        .info-item strong {
          color: #667eea;
          display: block;
          margin-bottom: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        table th {
          background: #667eea;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border: 1px solid #ddd;
        }
        table td {
          border: 1px solid #ddd;
          padding: 10px;
        }
        table tr:nth-child(even) {
          background: #f9f9f9;
        }
        .totals {
          display: flex;
          justify-content: flex-end;
          gap: 40px;
          margin-bottom: 40px;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }
        .total-item {
          text-align: right;
        }
        .total-item label {
          display: block;
          font-weight: 600;
          color: #667eea;
          margin-bottom: 5px;
        }
        .total-item value {
          display: block;
          font-size: 20px;
          font-weight: 700;
          color: #333;
        }
        .signature {
          margin-top: 50px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        .signature-block {
          border-top: 1px solid #999;
          padding-top: 10px;
          text-align: center;
          font-size: 12px;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          color: #999;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>NOTE DE FRAIS</h1>
          <p>${data.month} ${data.year}</p>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <strong>Salarié:</strong>
            ${data.employee}
          </div>
          <div class="info-item">
            <strong>Période:</strong>
            ${data.month} ${data.year}
          </div>
          <div class="info-item">
            <strong>Date de création:</strong>
            ${new Date(data.createdAt).toLocaleDateString('fr-FR')}
          </div>
          <div class="info-item">
            <strong>N° Rapport:</strong>
            ${data.reportId.substring(0, 8).toUpperCase()}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Fournisseur</th>
              <th>N° Facture</th>
              <th>Catégorie</th>
              <th>HT</th>
              <th>TVA</th>
              <th>TTC</th>
            </tr>
          </thead>
          <tbody>
            ${expenseRows}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-item">
            <label>Total HT:</label>
            <value>${data.total_ht.toFixed(2)} €</value>
          </div>
          <div class="total-item">
            <label>Total TVA:</label>
            <value>${data.total_tva.toFixed(2)} €</value>
          </div>
          <div class="total-item">
            <label>Total TTC:</label>
            <value>${data.total_ttc.toFixed(2)} €</value>
          </div>
        </div>

        <div class="signature">
          <div class="signature-block">
            Signature du salarié
            <br><br><br>
          </div>
          <div class="signature-block">
            Visa de la direction
            <br><br><br>
          </div>
        </div>

        <div class="footer">
          <p>Document généré automatiquement par Control Center • ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Convertit HTML en Base64 pour téléchargement côté client
 * (Alternative: utiliser une librairie comme pdfkit côté serveur)
 */
export function getHtmlAsDataUrl(html: string): string {
  const encoded = encodeURIComponent(html);
  return `data:text/html;charset=utf-8,${encoded}`;
}
