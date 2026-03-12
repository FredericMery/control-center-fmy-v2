import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type NdfProfileResponse = {
  validatorFirstName: string;
  validatorLastName: string;
  companyRecipientId: string | null;
  companyName: string | null;
  companyDestination: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('user_ndf_settings')
      .select('validator_first_name, validator_last_name, company_recipient_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Erreur chargement profil NDF' }, { status: 500 });
    }

    let companyName: string | null = null;
    let companyDestination: string | null = null;

    if (profile?.company_recipient_id) {
      const { data: company } = await supabase
        .from('expense_recipients')
        .select('name, destination')
        .eq('id', profile.company_recipient_id)
        .eq('user_id', userId)
        .maybeSingle();

      companyName = company?.name || null;
      companyDestination = company?.destination || null;
    }

    const payload: NdfProfileResponse = {
      validatorFirstName: String(profile?.validator_first_name || ''),
      validatorLastName: String(profile?.validator_last_name || ''),
      companyRecipientId: profile?.company_recipient_id || null,
      companyName,
      companyDestination,
    };

    return NextResponse.json({ success: true, profile: payload });
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
      validatorFirstName?: string;
      validatorLastName?: string;
      companyRecipientId?: string | null;
    };

    const validatorFirstName = String(body.validatorFirstName || '').trim().slice(0, 120);
    const validatorLastName = String(body.validatorLastName || '').trim().slice(0, 120);
    const companyRecipientId = body.companyRecipientId ? String(body.companyRecipientId).trim() : null;

    if (!validatorFirstName || !validatorLastName) {
      return NextResponse.json(
        { error: 'Nom et prenom du valideur requis' },
        { status: 400 }
      );
    }

    if (companyRecipientId) {
      const { data: company, error: companyError } = await supabase
        .from('expense_recipients')
        .select('id')
        .eq('id', companyRecipientId)
        .eq('user_id', userId)
        .maybeSingle();

      if (companyError || !company) {
        return NextResponse.json(
          { error: 'Entreprise selectionnee invalide' },
          { status: 400 }
        );
      }
    }

    const result = await supabase
      .from('user_ndf_settings')
      .upsert(
        {
          user_id: userId,
          validator_first_name: validatorFirstName,
          validator_last_name: validatorLastName,
          company_recipient_id: companyRecipientId,
        },
        { onConflict: 'user_id' }
      )
      .select('validator_first_name, validator_last_name, company_recipient_id')
      .single();

    if (result.error) {
      return NextResponse.json({ error: 'Erreur sauvegarde profil NDF' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Profil NDF mis a jour',
      profile: {
        validatorFirstName: result.data.validator_first_name,
        validatorLastName: result.data.validator_last_name,
        companyRecipientId: result.data.company_recipient_id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
