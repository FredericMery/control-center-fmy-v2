import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { logAiUsage, requireValidationCode } from '@/lib/ai/client';
import { createMemory, listMemories } from '@/lib/memory/memoryService';
import { linkMemories } from '@/lib/memory/graphService';
import {
  ACTION_CATALOG,
  localizeActionDefinition,
  type AssistantActionId,
  type DetectedContentType,
} from '@/lib/memory/actionMappings';
import { resolveRequestLanguage } from '@/lib/i18n/serverLanguage';
import { translateServerMessage } from '@/lib/i18n/serverMessages';

type ParsedPayload = {
  title?: string;
  summary?: string;
  structured_data?: Record<string, unknown>;
};

function extractCompany(structured: Record<string, unknown>): string | null {
  const company = structured.company || structured.company_name || structured.brand;
  if (!company) return null;
  return String(company).trim() || null;
}

function extractRestaurant(structured: Record<string, unknown>): string | null {
  const value = structured.restaurant || structured.place || structured.location;
  if (!value) return null;
  return String(value).trim() || null;
}

async function tryCreateLink(args: {
  userId: string;
  memoryId: string;
  actionId: AssistantActionId;
  structuredData: Record<string, unknown>;
}) {
  const existing = await listMemories(args.userId, 250);
  const lowerAction = args.actionId.toLowerCase();
  let match: { id: string; title: string } | null = null;

  if (lowerAction === 'link_company_memory') {
    const company = extractCompany(args.structuredData)?.toLowerCase();
    if (company) {
      match =
        existing.find((memory) => memory.id !== args.memoryId && memory.title.toLowerCase().includes(company)) || null;
    }
  }

  if (!match && lowerAction === 'link_restaurant_memory') {
    const restaurant = extractRestaurant(args.structuredData)?.toLowerCase();
    if (restaurant) {
      match =
        existing.find((memory) => memory.id !== args.memoryId && memory.title.toLowerCase().includes(restaurant)) || null;
    }
  }

  if (!match && lowerAction === 'add_relationship_graph') {
    match =
      existing.find(
        (memory) => memory.id !== args.memoryId && ['contact', 'business_card'].includes(memory.type)
      ) || null;
  }

  if (!match) return null;

  try {
    await linkMemories({
      userId: args.userId,
      fromMemory: args.memoryId,
      toMemory: match.id,
      relationType: 'assistant_suggestion',
    });
    return match.id;
  } catch {
    return null;
  }
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
    const actionId = body?.actionId as AssistantActionId | undefined;
    const detectedType = body?.detectedType as DetectedContentType | undefined;
    const parsed = (body?.parsed || {}) as ParsedPayload;
    const rawText = String(body?.rawText || '');

    requireValidationCode(validationCode);

    if (!actionId || !ACTION_CATALOG[actionId]) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.invalidAction') }, { status: 400 });
    }

    if (!detectedType) {
      return NextResponse.json({ error: translateServerMessage(language, 'memory.detectedTypeRequired') }, { status: 400 });
    }

    const action = ACTION_CATALOG[actionId];
    const localizedAction = localizeActionDefinition(action, language);
    const structuredData = {
      ...(parsed.structured_data || {}),
      assistant_action_id: actionId,
      detected_type: detectedType,
      raw_ocr_text: rawText,
      action_executed_at: new Date().toISOString(),
    };

    if (actionId === 'attach_monthly_expenses') {
      const currentMonth = new Date().toISOString().slice(0, 7);
      (structuredData as Record<string, unknown>).expense_bucket = currentMonth;
    }

    if (actionId === 'store_receipt_image') {
      (structuredData as Record<string, unknown>).storage_mode = 'receipt_archive';
    }

    const memory = await createMemory({
      userId,
      title: String(parsed.title || localizedAction.label).slice(0, 200),
      type: action.memoryType,
      content: String(parsed.summary || '').slice(0, 4000),
      structuredData,
      source: 'assistant_scan',
      sourceImage: body?.sourceImage || null,
    });

    const linkedMemoryId = await tryCreateLink({
      userId,
      memoryId: memory.id,
      actionId,
      structuredData,
    });

    await logAiUsage({
      userId,
      provider: 'hippocampe',
      service: `memory_action_choice:${detectedType}:${actionId}`,
      tokensUsed: 1,
      costEstimate: 0,
    });

    return NextResponse.json({
      memory,
      action: localizedAction,
      linkedMemoryId,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    const isValidationError = rawMessage.includes('validation');
    const message = isValidationError
      ? translateServerMessage(language, 'validation.required')
      : translateServerMessage(language, 'memory.errorAssistantExecute');
    const status = isValidationError ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}