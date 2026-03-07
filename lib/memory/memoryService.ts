import { buildEmbeddingInput, generateEmbedding } from '@/lib/ai/embeddingService';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { MemoryRow, MemoryType } from '@/types/memory';

export interface CreateMemoryInput {
  userId: string;
  title: string;
  type?: MemoryType | string;
  content?: string;
  structuredData?: Record<string, unknown>;
  source?: string;
  sourceImage?: string;
  rating?: number | null;
}

export async function createMemory(input: CreateMemoryInput) {
  const supabase = getSupabaseAdminClient();

  const embeddingInput = buildEmbeddingInput({
    title: input.title,
    summary: input.content,
    structuredData: input.structuredData,
  });
  const embedding = await generateEmbedding(input.userId, embeddingInput);

  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: input.userId,
      title: input.title,
      type: input.type || 'other',
      content: input.content || null,
      structured_data: input.structuredData || {},
      source: input.source || null,
      source_image: input.sourceImage || null,
      rating: input.rating ?? null,
      embedding,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as MemoryRow;
}

export async function updateMemory(
  userId: string,
  memoryId: string,
  updates: Partial<CreateMemoryInput>
): Promise<MemoryRow> {
  const supabase = getSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .single();

  if (existingError || !existing) {
    throw new Error('Memory introuvable');
  }

  const nextTitle = updates.title || existing.title;
  const nextContent =
    updates.content === undefined ? existing.content || '' : updates.content;
  const nextStructuredData =
    updates.structuredData === undefined
      ? (existing.structured_data as Record<string, unknown>)
      : updates.structuredData;

  const embeddingInput = buildEmbeddingInput({
    title: nextTitle,
    summary: nextContent || '',
    structuredData: nextStructuredData,
  });
  const embedding = await generateEmbedding(userId, embeddingInput);

  const { data, error } = await supabase
    .from('memories')
    .update({
      title: updates.title,
      type: updates.type,
      content: updates.content,
      structured_data: updates.structuredData,
      source: updates.source,
      source_image: updates.sourceImage,
      rating: updates.rating,
      embedding,
    })
    .eq('id', memoryId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Erreur mise a jour');
  }

  return data as MemoryRow;
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', memoryId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setMemoryRating(userId: string, memoryId: string, rating: number) {
  if (rating < 1 || rating > 5) {
    throw new Error('La note doit etre entre 1 et 5');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .update({ rating })
    .eq('id', memoryId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Erreur de notation');
  }

  return data as MemoryRow;
}

export async function getMemoryById(userId: string, memoryId: string): Promise<MemoryRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('id', memoryId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }

  return data as MemoryRow;
}

export async function listMemories(userId: string, limit = 100): Promise<MemoryRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as MemoryRow[];
}

export async function searchMemoriesByQuery(args: {
  userId: string;
  query: string;
  limit?: number;
}) {
  const supabase = getSupabaseAdminClient();
  const queryEmbedding = await generateEmbedding(args.userId, args.query);

  const { data, error } = await supabase.rpc('match_memories', {
    p_user_id: args.userId,
    p_query_embedding: queryEmbedding,
    p_match_count: args.limit || 10,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as Array<MemoryRow & { similarity: number }>;
}
