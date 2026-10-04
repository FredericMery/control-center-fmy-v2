import { callOpenAi } from '@/lib/ai/client';
import { MAIL_TYPES, type AiMailAnalysis, type MailPriority, type MailType } from '@/types/mail';

const MAX_AI_INPUT_CHARS = 8000;
const MAX_HEURISTIC_INPUT_CHARS = 20000;
const MAX_LINE_CHARS = 200;

function buildSystemPrompt(today: string): string {
  return `Tu es une archiviste et secrétaire de direction d'élite, spécialisée dans l'analyse de courrier papier numérisé.

Un même courrier peut contenir plusieurs documents numérisés. Tu dois toujours considérer l'ensemble des documents transmis comme un seul dossier de courrier et croiser les informations entre toutes les pièces.

Date du jour : ${today}.

Analyse le texte extrait (OCR) d'un courrier et retourne un JSON strict avec ces champs EXACTEMENT :
{
  "subject":          "Objet précis du courrier (ex: Relance facture N°12345). Utilise la ligne 'Objet :' si présente",
  "sender_name":      "Nom de la société ÉMETTRICE (raison sociale, ex: 'EDF', 'Crédit Agricole', 'SARL Dupont') ; si l'expéditeur est un particulier, son nom complet",
  "sender_address":   "Adresse postale complète de l'ÉMETTEUR sur une seule ligne (ex: '12 rue de la Paix, CS 12345, 75002 Paris Cedex, France'), ou vide",
  "sender_email":     "Adresse email de l'émetteur si présente (en-tête, pied de page, signature), sinon vide",
  "context":          "pro|perso selon le contenu principal du courrier",
  "mail_type":        "UN de ces types: ${MAIL_TYPES.join('|')}",
  "summary":          "Résumé concis de 2-3 lignes expliquant le contenu, le but et les actions à prendre",
  "action_required":  true ou false — une action explicite est-elle demandée à la personne ?
  "action_note":      "Description de l'action à faire si action_required=true, sinon vide",
  "priority":         "urgent|haute|normal|basse — basé sur le contenu et les délais",
  "due_date":         "Date d'échéance / date limite au format YYYY-MM-DD si mentionnée ou calculable (ex: 'sous 15 jours'), sinon null",
  "reference":        "Numéro de référence/dossier/contrat/client/facture si présent, sinon vide",
  "tags":             ["tag1", "tag2"] — mots-clés pertinents (max 5),
  "confidence":       0.XX — ton niveau de confiance dans cette analyse (entre 0.0 et 1.0)
}

Règles :
- Réponds UNIQUEMENT avec le JSON valide, sans aucun texte avant ou après.
- L'expéditeur est celui qui ENVOIE le courrier (logo, en-tête, signature, mentions légales en pied de page : SIRET, RCS, capital...). Ne confonds JAMAIS avec le destinataire (bloc adresse du destinataire, souvent précédé de 'M.', 'Mme', 'Monsieur', 'Madame').
- Corrige les erreurs d'OCR évidentes dans les noms, adresses et emails (espaces parasites, 'O' au lieu de '0' dans les codes postaux...).
- Si le texte est illisible ou insuffisant, utilise "autre" pour mail_type et 0.3 pour confidence.
- Pour priority "urgent" : délai <= 48h ou termes "urgent", "mise en demeure", "saisie", "huissier".
- Pour priority "haute" : délai 3-7j ou relance, montant > 1000€.
- Sois précis sur les montants, dates et références détectés.`;
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

const STREET_REGEX =
  /\b(\d{1,4}(?: ?(?:bis|ter))?[, ]+)?(rue|avenue|av\.?|boulevard|bd|chemin|place|all[ée]e|impasse|quai|route|cours|square|voie|parvis|esplanade|lieu[- ]dit|r[ée]sidence|zi|za|zac|parc|b\.?p\.?|c\.?s\.?|tsa)\b/i;
const POSTAL_LINE_REGEX = /\b(?:F-?\s?)?(\d{2}\s?\d{3})\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’\- ]{1,40}?)(\s+cedex(\s*\d{1,2})?)?\s*$/i;
const LEGAL_FORM_REGEX = /\b(SAS|SASU|SARL|EURL|SA|SCI|SNC|SCP|SELARL|GIE|EARL|GAEC|GmbH|Ltd|LLC|Inc\.?|S\.A\.S\.?|S\.A\.R\.L\.?|S\.A\.)\b/;
const RECIPIENT_PREFIX_REGEX = /^(m\.|mr\.?|mme|mlle|monsieur|madame|mademoiselle|à l'attention|a l'attention|destinataire)\b/i;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeEmail(value: unknown): string {
  const cleaned = normalizeText(value)
    .slice(0, MAX_HEURISTIC_INPUT_CHARS)
    .replace(/\s+/g, ' ')
    .replace(/ ?@ ?/g, '@')
    .replace(/ ?\. ?/g, '.');
  const match = cleaned.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : '';
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  const iso = `${String(fullYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidIsoDate(iso) ? iso : null;
}

function normalizeDueDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw || raw.toLowerCase() === 'null') return null;
  if (isValidIsoDate(raw)) return raw;
  return parseFrenchDate(raw.slice(0, 100).replace(/\s+/g, ' '));
}

function parseFrenchDate(raw: string): string | null {
  const numeric = raw.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (numeric) {
    return toIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }
  const textual = raw.match(/\b(\d{1,2})(?:er)? ([a-zéû]+) (\d{4})\b/i);
  if (textual) {
    const month = FRENCH_MONTHS[textual[2].toLowerCase()];
    if (month) return toIsoDate(Number(textual[3]), month, Number(textual[1]));
  }
  return null;
}

function getLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS))
    .filter((line) => line && !/^---\s*Piece\s+\d+/i.test(line));
}

function extractAddressBlock(lines: string[]): { address: string; nameLine: string } {
  for (let index = 0; index < lines.length; index += 1) {
    const postalMatch = lines[index].match(POSTAL_LINE_REGEX);
    if (!postalMatch) continue;

    const parts: string[] = [];
    let cursor = index - 1;
    while (cursor >= 0 && index - cursor <= 3 && STREET_REGEX.test(lines[cursor]) && lines[cursor].length <= 80) {
      parts.unshift(lines[cursor]);
      cursor -= 1;
    }
    if (parts.length === 0 && !STREET_REGEX.test(lines[index])) continue;

    const nameCandidate = cursor >= 0 ? lines[cursor] : '';
    if (nameCandidate && RECIPIENT_PREFIX_REGEX.test(nameCandidate)) {
      // Bloc destinataire : on cherche plutôt le bloc de l'émetteur
      continue;
    }

    parts.push(lines[index]);
    return {
      address: parts.join(', '),
      nameLine: nameCandidate && nameCandidate.length <= 60 && !EMAIL_REGEX.test(nameCandidate) ? nameCandidate : '',
    };
  }
  return { address: '', nameLine: '' };
}

function extractCompanyName(lines: string[], fallbackNameLine: string): string {
  const legalLine = lines.find((line) => LEGAL_FORM_REGEX.test(line) && line.length <= 60 && !/capital|siret|rcs|siren/i.test(line));
  if (legalLine) return legalLine;
  return fallbackNameLine;
}

function extractReference(text: string): string {
  const pattern = new RegExp(
    /(?:r[ée]f(?:[ée]rence)?s?(?: (?:client|dossier|contrat|facture|adh[ée]rent|courrier))?|n° ?(?:de )?(?:dossier|contrat|client|facture|adh[ée]rent|police)|(?:num[ée]ro de )?(?:dossier|contrat|client|facture|police)) ?(?:n°|no\.?|num[ée]ro)? ?[:.]? ?([A-Z0-9][A-Z0-9\-\/.]{3,30})/.source,
    'gi'
  );
  for (const match of text.matchAll(pattern)) {
    if (!/\d/.test(match[1])) continue;
    let reference = match[1];
    while (/[.\-\/]$/.test(reference)) reference = reference.slice(0, -1);
    return reference;
  }
  return '';
}

function extractSubject(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(/^objet ?:(.*)$/i);
    if (match && match[1].trim()) return match[1].trim().slice(0, 200);
  }
  return '';
}

function extractDueDate(text: string): string | null {
  const match = text.match(
    /(?:avant le|au plus tard le|date limite(?: de paiement)?|[ée]ch[ée]ance|[àa] r[ée]gler avant|[àa] payer avant|date d'exigibilit[ée]) ?[:\-]? ?(?:le )?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}(?:er)? [a-zéû]+ \d{4})/i
  );
  return match ? parseFrenchDate(match[1]) : null;
}

export interface HeuristicMailFields {
  subject: string;
  sender_name: string;
  sender_address: string;
  sender_email: string;
  reference: string;
  due_date: string | null;
}

/** Extraction déterministe (sans IA) des champs principaux du courrier depuis le texte OCR. */
export function extractMailFieldsHeuristically(fullText: string): HeuristicMailFields {
  const text = normalizeText(fullText).slice(0, MAX_HEURISTIC_INPUT_CHARS);
  const flatText = text.replace(/\s+/g, ' ');
  const lines = getLines(text);
  const { address, nameLine } = extractAddressBlock(lines);

  return {
    subject: extractSubject(lines),
    sender_name: extractCompanyName(lines, nameLine),
    sender_address: address,
    sender_email: normalizeEmail(flatText),
    reference: extractReference(flatText),
    due_date: extractDueDate(flatText),
  };
}

export function normalizeAiAnalysis(raw: unknown): AiMailAnalysis {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const context = normalizeText(source.context).toLowerCase() === 'perso' ? 'perso' : 'pro';
  const priorityRaw = normalizeText(source.priority).toLowerCase();
  const priority: MailPriority =
    priorityRaw === 'urgent' || priorityRaw === 'haute' || priorityRaw === 'basse'
      ? (priorityRaw as MailPriority)
      : 'normal';
  const mailTypeRaw = normalizeText(source.mail_type).toLowerCase() as MailType;
  const mailType: MailType = MAIL_TYPES.includes(mailTypeRaw) ? mailTypeRaw : 'autre';

  return {
    context,
    subject: normalizeText(source.subject),
    sender_name: normalizeText(source.sender_name),
    sender_address: normalizeText(source.sender_address)
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', '),
    sender_email: normalizeEmail(source.sender_email),
    mail_type: mailType,
    summary: normalizeText(source.summary),
    action_required: source.action_required === true || normalizeText(source.action_required).toLowerCase() === 'true',
    action_note: normalizeText(source.action_note),
    priority,
    due_date: normalizeDueDate(source.due_date),
    reference: normalizeText(source.reference),
    tags: Array.isArray(source.tags)
      ? source.tags.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 5)
      : [],
    confidence: Number.isFinite(Number(source.confidence))
      ? Math.max(0, Math.min(1, Number(source.confidence)))
      : 0.4,
  };
}

function mergeWithHeuristics(ai: AiMailAnalysis | null, fallback: HeuristicMailFields): AiMailAnalysis | null {
  const hasFallback = Boolean(
    fallback.subject || fallback.sender_name || fallback.sender_address ||
    fallback.sender_email || fallback.reference || fallback.due_date
  );
  if (!ai && !hasFallback) return null;

  const base: AiMailAnalysis = ai ?? {
    context: 'pro',
    subject: '',
    sender_name: '',
    sender_address: '',
    sender_email: '',
    mail_type: 'autre',
    summary: '',
    action_required: false,
    action_note: '',
    priority: 'normal',
    due_date: null,
    reference: '',
    tags: [],
    confidence: 0.3,
  };

  return {
    ...base,
    subject: base.subject || fallback.subject,
    sender_name: base.sender_name || fallback.sender_name,
    sender_address: base.sender_address || fallback.sender_address,
    sender_email: base.sender_email || fallback.sender_email,
    reference: base.reference || fallback.reference,
    due_date: base.due_date || fallback.due_date,
  };
}

/**
 * Analyse le texte OCR d'un courrier (IA + extraction déterministe en complément)
 * et retourne les valeurs à pré-remplir dans le formulaire.
 */
export async function analyzeMailText(
  userId: string,
  fullText: string,
  onAiUnavailable?: () => void
): Promise<AiMailAnalysis | null> {
  const text = normalizeText(fullText);
  if (!text) return null;

  const fallback = extractMailFieldsHeuristically(text);
  let aiAnalysis: AiMailAnalysis | null = null;

  if (text.length >= 30) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await callOpenAi({
        userId,
        service: 'chat/completions',
        model: 'gpt-4o-mini',
        body: {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: buildSystemPrompt(today) },
            {
              role: 'user',
              content: `Voici le texte extrait de l'ensemble des documents scannes pour un meme courrier. Analyse toutes les pieces ensemble:\n\n${text.slice(0, MAX_AI_INPUT_CHARS)}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: 'json_object' },
        },
      });

      const raw = String(response?.choices?.[0]?.message?.content || '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = normalizeAiAnalysis(JSON.parse(jsonMatch[0]));
      }
    } catch (error) {
      console.error('Mail AI analysis error:', error);
    }
  }

  if (!aiAnalysis) onAiUnavailable?.();

  return mergeWithHeuristics(aiAnalysis, fallback);
}
