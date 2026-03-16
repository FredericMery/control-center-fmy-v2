import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callOpenAi } from '@/lib/ai/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_TASK_INBOUND_ADDRESS = 'taskpro@mail.meetsync-ai.com';
const DEFAULT_AGENDA_INBOUND_ADDRESS = 'agend@mail.meetsync-ai.com';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (!isWebhookAuthorized(request, rawBody)) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const payload = rawBody
      ? ((() => {
          try {
            return JSON.parse(rawBody) as unknown;
          } catch {
            return null;
          }
        })())
      : null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const eventData = normalizeEventData(payload as Record<string, unknown>);

    const taskInboundAddress = String(
      process.env.RESEND_TASK_INBOUND_ADDRESS || DEFAULT_TASK_INBOUND_ADDRESS
    )
      .trim()
      .toLowerCase();
    const agendaInboundAddress = String(
      process.env.RESEND_AGENDA_INBOUND_ADDRESS || DEFAULT_AGENDA_INBOUND_ADDRESS
    )
      .trim()
      .toLowerCase();

    const recipientEmails = [
      ...extractEmailList(eventData.to),
      ...extractEmailList(eventData.cc),
      ...extractEmailList(eventData.bcc),
    ];

    const addressedToTaskInbox = recipientEmails.some((email) => email === taskInboundAddress);
    const addressedToAgendaInbox = recipientEmails.some((email) => email === agendaInboundAddress);
    if (!addressedToTaskInbox && !addressedToAgendaInbox) {
      return NextResponse.json({
        ok: true,
        skipped: 'not-supported-inbox',
        expectedTaskInboundAddress: taskInboundAddress,
        expectedAgendaInboundAddress: agendaInboundAddress,
        receivedRecipients: recipientEmails,
      });
    }

    const senderEmail = extractSingleEmail(eventData.from);
    if (!senderEmail) {
      return NextResponse.json({ error: 'Expediteur introuvable' }, { status: 400 });
    }

    const subject = normalizeText(eventData.subject);
    const plainText = normalizeText(eventData.text || eventData.text_body || eventData.snippet);
    const htmlText = normalizeText(eventData.html);
    const bodyForAi = plainText || htmlText;

    const userMatch = await findUserMatchForInboundEmail({
      senderEmail,
      senderRaw: eventData.from,
      subject,
      body: bodyForAi,
    });
    const userId = userMatch?.id || null;
    if (!userId) {
      if (addressedToAgendaInbox) {
        await createInboundCalendarLog({
          userId: null,
          inboxAddress: agendaInboundAddress,
          senderEmail,
          subject,
          eventUid: null,
          status: 'skipped',
          message: 'Utilisateur introuvable pour invitation agenda',
          payload: eventData,
        });

        return NextResponse.json({
          ok: true,
          skipped: 'unknown-sender-agenda-invite',
          senderEmail,
          expectedAgendaInboundAddress: agendaInboundAddress,
        });
      }

      const titleForPending = buildTaskTitle(subject, bodyForAi);
      const fallbackDeadline = resolveTaskDeadline(null, eventData.date || eventData.created_at);
      const senderName = extractSenderName(eventData.from);

      const reviewCandidate = await findPotentialUserForAliasReview({
        senderEmail,
        senderRaw: eventData.from,
        subject,
        body: bodyForAi,
      });

      if (reviewCandidate && reviewCandidate.score >= 50) {
        const requestId = await createInboundAliasReviewRequest({
          userId: reviewCandidate.id,
          senderEmail,
          senderName,
          subject,
          body: bodyForAi,
          inferredTitle: titleForPending,
          inferredDeadline: fallbackDeadline,
        });

        if (requestId) {
          await createAliasReviewNotification({
            userId: reviewCandidate.id,
            requestId,
            senderEmail,
            subject,
          });
        }

        return NextResponse.json({
          ok: true,
          skipped: 'pending-alias-review',
          senderEmail,
          requestId,
          candidateScore: reviewCandidate.score,
        });
      }

      await sendAliasGuidanceEmail({
        senderEmail,
        targetName: senderName || null,
      });

      // On accuse reception sans erreur pour eviter les retries webhook infinis.
      return NextResponse.json({
        ok: true,
        skipped: 'unknown-sender-guidance-sent',
        senderEmail,
        expectedTaskInboundAddress: taskInboundAddress,
        expectedAgendaInboundAddress: agendaInboundAddress,
      });
    }

    if (addressedToAgendaInbox) {
      const calendarUpsert = await upsertAgendaEventFromInboundEmail({
        userId,
        eventData,
        senderEmail,
      });

      if (!calendarUpsert.ok) {
        await createInboundCalendarLog({
          userId,
          inboxAddress: agendaInboundAddress,
          senderEmail,
          subject,
          eventUid: null,
          status: 'error',
          message: calendarUpsert.error,
          payload: eventData,
        });

        return NextResponse.json(
          {
            error: 'Invitation agenda non exploitable',
            details: calendarUpsert.error,
          },
          { status: 422 }
        );
      }

      await createInboundCalendarLog({
        userId,
        inboxAddress: agendaInboundAddress,
        senderEmail,
        subject,
        eventUid: String(calendarUpsert.event?.source_event_id || ''),
        status: 'processed',
        message: 'Invitation agenda importee',
        payload: eventData,
      });

      return NextResponse.json({
        ok: true,
        calendarEvent: calendarUpsert.event,
        matchedUser: {
          score: userMatch?.score || null,
          reason: userMatch?.reason || null,
        },
      });
    }

    const analysis = await analyzeTaskEmail({
      userId,
      subject,
      body: bodyForAi,
      receivedAt: normalizeText(eventData.date || eventData.created_at),
    });

    const title = buildTaskTitle(subject, analysis.description || bodyForAi);
    const deadline = resolveTaskDeadline(analysis.deadlineIso, eventData.date || eventData.created_at);

    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        type: 'pro',
        status: 'todo',
        archived: false,
        deadline,
      })
      .select('id,title,user_id,created_at')
      .single();

    if (error) {
      console.error('resend inbound -> insert task failed', error);
      return NextResponse.json(
        { error: 'Erreur creation tache', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: inserted,
      matchedUser: {
        score: userMatch?.score || null,
        reason: userMatch?.reason || null,
      },
      inferred: {
        deadline,
        usedDefaultDeadline: !analysis.deadlineIso,
        description: analysis.description,
      },
    });
  } catch (error) {
    console.error('resend inbound webhook error', error);
    return NextResponse.json({ error: 'Erreur serveur webhook' }, { status: 500 });
  }
}

async function createInboundCalendarLog(args: {
  userId: string | null;
  inboxAddress: string;
  senderEmail: string | null;
  subject: string;
  eventUid: string | null;
  status: 'processed' | 'skipped' | 'error';
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('inbound_calendar_logs').insert({
      user_id: args.userId,
      inbox_address: args.inboxAddress,
      sender_email: args.senderEmail,
      subject: truncate(args.subject || '', 500) || null,
      event_uid: truncate(args.eventUid || '', 255) || null,
      status: args.status,
      message: truncate(args.message || '', 1000) || null,
      payload: args.payload,
    });
  } catch (error) {
    console.error('create inbound calendar log failed', error);
  }
}

async function upsertAgendaEventFromInboundEmail(args: {
  userId: string;
  eventData: Record<string, unknown>;
  senderEmail: string;
}): Promise<{ ok: true; event: Record<string, unknown> } | { ok: false; error: string }> {
  const icsText = extractIcsTextFromInboundPayload(args.eventData);
  if (!icsText) {
    return { ok: false, error: 'Aucun contenu ICS detecte' };
  }

  const parsed = parseFirstIcsEvent(icsText);
  if (!parsed) {
    return { ok: false, error: 'Impossible de parser VEVENT' };
  }

  if (!parsed.startAt || !parsed.endAt) {
    return { ok: false, error: 'Horaires manquants dans le VEVENT' };
  }

  const sourceEventId = parsed.uid || `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    user_id: args.userId,
    source_id: null,
    source_provider: 'manual',
    source_event_id: sourceEventId,
    title: truncate(parsed.title || 'Rendez-vous pro', 220),
    description: parsed.description || null,
    location: parsed.location || null,
    start_at: parsed.startAt,
    end_at: parsed.endAt,
    timezone: parsed.timezone || 'Europe/Paris',
    all_day: parsed.allDay,
    status: parsed.status,
    organizer_email: parsed.organizerEmail || args.senderEmail,
    attendees: parsed.attendees,
    category: 'pro',
    event_type: 'reunion',
    priority: 3,
    is_read_only: false,
    is_blocking: true,
    created_by_ai: false,
    ai_context: {},
    raw_payload: args.eventData,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .upsert(payload, {
      onConflict: 'source_provider,source_event_id,user_id',
    })
    .select('id,title,start_at,end_at,status,source_provider,source_event_id')
    .single();

  if (error) {
    console.error('agenda inbound -> upsert calendar event failed', error);
    return { ok: false, error: error.message };
  }

  return { ok: true, event: (data || {}) as Record<string, unknown> };
}

function extractIcsTextFromInboundPayload(eventData: Record<string, unknown>): string | null {
  const directFields: unknown[] = [
    eventData['text'],
    eventData['text_body'],
    eventData['html'],
    eventData['raw'],
    eventData['raw_text'],
  ];

  for (const field of directFields) {
    const text = normalizeTextOrEmpty(field);
    if (text.includes('BEGIN:VCALENDAR') && text.includes('BEGIN:VEVENT')) {
      return text;
    }
  }

  const attachments = Array.isArray(eventData['attachments']) ? eventData['attachments'] : [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const record = attachment as Record<string, unknown>;
    const fileName = String(record['filename'] || record['name'] || '').toLowerCase();
    const contentType = String(
      record['content_type'] || record['contentType'] || record['type'] || ''
    ).toLowerCase();

    const isIcsAttachment =
      fileName.endsWith('.ics') ||
      contentType.includes('text/calendar') ||
      contentType.includes('application/ics');

    if (!isIcsAttachment) continue;

    const rawContent = record['content'] ?? record['data'] ?? record['raw'] ?? '';
    const plain = normalizeTextOrEmpty(rawContent);
    if (plain.includes('BEGIN:VCALENDAR') && plain.includes('BEGIN:VEVENT')) {
      return plain;
    }

    const maybeDecoded = decodeBase64ToText(String(rawContent || ''));
    if (maybeDecoded.includes('BEGIN:VCALENDAR') && maybeDecoded.includes('BEGIN:VEVENT')) {
      return maybeDecoded;
    }
  }

  return null;
}

type ParsedIcsEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  organizerEmail: string | null;
  attendees: Array<{ email?: string; name?: string; response?: string }>;
};

function parseFirstIcsEvent(icsText: string): ParsedIcsEvent | null {
  const unfoldedLines = unfoldIcsLines(icsText);
  const startIndex = unfoldedLines.findIndex((line) => line.toUpperCase() === 'BEGIN:VEVENT');
  if (startIndex === -1) return null;

  const endIndex = unfoldedLines.findIndex(
    (line, index) => index > startIndex && line.toUpperCase() === 'END:VEVENT'
  );
  if (endIndex === -1) return null;

  const eventLines = unfoldedLines.slice(startIndex + 1, endIndex);
  const props: Record<string, Array<{ value: string; params: Record<string, string> }>> = {};

  for (const line of eventLines) {
    const parsed = parseIcsLine(line);
    if (!parsed) continue;
    const key = parsed.key.toUpperCase();
    if (!props[key]) props[key] = [];
    props[key].push({ value: parsed.value, params: parsed.params });
  }

  const dtStart = props['DTSTART']?.[0];
  const dtEnd = props['DTEND']?.[0];

  const start = parseIcsDateValue(dtStart?.value || '', dtStart?.params || {});
  const end = parseIcsDateValue(dtEnd?.value || '', dtEnd?.params || {});

  let endAt = end.iso;
  if (!endAt && start.iso) {
    const fallbackEnd = new Date(start.iso);
    fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 60);
    endAt = fallbackEnd.toISOString();
  }

  const attendees = (props['ATTENDEE'] || []).map((entry) => {
    const email = extractMailto(entry.value);
    const name = normalizeText(entry.params['CN']);
    const response = normalizeText(entry.params['PARTSTAT']);
    return {
      email: email || undefined,
      name: name || undefined,
      response: response || undefined,
    };
  });

  const statusRaw = normalizeText(props['STATUS']?.[0]?.value).toUpperCase();
  const status: 'confirmed' | 'tentative' | 'cancelled' =
    statusRaw === 'CANCELLED'
      ? 'cancelled'
      : statusRaw === 'TENTATIVE'
        ? 'tentative'
        : 'confirmed';

  return {
    uid: normalizeText(props['UID']?.[0]?.value),
    title: normalizeText(props['SUMMARY']?.[0]?.value),
    description: normalizeText(props['DESCRIPTION']?.[0]?.value).replace(/\\n/g, '\n'),
    location: normalizeText(props['LOCATION']?.[0]?.value),
    startAt: start.iso,
    endAt,
    timezone: start.timezone || null,
    allDay: start.allDay,
    status,
    organizerEmail: extractMailto(props['ORGANIZER']?.[0]?.value || ''),
    attendees,
  };
}

function parseIcsLine(line: string): { key: string; params: Record<string, string>; value: string } | null {
  const separator = line.indexOf(':');
  if (separator <= 0) return null;

  const left = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawKey, ...paramParts] = left.split(';');
  const key = normalizeText(rawKey).toUpperCase();
  if (!key) return null;

  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const pKey = part.slice(0, eq).toUpperCase().trim();
    const pValue = part.slice(eq + 1).trim();
    if (pKey) params[pKey] = pValue;
  }

  return { key, params, value };
}

function unfoldIcsLines(content: string): string[] {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const unfolded: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }

  return unfolded;
}

function parseIcsDateValue(value: string, params: Record<string, string>): {
  iso: string | null;
  timezone: string | null;
  allDay: boolean;
} {
  const raw = normalizeText(value);
  if (!raw) return { iso: null, timezone: null, allDay: false };

  const timezone = normalizeText(params['TZID']) || null;

  if (/^\d{8}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const iso = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
    return { iso, timezone, allDay: true };
  }

  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) {
    return { iso: null, timezone, allDay: false };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || '0');
  const isUtc = Boolean(match[7]);

  const timestamp = isUtc
    ? Date.UTC(year, month - 1, day, hour, minute, second)
    : Date.UTC(year, month - 1, day, hour, minute, second);
  return { iso: new Date(timestamp).toISOString(), timezone, allDay: false };
}

function decodeBase64ToText(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function normalizeTextOrEmpty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!value) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function extractMailto(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const mailtoMatch = raw.match(/mailto:([^;\s]+)/i);
  if (mailtoMatch?.[1]) {
    return normalizeEmail(mailtoMatch[1]);
  }

  return extractSingleEmail(raw);
}

function isWebhookAuthorized(request: NextRequest, rawBody: string): boolean {
  const configuredToken = String(process.env.RESEND_INBOUND_WEBHOOK_TOKEN || '').trim();
  if (!configuredToken) {
    return true;
  }

  const fromHeader = String(request.headers.get('x-inbound-token') || '').trim();
  const fromQuery = String(request.nextUrl.searchParams.get('token') || '').trim();
  const authorization = String(request.headers.get('authorization') || '').trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const fromBearer = String(bearerMatch?.[1] || '').trim();

  if (
    fromHeader === configuredToken ||
    fromQuery === configuredToken ||
    fromBearer === configuredToken
  ) {
    return true;
  }

  return verifySvixSignature({
    secret: configuredToken,
    rawBody,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    svixSignature: request.headers.get('svix-signature'),
  });
}

function verifySvixSignature(args: {
  secret: string;
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}): boolean {
  const svixId = String(args.svixId || '').trim();
  const svixTimestamp = String(args.svixTimestamp || '').trim();
  const svixSignature = String(args.svixSignature || '').trim();

  if (!svixId || !svixTimestamp || !svixSignature || !args.rawBody) {
    return false;
  }

  const secretValue = args.secret.startsWith('whsec_')
    ? args.secret.slice('whsec_'.length)
    : args.secret;

  let key: Buffer;
  try {
    key = Buffer.from(secretValue, 'base64');
    if (!key.length) {
      key = Buffer.from(secretValue, 'utf8');
    }
  } catch {
    key = Buffer.from(secretValue, 'utf8');
  }

  const signedContent = `${svixId}.${svixTimestamp}.${args.rawBody}`;
  const expected = createHmac('sha256', key).update(signedContent).digest('base64');

  const signatures = svixSignature
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const comma = part.indexOf(',');
      if (comma === -1) return { version: '', value: '' };
      return {
        version: part.slice(0, comma),
        value: part.slice(comma + 1),
      };
    })
    .filter((entry) => entry.version === 'v1' && entry.value);

  const expectedBuf = Buffer.from(expected);

  return signatures.some((entry) => {
    const receivedBuf = Buffer.from(entry.value);
    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(receivedBuf, expectedBuf);
  });
}

function normalizeEventData(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return payload;
}

function extractEmailList(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => extractEmailList(value))
      .filter(Boolean);
  }

  if (typeof input === 'object') {
    const asRecord = input as Record<string, unknown>;
    if (Array.isArray(asRecord.email)) {
      return asRecord.email
        .map((v) => normalizeEmail(v))
        .filter((v): v is string => Boolean(v));
    }
    if (typeof asRecord.email === 'string') {
      const normalized = normalizeEmail(asRecord.email);
      return normalized ? [normalized] : [];
    }
    if (Array.isArray(asRecord.value)) {
      return asRecord.value
        .flatMap((v) => extractEmailList(v))
        .filter(Boolean);
    }
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((part) => extractSingleEmail(part))
      .filter((v): v is string => Boolean(v));
  }

  return [];
}

function extractSingleEmail(input: unknown): string | null {
  if (!input) return null;

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (typeof record.email === 'string') {
      return normalizeEmail(record.email);
    }
    if (typeof record.from === 'string') {
      return extractSingleEmail(record.from);
    }
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const bracketMatch = raw.match(/<([^>]+)>/);
  if (bracketMatch?.[1]) {
    return normalizeEmail(bracketMatch[1]);
  }

  const simpleMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (simpleMatch?.[0]) {
    return normalizeEmail(simpleMatch[0]);
  }

  return null;
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return null;
  return email;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTaskTitle(subject: string, plainText: string): string {
  const normalizedSubject = subject.replace(/^\s*(re|fwd?)\s*:\s*/i, '').trim();

  if (normalizedSubject) {
    return truncate(normalizedSubject, 180);
  }

  if (plainText) {
    const firstSentence = plainText.split(/\.|\n/)[0]?.trim() || plainText;
    return truncate(firstSentence || 'Tache depuis email', 180);
  }

  return 'Tache depuis email';
}

type TaskEmailAnalysis = {
  description: string;
  deadlineIso: string | null;
};

async function analyzeTaskEmail(args: {
  userId: string;
  subject: string;
  body: string;
  receivedAt?: string;
}): Promise<TaskEmailAnalysis> {
  const subject = truncate(normalizeText(args.subject), 240);
  const body = truncate(normalizeText(args.body), 8000);

  if (!subject && !body) {
    return {
      description: 'Tache creee depuis email',
      deadlineIso: null,
    };
  }

  try {
    const model = 'gpt-4.1-mini';
    const response = await callOpenAi({
      userId: args.userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content:
              'You extract actionable professional tasks from incoming emails. Return strict JSON only.',
          },
          {
            role: 'user',
            content: [
              'Analyze this email and return JSON with:',
              '- description: concise professional action sentence in French',
              '- deadline_iso: YYYY-MM-DD if an explicit deadline is present, otherwise null',
              '',
              `received_at: ${args.receivedAt || 'unknown'}`,
              `subject: ${subject}`,
              `body: ${body}`,
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
      response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';

    const parsed = JSON.parse(content) as {
      description?: unknown;
      deadline_iso?: unknown;
    };

    return {
      description: truncate(
        normalizeText(parsed.description) || buildTaskTitle(subject, body),
        180
      ),
      deadlineIso: normalizeIsoDate(parsed.deadline_iso),
    };
  } catch (error) {
    console.error('resend inbound -> ai analysis fallback', error);
    return {
      description: buildTaskTitle(subject, body),
      deadlineIso: null,
    };
  }
}

function resolveTaskDeadline(inferredIso: string | null, eventDate: unknown): string {
  if (inferredIso) {
    return new Date(`${inferredIso}T23:59:59.000Z`).toISOString();
  }

  const baseDate = parseInputDate(eventDate) || new Date();
  const fallback = new Date(baseDate);
  fallback.setUTCDate(fallback.getUTCDate() + 5);
  fallback.setUTCHours(23, 59, 59, 0);
  return fallback.toISOString();
}

function parseInputDate(value: unknown): Date | null {
  if (!value) return null;
  const candidate = new Date(String(value));
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate;
}

function normalizeIsoDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function truncate(value: string, max: number): string {
  const normalized = String(value || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('listUsers failed', error);
      return null;
    }

    const users = data?.users || [];
    const found = users.find((user) => String(user.email || '').toLowerCase() === normalized);
    if (found?.id) {
      return found.id;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

async function findUserIdByAliasEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('user_email_aliases')
    .select('user_id')
    .eq('email_alias', normalized)
    .eq('is_active', true)
    .limit(2);

  if (error) {
    console.error('find alias user failed', error);
    return null;
  }

  if (!data?.length) return null;
  if (data.length > 1) {
    console.warn('resend inbound -> duplicate active aliases detected', {
      email: normalized,
      count: data.length,
    });
    return null;
  }

  return String(data[0]?.user_id || '') || null;
}

type InboundUserMatch = {
  id: string;
  score: number;
  reason: string;
};

async function findUserMatchForInboundEmail(args: {
  senderEmail: string;
  senderRaw: unknown;
  subject: string;
  body: string;
}): Promise<InboundUserMatch | null> {
  const normalizedSender = normalizeEmail(args.senderEmail);
  if (!normalizedSender) return null;

  const aliasUserId = await findUserIdByAliasEmail(normalizedSender);
  if (aliasUserId) {
    return {
      id: aliasUserId,
      score: 150,
      reason: 'email-alias-exact',
    };
  }

  const directUserId = await findUserIdByEmail(normalizedSender);
  if (directUserId) {
    return {
      id: directUserId,
      score: 120,
      reason: 'exact-email',
    };
  }

  const ranked = await rankUserCandidates({
    senderEmail: normalizedSender,
    senderRaw: args.senderRaw,
    subject: args.subject,
    body: args.body,
  });

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 80) {
    return null;
  }

  if (second && best.score - second.score < 15) {
    console.warn('resend inbound -> ambiguous user match', {
      senderEmail: normalizedSender,
      best,
      second,
    });
    return null;
  }

  return best;
}

async function findPotentialUserForAliasReview(args: {
  senderEmail: string;
  senderRaw: unknown;
  subject: string;
  body: string;
}): Promise<InboundUserMatch | null> {
  const normalizedSender = normalizeEmail(args.senderEmail);
  if (!normalizedSender) return null;

  const ranked = await rankUserCandidates({
    senderEmail: normalizedSender,
    senderRaw: args.senderRaw,
    subject: args.subject,
    body: args.body,
  });

  const best = ranked[0];
  if (!best) return null;
  return best;
}

async function rankUserCandidates(args: {
  senderEmail: string;
  senderRaw: unknown;
  subject: string;
  body: string;
}): Promise<InboundUserMatch[]> {
  const users = await listAllAuthUsers();
  if (!users.length) return [];

  const senderName = extractSenderName(args.senderRaw);
  const signatureWindow = `${args.subject}\n${args.body}`.slice(0, 5000);

  return users
    .map((user) => {
      const scoreResult = scoreUserCandidate({
        senderEmail: args.senderEmail,
        senderName,
        signatureWindow,
        user,
      });

      return {
        id: user.id,
        score: scoreResult.score,
        reason: scoreResult.reason,
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function createInboundAliasReviewRequest(args: {
  userId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  body: string;
  inferredTitle: string;
  inferredDeadline: string;
}): Promise<string | null> {
  const normalizedSender = normalizeEmail(args.senderEmail);
  if (!normalizedSender) return null;

  const { data, error } = await supabase
    .from('inbound_alias_requests')
    .insert({
      user_id: args.userId,
      sender_email: normalizedSender,
      sender_name: truncate(normalizeText(args.senderName), 160) || null,
      original_subject: truncate(normalizeText(args.subject), 300) || null,
      original_body: truncate(normalizeText(args.body), 5000) || null,
      inferred_title: truncate(normalizeText(args.inferredTitle), 180) || 'Tache depuis email',
      inferred_deadline: args.inferredDeadline,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('create inbound alias request failed', error);
    return null;
  }

  return String(data?.id || '') || null;
}

async function createAliasReviewNotification(args: {
  userId: string;
  requestId: string;
  senderEmail: string;
  subject: string;
}): Promise<void> {
  const subjectPart = truncate(normalizeText(args.subject), 90);
  const message = subjectPart
    ? `Expediteur inconnu: ${args.senderEmail}. Objet: ${subjectPart}. Valider cet expediteur comme alias ?`
    : `Expediteur inconnu: ${args.senderEmail}. Valider cet expediteur comme alias ?`;

  const { error } = await supabase.from('notifications').insert({
    user_id: args.userId,
    type: 'alias_review',
    ref_key: `alias-review-${args.requestId}`,
    title: 'Validation expediteur requis',
    message,
    read: false,
  });

  if (error) {
    console.error('create alias review notification failed', error);
  }
}

async function sendAliasGuidanceEmail(args: {
  senderEmail: string;
  targetName: string | null;
}): Promise<void> {
  const normalizedSender = normalizeEmail(args.senderEmail);
  if (!normalizedSender || !process.env.RESEND_API_KEY) return;

  const fromAddress = String(process.env.EMAIL_FROM || 'noreply@meetsync-ai.com').trim();
  const greeting = args.targetName ? `Bonjour ${args.targetName},` : 'Bonjour,';

  try {
    await resend.emails.send({
      from: fromAddress,
      to: normalizedSender,
      subject: 'Action requise: preciser le destinataire de la tache',
      text: [
        greeting,
        '',
        'Nous avons bien recu votre email vers taskpro@mail.meetsync-ai.com, mais nous ne pouvons pas identifier le destinataire dans l\'application.',
        'Merci de repondre en indiquant le prenom + nom de la personne a qui attribuer la tache.',
        '',
        'Exemple: "Attribuer a: Prenom Nom"',
        '',
        'Merci.',
      ].join('\n'),
    });
  } catch (error) {
    console.error('send alias guidance email failed', error);
  }
}

async function listAllAuthUsers(): Promise<
  Array<{
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }>
> {
  const allUsers: Array<{
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }> = [];

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('listUsers failed', error);
      return [];
    }

    const users = data?.users || [];
    allUsers.push(
      ...users.map((user) => ({
        id: user.id,
        email: user.email || undefined,
        user_metadata:
          user.user_metadata && typeof user.user_metadata === 'object'
            ? (user.user_metadata as Record<string, unknown>)
            : undefined,
      }))
    );

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return allUsers;
}

function scoreUserCandidate(args: {
  senderEmail: string;
  senderName: string;
  signatureWindow: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
}): { score: number; reason: string } {
  const userEmail = normalizeEmail(args.user.email);
  if (!userEmail) return { score: 0, reason: 'missing-user-email' };

  const senderParts = splitEmailParts(args.senderEmail);
  const userParts = splitEmailParts(userEmail);

  let score = 0;
  const reasons: string[] = [];

  if (senderParts.localCanonical === userParts.localCanonical) {
    score += 85;
    reasons.push('local-match');
  }

  const localSimilarity = similarityRatio(senderParts.localLoose, userParts.localLoose);
  if (localSimilarity >= 0.92) {
    score += 15;
    reasons.push('local-similar');
  }

  if (senderParts.domain === userParts.domain) {
    score += 5;
    reasons.push('same-domain');
  }

  const displayName = extractUserDisplayName(args.user.user_metadata, userEmail);
  if (displayName) {
    const nameTokens = tokenizeWords(displayName);
    const senderNameTokens = tokenizeWords(args.senderName);
    const overlap = countIntersection(nameTokens, senderNameTokens);
    if (overlap >= 2) {
      score += 20;
      reasons.push('sender-name-overlap');
    } else if (overlap === 1) {
      score += 8;
      reasons.push('sender-name-partial');
    }

    const normalizedSignature = normalizeComparableText(args.signatureWindow);
    if (normalizedSignature.includes(normalizeComparableText(displayName))) {
      score += 12;
      reasons.push('signature-name-match');
    }
  }

  return {
    score,
    reason: reasons.join('+') || 'no-strong-signal',
  };
}

function splitEmailParts(email: string): {
  localCanonical: string;
  localLoose: string;
  domain: string;
} {
  const normalized = normalizeEmail(email) || '';
  const [localRaw = '', domainRaw = ''] = normalized.split('@');
  const localCanonical = localRaw.split('+')[0];
  const localLoose = localCanonical.replace(/[^a-z0-9]/g, '');
  const domain = domainRaw.trim();
  return { localCanonical, localLoose, domain };
}

function extractSenderName(input: unknown): string {
  if (!input) return '';

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const fromName = normalizeText(record.name);
    if (fromName) return fromName;
  }

  const raw = String(input || '').trim();
  if (!raw) return '';

  const match = raw.match(/^"?([^<"]+)"?\s*</);
  if (match?.[1]) {
    return normalizeText(match[1]);
  }

  return '';
}

function extractUserDisplayName(
  metadata: Record<string, unknown> | undefined,
  fallbackEmail: string
): string {
  const candidates = [
    metadata?.full_name,
    metadata?.name,
    metadata?.display_name,
    [metadata?.first_name, metadata?.last_name].filter(Boolean).join(' '),
  ];

  for (const value of candidates) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }

  const local = splitEmailParts(fallbackEmail).localCanonical.replace(/[._-]+/g, ' ').trim();
  return normalizeText(local);
}

function tokenizeWords(input: string): string[] {
  return normalizeComparableText(input)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function normalizeComparableText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countIntersection(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let count = 0;
  for (const token of setA) {
    if (setB.has(token)) count += 1;
  }
  return count;
}

function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const setA = buildBigrams(a);
  const setB = buildBigrams(b);
  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }

  return (2 * intersection) / (setA.size + setB.size);
}

function buildBigrams(input: string): Set<string> {
  const normalized = String(input || '').trim();
  const grams = new Set<string>();
  if (normalized.length < 2) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}
