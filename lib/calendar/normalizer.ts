import { NormalizedEvent } from '@/lib/calendar/types';

function safeString(input: unknown): string {
  return String(input ?? '').trim();
}

function safeNullableString(input: unknown): string | null {
  const value = safeString(input);
  return value ? value : null;
}

function toIsoString(input: unknown): string {
  const date = new Date(String(input));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date in provider payload');
  }
  return date.toISOString();
}

function deriveMeetingUrl(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.meeting_url,
    payload.onlineMeetingUrl,
    payload.joinUrl,
    payload.webLink,
  ];

  for (const candidate of candidates) {
    const value = safeNullableString(candidate);
    if (value) return value;
  }
  return null;
}

function normalizeAttendees(input: unknown): Array<{ email?: string; name?: string; response?: string }> {
  if (!Array.isArray(input)) return [];
  const compact = input
    .map((attendee) => {
      if (!attendee || typeof attendee !== 'object') return null;
      const a = attendee as Record<string, unknown>;
      const email = safeNullableString(a.email ?? (a.emailAddress as Record<string, unknown> | undefined)?.address);
      const name = safeNullableString(a.name ?? (a.emailAddress as Record<string, unknown> | undefined)?.name);
      const response = safeNullableString(a.response ?? (a.status as Record<string, unknown> | undefined)?.response);
      if (!email && !name) return null;
      return {
        email: email || undefined,
        name: name || undefined,
        response: response || undefined,
      };
    })
    .filter((v) => v !== null);

  return compact;
}

export function normalizeProviderEvent(args: {
  userId: string;
  sourceId: string | null;
  sourceProvider: NormalizedEvent['source_provider'];
  sourceEventId: string;
  payload: Record<string, unknown>;
  defaults?: Partial<NormalizedEvent>;
}): NormalizedEvent {
  const { userId, sourceId, sourceProvider, sourceEventId, payload, defaults } = args;

  const startAt = toIsoString(payload.start_at ?? (payload.start as Record<string, unknown> | undefined)?.dateTime ?? payload.start);
  const endAt = toIsoString(payload.end_at ?? (payload.end as Record<string, unknown> | undefined)?.dateTime ?? payload.end);

  const timezone =
    safeNullableString(payload.timezone) ||
    safeNullableString((payload.start as Record<string, unknown> | undefined)?.timeZone) ||
    defaults?.timezone ||
    'Europe/Paris';

  const normalized: NormalizedEvent = {
    user_id: userId,
    source_id: sourceId,
    source_provider: sourceProvider,
    source_event_id: sourceEventId,
    external_etag: safeNullableString(payload.external_etag ?? payload.etag ?? payload['@odata.etag']),
    title: safeString(payload.title ?? payload.subject ?? defaults?.title ?? 'Sans titre'),
    description: safeNullableString(payload.description ?? payload.bodyPreview ?? payload.body),
    location: safeNullableString(payload.location ?? (payload.location as Record<string, unknown> | undefined)?.displayName),
    start_at: startAt,
    end_at: endAt,
    timezone,
    all_day: Boolean(payload.all_day ?? payload.isAllDay ?? defaults?.all_day ?? false),
    status: (safeString(payload.status ?? payload.showAs ?? defaults?.status ?? 'confirmed') as NormalizedEvent['status']) || 'confirmed',
    visibility: safeString(payload.visibility ?? defaults?.visibility ?? 'default'),
    meeting_url: deriveMeetingUrl(payload),
    organizer_email:
      safeNullableString(payload.organizer_email) ||
      safeNullableString((payload.organizer as Record<string, unknown> | undefined)?.emailAddress as unknown),
    attendees: normalizeAttendees(payload.attendees),
    category: safeNullableString(payload.category ?? (Array.isArray(payload.categories) ? payload.categories[0] : null)),
    planner_type: (safeNullableString(payload.planner_type ?? payload.type_category) as 'pro' | 'perso' | null) || null,
    event_type: safeNullableString(payload.event_type ?? payload.type),
    workflow_status: (safeNullableString(payload.workflow_status) as NormalizedEvent['workflow_status']) || 'confirmed',
    priority: Number(payload.priority ?? defaults?.priority ?? 3),
    is_read_only: Boolean(payload.is_read_only ?? defaults?.is_read_only ?? false),
    is_blocking: Boolean(payload.is_blocking ?? defaults?.is_blocking ?? true),
    created_by_ai: Boolean(payload.created_by_ai ?? defaults?.created_by_ai ?? false),
    ai_context: (defaults?.ai_context || {}) as Record<string, unknown>,
    raw_payload: payload,
  };

  return normalized;
}
