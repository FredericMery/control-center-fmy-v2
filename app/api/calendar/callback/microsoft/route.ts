import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeMicrosoftCodeForToken } from '@/lib/calendar/connectors/microsoft';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      return NextResponse.redirect(new URL('/dashboard/agenda/connecteurs?error=oauth_denied', request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/dashboard/agenda/connecteurs?error=oauth_invalid', request.url));
    }

    let payload: { userId: string; redirectPath?: string };
    try {
      payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return NextResponse.redirect(new URL('/dashboard/agenda/connecteurs?error=oauth_state', request.url));
    }

    if (!payload?.userId) {
      return NextResponse.redirect(new URL('/dashboard/agenda/connecteurs?error=oauth_state', request.url));
    }

    const tokens = await exchangeMicrosoftCodeForToken(code);

    const { data: existing, error: existingErr } = await supabase
      .from('calendar_sources')
      .select('id')
      .eq('user_id', payload.userId)
      .eq('provider', 'microsoft')
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('calendar_sources')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 0) * 1000).toISOString(),
          is_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', payload.userId);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: insertErr } = await supabase.from('calendar_sources').insert({
        user_id: payload.userId,
        provider: 'microsoft',
        label: 'Microsoft 365 Calendar',
        is_enabled: true,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 0) * 1000).toISOString(),
        metadata: {},
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    const redirectPath = payload.redirectPath || '/dashboard/agenda/connecteurs';
    return NextResponse.redirect(new URL(`${redirectPath}?connected=microsoft`, request.url));
  } catch {
    return NextResponse.redirect(new URL('/dashboard/agenda/connecteurs?error=oauth_callback', request.url));
  }
}
