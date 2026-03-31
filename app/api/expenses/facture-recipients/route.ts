import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const recipientId = String(request.nextUrl.searchParams.get('recipientId') || '').trim();
    const recipientName = String(request.nextUrl.searchParams.get('recipientName') || '').trim();
    const recipientDestination = String(request.nextUrl.searchParams.get('recipientDestination') || '').trim();

    const companyRecipientId = await resolveCompanyRecipientId({
      userId,
      recipientId,
      recipientName,
      recipientDestination,
    });

    let linkedEmails: string[] = [];
    if (companyRecipientId) {
      const { data: links, error: linksError } = await supabase
        .from('email_company_links')
        .select('email')
        .eq('user_id', userId)
        .eq('type', 'facture')
        .eq('company_recipient_id', companyRecipientId);

      if (linksError) {
        return NextResponse.json({ error: linksError.message }, { status: 500 });
      }

      linkedEmails = normalizeEmailList((links || []).map((link) => String(link.email || '')).join(', '));
    }

    const { data: setting, error: settingError } = await supabase
      .from('email_settings')
      .select('email')
      .eq('user_id', userId)
      .eq('type', 'facture')
      .maybeSingle();

    if (settingError) {
      return NextResponse.json({ error: settingError.message }, { status: 500 });
    }

    const globalEmails = normalizeEmailList(String(setting?.email || ''));

    const recipients = linkedEmails.length > 0 ? linkedEmails : globalEmails;
    const source = linkedEmails.length > 0 ? 'company_links' : globalEmails.length > 0 ? 'global' : 'none';

    return NextResponse.json({
      success: true,
      source,
      recipients,
      linkedEmails,
      globalEmails,
      companyRecipientId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function resolveCompanyRecipientId(args: {
  userId: string;
  recipientId: string;
  recipientName: string;
  recipientDestination: string;
}): Promise<string | null> {
  const directId = String(args.recipientId || '').trim();
  if (directId) {
    const { data: row } = await supabase
      .from('expense_recipients')
      .select('id')
      .eq('user_id', args.userId)
      .eq('id', directId)
      .maybeSingle();

    if (row?.id) return String(row.id);
  }

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
