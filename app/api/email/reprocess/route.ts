import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import {
  analyzeInboundEmailWithAi,
  generateReplySuggestionWithAi,
} from '@/lib/email/assistantService';
import {
  buildEmailBehaviorInstructions,
  canPrepareReply,
  loadUserEmailAiSettings,
  loadUserRecipientEmails,
  resolveRecipientRole,
} from '@/lib/email/userEmailAiSettings';

type ReprocessPayload = {
  since?: string;
  limit?: number;
  dryRun?: boolean;
  regenerateDrafts?: boolean;
  mode?: 'full' | 'routing_only';
};

type DbMessage = {
  id: string;
  sender_email: string | null;
  sender_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  received_at: string | null;
  ai_action: string | null;
  ai_summary: string | null;
  ai_confidence: number | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_reasoning: string | null;
  ai_tags: string[] | null;
  response_status: string | null;
};

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as ReprocessPayload;
  const since = String(payload.since || '').trim();
  const dryRun = Boolean(payload.dryRun);
  const regenerateDrafts = payload.regenerateDrafts !== false;
  const mode = payload.mode === 'routing_only' ? 'routing_only' : 'full';
  const limit = Math.min(Math.max(Number(payload.limit || 500), 1), 2000);

  const supabase = getSupabaseAdminClient();
  const [userEmails, emailAiSettings] = await Promise.all([
    loadUserRecipientEmails(userId),
    loadUserEmailAiSettings(userId),
  ]);

  let query = supabase
    .from('email_messages')
    .select('id,sender_email,sender_name,subject,body_text,body_html,to_emails,cc_emails,received_at,ai_action,ai_summary,ai_confidence,ai_category,ai_priority,ai_reasoning,ai_tags,response_status')
    .eq('user_id', userId)
    .eq('direction', 'inbound')
    .is('deleted_at', null)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (since) {
    query = query.gte('received_at', since);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = (data || []) as DbMessage[];
  const globalRules = buildEmailBehaviorInstructions(emailAiSettings);

  let processed = 0;
  let updated = 0;
  let reclassifiedToReply = 0;
  let reclassifiedToClasser = 0;
  let draftsGenerated = 0;
  let errors = 0;

  for (const message of messages) {
    processed += 1;

    try {
      const toEmails = normalizeEmails(message.to_emails);
      const ccEmails = normalizeEmails(message.cc_emails);
      const recipientRole = resolveRecipientRole({
        userEmails,
        toEmails,
        ccEmails,
      });

      const allowReplyByScope = canPrepareReply({
        replyScope: emailAiSettings.replyScope,
        recipientRole,
      });

      const body = String(message.body_text || message.body_html || '').trim();
      const receivedAt = String(message.received_at || '').trim() || null;

      const triage =
        mode === 'full'
          ? await analyzeInboundEmailWithAi({
              userId,
              subject: String(message.subject || ''),
              body,
              senderEmail: String(message.sender_email || ''),
              to: toEmails,
              cc: ccEmails,
              userEmail: userEmails[0] || '',
              globalRules,
              receivedAt,
            })
          : null;

      const currentAction = String(message.ai_action || '').trim();
      const suggestedAction = triage?.action || (currentAction === 'repondre' ? 'repondre' : 'classer');
      const finalAction: 'repondre' | 'classer' =
        allowReplyByScope && suggestedAction === 'repondre' ? 'repondre' : 'classer';

      const previousAction = currentAction === 'repondre' ? 'repondre' : 'classer';
      if (previousAction !== finalAction) {
        if (finalAction === 'repondre') reclassifiedToReply += 1;
        else reclassifiedToClasser += 1;
      }

      const currentResponseStatus = String(message.response_status || 'none');
      const isAlreadySent = currentResponseStatus === 'sent';

      let responseStatus = currentResponseStatus;
      let responseRequired = finalAction === 'repondre' && !isAlreadySent;
      let archived = finalAction === 'classer';

      if (isAlreadySent) {
        responseRequired = false;
        archived = true;
      }

      if (finalAction === 'classer' && !isAlreadySent) {
        responseStatus = 'none';
      }

      if (finalAction === 'repondre' && !isAlreadySent && responseStatus === 'none') {
        responseStatus = regenerateDrafts ? 'draft_ready' : 'none';
      }

      if (!dryRun && finalAction === 'repondre' && !isAlreadySent && regenerateDrafts) {
        const suggestion = await generateReplySuggestionWithAi({
          userId,
          senderEmail: String(message.sender_email || ''),
          senderName: String(message.sender_name || ''),
          originalSubject: String(message.subject || ''),
          originalBody: body,
          summary: triage?.summary || message.ai_summary || '',
          tone: 'professionnel',
          globalRules,
          signature: emailAiSettings.signature,
        });

        const { data: lastDraft } = await supabase
          .from('email_reply_drafts')
          .select('version')
          .eq('message_id', message.id)
          .eq('user_id', userId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextVersion = Number(lastDraft?.version || 0) + 1;

        await supabase
          .from('email_reply_drafts')
          .update({ is_current: false })
          .eq('message_id', message.id)
          .eq('user_id', userId)
          .eq('is_current', true);

        const { error: draftError } = await supabase
          .from('email_reply_drafts')
          .insert({
            message_id: message.id,
            user_id: userId,
            version: nextVersion,
            is_current: true,
            tone: 'professionnel',
            language: 'fr',
            proposed_subject: suggestion.subject,
            proposed_body: suggestion.body,
            ai_model: 'gpt-4.1-mini',
            ai_confidence: suggestion.confidence,
            edited_by_user: false,
          });

        if (!draftError) {
          draftsGenerated += 1;
          responseStatus = 'draft_ready';
          responseRequired = true;
        }
      }

      if (!dryRun) {
        const updatePayload: Record<string, unknown> = {
          ai_action: finalAction,
          response_required: responseRequired,
          response_status: responseStatus,
          archived,
          ai_status: 'analyzed',
        };

        if (triage) {
          updatePayload.ai_summary = triage.summary;
          updatePayload.ai_confidence = triage.confidence;
          updatePayload.ai_category = triage.category;
          updatePayload.ai_priority = triage.priority;
          updatePayload.ai_tags = triage.tags;
          updatePayload.ai_reasoning = triage.reasoning;
        }

        const { error: updateError } = await supabase
          .from('email_messages')
          .update(updatePayload)
          .eq('id', message.id)
          .eq('user_id', userId);

        if (!updateError) {
          updated += 1;
        } else {
          errors += 1;
          continue;
        }

        await supabase.from('email_processing_logs').insert({
          user_id: userId,
          message_id: message.id,
          event_type: 'email_reprocessed',
          level: 'info',
          message: `Reprocessing ${mode} termine`,
          payload: {
            recipient_role: recipientRole,
            final_action: finalAction,
            response_status: responseStatus,
            archived,
            dry_run: dryRun,
          },
        });
      }
    } catch {
      errors += 1;
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    mode,
    limit,
    since: since || null,
    processed,
    updated,
    reclassified_to_reply: reclassifiedToReply,
    reclassified_to_classer: reclassifiedToClasser,
    drafts_generated: draftsGenerated,
    errors,
  });
}

function normalizeEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(entry))
    )
  );
}
