import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callGoogleVision, requireValidationCode } from '@/lib/ai/client';
import { parseOcrToMemory } from '@/lib/ai/parserService';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildSuggestions,
  detectContentType,
  getDetectedTypeLabel,
  localizeActionDefinition,
  parseActionChoiceService,
  sanitizeActionMappings,
  DEFAULT_ACTION_MAPPINGS,
} from '@/lib/memory/actionMappings';
import { resolveRequestLanguage } from '@/lib/i18n/serverLanguage';
import { translateServerMessage } from '@/lib/i18n/serverMessages';

const CONFIG_MEMORY_TITLE = 'memory_action_mappings';
const CONFIG_SOURCE = 'system_config';
const CONFIG_OWNER_ID = process.env.MEMORY_ACTIONS_CONFIG_USER_ID || '63efeb2d-6b5f-486d-8163-7485b26b9329';

function suggestTemplateId(detectedType: string): string {
  if (detectedType === 'wine_label') return 'wines';
  if (detectedType === 'business_card') return 'contacts';
  if (detectedType === 'product') return 'ideas';
  if (detectedType === 'note') return 'ideas';
  if (detectedType === 'document') return 'learnings';
  if (detectedType === 'invoice' || detectedType === 'receipt') return 'learnings';
  return 'other';
}

async function loadMappings() {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('memories')
    .select('structured_data')
    .eq('user_id', CONFIG_OWNER_ID)
    .eq('title', CONFIG_MEMORY_TITLE)
    .eq('source', CONFIG_SOURCE)
    .maybeSingle();

  const structured = (data?.structured_data || {}) as Record<string, unknown>;
  return sanitizeActionMappings(structured.mappings || DEFAULT_ACTION_MAPPINGS);
}

async function loadUsageCountByAction(userId: string, detectedType: string) {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('ai_usage_logs')
    .select('service, tokens_used')
    .eq('user_id', userId)
    .eq('provider', 'hippocampe')
    .ilike('service', `memory_action_choice:${detectedType}:%`)
    .limit(300);

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const parsed = parseActionChoiceService(String(row.service || ''));
    if (!parsed) continue;
    counts[parsed.actionId] = (counts[parsed.actionId] || 0) + Number(row.tokens_used || 1);
  }

  return counts;
}

export async function POST(request: NextRequest) {
  const language = resolveRequestLanguage(request);

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: translateServerMessage(language, 'auth.unauthenticated') }, { status: 401 });
    }

    const body = await request.json();
    const validationCode = body?.validationCode as string | undefined;
    const imageBase64 = body?.imageBase64 as string | undefined;

    requireValidationCode(validationCode);

    if (!imageBase64) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.imageRequired') }, { status: 400 });
    }

    const rawText = await callGoogleVision(userId, imageBase64);
    if (!rawText) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.noTextDetected') }, { status: 422 });
    }

    const parsed = await parseOcrToMemory(userId, rawText, language);
    const detectedType = detectContentType(parsed, rawText);

    const [mappings, usageCountByActionId] = await Promise.all([
      loadMappings(),
      loadUsageCountByAction(userId, detectedType),
    ]);

    const suggestions = buildSuggestions({
      detectedType,
      mappings,
      usageCountByActionId,
    }).map((suggestion) => localizeActionDefinition(suggestion, language));

    return NextResponse.json({
      detectedType,
      detectedLabel: getDetectedTypeLabel(detectedType, language),
      suggestedTemplateId: suggestTemplateId(detectedType),
      parsed,
      rawText,
      suggestions,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const isValidationError = rawMessage.includes('validation');
    const message = isValidationError
      ? translateServerMessage(language, 'validation.required')
      : translateServerMessage(language, 'memory.errorAssistantScan');
    const status = isValidationError ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}