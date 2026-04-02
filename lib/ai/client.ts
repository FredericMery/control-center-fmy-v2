import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export interface AiUsageInput {
  userId: string;
  provider: string;
  service: string;
  tokensUsed?: number;
  costEstimate?: number;
}

export function requireValidationCode(code?: string | null): void {
  const expectedCode = process.env.AI_VALIDATION_CODE || '050100';
  if (!code || code !== expectedCode) {
    throw new Error('Code de validation IA invalide');
  }
}

export async function logAiUsage(input: AiUsageInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('ai_usage_logs').insert({
    user_id: input.userId,
    provider: input.provider,
    service: input.service,
    tokens_used: input.tokensUsed ?? 0,
    cost_estimate: input.costEstimate ?? 0,
  });

  if (error) {
    console.error('Failed to log AI usage:', error.message);
  }
}

interface OpenAiRequest<TBody> {
  userId: string;
  service: string;
  body: TBody;
  model: string;
}

interface OpenAiAudioTranscriptionRequest {
  userId: string;
  file: File;
  model?: string;
  language?: string;
  prompt?: string;
}

export async function callOpenAi<TBody>(input: OpenAiRequest<TBody>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquant');
  }

  const response = await fetch(`https://api.openai.com/v1/${input.service}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input.body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Erreur OpenAI');
  }

  const usageTokens =
    json?.usage?.total_tokens ||
    (json?.usage?.prompt_tokens || 0) + (json?.usage?.completion_tokens || 0) ||
    0;

  const cost = estimateOpenAiCost(input.model, usageTokens);
  await logAiUsage({
    userId: input.userId,
    provider: 'openai',
    service: input.service,
    tokensUsed: usageTokens,
    costEstimate: cost,
  });

  return json;
}

export async function callOpenAiAudioTranscription(input: OpenAiAudioTranscriptionRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquant');
  }

  const model = input.model || 'whisper-1';
  const formData = new FormData();
  formData.append('model', model);
  formData.append('file', input.file);

  if (input.language) {
    formData.append('language', input.language);
  }

  if (input.prompt) {
    formData.append('prompt', input.prompt);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'Erreur OpenAI Whisper');
  }

  await logAiUsage({
    userId: input.userId,
    provider: 'openai',
    service: 'audio/transcriptions',
    tokensUsed: 0,
    costEstimate: 0,
  });

  return json as {
    text?: string;
    language?: string;
    duration?: number;
  };
}

export async function callGoogleVision(userId: string, imageBase64: string): Promise<string> {
  const apiKey =
    process.env.GOOGLE_VISION_KEY ||
    process.env.GOOGLE_VISION_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_VISION_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_VISION_KEY manquant');
  }

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: cleanBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      }),
    }
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json?.error?.message || 'Erreur Google Vision');
  }

  const rawText =
    json?.responses?.[0]?.fullTextAnnotation?.text ||
    json?.responses?.[0]?.textAnnotations?.[0]?.description ||
    '';

  await logAiUsage({
    userId,
    provider: 'google',
    service: 'vision_ocr',
    tokensUsed: 1,
    costEstimate: 0.0015,
  });

  return rawText;
}

function estimateOpenAiCost(model: string, totalTokens: number): number {
  if (!totalTokens || totalTokens < 1) return 0;

  const lowerModel = model.toLowerCase();
  const perThousand =
    lowerModel.includes('embedding')
      ? 0.0001
      : lowerModel.includes('gpt-4.1')
      ? 0.01
      : lowerModel.includes('gpt-4o')
      ? 0.008
      : 0.005;

  return Number(((totalTokens / 1000) * perThousand).toFixed(6));
}
