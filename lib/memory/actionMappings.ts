import type { ParsedMemoryResult } from '@/lib/ai/parserService';

export type DetectedContentType =
  | 'wine_label'
  | 'invoice'
  | 'receipt'
  | 'business_card'
  | 'document'
  | 'product'
  | 'note'
  | 'unknown';

export type AssistantActionId =
  | 'add_wine_memory'
  | 'add_tasting_note'
  | 'link_restaurant_memory'
  | 'create_expense_memory'
  | 'attach_monthly_expenses'
  | 'store_receipt_image'
  | 'create_contact_memory'
  | 'link_company_memory'
  | 'add_relationship_graph'
  | 'create_document_memory'
  | 'create_product_memory'
  | 'create_note_memory';

export interface AssistantActionDefinition {
  id: AssistantActionId;
  label: string;
  description: string;
  memoryType: string;
}

export type ActionMappingConfig = Record<DetectedContentType, AssistantActionId[]>;

export const DETECTED_TYPE_LABELS: Record<DetectedContentType, string> = {
  wine_label: 'Wine label',
  invoice: 'Invoice',
  receipt: 'Receipt',
  business_card: 'Business card',
  document: 'Document',
  product: 'Product',
  note: 'Note',
  unknown: 'Unknown',
};

export const ACTION_CATALOG: Record<AssistantActionId, AssistantActionDefinition> = {
  add_wine_memory: {
    id: 'add_wine_memory',
    label: 'Add wine memory',
    description: 'Create a wine-focused memory card from this label.',
    memoryType: 'wine',
  },
  add_tasting_note: {
    id: 'add_tasting_note',
    label: 'Add tasting note',
    description: 'Create a tasting note memory with structured tasting fields.',
    memoryType: 'note',
  },
  link_restaurant_memory: {
    id: 'link_restaurant_memory',
    label: 'Link to restaurant memory',
    description: 'Create memory and link it to related restaurant memories.',
    memoryType: 'wine',
  },
  create_expense_memory: {
    id: 'create_expense_memory',
    label: 'Create expense memory',
    description: 'Create a structured expense memory card.',
    memoryType: 'invoice',
  },
  attach_monthly_expenses: {
    id: 'attach_monthly_expenses',
    label: 'Attach to monthly expenses',
    description: 'Create memory and tag it for monthly expense workflows.',
    memoryType: 'invoice',
  },
  store_receipt_image: {
    id: 'store_receipt_image',
    label: 'Store receipt image',
    description: 'Create memory focused on receipt archival.',
    memoryType: 'receipt',
  },
  create_contact_memory: {
    id: 'create_contact_memory',
    label: 'Create contact memory',
    description: 'Create a contact memory from card details.',
    memoryType: 'contact',
  },
  link_company_memory: {
    id: 'link_company_memory',
    label: 'Link to company',
    description: 'Create contact memory and link to company memories.',
    memoryType: 'business_card',
  },
  add_relationship_graph: {
    id: 'add_relationship_graph',
    label: 'Add to relationship graph',
    description: 'Create a card and connect it into your relationship graph.',
    memoryType: 'contact',
  },
  create_document_memory: {
    id: 'create_document_memory',
    label: 'Create document memory',
    description: 'Store this scan as a general document memory.',
    memoryType: 'document',
  },
  create_product_memory: {
    id: 'create_product_memory',
    label: 'Create product memory',
    description: 'Create a product memory with extracted attributes.',
    memoryType: 'document',
  },
  create_note_memory: {
    id: 'create_note_memory',
    label: 'Create note memory',
    description: 'Create a simple note memory card.',
    memoryType: 'note',
  },
};

export const DEFAULT_ACTION_MAPPINGS: ActionMappingConfig = {
  wine_label: ['add_wine_memory', 'add_tasting_note', 'link_restaurant_memory'],
  invoice: ['create_expense_memory', 'attach_monthly_expenses', 'store_receipt_image'],
  receipt: ['store_receipt_image', 'create_expense_memory', 'attach_monthly_expenses'],
  business_card: ['create_contact_memory', 'link_company_memory', 'add_relationship_graph'],
  document: ['create_document_memory', 'create_note_memory'],
  product: ['create_product_memory', 'create_document_memory'],
  note: ['create_note_memory', 'create_document_memory'],
  unknown: ['create_note_memory', 'create_document_memory'],
};

export function sanitizeActionMappings(input: unknown): ActionMappingConfig {
  const safe: ActionMappingConfig = { ...DEFAULT_ACTION_MAPPINGS };
  if (!input || typeof input !== 'object') {
    return safe;
  }

  for (const detectedType of Object.keys(DEFAULT_ACTION_MAPPINGS) as DetectedContentType[]) {
    const value = (input as Record<string, unknown>)[detectedType];
    if (!Array.isArray(value)) continue;

    const filtered = value
      .map((entry) => String(entry) as AssistantActionId)
      .filter((id) => Boolean(ACTION_CATALOG[id]));

    safe[detectedType] = filtered.length > 0 ? Array.from(new Set(filtered)) : DEFAULT_ACTION_MAPPINGS[detectedType];
  }

  return safe;
}

export function withPrimaryAction(
  mappings: ActionMappingConfig,
  primaryActions: Partial<Record<DetectedContentType, AssistantActionId>>
): ActionMappingConfig {
  const merged = sanitizeActionMappings(mappings);

  for (const detectedType of Object.keys(merged) as DetectedContentType[]) {
    const primary = primaryActions[detectedType];
    if (!primary || !ACTION_CATALOG[primary]) continue;

    const rest = merged[detectedType].filter((entry) => entry !== primary);
    merged[detectedType] = [primary, ...rest];
  }

  return merged;
}

export function detectContentType(parsed: ParsedMemoryResult, rawText: string): DetectedContentType {
  const text = rawText.toLowerCase();

  if (parsed.type === 'wine') return 'wine_label';
  if (parsed.type === 'invoice') return 'invoice';
  if (parsed.type === 'receipt') return 'receipt';
  if (parsed.type === 'business_card') return 'business_card';
  if (parsed.type === 'document') return 'document';
  if (parsed.type === 'note') return 'note';

  if (/sku|barcode|ean|ingredients|composition|nutrition|price|prix/.test(text)) {
    return 'product';
  }

  if (text.trim().length < 12) {
    return 'unknown';
  }

  return 'document';
}

export function parseActionChoiceService(service: string): {
  detectedType: DetectedContentType;
  actionId: AssistantActionId;
} | null {
  const parts = service.split(':');
  if (parts.length !== 3 || parts[0] !== 'memory_action_choice') return null;

  const detectedType = parts[1] as DetectedContentType;
  const actionId = parts[2] as AssistantActionId;
  if (!DETECTED_TYPE_LABELS[detectedType] || !ACTION_CATALOG[actionId]) {
    return null;
  }

  return { detectedType, actionId };
}

export function buildSuggestions(args: {
  detectedType: DetectedContentType;
  mappings: ActionMappingConfig;
  usageCountByActionId?: Partial<Record<AssistantActionId, number>>;
}) {
  const configured = args.mappings[args.detectedType] || [];
  const fallback = DEFAULT_ACTION_MAPPINGS[args.detectedType] || DEFAULT_ACTION_MAPPINGS.unknown;
  const actionIds = configured.length > 0 ? configured : fallback;
  const usageCount = args.usageCountByActionId || {};

  return actionIds
    .filter((id) => Boolean(ACTION_CATALOG[id]))
    .map((id, index) => {
      const count = Number(usageCount[id] || 0);
      const ranking = (actionIds.length - index) * 10 + count * 50;
      return {
        ...ACTION_CATALOG[id],
        usageCount: count,
        ranking,
      };
    })
    .sort((a, b) => b.ranking - a.ranking);
}

export function extractPrimaryActionMap(mappings: ActionMappingConfig): Partial<Record<DetectedContentType, AssistantActionId>> {
  const result: Partial<Record<DetectedContentType, AssistantActionId>> = {};

  for (const detectedType of Object.keys(mappings) as DetectedContentType[]) {
    const first = mappings[detectedType]?.[0];
    if (first && ACTION_CATALOG[first]) {
      result[detectedType] = first;
    }
  }

  return result;
}