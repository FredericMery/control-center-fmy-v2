import { callOpenAi } from '@/lib/ai/client';
import type { AppLanguage } from '@/lib/i18n/translations';
import { translateServerMessage } from '@/lib/i18n/serverMessages';
import { searchMemoriesByQuery } from '@/lib/memory/memoryService';
import { getRelatedMemories } from '@/lib/memory/graphService';

export interface AskMemoryAgentInput {
  userId: string;
  question: string;
  language: AppLanguage;
}

function getPromptLanguage(language: AppLanguage): string {
  if (language === 'en') return 'English';
  if (language === 'es') return 'Spanish';
  return 'French';
}

export async function askMemoryAgent(input: AskMemoryAgentInput) {
  const similar = await searchMemoriesByQuery({
    userId: input.userId,
    query: input.question,
    limit: 8,
  });

  const rootIds = similar.map((memory) => memory.id);
  const graph = rootIds.length > 0
    ? await getRelatedMemories(input.userId, rootIds, 2)
    : [];

  const contextPayload = {
    top_memories: similar,
    related_memories: graph,
  };
  const promptLanguage = getPromptLanguage(input.language);

  const model = 'gpt-4.1-mini';
  const response = await callOpenAi({
    userId: input.userId,
    service: 'responses',
    model,
    body: {
      model,
      input: [
        {
          role: 'system',
          content:
            `You answer user questions using memory context only. If data is missing, clearly say what is missing. Always answer in ${promptLanguage}.`,
        },
        {
          role: 'user',
          content: [
            `Question: ${input.question}`,
            'Memory context JSON:',
            JSON.stringify(contextPayload),
          ].join('\n\n'),
        },
      ],
    },
  });

  const answer =
    response?.output?.[0]?.content?.[0]?.text ||
    response?.output_text ||
    translateServerMessage(input.language, 'memory.defaultAnswer');

  return {
    answer,
    usedMemories: similar,
    relatedMemories: graph,
  };
}
