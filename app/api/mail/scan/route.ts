import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi, callGoogleVision } from '@/lib/ai/client';
import type { AiMailAnalysis, MailType, MailPriority } from '@/types/mail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);

const AI_SYSTEM_PROMPT = `Tu es une archiviste et secrétaire de direction d'élite, spécialisée dans l'analyse de courrier papier numérisé.

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

// POST /api/mail/scan — upload scan + OCR + analyse IA
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 });
  }

  const rawFiles = formData.getAll('files');
  const singleFile = formData.get('file');
  const files = (rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : [])
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
  }

  if (files.length > 10) {
    return NextResponse.json({ error: 'Maximum 10 pieces par courrier' }, { status: 400 });
  }
  const maxSize = 15 * 1024 * 1024; // 15 MB
  const uploaded: Array<{ url: string; name: string; text: string }> = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Format non supporte. Utilisez JPG, PNG, WEBP ou PDF.' },
        { status: 400 }
      );
    }

    if (file.size > maxSize) {
      return NextResponse.json({ error: `Fichier trop volumineux (${file.name}) - max 15 Mo` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Upload dans Supabase Storage
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('mail-scans')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Erreur upload scan' }, { status: 500 });
    }

    // URL signée valable 10 ans (pour archivage)
    const { data: signedData } = await supabase.storage
      .from('mail-scans')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

    const scanUrl = signedData?.signedUrl || '';

    // 2. OCR via Google Vision (uniquement pour les images)
    let ocrText = '';
    if (file.type !== 'application/pdf') {
      try {
        const base64 = buffer.toString('base64');
        ocrText = await callGoogleVision(userId, base64);
      } catch (err) {
        console.error('OCR error:', err);
      }
    }

    uploaded.push({ url: scanUrl, name: fileName, text: ocrText || '' });
  }

  const validUploads = uploaded.filter((entry) => entry.url);
  const scanUrls = validUploads.map((entry) => entry.url).slice(0, 10);
  const scanFileNames = validUploads.map((entry) => entry.name).slice(0, 10);
  const ocrText = uploaded
    .map((entry, index) => (entry.text ? `--- Piece ${index + 1}: ${entry.name} ---\n${entry.text}` : ''))
    .filter(Boolean)
    .join('\n\n');

  // 3. Analyse IA via OpenAI
  let aiAnalysis: AiMailAnalysis | null = null;
  if (ocrText && ocrText.length > 30) {
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
              content: `Voici le texte extrait du courrier:\n\n${ocrText.slice(0, 4000)}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 700,
        },
      });

      const raw = response?.choices?.[0]?.message?.content || '';
      // Extraire le JSON même si entouré de backticks
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiAnalysis = normalizeAiAnalysis(JSON.parse(jsonMatch[0]));
      }
    } catch (err) {
      console.error('AI analysis error:', err);
    }
  }

  return NextResponse.json({
    scan_url: scanUrls[0] || null,
    scan_file_name: scanFileNames[0] || null,
    scan_urls: scanUrls,
    scan_file_names: scanFileNames,
    full_text: ocrText || null,
    ai_analysis: aiAnalysis,
  });
}
