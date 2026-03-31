import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { sendExpenseEmail } from '@/lib/email/resendService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as { expenseId?: string };
    const expenseId = String(body.expenseId || '').trim();

    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId requis' }, { status: 400 });
    }

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select(
        'id, user_id, payment_method, invoice_number, invoice_date, vendor, amount_ht, amount_tva, amount_ttc, category, photo_url, description'
      )
      .eq('id', expenseId)
      .eq('user_id', userId)
      .maybeSingle();

    if (expenseError || !expense) {
      return NextResponse.json({ error: 'Depense introuvable' }, { status: 404 });
    }

    if (expense.payment_method !== 'cb_pro') {
      return NextResponse.json(
        { error: 'Renvoi email disponible uniquement pour CB Pro' },
        { status: 400 }
      );
    }

    const markerRecipientName = extractContextMarker(String(expense.description || ''), 'Destinataire nom');
    const markerRecipientDestination = extractContextMarker(String(expense.description || ''), 'Destinataire');
    const recipientEmails = await resolveFactureRecipientEmails({
      userId,
      recipientName: markerRecipientName,
      recipientDestination: markerRecipientDestination,
    });

    if (recipientEmails.length === 0) {
      return NextResponse.json(
        { error: 'Aucun email facture configure (societe ou reglage global)' },
        { status: 400 }
      );
    }

    await sendExpenseEmail({
      userId,
      to: recipientEmails.join(', '),
      vendor: expense.vendor || 'Fournisseur',
      amountHt: Number(expense.amount_ht || 0),
      amountTax: Number(expense.amount_tva || 0),
      amountTtc: Number(expense.amount_ttc || 0),
      expenseType: expense.category || 'autre',
      invoiceNumber: expense.invoice_number || undefined,
      invoiceDate: expense.invoice_date || undefined,
      photoUrl: expense.photo_url || undefined,
    });

    const updatedDescription = upsertEmailSentMarker(String(expense.description || ''), true);

    await supabase
      .from('expenses')
      .update({ description: updatedDescription })
      .eq('id', expense.id)
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      message: 'Email renvoye avec succes',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function upsertEmailSentMarker(description: string, sent: boolean): string {
  const marker = `EMAIL_SENT=${sent ? 'true' : 'false'}`;
  const cleaned = description.replace(/EMAIL_SENT=(true|false)/i, '').trim();
  if (!cleaned) return marker;
  return `${cleaned} | ${marker}`.slice(0, 255);
}

function extractContextMarker(description: string, marker: string): string {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedMarker}=([^|]+)`, 'i');
  const match = String(description || '').match(regex);
  return String(match?.[1] || '').trim();
}

async function resolveFactureRecipientEmails(args: {
  userId: string;
  recipientName: string;
  recipientDestination: string;
}): Promise<string[]> {
  const companyRecipientId = await resolveCompanyRecipientId({
    userId: args.userId,
    recipientName: args.recipientName,
    recipientDestination: args.recipientDestination,
  });

  if (companyRecipientId) {
    const { data: links } = await supabase
      .from('email_company_links')
      .select('email')
      .eq('user_id', args.userId)
      .eq('type', 'facture')
      .eq('company_recipient_id', companyRecipientId);

    const linkedEmails = normalizeEmailList((links || []).map((link) => String(link.email || '')).join(', '));
    if (linkedEmails.length > 0) {
      return linkedEmails;
    }
  }

  const { data: setting } = await supabase
    .from('email_settings')
    .select('email')
    .eq('user_id', args.userId)
    .eq('type', 'facture')
    .maybeSingle();

  return normalizeEmailList(String(setting?.email || ''));
}

async function resolveCompanyRecipientId(args: {
  userId: string;
  recipientName: string;
  recipientDestination: string;
}): Promise<string | null> {
  const name = String(args.recipientName || '').trim();
  if (!name) return null;

  let query = supabase
    .from('expense_recipients')
    .select('id, name, destination')
    .eq('user_id', args.userId)
    .ilike('name', name)
    .limit(5);

  const destination = String(args.recipientDestination || '').trim();
  if (destination) {
    query = query.ilike('destination', destination);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return null;

  const exact = rows.find((row) => {
    const sameName = String(row.name || '').trim().toLowerCase() === name.toLowerCase();
    const rowDestination = String(row.destination || '').trim().toLowerCase();
    if (!destination) return sameName;
    return sameName && rowDestination === destination.toLowerCase();
  });

  return String((exact || rows[0]).id || '') || null;
}

function normalizeEmailList(raw: string): string[] {
  const entries = String(raw || '')
    .split(/[;,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));

  return Array.from(new Set(entries));
}
