import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { buildMailScansPdfAttachment } from '@/lib/mail/buildMailScansPdfAttachment';
import { MAIL_MAX_SCAN_FILES } from '@/types/mail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

type TransferSendPayload = {
  recipient_email?: string;
  recipient_name?: string;
  cc_emails?: string[] | string;
  subject?: string;
  message?: string;
  ai_baseline_subject?: string;
  ai_baseline_message?: string;
  task_title?: string;
  task_type?: 'pro' | 'perso';
  task_deadline?: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const { id } = await params;

  let body: TransferSendPayload;
  try {
    body = (await request.json()) as TransferSendPayload;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const recipientEmail = normalizeEmail(body.recipient_email);
  if (!recipientEmail) {
    return NextResponse.json({ error: 'Destinataire email invalide' }, { status: 400 });
  }

  const { data: mail, error: mailError } = await supabase
    .from('mail_items')
    .select('id,context,subject,summary,action_note,due_date,status,scan_url,scan_file_name,scan_urls,scan_file_names')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (mailError || !mail) {
    return NextResponse.json({ error: 'Courrier introuvable' }, { status: 404 });
  }

  const subject = normalizeText(body.subject) || buildDefaultSubject(mail.subject);
  const message = normalizeText(body.message) || buildDefaultMessage(mail.summary, mail.action_note);
  const aiBaselineSubject = normalizeText(body.ai_baseline_subject) || subject;
  const aiBaselineMessage = normalizeText(body.ai_baseline_message) || message;
  const taskTitle = normalizeText(body.task_title) || buildDefaultTaskTitle(mail.subject, mail.action_note);
  const taskType = body.task_type === 'perso' ? 'perso' : mail.context === 'perso' ? 'perso' : 'pro';
  const taskDeadline = normalizeDate(body.task_deadline) || normalizeDate(mail.due_date);
  const ccEmails = normalizeEmailList(body.cc_emails).filter((email) => email !== recipientEmail);

  const attachments = await buildAttachments(
    mail.scan_urls,
    mail.scan_file_names,
    mail.scan_url,
    mail.scan_file_name,
    mail.subject
  );

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY manquant' }, { status: 500 });
  }

  const from =
    String(process.env.RESEND_MAIL_FROM || '').trim() ||
    String(process.env.RESEND_EMAIL_ASSISTANT_FROM || '').trim() ||
    'Control Center <traitement@mail.meetsync-ai.com>';

  const to = recipientEmail;

  const sendPromise = resend.emails.send({
    from,
    to,
    cc: ccEmails.length > 0 ? ccEmails : undefined,
    subject,
    text: message,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const taskPromise = supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: taskTitle,
      type: taskType,
      status: 'todo',
      deadline: taskDeadline,
      archived: false,
    })
    .select('id,title,type,status,deadline,archived,created_at')
    .single();

  const [sendResult, taskResult] = await Promise.all([sendPromise, taskPromise]);

  if (sendResult.error) {
    return NextResponse.json(
      { error: sendResult.error.message || 'Erreur envoi email' },
      { status: 500 }
    );
  }

  if (taskResult.error) {
    return NextResponse.json({ error: taskResult.error.message || 'Erreur creation tache' }, { status: 500 });
  }

  await supabase
    .from('mail_items')
    .update({
      replied: true,
      replied_at: new Date().toISOString(),
      reply_note: `Transfere a ${recipientEmail} avec suivi tache ${taskResult.data?.id || ''}`.trim(),
      status: mail.status === 'recu' ? 'en_cours' : mail.status,
    })
    .eq('id', id)
    .eq('user_id', userId);

  const editedByUser = aiBaselineSubject !== subject || aiBaselineMessage !== message;
  await supabase.from('email_processing_logs').insert({
    user_id: userId,
    message_id: null,
    event_type: 'mail_transfer_sent',
    level: 'info',
    message: 'Transfert courrier envoye avec suivi',
    payload: {
      mail_item_id: id,
      recipient_email: recipientEmail,
      cc_emails: ccEmails,
      ai_baseline_subject: aiBaselineSubject,
      ai_baseline_body: aiBaselineMessage,
      final_subject: subject,
      final_body: message,
      edited_by_user: editedByUser,
      task_id: taskResult.data?.id || null,
      provider_message_id: String((sendResult.data as { id?: string } | null)?.id || ''),
    },
  });

  return NextResponse.json({
    success: true,
    task: taskResult.data,
    provider_message_id: String((sendResult.data as { id?: string } | null)?.id || ''),
  });
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value: unknown): string {
  const email = normalizeText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizeEmailList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((entry) => normalizeEmail(entry)).filter(Boolean))
    ).slice(0, 20);
  }

  const raw = String(value || '');
  if (!raw) return [];
  const matches = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((entry) => normalizeEmail(entry)).filter(Boolean))).slice(0, 20);
}

function normalizeDate(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildDefaultSubject(subject: unknown): string {
  const clean = normalizeText(subject);
  return clean ? `Transfert courrier - ${clean}` : 'Transfert courrier';
}

function buildDefaultTaskTitle(subject: unknown, actionNote: unknown): string {
  const action = normalizeText(actionNote);
  if (action) return `Suivi courrier: ${action}`.slice(0, 220);
  return `Suivi courrier: ${normalizeText(subject) || 'courrier recu'}`.slice(0, 220);
}

function buildDefaultMessage(summary: unknown, actionNote: unknown): string {
  const summaryText = normalizeText(summary);
  const actionText = normalizeText(actionNote);
  return [
    'Bonjour,',
    '',
    'Je te transfere ce courrier pour traitement.',
    summaryText ? `Resume: ${summaryText}` : '',
    actionText ? `Action attendue: ${actionText}` : '',
    '',
    'Merci de me tenir informe(e).',
  ]
    .filter(Boolean)
    .join('\n');
}

async function buildAttachments(
  scanUrls: unknown,
  scanFileNames: unknown,
  scanUrlFallback: unknown,
  scanFileNameFallback: unknown,
  subject: unknown
): Promise<Array<{ filename: string; content: string }>> {
  const urls = normalizeTextArray(scanUrls, scanUrlFallback);
  const names = normalizeTextArray(scanFileNames, scanFileNameFallback);
  const sources = urls
    .map((url, index) => ({
      url,
      name: names[index] || `courrier-scan-${index + 1}`,
    }))
    .filter((source) => Boolean(source.url));

  const pdfAttachment = await buildMailScansPdfAttachment({
    sources,
    subject: normalizeText(subject),
  });

  return pdfAttachment ? [pdfAttachment] : [];
}

function normalizeTextArray(value: unknown, fallback: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) => normalizeText(entry)).filter(Boolean))).slice(0, MAIL_MAX_SCAN_FILES);
  }
  const single = normalizeText(fallback);
  return single ? [single] : [];
}
