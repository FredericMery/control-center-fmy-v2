import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function linkMemories(args: {
  userId: string;
  fromMemory: string;
  toMemory: string;
  relationType: string;
}) {
  const supabase = getSupabaseAdminClient();

  // Ensure both memories belong to current user.
  const { data: owned, error: ownedError } = await supabase
    .from('memories')
    .select('id')
    .eq('user_id', args.userId)
    .in('id', [args.fromMemory, args.toMemory]);

  if (ownedError) {
    throw new Error(ownedError.message);
  }

  if (!owned || owned.length !== 2) {
    throw new Error('Relation interdite pour cette memoire');
  }

  const { data, error } = await supabase
    .from('memory_relations')
    .insert({
      from_memory: args.fromMemory,
      to_memory: args.toMemory,
      relation_type: args.relationType,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getMemoryRelations(userId: string, memoryId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('memory_relations')
    .select(
      `
      id,
      relation_type,
      created_at,
      from_memory,
      to_memory
    `
    )
    .or(`from_memory.eq.${memoryId},to_memory.eq.${memoryId}`);

  if (error) {
    throw new Error(error.message);
  }

  const relationRows = data || [];
  if (relationRows.length === 0) {
    return [];
  }

  const ids = Array.from(
    new Set(
      relationRows
        .flatMap((row) => [row.from_memory, row.to_memory])
        .filter((id) => id && id !== memoryId)
    )
  );

  if (ids.length === 0) {
    return [];
  }

  const { data: nodes, error: nodesError } = await supabase
    .from('memories')
    .select('id, title, type, rating, user_id')
    .eq('user_id', userId)
    .in('id', ids);

  if (nodesError) {
    throw new Error(nodesError.message);
  }

  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));

  return relationRows
    .map((row) => {
      const relatedId = row.from_memory === memoryId ? row.to_memory : row.from_memory;
      const related = nodeMap.get(relatedId);
      if (!related) return null;

      return {
        id: row.id,
        relationType: row.relation_type,
        relatedMemory: related,
        createdAt: row.created_at,
      };
    })
    .filter(Boolean);
}

export async function getRelatedMemories(userId: string, memoryIds: string[], depth = 1) {
  const supabase = getSupabaseAdminClient();

  const visited = new Set<string>(memoryIds);
  let frontier = [...memoryIds];

  for (let d = 0; d < depth; d += 1) {
    if (frontier.length === 0) break;

    const { data: relations, error } = await supabase
      .from('memory_relations')
      .select('from_memory, to_memory, relation_type')
      .or(frontier.map((id) => `from_memory.eq.${id},to_memory.eq.${id}`).join(','));

    if (error || !relations) {
      break;
    }

    const next: string[] = [];
    for (const relation of relations) {
      const candidateIds = [relation.from_memory, relation.to_memory];
      for (const id of candidateIds) {
        if (!visited.has(id)) {
          visited.add(id);
          next.push(id);
        }
      }
    }

    frontier = next;
  }

  const allIds = Array.from(visited);
  if (allIds.length === 0) return [];

  const { data: memories, error: memError } = await supabase
    .from('memories')
    .select('id, title, type, rating, content, structured_data, created_at')
    .eq('user_id', userId)
    .in('id', allIds);

  if (memError) {
    throw new Error(memError.message);
  }

  return memories || [];
}
