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

    const { data: setting } = await supabase
      .from('email_settings')
      .select('email')
      .eq('user_id', userId)
      .eq('type', 'facture')
      .maybeSingle();

    const recipientEmail = String(setting?.email || '').trim();
    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'Aucun email facture configure dans les settings' },
        { status: 400 }
      );
    }

    await sendExpenseEmail({
      userId,
      to: recipientEmail,
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
