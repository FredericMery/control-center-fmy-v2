import { callOpenAi } from '@/lib/ai/client';
import type { AppLanguage } from '@/lib/i18n/translations';
import { translateServerMessage } from '@/lib/i18n/serverMessages';
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
