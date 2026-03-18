import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildProposalConfirmToken, normalizeRecipientEmails, sendProposalRelanceEmail } from '@/lib/calendar/proposalsAutomation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isCronAuthorized(request: NextRequest): boolean {
  const cronHeader = request.headers.get('x-vercel-cron');
  if (cronHeader === '1') return true;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return Boolean(process.env.CALENDAR_PROPOSALS_CRON_SECRET && token === process.env.CALENDAR_PROPOSALS_CRON_SECRET);
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 });
    }

    const secret = String(process.env.CALENDAR_PROPOSALS_CONFIRM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!secret) {
      return NextResponse.json({ error: 'CALENDAR_PROPOSALS_CONFIRM_SECRET manquant' }, { status: 500 });
    }

    const limit = Number(new URL(request.url).searchParams.get('limit') || '200');
    const batchLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200;

    const nowIso = new Date().toISOString();
    const { data: requests, error: requestsError } = await supabase
      .from('scheduling_requests')
      .select('id, user_id, request_text, requested_attendees, selected_slot, linked_event_id, workflow_status, first_sent_at')
      .eq('proposal_mode', 'proposal')
      .in('workflow_status', ['sent', 'relanced'])
      .not('next_relance_at', 'is', null)
      .lte('next_relance_at', nowIso)
      .order('next_relance_at', { ascending: true })
      .limit(batchLimit);

    if (requestsError) throw new Error(requestsError.message);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;

    const report = {
      total: Number(requests?.length || 0),
      processed: 0,
      sent: 0,
      confirmed: 0,
      failed: 0,
      details: [] as Array<{ requestId: string; userId: string; status: 'sent' | 'confirmed' | 'skipped' | 'failed'; message: string }>,
    };

    for (const row of requests || []) {
      const requestId = String(row.id);
      const userId = String(row.user_id);

      try {
        const recipients = normalizeRecipientEmails(row.requested_attendees);
        if (recipients.length === 0) {
          report.failed += 1;
          report.details.push({
            requestId,
            userId,
            status: 'failed',
            message: 'Aucun destinataire valide',
          });
          continue;
        }

        const expiresAtMs = Date.now() + 14 * 24 * 60 * 60 * 1000;
        const token = buildProposalConfirmToken({
          requestId,
          userId,
          expiresAtMs,
          secret,
        });

        const confirmUrl = `${baseUrl}/api/calendar/proposals/confirm?requestId=${encodeURIComponent(requestId)}&userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;

        await sendProposalRelanceEmail({
          to: recipients,
          title: String(row.request_text || 'Rendez-vous'),
          selectedSlot: (row.selected_slot || {}) as { startAt?: string; endAt?: string },
          confirmUrl,
        });

        const nextRelance = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        await supabase
          .from('scheduling_requests')
          .update({
            workflow_status: 'relanced',
            progression: 75,
            first_sent_at: row.first_sent_at || new Date().toISOString(),
            last_relance_at: new Date().toISOString(),
            next_relance_at: nextRelance,
          })
          .eq('id', requestId)
          .eq('user_id', userId);

        if (row.linked_event_id) {
          await supabase
            .from('calendar_events')
            .update({ workflow_status: 'relance_sent' })
            .eq('id', row.linked_event_id)
            .eq('user_id', userId);
        }

        await supabase.from('scheduling_actions_log').insert({
          user_id: userId,
          request_id: requestId,
          action_type: 'auto_relance_email',
          result_status: 'ok',
          message: `Relance automatique envoyee a ${recipients.length} participant(s)`,
          action_payload: {
            triggered_at: new Date().toISOString(),
            recipients_count: recipients.length,
          },
        });

        report.processed += 1;
        report.sent += 1;
        report.details.push({
          requestId,
          userId,
          status: 'sent',
          message: `Relance envoyee (${recipients.length} destinataire(s))`,
        });
      } catch (error) {
        report.failed += 1;
        report.details.push({
          requestId,
          userId,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
