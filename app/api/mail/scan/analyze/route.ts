import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';
import type { AiMailAnalysis, MailPriority, MailType } from '@/types/mail';

const AI_SYSTEM_PROMPT = `Tu es une archiviste et secrétaire de direction d'élite, spécialisée dans l'analyse de courrier papier numérisé.

Un même courrier peut contenir plusieurs documents numérisés. Tu dois toujours considérer l'ensemble des documents transmis comme un seul dossier de courrier et croiser les informations entre toutes les pièces.

Analyse le texte extrait d'un courrier et retourne un JSON strict avec ces champs EXACTEMENT :
{
  "subject":          "Objet précis du courrier (ex: Relance facture N°12345)",
  "sender_name":      "Nom de l'expéditeur (personne physique ou morale)",
  "sender_address":   "Adresse postale complète de l'expéditeur, ou vide",
  "sender_email":     "Email de l'expéditeur si présent, sinon vide",
  "context":          "pro|perso selon le contenu principal du courrier",
  "mail_type":        "UN de ces types: facture|contrat|administratif|bancaire|juridique|fiscal|assurance|sante|immobilier|relance|offre_commerciale|autre",
  "summary":          "Résumé concis de 2-3 lignes expliquant le contenu, le but et les actions à prendre",
  "action_required":  true ou false — une action explicite est-elle demandée à la personne ?
  "action_note":      "Description de l'action à faire si action_required=true, sinon vide",
  "priority":         "urgent|haute|normal|basse — basé sur le contenu et les délais",
  "due_date":         "Date d'échéance au format YYYY-MM-DD si mentionnée, sinon null",
  "reference":        "Numéro de référence/dossier/contrat si présent, sinon vide",
  "tags":             ["tag1", "tag2"] — mots-clés pertinents (max 5),
  "confidence":       0.XX — ton niveau de confiance dans cette analyse (entre 0.0 et 1.0)
}

Règles :
- Réponds UNIQUEMENT avec le JSON valide, sans aucun texte avant ou après.
- Si le texte est illisible ou insuffisant, utilise "autre" pour mail_type et 0.3 pour confidence.
- Pour priority "urgent" : délai <= 48h ou termes "urgent", "mise en demeure", "saisie", "huissier".
- Pour priority "haute" : délai 3-7j ou relance, montant > 1000€.
- Sois précis sur les montants, dates et références détectés.`;

function normalizeAiAnalysis(raw: unknown): AiMailAnalysis {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const normalizeText = (value: unknown) => String(value || '').trim();
  const context = normalizeText(source.context).toLowerCase() === 'perso' ? 'perso' : 'pro';
  const priorityRaw = normalizeText(source.priority).toLowerCase();
  const priority: MailPriority =
    priorityRaw === 'urgent' || priorityRaw === 'haute' || priorityRaw === 'basse'
      ? (priorityRaw as MailPriority)
      : 'normal';

  const allowedMailTypes = new Set<MailType>([
    'facture',
    'contrat',
    'administratif',
    'bancaire',
    'juridique',
    'fiscal',
    'assurance',
    'sante',
    'immobilier',
    'relance',
    'offre_commerciale',
    'autre',
  ]);
  const mailTypeRaw = normalizeText(source.mail_type) as MailType;
  const mailType: MailType = allowedMailTypes.has(mailTypeRaw) ? mailTypeRaw : 'autre';

  return {
    context,
    subject: normalizeText(source.subject),
    sender_name: normalizeText(source.sender_name),
    sender_address: normalizeText(source.sender_address),
    sender_email: normalizeText(source.sender_email),
    mail_type: mailType,
    summary: normalizeText(source.summary),
    action_required: Boolean(source.action_required),
    action_note: normalizeText(source.action_note),
    priority,
    due_date: normalizeText(source.due_date) || null,
    reference: normalizeText(source.reference),
    tags: Array.isArray(source.tags)
      ? source.tags.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 5)
      : [],
    confidence: Number.isFinite(Number(source.confidence))
      ? Math.max(0, Math.min(1, Number(source.confidence)))
      : 0.4,
  };
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const fullText = String(body.full_text || '').trim();
  if (!fullText || fullText.length < 30) {
    return NextResponse.json({ ai_analysis: null });
  }

  try {
    const response = await callOpenAi({
      userId,
      service: 'chat/completions',
      model: 'gpt-4o-mini',
      body: {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Voici le texte extrait de l'ensemble des documents scannes pour un meme courrier. Analyse toutes les pieces ensemble:\n\n${fullText.slice(0, 8000)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 700,
      },
    });

    const raw = response?.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ai_analysis: null });
    }

    return NextResponse.json({ ai_analysis: normalizeAiAnalysis(JSON.parse(jsonMatch[0])) });
  } catch (error) {
    console.error('POST /api/mail/scan/analyze error:', error);
    return NextResponse.json({ ai_analysis: null });
  }
}