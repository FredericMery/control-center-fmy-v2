import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';
import type { MailContext } from '@/types/mail';

type TransferPreview = {
  recipient_email: string;
  recipient_name: string;
  subject: string;
  message: string;
  task_title: string;
  task_type: MailContext;
  task_deadline: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const { id } = await params;

  const { data: mail, error: mailError } = await supabase
    .from('mail_items')
    .select('id,context,subject,summary,action_note,due_date,sender_name,sender_email,received_at,scan_file_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (mailError || !mail) {
    return NextResponse.json({ error: 'Courrier introuvable' }, { status: 404 });
  }

  const senderEmail = normalizeEmail(mail.sender_email);
  const senderName = normalizeText(mail.sender_name);

  const { data: historyRows } = await supabase
    .from('email_messages')
    .select('subject,response_status,received_at,sender_email')
    .eq('user_id', userId)
    .not('sender_email', 'is', null)
    .order('received_at', { ascending: false })
    .limit(30);

  const senderHistory = (historyRows || []).filter(
    (row) => normalizeEmail(row.sender_email) === senderEmail
  );

  const fallbackRecipient =
    senderEmail ||
    normalizeEmail((historyRows || []).map((row) => row.sender_email).find(Boolean)) ||
    '';

  const fallback: TransferPreview = {
    recipient_email: fallbackRecipient,
    recipient_name: senderName,
    subject: buildFallbackSubject(mail.subject),
    message: buildFallbackMessage({
      subject: mail.subject,
      summary: mail.summary,
      actionNote: mail.action_note,
    }),
    task_title: buildFallbackTaskTitle(mail.subject, mail.action_note),
    task_type: mail.context === 'perso' ? 'perso' : 'pro',
    task_deadline: normalizeDate(mail.due_date),
  };

  if (!fallbackRecipient) {
    return NextResponse.json({ preview: fallback });
  }

  const historySnippet = senderHistory
    .slice(0, 8)
    .map((row) => {
      const subject = normalizeText(row.subject) || 'Sans objet';
      const status = normalizeText(row.response_status) || 'none';
      const at = normalizeText(row.received_at) || 'unknown';
      return `- ${subject} | status=${status} | date=${at}`;
    })
    .join('\n');

  const prompt = [
    'Tu aides une direction a transferer un courrier scanne a la bonne personne.',
    'Retourne STRICTEMENT un JSON valide avec les champs suivants:',
    '{',
    '  "recipient_email": "email destinataire",',
    '  "recipient_name": "nom destinataire (optionnel)",',
    '  "subject": "objet email de transfert",',
    '  "message": "message professionnel en francais, clair et court",',
    '  "task_title": "titre de tache actionnable",',
    '  "task_type": "pro|perso",',
    '  "task_deadline": "YYYY-MM-DD ou null"',
    '}',
    '',
    'Contraintes:',
    '- Pas de markdown.',
    '- Message directement envoyable.',
    '- Si un champ est incertain, garder une valeur raisonnable.',
    '',
    `courrier_context: ${mail.context === 'perso' ? 'perso' : 'pro'}`,
    `courrier_subject: ${normalizeText(mail.subject)}`,
    `courrier_summary: ${normalizeText(mail.summary)}`,
    `courrier_action_note: ${normalizeText(mail.action_note)}`,
    `courrier_due_date: ${normalizeDate(mail.due_date) || 'null'}`,
    `sender_name: ${senderName}`,
    `sender_email: ${senderEmail}`,
    `fallback_recipient_email: ${fallback.recipient_email}`,
    `fallback_recipient_name: ${fallback.recipient_name}`,
    senderHistory.length
      ? `historique_emails_avec_ce_contact:\n${historySnippet}`
      : 'historique_emails_avec_ce_contact: aucun',
  ].join('\n');

  try {
    const response = await callOpenAi({
      userId,
      service: 'responses',
      model: 'gpt-4.1-mini',
      body: {
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'Tu renvoies uniquement un JSON strict.' },
          { role: 'user', content: prompt },
        ],
        text: { format: { type: 'json_object' } },
      },
    });

    const raw =
      response?.output?.[0]?.content?.[0]?.text ||
      response?.output_text ||
      '{}';

    const parsed = JSON.parse(raw) as Partial<TransferPreview>;

    const preview: TransferPreview = {
      recipient_email: normalizeEmail(parsed.recipient_email) || fallback.recipient_email,
      recipient_name: normalizeText(parsed.recipient_name) || fallback.recipient_name,
      subject: normalizeText(parsed.subject) || fallback.subject,
      message: normalizeText(parsed.message) || fallback.message,
      task_title: normalizeText(parsed.task_title) || fallback.task_title,
      task_type: parsed.task_type === 'perso' ? 'perso' : fallback.task_type,
      task_deadline: normalizeDate(parsed.task_deadline) || fallback.task_deadline,
    };

    return NextResponse.json({ preview });
  } catch {
    return NextResponse.json({ preview: fallback });
  }
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value: unknown): string {
  const email = normalizeText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizeDate(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (match) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildFallbackSubject(subject: unknown): string {
  const clean = normalizeText(subject);
  return clean ? `Transfert courrier - ${clean}` : 'Transfert courrier a traiter';
}

function buildFallbackTaskTitle(subject: unknown, actionNote: unknown): string {
  const action = normalizeText(actionNote);
  if (action) return `Traiter courrier: ${action}`.slice(0, 220);
  const cleanSubject = normalizeText(subject) || 'courrier recu';
  return `Traiter courrier: ${cleanSubject}`.slice(0, 220);
}

function buildFallbackMessage(args: {
  subject: unknown;
  summary: unknown;
  actionNote: unknown;
}): string {
  const summary = normalizeText(args.summary);
  const action = normalizeText(args.actionNote);
  const cleanSubject = normalizeText(args.subject) || 'courrier recu';

  return [
    'Bonjour,',
    '',
    `Je te transfere ce courrier concernant: ${cleanSubject}.`,
    summary ? `Resume: ${summary}` : '',
    action ? `Action demandee: ${action}` : 'Merci de le prendre en charge et de me faire un retour.',
    '',
    'Merci d avance.',
  ]
    .filter(Boolean)
    .join('\n');
}
