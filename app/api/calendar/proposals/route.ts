import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildProposalConfirmToken, normalizeRecipientEmails, sendProposalRelanceEmail } from '@/lib/calendar/proposalsAutomation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('scheduling_requests')
      .select('id, request_text, status, workflow_status, progression, proposal_mode, target_event_type, first_sent_at, last_relance_at, next_relance_at, created_at, updated_at')
      .eq('user_id', userId)
      .in('workflow_status', ['created', 'sent', 'relanced', 'confirmed'])
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    return NextResponse.json({ proposals: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const requestId = String(body?.requestId || '').trim();
    if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 });

    const now = new Date();
    const nextRelance = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const { data: current, error: currentError } = await supabase
      .from('scheduling_requests')
      .select('id, user_id, request_text, requested_attendees, selected_slot, linked_event_id, first_sent_at')
      .eq('id', requestId)
      .eq('user_id', userId)
      .maybeSingle();

    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 });

    const recipients = normalizeRecipientEmails(current.requested_attendees);
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Aucun participant email valide pour relancer' }, { status: 400 });
    }

    const secret = String(process.env.CALENDAR_PROPOSALS_CONFIRM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!secret) {
      return NextResponse.json({ error: 'CALENDAR_PROPOSALS_CONFIRM_SECRET manquant' }, { status: 500 });
    }

    const expiresAtMs = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const token = buildProposalConfirmToken({
      requestId,
      userId,
      expiresAtMs,
      secret,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;
    const confirmUrl = `${baseUrl}/api/calendar/proposals/confirm?requestId=${encodeURIComponent(requestId)}&userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

    await sendProposalRelanceEmail({
      to: recipients,
      title: String(current.request_text || 'Rendez-vous'),
      selectedSlot: (current.selected_slot || {}) as { startAt?: string; endAt?: string },
      confirmUrl,
    });

    const { data, error } = await supabase
      .from('scheduling_requests')
      .update({
        workflow_status: 'relanced',
        progression: 75,
        first_sent_at: current.first_sent_at || now.toISOString(),
        last_relance_at: now.toISOString(),
        next_relance_at: nextRelance.toISOString(),
      })
      .eq('id', requestId)
      .eq('user_id', userId)
      .select('id, workflow_status, progression, last_relance_at, next_relance_at')
      .single();

    if (error) throw new Error(error.message);

    if (current.linked_event_id) {
      await supabase
        .from('calendar_events')
        .update({ workflow_status: 'relance_sent' })
        .eq('id', current.linked_event_id)
        .eq('user_id', userId);
    }

    await supabase.from('scheduling_actions_log').insert({
      user_id: userId,
      request_id: requestId,
      action_type: 'relance',
      result_status: 'ok',
      message: `Relance manuelle envoyee a ${recipients.length} participant(s)`,
      action_payload: {
        triggered_at: now.toISOString(),
        recipients_count: recipients.length,
        confirm_url: confirmUrl,
      },
    });

    return NextResponse.json({ ok: true, proposal: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
