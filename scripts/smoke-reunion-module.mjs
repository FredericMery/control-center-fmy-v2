#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const CRON_SECRET = process.env.REUNION_FOLLOWUP_CRON_SECRET || '';

if (!AUTH_TOKEN) {
  console.error('Missing TEST_AUTH_TOKEN');
  process.exit(1);
}

function authHeaders(json = true) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
}

async function call(method, path, body, json = true, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...authHeaders(json),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return { ok: res.ok, status: res.status, payload };
}

function assertOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
}

async function createMeetingFromPrompt() {
  const prompt = `Create a meeting with Marc and Stephane tomorrow at 10am about Renault project ${Date.now()}`;
  const result = await call('POST', '/api/reunions/meetings', { prompt });
  assertOk(result, 'POST /api/reunions/meetings');

  const meetingId = String(result.payload?.meeting?.id || '');
  if (!meetingId) {
    throw new Error('Meeting id missing after creation');
  }

  return {
    meetingId,
    title: result.payload?.meeting?.title,
    joinUrl: result.payload?.joinUrl || null,
  };
}

async function fetchMeetingDetail(meetingId) {
  const result = await call('GET', `/api/reunions/meetings/${meetingId}`);
  assertOk(result, 'GET /api/reunions/meetings/[id]');

  return {
    participants: Array.isArray(result.payload?.participants) ? result.payload.participants.length : 0,
    actions: Array.isArray(result.payload?.actions) ? result.payload.actions.length : 0,
  };
}

async function processTranscript(meetingId) {
  const transcript = [
    'Marc prend en charge la proposition commerciale pour Renault.',
    'Stephane valide le budget avant vendredi.',
    'On doit relancer le client lundi prochain.',
  ].join(' ');

  const result = await call('POST', `/api/reunions/meetings/${meetingId}/process-record`, {
    transcript,
  });
  assertOk(result, 'POST /api/reunions/meetings/[id]/process-record');

  return {
    extractedActions: Array.isArray(result.payload?.extractedActions)
      ? result.payload.extractedActions.length
      : 0,
    summaryPreview: String(result.payload?.understanding?.executiveSummary || '').slice(0, 120),
  };
}

async function runFollowupCronOptional(type) {
  if (!CRON_SECRET) {
    return { skipped: true, reason: 'REUNION_FOLLOWUP_CRON_SECRET not set' };
  }

  const result = await call(
    'GET',
    `/api/reunions/followups/cron/${type}`,
    null,
    false,
    { Authorization: `Bearer ${CRON_SECRET}` }
  );

  assertOk(result, `GET /api/reunions/followups/cron/${type}`);
  return {
    count: Number(result.payload?.count || 0),
    ok: Boolean(result.payload?.ok),
  };
}

async function run() {
  const summary = {};

  const created = await createMeetingFromPrompt();
  summary.create = created;

  summary.detailBefore = await fetchMeetingDetail(created.meetingId);
  summary.process = await processTranscript(created.meetingId);
  summary.detailAfter = await fetchMeetingDetail(created.meetingId);

  summary.followupDaily = await runFollowupCronOptional('daily');

  console.log('Reunion module smoke tests: OK');
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error('Reunion module smoke tests: FAILED');
  console.error(error.message || error);
  process.exit(1);
});
