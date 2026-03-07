import type { ParsedMemoryResult } from '@/lib/ai/parserService';
import type { AppLanguage } from '@/lib/i18n/translations';

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

const DETECTED_TYPE_LABELS_I18N: Record<AppLanguage, Record<DetectedContentType, string>> = {
  fr: {
    wine_label: 'Etiquette de vin',
    invoice: 'Facture',
    receipt: 'Ticket',
    business_card: 'Carte de visite',
    document: 'Document',
    product: 'Produit',
    note: 'Note',
    unknown: 'Inconnu',
  },
  en: DETECTED_TYPE_LABELS,
  es: {
    wine_label: 'Etiqueta de vino',
    invoice: 'Factura',
    receipt: 'Recibo',
    business_card: 'Tarjeta de visita',
    document: 'Documento',
    product: 'Producto',
    note: 'Nota',
    unknown: 'Desconocido',
  },
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

const ACTION_CATALOG_I18N: Record<AppLanguage, Record<AssistantActionId, Pick<AssistantActionDefinition, 'label' | 'description'>>> = {
  fr: {
    add_wine_memory: {
      label: 'Ajouter une memoire vin',
      description: 'Creer une fiche memoire orientee vin a partir de cette etiquette.',
    },
    add_tasting_note: {
      label: 'Ajouter une note de degustation',
      description: 'Creer une note de degustation avec des champs structures.',
    },
    link_restaurant_memory: {
      label: 'Lier a une memoire restaurant',
      description: 'Creer la memoire et la relier aux restaurants associes.',
    },
    create_expense_memory: {
      label: 'Creer une memoire de depense',
      description: 'Creer une fiche depense structuree.',
    },
    attach_monthly_expenses: {
      label: 'Associer aux depenses du mois',
      description: 'Creer la memoire et l\'etiqueter pour le flux mensuel.',
    },
    store_receipt_image: {
      label: 'Archiver le ticket',
      description: 'Creer une memoire orientee archivage du ticket.',
    },
    create_contact_memory: {
      label: 'Creer une memoire contact',
      description: 'Creer un contact depuis les details de la carte.',
    },
    link_company_memory: {
      label: 'Lier a l\'entreprise',
      description: 'Creer un contact et le relier aux memoires entreprise.',
    },
    add_relationship_graph: {
      label: 'Ajouter au graphe relationnel',
      description: 'Creer la fiche et l\'integrer a votre graphe de relations.',
    },
    create_document_memory: {
      label: 'Creer une memoire document',
      description: 'Enregistrer ce scan comme document general.',
    },
    create_product_memory: {
      label: 'Creer une memoire produit',
      description: 'Creer une fiche produit avec attributs extraits.',
    },
    create_note_memory: {
      label: 'Creer une memoire note',
      description: 'Creer une fiche note simple.',
    },
  },
  en: {
    add_wine_memory: ACTION_CATALOG.add_wine_memory,
    add_tasting_note: ACTION_CATALOG.add_tasting_note,
    link_restaurant_memory: ACTION_CATALOG.link_restaurant_memory,
    create_expense_memory: ACTION_CATALOG.create_expense_memory,
    attach_monthly_expenses: ACTION_CATALOG.attach_monthly_expenses,
    store_receipt_image: ACTION_CATALOG.store_receipt_image,
    create_contact_memory: ACTION_CATALOG.create_contact_memory,
    link_company_memory: ACTION_CATALOG.link_company_memory,
    add_relationship_graph: ACTION_CATALOG.add_relationship_graph,
    create_document_memory: ACTION_CATALOG.create_document_memory,
    create_product_memory: ACTION_CATALOG.create_product_memory,
    create_note_memory: ACTION_CATALOG.create_note_memory,
  },
  es: {
    add_wine_memory: {
      label: 'Agregar memoria de vino',
      description: 'Crear una ficha de memoria de vino desde esta etiqueta.',
    },
    add_tasting_note: {
      label: 'Agregar nota de cata',
      description: 'Crear una nota de cata con campos estructurados.',
    },
    link_restaurant_memory: {
      label: 'Vincular con memoria de restaurante',
      description: 'Crear la memoria y vincularla con restaurantes relacionados.',
    },
    create_expense_memory: {
      label: 'Crear memoria de gasto',
      description: 'Crear una ficha de gasto estructurada.',
    },
    attach_monthly_expenses: {
      label: 'Adjuntar a gastos mensuales',
      description: 'Crear memoria y etiquetarla para flujos mensuales.',
    },
    store_receipt_image: {
      label: 'Guardar imagen del recibo',
      description: 'Crear una memoria enfocada en el archivo del recibo.',
    },
    create_contact_memory: {
      label: 'Crear memoria de contacto',
      description: 'Crear un contacto desde los datos de la tarjeta.',
    },
    link_company_memory: {
      label: 'Vincular con empresa',
      description: 'Crear un contacto y vincularlo a memorias de empresa.',
    },
    add_relationship_graph: {
      label: 'Agregar al grafo de relaciones',
      description: 'Crear la ficha y conectarla a tu grafo de relaciones.',
    },
    create_document_memory: {
      label: 'Crear memoria de documento',
      description: 'Guardar este escaneo como memoria de documento general.',
    },
    create_product_memory: {
      label: 'Crear memoria de producto',
      description: 'Crear una memoria de producto con atributos extraidos.',
    },
    create_note_memory: {
      label: 'Crear memoria de nota',
      description: 'Crear una ficha de nota simple.',
    },
  },
};

export function getDetectedTypeLabel(detectedType: DetectedContentType, language: AppLanguage): string {
  return DETECTED_TYPE_LABELS_I18N[language][detectedType] || DETECTED_TYPE_LABELS[detectedType];
}

export function localizeActionDefinition<T extends AssistantActionDefinition>(
  action: T,
  language: AppLanguage
): T {
  const i18nAction = ACTION_CATALOG_I18N[language][action.id];
  if (!i18nAction) {
    return action;
  }

  return {
    ...action,
    label: i18nAction.label,
    description: i18nAction.description,
  } as T;
}

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