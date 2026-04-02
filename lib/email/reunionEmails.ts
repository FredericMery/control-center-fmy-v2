import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function getSender() {
  return (
    String(process.env.EMAIL_FROM || process.env.RESEND_FROM || '').trim() ||
    'Control Center <noreply@meetsync-ai.com>'
  );
}

function normalizeRecipients(value: string[] | string) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[;,]/);
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

export async function sendMeetingSummaryEmail(args: {
  to: string[] | string;
  meetingTitle: string;
  meetingDateIso: string;
  summary: string;
  decisions: string[];
  actions: Array<{ title: string; assigned_to?: string | null; deadline?: string | null }>;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY manquant');
  }

  const recipients = normalizeRecipients(args.to);
  if (recipients.length === 0) return null;

  const decisionsHtml = args.decisions.length > 0
    ? `<ul>${args.decisions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>Aucune decision explicite detectee.</p>';

  const actionsHtml = args.actions.length > 0
    ? `<ul>${args.actions
        .map((action) => `<li><strong>${escapeHtml(action.title)}</strong> - ${escapeHtml(action.assigned_to || 'A assigner')} ${action.deadline ? `(deadline: ${escapeHtml(action.deadline)})` : ''}</li>`)
        .join('')}</ul>`
    : '<p>Aucune action detectee.</p>';

  return resend.emails.send({
    from: getSender(),
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject: `Compte-rendu reunion: ${args.meetingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:680px;margin:auto;">
        <h2 style="margin-bottom:4px;">${escapeHtml(args.meetingTitle)}</h2>
        <p style="color:#6b7280;margin-top:0;">${new Date(args.meetingDateIso).toLocaleString('fr-FR')}</p>
        <h3>Resume executif</h3>
        <p>${escapeHtml(args.summary || 'Resume indisponible')}</p>
        <h3>Decisions</h3>
        ${decisionsHtml}
        <h3>Actions</h3>
        ${actionsHtml}
      </div>
    `,
  });
}

export async function sendMeetingReminderEmail(args: {
  to: string[] | string;
  subjectLabel: string;
  message: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY manquant');
  }

  const recipients = normalizeRecipients(args.to);
  if (recipients.length === 0) return null;

  return resend.emails.send({
    from: getSender(),
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject: `Rappel actions reunion - ${args.subjectLabel}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:680px;margin:auto;">
        <h2>Rappel intelligent</h2>
        <p>${escapeHtml(args.message)}</p>
      </div>
    `,
  });
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
