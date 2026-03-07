import { callOpenAi } from '@/lib/ai/client';

export function buildEmbeddingInput(args: {
  title: string;
  summary?: string;
  structuredData?: Record<string, unknown>;
}): string {
  const parts = [args.title.trim()];

  if (args.summary?.trim()) {
    parts.push(args.summary.trim());
  }

  if (args.structuredData && Object.keys(args.structuredData).length > 0) {
    parts.push(JSON.stringify(args.structuredData));
  }

  return parts.join('\n\n');
}

export async function generateEmbedding(userId: string, input: string): Promise<number[]> {
  const model = 'text-embedding-3-small';

  const result = await callOpenAi({
    userId,
    service: 'embeddings',
    model,
    body: {
      model,
      input,
    },
  });

  const embedding = result?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding invalide recu depuis OpenAI');
  }

  return embedding;
}
