export type MemoryType =
  | 'wine'
  | 'invoice'
  | 'receipt'
  | 'business_card'
  | 'document'
  | 'note'
  | 'idea'
  | 'contact'
  | 'other';

export interface MemoryRow {
  id: string;
  user_id: string;
  title: string;
  type: string;
  content: string | null;
  structured_data: Record<string, unknown>;
  rating: number | null;
  source: string | null;
  source_image: string | null;
  embedding: number[] | null;
  created_at: string;
  updated_at?: string;
}

export interface MemoryRelationRow {
  id: string;
  from_memory: string;
  to_memory: string;
  relation_type: string;
  created_at: string;
}
