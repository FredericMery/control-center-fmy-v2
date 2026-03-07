#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const VALIDATION_CODE = process.env.AI_VALIDATION_CODE || '050100';
const TEST_IMAGE_BASE64 = process.env.TEST_IMAGE_BASE64 || '';

if (!AUTH_TOKEN) {
  console.error('Missing TEST_AUTH_TOKEN');
  process.exit(1);
}

function headers(json = true) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
}

async function call(method, path, body, json = true) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(json),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    payload,
  };
}

function assertOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed (${result.status}): ${JSON.stringify(result.payload)}`);
  }
}

async function testSubscription() {
  const getSub = await call('GET', '/api/settings/subscription');
  assertOk(getSub, 'GET subscription');

  const putSub = await call('PUT', '/api/settings/subscription', { plan: 'BASIC' });
  assertOk(putSub, 'PUT subscription');

  return {
    currentPlan: putSub.payload?.subscription?.plan,
    features: putSub.payload?.subscription?.features,
  };
}

async function testMemoryCreateAndSearch() {
  const create = await call('POST', '/api/memory/cards', {
    title: `Smoke test memory ${Date.now()}`,
    type: 'note',
    content: 'Test content for vector search',
    structured_data: { category: 'smoke' },
    validationCode: VALIDATION_CODE,
  });
  assertOk(create, 'POST memory/cards');

  const memoryId = create.payload?.memory?.id;

  const search = await call('POST', '/api/memory/search', {
    query: 'smoke test memory',
    validationCode: VALIDATION_CODE,
    limit: 5,
  });
  assertOk(search, 'POST memory/search');

  return {
    createdMemoryId: memoryId,
    searchCount: search.payload?.count || 0,
  };
}

async function testAskAgent() {
  const ask = await call('POST', '/api/memory/ask', {
    question: 'Donne un resume de mes dernieres memoires',
    validationCode: VALIDATION_CODE,
  });
  assertOk(ask, 'POST memory/ask');

  return {
    answerPreview: String(ask.payload?.answer || '').slice(0, 120),
  };
}

async function testIngestImage() {
  if (!TEST_IMAGE_BASE64) {
    return { skipped: true, reason: 'TEST_IMAGE_BASE64 not set' };
  }

  const ingest = await call('POST', '/api/memory/ingest', {
    imageBase64: TEST_IMAGE_BASE64,
    validationCode: VALIDATION_CODE,
  });
  assertOk(ingest, 'POST memory/ingest');

  return {
    memoryId: ingest.payload?.memory?.id,
    linkedCount: ingest.payload?.linkedCount || 0,
  };
}

async function run() {
  const summary = {};

  summary.subscription = await testSubscription();
  summary.memory = await testMemoryCreateAndSearch();
  summary.ask = await testAskAgent();
  summary.ingest = await testIngestImage();

  console.log('AI Memory smoke tests: OK');
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error('AI Memory smoke tests: FAILED');
  console.error(error.message || error);
  process.exit(1);
});
