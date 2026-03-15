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

type ExpenseRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  category: string | null;
  photo_url: string | null;
  status: string;
  created_at: string;
};

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
      expenseIds?: string[];
      reimbursedFullName?: string;
      companyName?: string;
      companyDestination?: string;
    };

    const now = new Date();
    const month = Number(body.month || now.getMonth() + 1);
    const year = Number(body.year || now.getFullYear());
    const providedEmail = String(body.email || '').trim();
    const providedCompanyName = String(body.companyName || '').trim();
    const providedCompanyDestination = String(body.companyDestination || '').trim();
    const subject = String(body.subject || `Note de frais ${String(month).padStart(2, '0')}/${year}`).trim();
    const bodyText = String(body.bodyText || '').trim();
    const reimbursedFullName = String(body.reimbursedFullName || '').trim().slice(0, 120);
    const selectedExpenseIds = Array.isArray(body.expenseIds)
      ? body.expenseIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!reimbursedFullName) {
      return NextResponse.json({ error: 'Nom et prenom de la personne remboursee requis' }, { status: 400 });
    }

    const { start, end } = getMonthRange(year, month);

    let expensesQuery = supabase
      .from('expenses')
      .select('id, invoice_number, invoice_date, vendor, amount_ht, amount_tva, amount_ttc, category, photo_url, status, created_at')
      .eq('user_id', userId)
      .eq('payment_method', 'cb_perso')
      .gte('created_at', start)
      .lte('created_at', end)
      .in('status', ['pending_ndf', 'pending'])
      .order('created_at', { ascending: true });

    if (selectedExpenseIds.length > 0) {
      expensesQuery = expensesQuery.in('id', selectedExpenseIds);
    }

    const { data: expenses, error: expensesError } = await expensesQuery;

    if (expensesError) {
      return NextResponse.json({ error: 'Erreur recuperation depenses CB Perso' }, { status: 500 });
    }

    const rows: ExpenseRow[] = expenses || [];
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

    const { data: ndfProfile } = await supabase
      .from('user_ndf_settings')
      .select('validator_first_name, validator_last_name, company_recipient_id')
      .eq('user_id', userId)
      .maybeSingle();

    const company = await resolveCompanyForNdf(
      userId,
      providedCompanyName,
      providedCompanyDestination,
      ndfProfile?.company_recipient_id || null
    );

    const linkedRecipients = company?.id
      ? await getCompanyLinkedNdfEmails(userId, company.id)
      : [];
    const fallbackRecipients = await getGlobalNdfEmails(userId);
    const recipientEmails = normalizeRecipientList(
      providedEmail || linkedRecipients.join(', ') || fallbackRecipients.join(', ')
    );
    if (recipientEmails.length === 0) {
      return NextResponse.json(
        { error: 'Aucune adresse email NDF valide configuree' },
        { status: 400 }
      );
    }

    const validatorFullName = `${String(ndfProfile?.validator_first_name || '').trim()} ${String(
      ndfProfile?.validator_last_name || ''
    ).trim()}`.trim();

    const pdfBytes = await buildNdfPdf({
      month,
      year,
      expenses: rows,
      totals,
      reimbursedFullName,
      validatorFullName,
      companyName: company?.name || '',
      companyDestination: company?.destination || '',
    });
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
        to: recipientEmails.length === 1 ? recipientEmails[0] : recipientEmails,
        subject,
        html: mailboxStyleHtml({
          bodyText,
          month,
          year,
          totals,
          count: rows.length,
          reimbursedFullName,
          validatorFullName,
          companyName: company?.name || '',
        }),
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

async function getGlobalNdfEmails(userId: string): Promise<string[]> {
  const { data: setting } = await supabase
    .from('email_settings')
    .select('email')
    .eq('user_id', userId)
    .eq('type', 'ndf')
    .maybeSingle();

  return normalizeRecipientList(String(setting?.email || '').trim());
}

async function getCompanyLinkedNdfEmails(userId: string, companyRecipientId: string): Promise<string[]> {
  const { data: links } = await supabase
    .from('email_company_links')
    .select('email')
    .eq('user_id', userId)
    .eq('type', 'ndf')
    .eq('company_recipient_id', companyRecipientId);

  return normalizeRecipientList((links || []).map((link) => String(link.email || '')).join(', '));
}

async function resolveCompanyForNdf(
  userId: string,
  companyName: string,
  companyDestination: string,
  fallbackCompanyRecipientId: string | null
): Promise<{ id: string; name: string; destination: string } | null> {
  if (companyName) {
    let query = supabase
      .from('expense_recipients')
      .select('id, name, destination')
      .eq('user_id', userId)
      .eq('name', companyName)
      .limit(1);

    if (companyDestination) {
      query = query.eq('destination', companyDestination);
    }

    const { data: rows } = await query;
    if (rows && rows.length > 0) {
      return rows[0];
    }
  }

  if (fallbackCompanyRecipientId) {
    const { data: companyRow } = await supabase
      .from('expense_recipients')
      .select('id, name, destination')
      .eq('id', fallbackCompanyRecipientId)
      .eq('user_id', userId)
      .maybeSingle();
    return companyRow || null;
  }

  return null;
}

function normalizeRecipientList(raw: string): string[] {
  const entries = String(raw || '')
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const validEntries = entries.filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
  const unique = new Set<string>();
  const out: string[] = [];

  for (const email of validEntries) {
    const key = email.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    out.push(email);
  }

  return out;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const end = `${new Date(year, month, 0).toISOString().slice(0, 10)}T23:59:59.999Z`;
  return { start, end };
}

async function buildNdfPdf(args: {
  month: number;
  year: number;
  expenses: ExpenseRow[];
  totals: {
    totalHt: number;
    totalTax: number;
    totalTtc: number;
  };
  reimbursedFullName: string;
  validatorFullName: string;
  companyName: string;
  companyDestination: string;
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
  draw(`Personne remboursee: ${args.reimbursedFullName}`, 40, 535, 11);
  draw(`Valideur: ${args.validatorFullName || '-'}`, 40, 520, 11);
  draw(`Entreprise: ${args.companyName || '-'}`, 360, 535, 11);
  draw(`Contact entreprise: ${args.companyDestination || '-'}`, 360, 520, 9);
  draw(`Total HT: ${args.totals.totalHt.toFixed(2)} EUR`, 40, 500, 11);
  draw(`Total Taxe: ${args.totals.totalTax.toFixed(2)} EUR`, 280, 500, 11);
  draw(`Total TTC: ${args.totals.totalTtc.toFixed(2)} EUR`, 520, 500, 11, true);

  let y = 475;
  draw('Ligne', 40, y, 9, true);
  draw('No facture', 80, y, 9, true);
  draw('Raison', 180, y, 9, true);
  draw('Fournisseur', 320, y, 9, true);
  draw('HT', 520, y, 9, true);
  draw('Taxe', 590, y, 9, true);
  draw('TTC', 680, y, 9, true);

  y -= 18;
  args.expenses.slice(0, 22).forEach((row, index) => {
    const lineNo = String(index + 1);
    const invoiceNumber = String(row.invoice_number || '-').slice(0, 16);
    const reason = String(row.category || '-').slice(0, 22);
    const vendor = String(row.vendor || '-').slice(0, 35);
    const ht = Number(row.amount_ht || 0).toFixed(2);
    const tax = Number(row.amount_tva || 0).toFixed(2);
    const ttc = Number(row.amount_ttc || 0).toFixed(2);

    draw(lineNo, 40, y, 9);
    draw(invoiceNumber, 80, y, 9);
    draw(reason, 180, y, 9);
    draw(vendor, 320, y, 9);
    draw(ht, 520, y, 9);
    draw(tax, 590, y, 9);
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
  reimbursedFullName: string;
  validatorFullName: string;
  companyName: string;
}) {
  const content = escapeHtml(args.bodyText || '').replace(/\n/g, '<br>');

  return `
    <div style="font-family: Arial, sans-serif; background:#f3f4f6; padding:24px;">
      <div style="max-width:760px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#fafafa;">
          <div style="font-size:12px;color:#6b7280;">Boite d envoi</div>
          <div style="margin-top:4px;font-size:15px;font-weight:600;color:#111827;">Note de frais ${String(args.month).padStart(2, '0')}/${args.year}</div>
          <div style="margin-top:4px;font-size:12px;color:#334155;">Personne remboursee: ${escapeHtml(args.reimbursedFullName)}</div>
          <div style="margin-top:2px;font-size:12px;color:#334155;">Valideur: ${escapeHtml(args.validatorFullName || '-')}</div>
          <div style="margin-top:2px;font-size:12px;color:#334155;">Entreprise: ${escapeHtml(args.companyName || '-')}</div>
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

function escapeHtml(value: string) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
