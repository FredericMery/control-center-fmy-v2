import { Resend } from 'resend';
import { callOpenAi } from '@/lib/ai/client';
import type { EmailReplySuggestion, EmailTriageResult } from '@/types/emailAssistant';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function analyzeInboundEmailWithAi(args: {
  userId: string;
  subject: string;
  body: string;
  senderEmail: string;
  to: string[];
  cc: string[];
  userEmail?: string;
  globalRules?: string;
  receivedAt?: string | null;
}): Promise<EmailTriageResult> {
  const model = 'gpt-4.1-mini';
  const content = [
    'Tu es un assistant executive email ultra rigoureux.',
    'Analyse ce mail pro entrant et retourne STRICTEMENT un JSON.',
    'JSON attendu:',
    '{',
    '  "summary": "resume operationnel en 1-2 phrases",',
    '  "action": "classer|repondre",',
    '  "category": "categorie principale",',
    '  "priority": "urgent|high|normal|low",',
    '  "confidence": 0.0-1.0,',
    '  "reasoning": "pourquoi action + priorite",',
    '  "tags": ["mot-cle-1", "mot-cle-2"]',
    '}',
    '',
    `user_email: ${args.userEmail || 'unknown'}`,
    `sender: ${args.senderEmail}`,
    `to: ${args.to.join(', ') || 'none'}`,
    `cc: ${args.cc.join(', ') || 'none'}`,
    `received_at: ${args.receivedAt || 'unknown'}`,
    args.globalRules ? `global_rules:\n${args.globalRules}` : '',
    `subject: ${args.subject}`,
    `body: ${args.body}`,
  ].join('\n');

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          { role: 'system', content: 'Tu renvoies un JSON strict et rien d autre.' },
          { role: 'user', content },
        ],
        text: { format: { type: 'json_object' } },
      },
    });

    const raw =
      response?.output?.[0]?.content?.[0]?.text ||
      response?.output_text ||
      '{}';

    const parsed = JSON.parse(raw) as Partial<EmailTriageResult>;

    return {
      summary: normalize(parsed.summary, 480) || 'Email analyse automatiquement.',
      action: parsed.action === 'repondre' ? 'repondre' : 'classer',
      category: normalize(parsed.category, 80) || 'general',
      priority:
        parsed.priority === 'urgent' || parsed.priority === 'high' || parsed.priority === 'low'
          ? parsed.priority
          : 'normal',
      confidence: normalizeConfidence(parsed.confidence),
      reasoning: normalize(parsed.reasoning, 800) || 'Analyse heuristique standard.',
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((tag) => normalize(tag, 40)).filter(Boolean).slice(0, 8)
        : [],
    };
  } catch {
    return {
      summary: 'Analyse indisponible, action par defaut: reponse manuelle.',
      action: 'repondre',
      category: 'fallback',
      priority: 'normal',
      confidence: 0.3,
      reasoning: 'Fallback applique suite a erreur IA.',
      tags: ['fallback'],
    };
  }
}

export async function generateReplySuggestionWithAi(args: {
  userId: string;
  senderEmail: string;
  senderName?: string | null;
  originalSubject: string;
  originalBody: string;
  summary?: string | null;
  tone?: string;
  globalRules?: string;
  signature?: string;
}): Promise<EmailReplySuggestion> {
  const model = 'gpt-4.1-mini';
  const tone = normalize(args.tone, 40) || 'professionnel';

  const prompt = [
    'Tu es assistant de direction. Redige une reponse email professionnelle en francais.',
    'Contrainte: concret, clair, polit, sans markdown.',
    'Retourne JSON strict: {"subject":"...","body":"...","confidence":0.0-1.0}',
    '',
    `tonalite: ${tone}`,
    `expediteur: ${args.senderName || ''} <${args.senderEmail}>`,
    `objet_original: ${args.originalSubject}`,
    `resume_ia: ${args.summary || ''}`,
    args.globalRules ? `regles_globales:\n${args.globalRules}` : '',
    args.signature ? `signature_a_utiliser: ${args.signature}` : '',
    `message_original: ${args.originalBody}`,
  ].join('\n');

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          { role: 'system', content: 'Tu renvoies un JSON strict et rien d autre.' },
          { role: 'user', content: prompt },
        ],
        text: { format: { type: 'json_object' } },
      },
    });

    const raw =
      response?.output?.[0]?.content?.[0]?.text ||
      response?.output_text ||
      '{}';

    const parsed = JSON.parse(raw) as {
      subject?: unknown;
      body?: unknown;
      confidence?: unknown;
    };

    return {
      subject: normalize(parsed.subject, 240) || withReplyPrefix(args.originalSubject),
      body:
        normalize(parsed.body, 5000) ||
        [
          'Bonjour,',
          '',
          'Merci pour votre email. Je prends bonne note de votre message et je reviens vers vous rapidement avec les elements demandes.',
          '',
          'Bien cordialement,',
        ].join('\n'),
      confidence: normalizeConfidence(parsed.confidence),
    };
  } catch {
    return {
      subject: withReplyPrefix(args.originalSubject),
      body: [
        'Bonjour,',
        '',
        'Merci pour votre email. Je prends bonne note de votre message et je reviens vers vous rapidement.',
        '',
        'Bien cordialement,',
      ].join('\n'),
      confidence: 0.3,
    };
  }
}

export async function sendPreparedReplyEmail(args: {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY manquant');
  }

  // Adresse dédiée au module Email Assistant (traitement@)
  const from =
    String(process.env.RESEND_EMAIL_ASSISTANT_FROM || '').trim() ||
    'Control Center <traitement@mail.meetsync-ai.com>';

  return resend.emails.send({
    from,
    to: args.to,
    cc: args.cc && args.cc.length > 0 ? args.cc : undefined,
    subject: normalize(args.subject, 240) || 'Reponse',
    text: normalize(args.body, 5000),
  });
}

function normalize(value: unknown, max: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return Math.round(parsed * 100) / 100;
}

function withReplyPrefix(subject: string): string {
  const s = normalize(subject, 220);
  if (!s) return 'Re: votre email';
  if (/^re\s*:/i.test(s)) return s;
  return `Re: ${s}`;
}
