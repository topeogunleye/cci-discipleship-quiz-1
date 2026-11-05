'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/transcript/_middleware.js'), 'utf8')
  .replace("import auth from '../_lib/auth.cjs';", "const auth = require('../_lib/auth.cjs');")
  .replace(/export async function /g, 'async function ');
const onRequest = vm.runInNewContext(source + '\n onRequest;', {
  require: request => request === '../_lib/auth.cjs' ? require('../functions/_lib/auth.cjs') : require(request),
  URL,
  Response,
  Headers
});

test('transcript assets require a valid video session and receive private no-store headers', async () => {
  const env = { SUPABASE_URL: 'https://auth.example', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
  let nextCalls = 0, originalFetch;
  const next = async () => {
    nextCalls++;
    return new Response('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA lesson cue.\n', { headers: { 'Content-Type': 'text/vtt' } });
  };
  const request = cookie => new Request('https://study.example/transcript/lesson.vtt', {
    headers: cookie ? { Cookie: '__Host-cci-video-session=' + cookie } : {}
  });

  const denied = await onRequest({ request: request(''), env, next });
  assert.equal(denied.status, 401);
  assert.equal(nextCalls, 0);

  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const allowed = await onRequest({ request: request('header.payload.signature'), env, next });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA lesson cue.\n');
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
    assert.equal(allowed.headers.get('content-type'), 'text/vtt');
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(nextCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transcript middleware rejects non-WebVTT paths and methods before continuing', async () => {
  const env = {};
  let nextCalls = 0;
  const next = async () => { nextCalls++; return new Response('asset'); };
  const invalidPath = await onRequest({ request: new Request('https://study.example/transcript/../other.js'), env, next });
  assert.equal(invalidPath.status, 404);
  const invalidMethod = await onRequest({ request: new Request('https://study.example/transcript/lesson.vtt', { method: 'POST' }), env, next });
  assert.equal(invalidMethod.status, 405);
  assert.equal(nextCalls, 0);
});
