import { createHmac, timingSafeEqual } from 'crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

type SelectedSlot = {
  startAt?: string;
  endAt?: string;
};

export function normalizeRecipientEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const emails = input
    .map((item) => {
      if (typeof item === 'string') return item.trim().toLowerCase();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return String(record.email || '').trim().toLowerCase();
      }
      return '';
    })
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));

  return [...new Set(emails)];
}

export function buildProposalConfirmToken(args: {
  requestId: string;
  userId: string;
  expiresAtMs: number;
  secret: string;
}): string {
  const payload = `${args.requestId}.${args.userId}.${args.expiresAtMs}`;
  const signature = createHmac('sha256', args.secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifyProposalConfirmToken(args: {
  token: string;
  requestId: string;
  userId: string;
  secret: string;
}): { ok: true } | { ok: false; reason: string } {
  const parts = String(args.token || '').split('.');
  if (parts.length !== 4) return { ok: false, reason: 'invalid-token-format' };

  const [tokenRequestId, tokenUserId, expiresAtRaw, signature] = parts;
  const expiresAtMs = Number(expiresAtRaw || 0);

  if (!tokenRequestId || !tokenUserId || !signature || !Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: 'invalid-token-parts' };
  }

  if (tokenRequestId !== args.requestId || tokenUserId !== args.userId) {
    return { ok: false, reason: 'token-mismatch' };
  }

  if (Date.now() > expiresAtMs) {
    return { ok: false, reason: 'token-expired' };
  }

  const payload = `${tokenRequestId}.${tokenUserId}.${expiresAtMs}`;
  const expected = createHmac('sha256', args.secret).update(payload).digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) {
    return { ok: false, reason: 'invalid-signature-length' };
  }

  const valid = timingSafeEqual(expectedBuffer, providedBuffer);
  return valid ? { ok: true } : { ok: false, reason: 'invalid-signature' };
}

function formatSlot(selectedSlot: SelectedSlot): string {
  if (!selectedSlot.startAt || !selectedSlot.endAt) return 'Créneau proposé';
  const start = new Date(selectedSlot.startAt);
  const end = new Date(selectedSlot.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Créneau proposé';

  return `${start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })} · ${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export async function sendProposalRelanceEmail(args: {
  to: string[];
  title: string;
  selectedSlot: SelectedSlot;
  confirmUrl: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY manquant');
  }

  if (!Array.isArray(args.to) || args.to.length === 0) {
    throw new Error('Aucun destinataire valide pour la relance');
  }

  const fromAddress =
    String(process.env.EMAIL_FROM || process.env.RESEND_FROM || '').trim() ||
    'Control Center <noreply@meetsync-ai.com>';

  const slotText = formatSlot(args.selectedSlot);

  await resend.emails.send({
    from: fromAddress,
    to: args.to.length === 1 ? args.to[0] : args.to,
    subject: `Relance réunion: ${args.title}`,
    text: [
      'Bonjour,',
      '',
      `Relance automatique concernant la réunion: ${args.title}`,
      `Créneau: ${slotText}`,
      '',
      'Merci de confirmer votre disponibilité en cliquant sur ce lien:',
      args.confirmUrl,
      '',
      'Ce lien expire dans 14 jours.',
    ].join('\n'),
  });
}
