import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { PLAN_DEFINITIONS, type SubscriptionPlan } from '@/lib/subscription/plans';
import {
  FULL_ACCESS_FEATURES,
  isFullAccessUser,
} from '@/lib/subscription/accessControl';

function isValidPlan(plan: string): plan is SubscriptionPlan {
  return plan === 'BASIC' || plan === 'PLUS' || plan === 'PRO';
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();

    if (isFullAccessUser(userId)) {
      const { data: privileged, error: privilegedError } = await supabase
        .from('user_subscriptions')
        .upsert(
          {
            user_id: userId,
            plan: 'PRO',
            price: 0,
            features: FULL_ACCESS_FEATURES,
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .single();

      if (privilegedError) {
        return NextResponse.json({ error: privilegedError.message }, { status: 500 });
      }

      return NextResponse.json({ subscription: privileged, plans: PLAN_DEFINITIONS });
    }

    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      const defaultPlan = PLAN_DEFINITIONS.BASIC;
      const { data: inserted, error: insertError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan: defaultPlan.plan,
          price: defaultPlan.price,
          features: defaultPlan.features,
        })
        .select('*')
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ subscription: inserted, plans: PLAN_DEFINITIONS });
    }

    return NextResponse.json({ subscription: data, plans: PLAN_DEFINITIONS });
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

    const body = await request.json();
    const requestedPlan = String(body?.plan || '').toUpperCase();

    const supabase = getSupabaseAdminClient();

    if (isFullAccessUser(userId)) {
      const { data: forced, error: forcedError } = await supabase
        .from('user_subscriptions')
        .upsert(
          {
            user_id: userId,
            plan: 'PRO',
            price: 0,
            features: FULL_ACCESS_FEATURES,
          },
          { onConflict: 'user_id' }
        )
        .select('*')
        .single();

      if (forcedError) {
        return NextResponse.json({ error: forcedError.message }, { status: 500 });
      }

      return NextResponse.json({ subscription: forced, lockedByAdmin: true });
    }

    let plan: SubscriptionPlan = 'BASIC';
    let price = PLAN_DEFINITIONS.BASIC.price;
    let features = PLAN_DEFINITIONS.BASIC.features;

    if (isValidPlan(requestedPlan)) {
      const base = PLAN_DEFINITIONS[requestedPlan];
      plan = base.plan;
      price = Number(body?.price ?? base.price);
      features = {
        ...base.features,
        ...(body?.features && typeof body.features === 'object' ? body.features : {}),
      };
    } else if (body?.features && typeof body.features === 'object') {
      // Optional custom mode if the user only toggles modules.
      const current = await supabase
        .from('user_subscriptions')
        .select('plan, price, features')
        .eq('user_id', userId)
        .single();

      if (current.data) {
        plan = isValidPlan(current.data.plan) ? current.data.plan : 'BASIC';
        price = Number(body?.price ?? current.data.price ?? PLAN_DEFINITIONS[plan].price);
        features = {
          ...PLAN_DEFINITIONS[plan].features,
          ...(current.data.features || {}),
          ...body.features,
        };
      }
    } else {
      return NextResponse.json({ error: 'plan ou features requis' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          plan,
          price,
          features,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ subscription: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
