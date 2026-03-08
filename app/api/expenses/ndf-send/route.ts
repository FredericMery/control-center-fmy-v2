import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { buildAttachmentFromUrl } from '@/lib/email/resendService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 });
    }

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as {
      month?: number;
      year?: number;
      email?: string;
      subject?: string;
      bodyText?: string;
    };

    const now = new Date();
    const month = Number(body.month || now.getMonth() + 1);
    const year = Number(body.year || now.getFullYear());
    const toEmail = String(body.email || '').trim();
    const subject = String(body.subject || `Note de frais ${String(month).padStart(2, '0')}/${year}`).trim();
    const bodyText = String(body.bodyText || '').trim();

    if (!toEmail || !isEmail(toEmail)) {
      return NextResponse.json({ error: 'Adresse email destinataire invalide' }, { status: 400 });
    }

    const { start, end } = getMonthRange(year, month);

    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('id, invoice_number, invoice_date, vendor, amount_ht, amount_tva, amount_ttc, category, photo_url, status, created_at')
      .eq('user_id', userId)
      .eq('payment_method', 'cb_perso')
      .gte('created_at', start)
      .lte('created_at', end)
      .in('status', ['pending_ndf', 'pending'])
      .order('created_at', { ascending: true });

    if (expensesError) {
      return NextResponse.json({ error: 'Erreur recuperation depenses CB Perso' }, { status: 500 });
    }

    const rows = expenses || [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucune depense CB Perso pour cette periode' }, { status: 400 });
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.totalHt += Number(row.amount_ht || 0);
        acc.totalTax += Number(row.amount_tva || 0);
        acc.totalTtc += Number(row.amount_ttc || 0);
        return acc;
      },
      { totalHt: 0, totalTax: 0, totalTtc: 0 }
    );

    const pdfBytes = await buildNdfPdf({ month, year, expenses: rows, totals });
    const pdfFileName = `ndf_${year}_${String(month).padStart(2, '0')}_${Date.now()}.pdf`;
    const pdfStoragePath = `ndf-reports/${pdfFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(pdfStoragePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Erreur creation PDF NDF' }, { status: 500 });
    }

    const {
      data: { publicUrl: pdfUrl },
    } = supabase.storage.from('expense-receipts').getPublicUrl(pdfStoragePath);

    const { data: reportRow } = await supabase
      .from('ndf_reports')
      .select('id')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (reportRow?.id) {
      await supabase
        .from('ndf_reports')
        .update({
          total_ht: totals.totalHt,
          total_tva: totals.totalTax,
          total_ttc: totals.totalTtc,
          status: 'submitted',
          pdf_url: pdfStoragePath,
        })
        .eq('id', reportRow.id);
    } else {
      await supabase.from('ndf_reports').insert({
        user_id: userId,
        month,
        year,
        total_ht: totals.totalHt,
        total_tva: totals.totalTax,
        total_ttc: totals.totalTtc,
        status: 'submitted',
        pdf_url: pdfStoragePath,
      });
    }

    await supabase
      .from('expenses')
      .update({ status: 'submitted' })
      .in('id', rows.map((row) => row.id));

    const photoRows = rows.filter((row) => row.photo_url);
    const photoAttachments = await Promise.all(
      photoRows.map((row, index) => buildAttachmentFromUrl(String(row.photo_url), `justificatif_${index + 1}`))
    );

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@meetsync-ai.com',
        to: toEmail,
        subject,
        html: mailboxStyleHtml({ bodyText, month, year, totals, count: rows.length }),
        attachments: [
          {
            filename: `NDF_${String(month).padStart(2, '0')}_${year}.pdf`,
            content: Buffer.from(pdfBytes),
          },
          ...photoAttachments,
        ],
      });
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : 'Erreur envoi mail NDF';
      return NextResponse.json({ error: `Envoi email NDF echoue: ${message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'NDF envoyee par email',
      pdfUrl,
      totals,
      count: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const end = `${new Date(year, month, 0).toISOString().slice(0, 10)}T23:59:59.999Z`;
  return { start, end };
}

async function buildNdfPdf(args: {
  month: number;
  year: number;
  expenses: Array<{
    invoice_date: string | null;
    vendor: string | null;
    category: string | null;
    amount_ttc: number | null;
  }>;
  totals: {
    totalHt: number;
    totalTax: number;
    totalTtc: number;
  };
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, x: number, y: number, size = 10, isBold = false) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
  };

  draw(`NOTE DE FRAIS ${String(args.month).padStart(2, '0')}/${args.year}`, 40, 555, 18, true);
  draw(`Total HT: ${args.totals.totalHt.toFixed(2)} EUR`, 40, 530, 11);
  draw(`Total Taxe: ${args.totals.totalTax.toFixed(2)} EUR`, 250, 530, 11);
  draw(`Total TTC: ${args.totals.totalTtc.toFixed(2)} EUR`, 460, 530, 11, true);

  let y = 500;
  draw('Date', 40, y, 10, true);
  draw('Fournisseur', 130, y, 10, true);
  draw('Categorie', 380, y, 10, true);
  draw('TTC', 680, y, 10, true);

  y -= 18;
  args.expenses.slice(0, 22).forEach((row) => {
    const date = row.invoice_date || '-';
    const vendor = String(row.vendor || '-').slice(0, 35);
    const category = String(row.category || '-').slice(0, 24);
    const ttc = Number(row.amount_ttc || 0).toFixed(2);

    draw(date, 40, y, 9);
    draw(vendor, 130, y, 9);
    draw(category, 380, y, 9);
    draw(`${ttc} EUR`, 670, y, 9);
    y -= 16;
  });

  if (args.expenses.length > 22) {
    draw(`... ${args.expenses.length - 22} ligne(s) supplementaire(s) non affichee(s)`, 40, y - 8, 9);
  }

  return await doc.save();
}

function mailboxStyleHtml(args: {
  bodyText: string;
  month: number;
  year: number;
  totals: { totalHt: number; totalTax: number; totalTtc: number };
  count: number;
}) {
  const content = (args.bodyText || '').replace(/\n/g, '<br>');

  return `
    <div style="font-family: Arial, sans-serif; background:#f3f4f6; padding:24px;">
      <div style="max-width:760px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#fafafa;">
          <div style="font-size:12px;color:#6b7280;">Boite d envoi</div>
          <div style="margin-top:4px;font-size:15px;font-weight:600;color:#111827;">Note de frais ${String(args.month).padStart(2, '0')}/${args.year}</div>
        </div>
        <div style="padding:16px 18px;font-size:14px;color:#111827;line-height:1.6;">
          ${content}
          <div style="margin-top:14px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
            <div>Total HT: ${args.totals.totalHt.toFixed(2)} EUR</div>
            <div>Total Taxe: ${args.totals.totalTax.toFixed(2)} EUR</div>
            <div><strong>Total TTC: ${args.totals.totalTtc.toFixed(2)} EUR</strong></div>
            <div>Justificatifs: ${args.count}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}
