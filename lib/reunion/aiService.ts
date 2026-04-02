import { callOpenAi } from '@/lib/ai/client';
import type {
  ExtractedAction,
  FollowupInsight,
  MeetingUnderstandingOutput,
  ParsedMeetingPrompt,
  ReunionPriority,
} from '@/lib/reunion/types';

function clampScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function normalizePriority(value: unknown): ReunionPriority {
  const candidate = String(value || '').toLowerCase();
  if (candidate === 'high') return 'high';
  if (candidate === 'low') return 'low';
  return 'medium';
}

function normalizeStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseJsonOutput(raw: unknown): Record<string, unknown> {
  const text = String(raw || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fallbackDateIsoFromPrompt(prompt: string): string {
  const now = new Date();
  const lower = prompt.toLowerCase();

  if (lower.includes('tomorrow') || lower.includes('demain')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const hourMatch = prompt.match(/\b(\d{1,2})(?:[:h](\d{2}))?\b/);
    if (hourMatch) {
      d.setHours(Number(hourMatch[1]), Number(hourMatch[2] || 0), 0, 0);
    } else {
      d.setHours(10, 0, 0, 0);
    }
    return d.toISOString();
  }

  const defaultDate = new Date(now);
  defaultDate.setDate(defaultDate.getDate() + 1);
  defaultDate.setHours(10, 0, 0, 0);
  return defaultDate.toISOString();
}

export async function parseMeetingPromptWithAi(args: {
  userId: string;
  prompt: string;
  nowIso?: string;
}): Promise<ParsedMeetingPrompt> {
  const model = 'gpt-4.1-mini';
  const nowIso = args.nowIso || new Date().toISOString();

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'You are a meeting creation parser.',
              'Extract participants, datetime, topic, and generate title/objective/description.',
              'Return strict JSON only.',
              'When missing date info, set tomorrow at 10:00 local time.',
              'Also return estimatedDurationMinutes and a concise agenda array.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `Now ISO: ${nowIso}`,
              `Prompt: ${args.prompt}`,
              'JSON format:',
              '{"participants":[{"name":"","email":""}],"meetingDateIso":"","topic":"","title":"","objective":"","description":"","estimatedDurationMinutes":45,"agenda":["..."]}',
            ].join('\n'),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content =
      response?.output?.[0]?.content?.[0]?.text ||
      response?.output_text ||
      '{}';

    const parsed = parseJsonOutput(content);
    const participantsRaw = Array.isArray(parsed.participants) ? parsed.participants : [];
    const participants: Array<{ name: string; email?: string }> = [];

    for (const entry of participantsRaw) {
      const row = entry as Record<string, unknown>;
      const name = String(row?.name || '').trim();
      const email = String(row?.email || '').trim();
      if (!name) continue;
      participants.push({
        name,
        email: email || undefined,
      });
      if (participants.length >= 30) break;
    }

    const topic = String(parsed.topic || '').trim() || 'Meeting';

    return {
      participants,
      meetingDateIso: String(parsed.meetingDateIso || '').trim() || fallbackDateIsoFromPrompt(args.prompt),
      topic,
      title: String(parsed.title || '').trim() || `Meeting - ${topic}`,
      objective: String(parsed.objective || '').trim() || `Alignement sur ${topic}`,
      description: String(parsed.description || '').trim() || `Reunion autour de ${topic}.`,
      estimatedDurationMinutes: Math.max(15, Math.min(180, Number(parsed.estimatedDurationMinutes) || 45)),
      agenda: normalizeStringArray(parsed.agenda, 12),
    };
  } catch {
    const fallbackTopic = args.prompt.slice(0, 80) || 'Meeting';
    return {
      participants: [],
      meetingDateIso: fallbackDateIsoFromPrompt(args.prompt),
      topic: fallbackTopic,
      title: `Meeting - ${fallbackTopic}`,
      objective: `Alignement sur ${fallbackTopic}`,
      description: `Reunion planifiee automatiquement: ${fallbackTopic}`,
      estimatedDurationMinutes: 45,
      agenda: [
        'Contexte et objectifs',
        'Points de decision',
        'Actions et prochaines etapes',
      ],
    };
  }
}

export async function cleanTranscriptWithAi(args: {
  userId: string;
  transcript: string;
}): Promise<string> {
  const model = 'gpt-4.1-mini';

  if (!args.transcript.trim()) return '';

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: 'Clean meeting transcript: remove fillers/noise and keep precise meaning. Return plain text.',
          },
          {
            role: 'user',
            content: args.transcript.slice(0, 14000),
          },
        ],
      },
    });

    return String(response?.output?.[0]?.content?.[0]?.text || response?.output_text || args.transcript)
      .trim()
      .slice(0, 30000);
  } catch {
    return args.transcript.slice(0, 30000);
  }
}

export async function understandMeetingWithAi(args: {
  userId: string;
  transcript: string;
}): Promise<MeetingUnderstandingOutput> {
  const model = 'gpt-4.1-mini';

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'Analyze meeting transcript and return strict JSON.',
              'Need: executiveSummary (max 5 lines), keyPoints, decisions, risks, openQuestions.',
            ].join(' '),
          },
          {
            role: 'user',
            content: args.transcript.slice(0, 16000),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = parseJsonOutput(content);

    return {
      executiveSummary: String(parsed.executiveSummary || '').trim().slice(0, 1200),
      keyPoints: normalizeStringArray(parsed.keyPoints, 20),
      decisions: normalizeStringArray(parsed.decisions, 20),
      risks: normalizeStringArray(parsed.risks, 20),
      openQuestions: normalizeStringArray(parsed.openQuestions, 20),
    };
  } catch {
    return {
      executiveSummary: args.transcript.slice(0, 500),
      keyPoints: [],
      decisions: [],
      risks: [],
      openQuestions: [],
    };
  }
}

export async function extractActionsWithAi(args: {
  userId: string;
  transcript: string;
}): Promise<ExtractedAction[]> {
  const model = 'gpt-4.1-mini';

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'Extract explicit and implicit actions from a meeting transcript.',
              'Return strict JSON array.',
              'Each item keys:',
              'title, description, assigned_to, assigned_email, deadline, priority, importance_score, urgency_score.',
              'priority must be low|medium|high. scores are 1..10.',
              'Infer missing deadline when possible.',
            ].join(' '),
          },
          {
            role: 'user',
            content: args.transcript.slice(0, 18000),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = parseJsonOutput(content);
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
      : Array.isArray(parsed)
      ? parsed
      : [];

    const extracted: ExtractedAction[] = [];
    for (const entry of actions) {
      const row = entry as Record<string, unknown>;
      const title = String(row.title || '').trim();
      if (!title) continue;

      extracted.push({
        title,
        description: String(row.description || '').trim().slice(0, 2000),
        assigned_to: String(row.assigned_to || '').trim(),
        assigned_email: String(row.assigned_email || '').trim() || undefined,
        deadline: String(row.deadline || '').trim() || undefined,
        priority: normalizePriority(row.priority),
        importance_score: clampScore(row.importance_score),
        urgency_score: clampScore(row.urgency_score),
      });

      if (extracted.length >= 50) break;
    }

    return extracted;
  } catch {
    return [];
  }
}

export async function generateFollowupInsightWithAi(args: {
  userId: string;
  payload: Record<string, unknown>;
}): Promise<FollowupInsight> {
  const model = 'gpt-4.1-mini';

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'You are a follow-up intelligence engine.',
              'Detect overloaded people and summarize priorities.',
              'Return strict JSON object:',
              '{"summary":"...","overloadedPeople":[{"name":"","lateCount":0,"inProgressCount":0}]}',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(args.payload),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = parseJsonOutput(content);

    const overloadedRaw = Array.isArray(parsed.overloadedPeople) ? parsed.overloadedPeople : [];
    const overloadedPeople = overloadedRaw
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        const name = String(row.name || '').trim();
        if (!name) return null;
        return {
          name,
          lateCount: Math.max(0, Number(row.lateCount) || 0),
          inProgressCount: Math.max(0, Number(row.inProgressCount) || 0),
        };
      })
      .filter((entry): entry is { name: string; lateCount: number; inProgressCount: number } => Boolean(entry));

    return {
      summary: String(parsed.summary || '').trim().slice(0, 1000),
      overloadedPeople,
    };
  } catch {
    return {
      summary: 'Follow-up genere sans IA detaillee.',
      overloadedPeople: [],
    };
  }
}

export async function computeMeetingOptimizationWithAi(args: {
  userId: string;
  payload: Record<string, unknown>;
}): Promise<{ efficiencyScore: number; insights: string[] }> {
  const model = 'gpt-4.1-mini';

  try {
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content: [
              'Compute meeting optimization insights.',
              'Return strict JSON object:',
              '{"efficiencyScore":0-100,"insights":["..."]}',
              'Focus on unnecessary meetings and duplicate actions.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(args.payload),
          },
        ],
        text: {
          format: {
            type: 'json_object',
          },
        },
      },
    });

    const content = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = parseJsonOutput(content);
    const score = Math.max(0, Math.min(100, Number(parsed.efficiencyScore) || 65));

    return {
      efficiencyScore: score,
      insights: normalizeStringArray(parsed.insights, 10),
    };
  } catch {
    return {
      efficiencyScore: 65,
      insights: ['Analyse optimisation indisponible temporairement.'],
    };
  }
}
