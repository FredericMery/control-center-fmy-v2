import { callOpenAi } from '@/lib/ai/client';
import type { AppLanguage } from '@/lib/i18n/translations';
import { translateServerMessage } from '@/lib/i18n/serverMessages';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';
import type { MemoryType } from '@/types/memory';

export interface ParsedMemoryResult {
  type: MemoryType;
  title: string;
  summary: string;
  structured_data: Record<string, unknown>;
  suggested_relations: string[];
}

const ALLOWED_TYPES: MemoryType[] = [
  'wine',
  'invoice',
  'receipt',
  'business_card',
  'document',
  'note',
  'other',
];

function getPromptLanguage(language: AppLanguage): string {
  if (language === 'en') return 'English';
  if (language === 'es') return 'Spanish';
  return 'French';
}

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_');
}

function normalizeWineYearText(rawText: string): string {
  // Handle common OCR confusion like 2O19 -> 2019.
  return rawText.replace(/\b([12])[oO]([0-9]{2})\b/g, '$10$2');
}

function extractWineVintageYear(rawText: string): string | null {
  const text = normalizeWineYearText(rawText);
  const currentYear = new Date().getFullYear();
  const minYear = 1900;
  const maxYear = currentYear + 1;
  const keywords = [
    'vintage',
    'millesime',
    'millesime',
    'annee',
    'vendange',
    'bottled',
    'mis en bouteille',
    'appellation',
    'cuvee',
    'reserve',
  ];

  const matches = Array.from(text.matchAll(/\b(19\d{2}|20\d{2})\b/g));
  if (matches.length === 0) return null;

  const candidates = matches
    .map((match) => {
      const value = Number(match[1]);
      const index = match.index ?? 0;
      if (!Number.isFinite(value) || value < minYear || value > maxYear) return null;

      const start = Math.max(0, index - 28);
      const end = Math.min(text.length, index + 32);
      const context = text.slice(start, end).toLowerCase();

      let score = 0;
      if (keywords.some((keyword) => context.includes(keyword))) score += 7;
      if (value >= 1950 && value <= currentYear) score += 3;
      if (value >= currentYear - 1) score -= 2;

      return {
        value,
        index,
        score,
      };
    })
    .filter((entry): entry is { value: number; index: number; score: number } => Boolean(entry));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return String(candidates[0].value);
}

export async function parseOcrToTemplateFields(args: {
  userId: string;
  rawText: string;
  templateId: string;
  language?: AppLanguage;
}): Promise<Record<string, string>> {
  const { userId, rawText, templateId, language = 'fr' } = args;
  const template = MEMORY_TEMPLATES[templateId];
  if (!template) return {};

  const model = 'gpt-4.1-mini';
  const targetLanguage = getPromptLanguage(language);

  const fieldDefinitions = template.fields.map((field) => {
    const key = toFieldKey(field.label);
    const options = Array.isArray(field.options) && field.options.length > 0
      ? `; allowed options: ${field.options.join(', ')}`
      : '';
    return `- ${key} | label: ${field.label} | type: ${field.field_type}${options}`;
  });

  const prompt = [
    `You extract memory card fields for template: ${template.name}.`,
    `Write extracted values in ${targetLanguage}.`,
    'Return strict JSON object only with the listed keys.',
    'If a value is unknown, return an empty string for that key.',
    'Do not invent data. Keep values concise.',
    '',
    'Fields:',
    ...fieldDefinitions,
    '',
    'OCR text:',
    rawText,
  ].join('\n');

  const response = await callOpenAi({
    userId,
    service: 'responses',
    model,
    body: {
      model,
      input: [
        {
          role: 'system',
          content: 'You are a strict JSON extraction assistant. Return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    },
  });

  const content =
    response?.output?.[0]?.content?.[0]?.text ||
    response?.output_text ||
    '{}';

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const allowedKeys = new Set(template.fields.map((field) => toFieldKey(field.label)));
  const clean: Record<string, string> = {};

  for (const key of allowedKeys) {
    const value = parsed[key];
    clean[key] = typeof value === 'string' ? value.trim().slice(0, 600) : '';
  }

  if (templateId === 'wines') {
    const extractedYear = extractWineVintageYear(rawText);
    if (extractedYear) {
      if (allowedKeys.has('annee')) {
        clean.annee = extractedYear;
      } else if (allowedKeys.has('year')) {
        clean.year = extractedYear;
      }
    }
  }

  return clean;
}

export async function parseOcrToMemory(
  userId: string,
  rawText: string,
  language: AppLanguage = 'fr'
): Promise<ParsedMemoryResult> {
  const model = 'gpt-4.1-mini';
  const targetLanguage = getPromptLanguage(language);

  const prompt = [
    'Analyze the following OCR text.',
    `Write title and summary in ${targetLanguage}.`,
    '',
    'Detect memory type:',
    'wine',
    'invoice',
    'receipt',
    'business_card',
    'document',
    'note',
    'other',
    '',
    'Return structured JSON:',
    '{',
    '"type": "...",',
    '"title": "...",',
    '"summary": "...",',
    '"structured_data": {},',
    '"suggested_relations": []',
    '}',
    '',
    'OCR text:',
    rawText,
  ].join('\n');

  const response = await callOpenAi({
    userId,
    service: 'responses',
    model,
    body: {
      model,
      input: [
        {
          role: 'system',
          content: 'You are a strict JSON extraction assistant. Return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    },
  });

  const content =
    response?.output?.[0]?.content?.[0]?.text ||
    response?.output_text ||
    '{}';

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const parsedType = typeof parsed.type === 'string' ? parsed.type : '';
  const normalizedType: MemoryType = ALLOWED_TYPES.includes(parsedType as MemoryType)
    ? (parsedType as MemoryType)
    : 'other';

  const parsedStructuredData =
    parsed.structured_data && typeof parsed.structured_data === 'object'
      ? (parsed.structured_data as Record<string, unknown>)
      : {};

  const parsedRelations = Array.isArray(parsed.suggested_relations)
    ? parsed.suggested_relations
    : [];

  return {
    type: normalizedType,
    title: String(parsed.title || translateServerMessage(language, 'memory.untitled')).slice(0, 200),
    summary: String(parsed.summary || rawText.slice(0, 1200)),
    structured_data: parsedStructuredData,
    suggested_relations: parsedRelations.map((rel) => String(rel)).slice(0, 20),
  };
}
