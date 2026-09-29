import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';
import { generateReplySuggestionWithAi } from '@/lib/email/assistantService';
import {
  buildEmailBehaviorInstructions,
  canPrepareReply,
  loadUserEmailAiSettings,
  loadUserRecipientEmails,
  resolveRecipientRole,
} from '@/lib/email/userEmailAiSettings';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { id } = await params;
  const requestBody = (await request.json().catch(() => ({}))) as {
    draft_subject?: unknown;
    draft_body?: unknown;
  };
  const supabase = getSupabaseAdminClient();

  const { data: message, error: messageError } = await supabase
    .from('email_messages')
    .select('id,subject,body_text,body_html,sender_email,sender_name,received_at,ai_summary,to_emails,cc_emails')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (messageError || !message) {
    return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
  }

  const senderEmail = normalizeText(message.sender_email);
  const senderName = normalizeText(message.sender_name);
  const senderLabel = senderName || senderEmail || 'expediteur inconnu';

  const generated = await generateTaskActionFromEmail({
    userId,
    senderLabel,
    senderEmail,
    subject: normalizeText(message.subject),
    summary: normalizeText(message.ai_summary),
    body: truncate(normalizeText(message.body_text || message.body_html || ''), 6000),
    receivedAt: normalizeText(message.received_at),
  });

  const baseTitle = generated.actionTitle || buildFallbackActionTitle(normalizeText(message.subject));
  const linkedTitle = appendSenderToTaskTitle(baseTitle, senderLabel);
  const finalTitle = addEmailSourceToken(linkedTitle, id);
  const deadline = resolveTaskDeadline(generated.deadlineIso, message.received_at);

  const { data: task, error: insertError } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: finalTitle,
      type: 'pro',
      status: 'todo',
      archived: false,
      deadline,
    })
    .select('id,title,type,status,deadline,archived,created_at')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const draft = await ensureProposedReplyDraft({
    supabase,
    userId,
    messageId: id,
    message,
    providedSubject: String(requestBody?.draft_subject ?? '').trim(),
    providedBody: String(requestBody?.draft_body ?? '').trim(),
  });

  await supabase
    .from('email_messages')
    .update({
      archived: true,
      response_required: false,
      response_status: 'task_created',
      ai_action: 'classer',
    })
    .eq('id', id)
    .eq('user_id', userId);

  await supabase
    .from('email_processing_logs')
    .insert({
      user_id: userId,
      message_id: id,
      event_type: 'task_created_from_email',
      level: 'info',
      message: 'Tache pro creee depuis le module email assistant',
      payload: {
        task_id: task?.id || null,
        task_title: finalTitle,
        sender_email: senderEmail || null,
        sender_name: senderName || null,
        action_note: generated.actionNote,
        draft_id: draft?.id || null,
      },
    });

  return NextResponse.json({
    success: true,
    task,
    draft,
    generated: {
      action_note: generated.actionNote,
      sender: senderLabel,
    },
  });
}

type ProposedReplyDraft = {
  id: string;
  proposed_subject: string | null;
  proposed_body: string;
};

async function ensureProposedReplyDraft(args: {
  supabase: ReturnType<typeof getSupabaseAdminClient>;
  userId: string;
  messageId: string;
  message: {
    subject: unknown;
    body_text: unknown;
    body_html: unknown;
    sender_email: unknown;
    sender_name: unknown;
    ai_summary: unknown;
    to_emails: unknown;
    cc_emails: unknown;
  };
  providedSubject: string;
  providedBody: string;
}): Promise<ProposedReplyDraft | null> {
  const { supabase, userId, messageId, message, providedSubject, providedBody } = args;
  const draftColumns = 'id,proposed_subject,proposed_body';

  try {
    const { data: currentDraft } = await supabase
      .from('email_reply_drafts')
      .select('id,version,proposed_subject,proposed_body')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentDraft && providedBody) {
      const unchanged =
        String(currentDraft.proposed_body || '') === providedBody &&
        String(currentDraft.proposed_subject || '') === providedSubject;
      if (unchanged) return currentDraft as ProposedReplyDraft;

      const { data: updated } = await supabase
        .from('email_reply_drafts')
        .update({
          proposed_subject: providedSubject || currentDraft.proposed_subject || null,
          proposed_body: providedBody,
          edited_by_user: true,
        })
        .eq('id', currentDraft.id)
        .eq('user_id', userId)
        .select(draftColumns)
        .single();
      return (updated as ProposedReplyDraft | null) || (currentDraft as ProposedReplyDraft);
    }

    if (currentDraft) return currentDraft as ProposedReplyDraft;

    let subject = providedSubject;
    let body = providedBody;
    let confidence: number | null = null;
    let editedByUser = Boolean(providedBody);

    if (!body) {
      const [userEmails, emailAiSettings] = await Promise.all([
        loadUserRecipientEmails(userId),
        loadUserEmailAiSettings(userId),
      ]);
      const recipientRole = resolveRecipientRole({
        userEmails,
        toEmails: Array.isArray(message.to_emails) ? (message.to_emails as string[]) : [],
        ccEmails: Array.isArray(message.cc_emails) ? (message.cc_emails as string[]) : [],
      });
      if (!canPrepareReply({ replyScope: emailAiSettings.replyScope, recipientRole })) {
        return null;
      }

      const reply = await generateReplySuggestionWithAi({
        userId,
        senderEmail: String(message.sender_email || ''),
        senderName: String(message.sender_name || ''),
        originalSubject: String(message.subject || ''),
        originalBody: String(message.body_text || message.body_html || ''),
        summary: String(message.ai_summary || ''),
        tone: 'professionnel',
        globalRules: buildEmailBehaviorInstructions(emailAiSettings),
        signature: emailAiSettings.signature,
      });
      subject = reply.subject;
      body = reply.body;
      confidence = reply.confidence;
      editedByUser = false;
    }

    if (!String(body || '').trim()) return null;

    const { data: lastDraft } = await supabase
      .from('email_reply_drafts')
      .select('version')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: inserted } = await supabase
      .from('email_reply_drafts')
      .insert({
        message_id: messageId,
        user_id: userId,
        version: Number(lastDraft?.version || 0) + 1,
        is_current: true,
        tone: 'professionnel',
        language: 'fr',
        proposed_subject: subject || null,
        proposed_body: body,
        ai_model: editedByUser ? null : 'gpt-4.1-mini',
        ai_confidence: confidence,
        edited_by_user: editedByUser,
      })
      .select(draftColumns)
      .single();

    return (inserted as ProposedReplyDraft | null) || null;
  } catch (error) {
    console.error('email task draft fallback', error);
    return null;
  }
}

type GeneratedTaskAction = {
  actionTitle: string;
  actionNote: string;
  deadlineIso: string | null;
};

async function generateTaskActionFromEmail(args: {
  userId: string;
  senderLabel: string;
  senderEmail: string;
  subject: string;
  summary: string;
  body: string;
  receivedAt: string;
}): Promise<GeneratedTaskAction> {
  try {
    const model = 'gpt-4.1-mini';
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'Tu transformes un email professionnel en tache actionnable.',
              'Retourne STRICTEMENT un JSON valide.',
              'Format attendu: {"action_title":"...","action_note":"...","deadline_iso":"YYYY-MM-DD ou null"}',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `Expediteur: ${args.senderLabel}`,
              `Email expediteur: ${args.senderEmail || 'inconnu'}`,
              `Date reception: ${args.receivedAt || 'inconnue'}`,
              `Objet: ${args.subject || '(sans objet)'}`,
              `Resume IA: ${args.summary || 'aucun'}`,
              `Contenu: ${args.body || 'vide'}`,
              '',
              'Consignes:',
              '- action_title: une action claire et courte en francais (max 130 chars), imperative si possible.',
              '- action_note: une phrase qui dit exactement ce qu il faut faire et avec qui.',
              '- deadline_iso: uniquement si une date explicite existe, sinon null.',
            ].join('\n'),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = JSON.parse(content) as {
      action_title?: unknown;
      action_note?: unknown;
      deadline_iso?: unknown;
    };

    return {
      actionTitle: truncate(normalizeText(parsed.action_title), 130),
      actionNote: truncate(normalizeText(parsed.action_note), 500),
      deadlineIso: normalizeIsoDate(parsed.deadline_iso),
    };
  } catch (error) {
    console.error('email task generation fallback', error);
    return {
      actionTitle: '',
      actionNote: '',
      deadlineIso: null,
    };
  }
}

function appendSenderToTaskTitle(baseTitle: string, sender: string): string {
  const cleanBase = truncate(normalizeText(baseTitle) || 'Traiter cet email', 150);
  const cleanSender = truncate(normalizeText(sender) || 'expediteur inconnu', 80);
  return truncate(`${cleanBase} - ${cleanSender}`, 180);
}

function buildFallbackActionTitle(subject: string): string {
  const cleanSubject = normalizeText(subject).replace(/^\s*(re|fwd?|tr)\s*:\s*/i, '').trim();
  if (cleanSubject) return truncate(`Traiter: ${cleanSubject}`, 130);
  return 'Traiter cet email';
}

function addEmailSourceToken(title: string, emailId: string): string {
  const cleanTitle = truncate(normalizeText(title), 180);
  const cleanId = normalizeText(emailId);
  if (!cleanId) return cleanTitle;
  return truncate(`${cleanTitle} [email:${cleanId}]`, 220);
}

function resolveTaskDeadline(inferredIso: string | null, receivedAt: unknown): string {
  if (inferredIso) {
    return new Date(`${inferredIso}T23:59:59.000Z`).toISOString();
  }

  const baseDate = parseInputDate(receivedAt) || new Date();
  const fallback = new Date(baseDate);
  fallback.setUTCDate(fallback.getUTCDate() + 5);
  fallback.setUTCHours(23, 59, 59, 0);
  return fallback.toISOString();
}

function parseInputDate(value: unknown): Date | null {
  if (!value) return null;
  const candidate = new Date(String(value));
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate;
}

function normalizeIsoDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  const normalized = String(value || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}
