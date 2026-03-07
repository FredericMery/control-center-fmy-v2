import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callGoogleVision, requireValidationCode } from '@/lib/ai/client';
import { parseOcrToMemory } from '@/lib/ai/parserService';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildSuggestions,
  detectContentType,
  parseActionChoiceService,
  sanitizeActionMappings,
  DEFAULT_ACTION_MAPPINGS,
  DETECTED_TYPE_LABELS,
} from '@/lib/memory/actionMappings';

const CONFIG_MEMORY_TITLE = 'memory_action_mappings';
const CONFIG_SOURCE = 'system_config';
const CONFIG_OWNER_ID = process.env.MEMORY_ACTIONS_CONFIG_USER_ID || '63efeb2d-6b5f-486d-8163-7485b26b9329';

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
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const validationCode = body?.validationCode as string | undefined;
    const imageBase64 = body?.imageBase64 as string | undefined;

    requireValidationCode(validationCode);

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 requis' }, { status: 400 });
    }

    const rawText = await callGoogleVision(userId, imageBase64);
    if (!rawText) {
      return NextResponse.json({ error: 'Aucun texte detecte' }, { status: 422 });
    }

    const parsed = await parseOcrToMemory(userId, rawText);
    const detectedType = detectContentType(parsed, rawText);

    const [mappings, usageCountByActionId] = await Promise.all([
      loadMappings(),
      loadUsageCountByAction(userId, detectedType),
    ]);

    const suggestions = buildSuggestions({
      detectedType,
      mappings,
      usageCountByActionId,
    });

    return NextResponse.json({
      detectedType,
      detectedLabel: DETECTED_TYPE_LABELS[detectedType],
      parsed,
      rawText,
      suggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur scan assistant';
    const status = message.includes('validation') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}