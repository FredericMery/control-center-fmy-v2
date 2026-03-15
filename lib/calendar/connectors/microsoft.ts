import { createClient } from '@supabase/supabase-js';
import { mapProviderEventToNormalized, upsertNormalizedEvents } from '@/lib/calendar/eventService';
import { CalendarSource } from '@/lib/calendar/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing`);
  return value;
}

function getMicrosoftConfig() {
  return {
    clientId: requireEnv('MICROSOFT_CLIENT_ID'),
    clientSecret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: requireEnv('MICROSOFT_REDIRECT_URI'),
  };
}

function getTokenUrl() {
  const { tenantId } = getMicrosoftConfig();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

function getAuthorizeUrl() {
  const { tenantId } = getMicrosoftConfig();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}

export function getMicrosoftAuthUrl(args: { state: string; prompt?: 'select_account' | 'consent' }) {
  const { clientId, redirectUri } = getMicrosoftConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'offline_access User.Read Calendars.Read Calendars.ReadWrite',
    state: args.state,
  });

  if (args.prompt) params.set('prompt', args.prompt);
  return `${getAuthorizeUrl()}?${params.toString()}`;
}

export async function exchangeMicrosoftCodeForToken(code: string) {
  const { clientId, clientSecret, redirectUri } = getMicrosoftConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'offline_access User.Read Calendars.Read Calendars.ReadWrite',
  });

  const response = await fetch(getTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error_description || 'Microsoft token exchange failed');
  }

  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const { clientId, clientSecret, redirectUri } = getMicrosoftConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
    grant_type: 'refresh_token',
    scope: 'offline_access User.Read Calendars.Read Calendars.ReadWrite',
  });

  const response = await fetch(getTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error_description || 'Microsoft refresh token failed');
  }

  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function graphRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.message || 'Microsoft Graph request failed');
  }
  return json as T;
}

export async function fetchMicrosoftEvents(args: {
  accessToken: string;
  startAt: string;
  endAt: string;
  calendarId?: string;
}) {
  const calendarPath = args.calendarId
    ? `/me/calendars/${encodeURIComponent(args.calendarId)}/calendarView`
    : '/me/calendar/calendarView';

  let next = `${calendarPath}?startDateTime=${encodeURIComponent(args.startAt)}&endDateTime=${encodeURIComponent(
    args.endAt
  )}&$top=100`;
  const items: Array<Record<string, unknown>> = [];

  while (next) {
    const json = await graphRequest<{ value: Array<Record<string, unknown>>; '@odata.nextLink'?: string }>(
      args.accessToken,
      next.startsWith('http') ? next.replace(MICROSOFT_GRAPH_BASE, '') : next
    );

    items.push(...(json.value || []));
    next = json['@odata.nextLink'] || '';
  }

  return items;
}

export function mapMicrosoftEventToNormalizedEvent(args: {
  userId: string;
  sourceId: string;
  event: Record<string, unknown>;
}) {
  const sourceEventId = String(args.event.id || '');
  if (!sourceEventId) {
    throw new Error('Microsoft event without id');
  }

  return mapProviderEventToNormalized({
    userId: args.userId,
    sourceId: args.sourceId,
    sourceProvider: 'microsoft',
    sourceEventId,
    payload: {
      subject: args.event.subject,
      bodyPreview: args.event.bodyPreview,
      location: (args.event.location as Record<string, unknown> | undefined)?.displayName,
      start: args.event.start,
      end: args.event.end,
      isAllDay: args.event.isAllDay,
      showAs: args.event.showAs,
      webLink: args.event.webLink,
      organizer: args.event.organizer,
      attendees: args.event.attendees,
      categories: args.event.categories,
      type: args.event.type,
      '@odata.etag': args.event['@odata.etag'],
    },
    defaults: {
      is_read_only: false,
      is_blocking: true,
      category: 'pro',
      event_type: 'reunion',
      priority: 3,
    },
  });
}

export async function createMicrosoftEvent(args: {
  accessToken: string;
  calendarId?: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  attendees?: Array<{ email: string; name?: string }>;
  description?: string;
  location?: string;
}) {
  const path = args.calendarId
    ? `/me/calendars/${encodeURIComponent(args.calendarId)}/events`
    : '/me/calendar/events';

  return graphRequest<Record<string, unknown>>(args.accessToken, path, {
    method: 'POST',
    body: JSON.stringify({
      subject: args.title,
      body: {
        contentType: 'text',
        content: args.description || '',
      },
      start: { dateTime: args.startAt, timeZone: args.timezone },
      end: { dateTime: args.endAt, timeZone: args.timezone },
      location: args.location ? { displayName: args.location } : undefined,
      attendees: (args.attendees || []).map((a) => ({
        emailAddress: { address: a.email, name: a.name || a.email },
        type: 'required',
      })),
    }),
  });
}

export async function updateMicrosoftEvent(args: {
  accessToken: string;
  eventId: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  description?: string;
}) {
  return graphRequest<Record<string, unknown>>(args.accessToken, `/me/events/${encodeURIComponent(args.eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subject: args.title,
      body: args.description
        ? {
            contentType: 'text',
            content: args.description,
          }
        : undefined,
      start: args.startAt && args.timezone ? { dateTime: args.startAt, timeZone: args.timezone } : undefined,
      end: args.endAt && args.timezone ? { dateTime: args.endAt, timeZone: args.timezone } : undefined,
    }),
  });
}

export async function deleteMicrosoftEvent(args: { accessToken: string; eventId: string }) {
  await graphRequest(args.accessToken, `/me/events/${encodeURIComponent(args.eventId)}`, {
    method: 'DELETE',
  });
}

async function getValidMicrosoftAccessToken(source: CalendarSource): Promise<{
  accessToken: string;
  refreshedSource: CalendarSource;
}> {
  const expiresAt = source.token_expires_at ? new Date(source.token_expires_at).getTime() : 0;
  if (source.access_token && expiresAt > Date.now() + 60_000) {
    return { accessToken: source.access_token, refreshedSource: source };
  }

  if (!source.refresh_token) {
    throw new Error('Microsoft refresh token missing');
  }

  const refreshed = await refreshMicrosoftAccessToken(source.refresh_token);
  const nextExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const { data, error } = await supabase
    .from('calendar_sources')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || source.refresh_token,
      token_expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', source.id)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to persist refreshed token: ${error.message}`);

  return { accessToken: refreshed.access_token, refreshedSource: data as CalendarSource };
}

export async function syncMicrosoftCalendar(args: {
  userId: string;
  sourceId: string;
  range?: { startAt: string; endAt: string };
}) {
  const { data: source, error: sourceError } = await supabase
    .from('calendar_sources')
    .select('*')
    .eq('id', args.sourceId)
    .eq('user_id', args.userId)
    .eq('provider', 'microsoft')
    .single();

  if (sourceError || !source) {
    throw new Error('Microsoft source not found');
  }

  const sourceRow = source as CalendarSource;
  const syncRun = await supabase
    .from('calendar_sync_runs')
    .insert({ source_id: sourceRow.id, status: 'running' })
    .select('id')
    .single();
  const syncRunId = syncRun.data?.id;

  try {
    const { accessToken } = await getValidMicrosoftAccessToken(sourceRow);
    const startAt = args.range?.startAt || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const endAt = args.range?.endAt || new Date(Date.now() + 120 * 24 * 3600 * 1000).toISOString();

    const events = await fetchMicrosoftEvents({
      accessToken,
      startAt,
      endAt,
      calendarId: sourceRow.external_calendar_id || undefined,
    });

    const normalized = events.map((event) =>
      mapMicrosoftEventToNormalizedEvent({
        userId: args.userId,
        sourceId: sourceRow.id,
        event,
      })
    );

    const result = await upsertNormalizedEvents(normalized);

    await supabase
      .from('calendar_sources')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
      })
      .eq('id', sourceRow.id);

    if (syncRunId) {
      await supabase
        .from('calendar_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'success',
          items_created: result.created,
          items_updated: result.updated,
          items_skipped: result.skipped,
        })
        .eq('id', syncRunId);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Microsoft sync failed';

    await supabase
      .from('calendar_sources')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        last_sync_error: message,
      })
      .eq('id', sourceRow.id);

    if (syncRunId) {
      await supabase
        .from('calendar_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          error_message: message,
        })
        .eq('id', syncRunId);
    }

    throw error;
  }
}
