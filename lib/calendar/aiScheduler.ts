import {
  DateRange,
  ParsedSchedulingIntent,
  RankedSlot,
  ScheduleProposal,
  SchedulingPreferences,
} from '@/lib/calendar/types';
import { getFreeSlots, getSchedulingPreferences, rankSlots } from '@/lib/calendar/availability';

function sanitizeText(value: string): string {
  return String(value || '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function defaultRange(): DateRange {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function extractDurationMinutes(text: string, fallback = 60): number {
  const lower = text.toLowerCase();
  const minutesMatch = lower.match(/(\d{1,3})\s*min/);
  if (minutesMatch) return Math.max(15, Number(minutesMatch[1]));

  const hourMatch = lower.match(/(\d{1,2})\s*h/);
  if (hourMatch) return Math.max(15, Number(hourMatch[1]) * 60);

  return fallback;
}

function inferRange(text: string): DateRange {
  const lower = text.toLowerCase();
  const start = new Date();
  let end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (lower.includes('semaine prochaine') || lower.includes('next week')) {
    start.setUTCDate(start.getUTCDate() + 7);
    end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (lower.includes('ce mois') || lower.includes('this month')) {
    end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else if (lower.includes('demain') || lower.includes('tomorrow')) {
    start.setUTCDate(start.getUTCDate() + 1);
    end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

async function parseWithLLM(
  text: string,
  preferences: SchedulingPreferences
): Promise<ParsedSchedulingIntent | null> {
  void text;
  void preferences;
  return null;
}

function parseHeuristically(text: string): ParsedSchedulingIntent {
  const cleaned = sanitizeText(text);
  const durationMinutes = extractDurationMinutes(cleaned, 60);
  const dateRange = inferRange(cleaned);

  const attendees = cleaned
    .match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g)
    ?.map((v) => v.toLowerCase()) || [];

  const titleSuggestion = cleaned.slice(0, 100) || 'Meeting';

  return {
    requestText: cleaned,
    titleSuggestion,
    attendees,
    durationMinutes,
    dateRange,
    hardConstraints: [],
    softPreferences: [],
    targetSourceProvider: 'microsoft',
  };
}

export async function parseSchedulingIntent(
  text: string,
  preferences: SchedulingPreferences
): Promise<ParsedSchedulingIntent> {
  const llmParsed = await parseWithLLM(text, preferences);
  if (llmParsed) return llmParsed;
  return parseHeuristically(text);
}

export function buildProposal(
  intent: ParsedSchedulingIntent,
  rankedSlots: RankedSlot[],
  topN = 5
): ScheduleProposal {
  const selected = rankedSlots.slice(0, topN);

  return {
    proposalId: crypto.randomUUID(),
    title: intent.titleSuggestion,
    durationMinutes: intent.durationMinutes,
    participants: intent.attendees,
    rankedSlots: selected,
    rationale: selected.map((slot, index) => `${index + 1}. ${slot.startAt} (score=${slot.score})`).join('\n'),
    createdAt: nowIso(),
    metadata: {
      requestText: intent.requestText,
      hardConstraints: intent.hardConstraints,
      softPreferences: intent.softPreferences,
    },
  };
}

export async function generateScheduleProposal(
  userId: string,
  naturalLanguagePrompt: string,
  explicitRange?: DateRange
): Promise<{ intent: ParsedSchedulingIntent; proposal: ScheduleProposal }> {
  const preferences = await getSchedulingPreferences(userId);
  const intent = await parseSchedulingIntent(naturalLanguagePrompt, preferences);

  const effectiveRange = explicitRange || intent.dateRange || defaultRange();
  const freeSlots = await getFreeSlots(userId, effectiveRange, preferences, intent.durationMinutes || 60);
  const rankedSlots = rankSlots(freeSlots, intent, preferences);

  const proposal = buildProposal(intent, rankedSlots, 5);
  return { intent, proposal };
}
