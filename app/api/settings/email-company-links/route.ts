import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EmailType = 'facture' | 'ndf';

function normalizeEmail(value: string) {
  return String(value || '')
    .trim()
    .replace(/^mailto:/i, '')
    .toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { data: links, error } = await supabase
      .from('email_company_links')
      .select('type, email, company_recipient_id')
      .eq('user_id', userId)
      .order('email', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Erreur chargement rattachements email/societe' }, { status: 500 });
    }

    const companyIds = uniqueStrings((links || []).map((link) => String(link.company_recipient_id || '')));
    let recipientNameById = new Map<string, string>();

    if (companyIds.length > 0) {
      const { data: recipients, error: recipientsError } = await supabase
        .from('expense_recipients')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', companyIds);

      if (recipientsError) {
        return NextResponse.json({ error: 'Erreur chargement societes rattachees' }, { status: 500 });
      }

      recipientNameById = new Map((recipients || []).map((recipient) => [recipient.id, recipient.name]));
    }

    return NextResponse.json({
      success: true,
      links: (links || []).map((link) => ({
        type: link.type as EmailType,
        email: normalizeEmail(link.email),
        companyRecipientId: String(link.company_recipient_id),
        companyName: recipientNameById.get(String(link.company_recipient_id)) || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as {
      type?: EmailType;
      links?: Array<{ email?: string; companyRecipientIds?: string[] }>;
    };

    const type = body.type;
    if (!type || !['facture', 'ndf'].includes(type)) {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 });
    }

    const links = Array.isArray(body.links) ? body.links : [];
    const normalizedLinks = links
      .map((link) => ({
        email: normalizeEmail(String(link.email || '')),
        companyRecipientIds: uniqueStrings((link.companyRecipientIds || []).map((id) => String(id || '').trim())),
      }))
      .filter((link) => link.email);

    const invalidEmail = normalizedLinks.find((link) => !isValidEmail(link.email));
    if (invalidEmail) {
      return NextResponse.json({ error: `Email invalide: ${invalidEmail.email}` }, { status: 400 });
    }

    const companyIds = uniqueStrings(
      normalizedLinks.flatMap((link) => link.companyRecipientIds)
    );

    if (companyIds.length > 0) {
      const { data: recipients, error: recipientsError } = await supabase
        .from('expense_recipients')
        .select('id')
        .eq('user_id', userId)
        .in('id', companyIds);

      if (recipientsError) {
        return NextResponse.json({ error: 'Erreur validation societes' }, { status: 500 });
      }

      const validIds = new Set((recipients || []).map((recipient) => String(recipient.id)));
      const invalidCompanyId = companyIds.find((id) => !validIds.has(id));
      if (invalidCompanyId) {
        return NextResponse.json({ error: 'Societe invalide dans les rattachements' }, { status: 400 });
      }
    }

    const deleteResult = await supabase
      .from('email_company_links')
      .delete()
      .eq('user_id', userId)
      .eq('type', type);

    if (deleteResult.error) {
      return NextResponse.json({ error: 'Erreur suppression anciens rattachements' }, { status: 500 });
    }

    const rowsToInsert = normalizedLinks.flatMap((link) =>
      link.companyRecipientIds.map((companyRecipientId) => ({
        user_id: userId,
        type,
        email: link.email,
        company_recipient_id: companyRecipientId,
      }))
    );

    if (rowsToInsert.length > 0) {
      const insertResult = await supabase.from('email_company_links').insert(rowsToInsert);
      if (insertResult.error) {
        return NextResponse.json({ error: 'Erreur sauvegarde rattachements email/societe' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Rattachements email/societe mis a jour',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}