import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyProposalConfirmToken } from '@/lib/calendar/proposalsAutomation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const requestId = String(searchParams.get('requestId') || '').trim();
    const userId = String(searchParams.get('userId') || '').trim();
    const token = String(searchParams.get('token') || '').trim();

    if (!requestId || !userId || !token) {
      return NextResponse.json({ error: 'Parametres manquants' }, { status: 400 });
    }

    const secret = String(process.env.CALENDAR_PROPOSALS_CONFIRM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!secret) {
      return NextResponse.json({ error: 'CALENDAR_PROPOSALS_CONFIRM_SECRET manquant' }, { status: 500 });
    }

    const verification = verifyProposalConfirmToken({ token, requestId, userId, secret });
    if (!verification.ok) {
      return NextResponse.json({ error: `Token invalide: ${verification.reason}` }, { status: 401 });
    }

    const { data: schedulingRequest, error: requestError } = await supabase
      .from('scheduling_requests')
      .select('id, user_id, linked_event_id, workflow_status')
      .eq('id', requestId)
      .eq('user_id', userId)
      .maybeSingle();

    if (requestError) throw new Error(requestError.message);
    if (!schedulingRequest) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });

    await supabase
      .from('scheduling_requests')
      .update({
        status: 'confirmed',
        workflow_status: 'confirmed',
        progression: 100,
      })
      .eq('id', requestId)
      .eq('user_id', userId);

    if (schedulingRequest.linked_event_id) {
      await supabase
        .from('calendar_events')
        .update({
          status: 'confirmed',
          workflow_status: 'confirmed',
        })
        .eq('id', schedulingRequest.linked_event_id)
        .eq('user_id', userId);
    }

    await supabase.from('scheduling_actions_log').insert({
      user_id: userId,
      request_id: requestId,
      action_type: 'auto_confirm_email_click',
      result_status: 'ok',
      message: 'Confirmation automatique via lien email',
      action_payload: {
        confirmed_at: new Date().toISOString(),
      },
    });

    const redirectUrl = new URL('/dashboard/agenda/propositions?confirmed=1', request.url);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
