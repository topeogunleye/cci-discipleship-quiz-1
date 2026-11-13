'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const transcriptManifest = require('../content/lesson-transcripts.json');
const videoCatalog = require('../functions/_lib/video-catalog.cjs');
const transcriptMapping = transcriptManifest.transcripts[0];
const transcriptFilename = transcriptMapping.file.replace(/\.srt$/i, '.vtt');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/transcript/_middleware.js'), 'utf8')
  .replace("import auth from '../_lib/auth.cjs';", "const auth = require('../_lib/auth.cjs');")
  .replace("import transcripts from '../_generated/lesson-transcripts.cjs';", "const transcripts = require('../_generated/lesson-transcripts.cjs');")
  .replace("import videoCatalog from '../_lib/video-catalog.cjs';", "const videoCatalog = require('../_lib/video-catalog.cjs');")
  .replace(/export async function /g, 'async function ');
const passage = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA lesson cue.\n';
const onRequest = vm.runInNewContext(source + '\n onRequest;', {
  require: request => request === '../_lib/auth.cjs' ? require('../functions/_lib/auth.cjs') : (request === '../_lib/video-catalog.cjs' ? videoCatalog : { [transcriptFilename]: passage }),
  URL,
  Response,
  Headers,
  TextEncoder
});

test('transcript assets require a valid video session and receive private no-store headers', async () => {
  const env = { SUPABASE_URL: 'https://auth.example', SUPABASE_ANON_KEY: 'sb_publishable_test_key', VIDEO_AUTH_MODE: 'remote' };
  let nextCalls = 0, originalFetch;
  const next = async () => { nextCalls++; throw new Error('Private transcripts must never fall through to static assets.'); };
  const request = (cookie, method = 'GET', file = transcriptFilename, origin) => new Request('https://study.example/transcript/' + file, {
    method,
    headers: { ...(cookie ? { Cookie: '__Host-cci-video-session=' + cookie } : {}), ...(origin ? { Origin: origin } : {}) }
  });

  const denied = await onRequest({ request: request(''), env, next });
  assert.equal(denied.status, 401);
  assert.equal(nextCalls, 0);

  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const allowed = await onRequest({ request: request('header.payload.signature'), env, next });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), passage);
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
    assert.equal(allowed.headers.get('content-type'), 'text/vtt; charset=utf-8');
    assert.equal(allowed.headers.get('content-length'), String(Buffer.byteLength(passage)));
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    const head = await onRequest({ request: request('header.payload.signature', 'HEAD'), env, next });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(head.headers.get('content-length'), allowed.headers.get('content-length'));
    const missing = await onRequest({ request: request('header.payload.signature', 'GET', 'missing.vtt'), env, next });
    assert.equal(missing.status, 404);
    const deniedOrigin = await onRequest({ request: request('header.payload.signature', 'GET', transcriptFilename, 'https://other.example'), env, next });
    assert.equal(deniedOrigin.status, 403);
    const nativeEnv = { ...env, ALLOWED_APP_ORIGINS: 'capacitor://localhost' };
    const native = await onRequest({ request: request('header.payload.signature', 'GET', transcriptFilename, 'capacitor://localhost'), env: nativeEnv, next });
    assert.equal(native.status, 200);
    assert.equal(native.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal(native.headers.get('access-control-allow-credentials'), 'true');
    const preflight = await onRequest({ request: request('', 'OPTIONS', transcriptFilename, 'capacitor://localhost'), env: nativeEnv, next });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal(nextCalls, 0);
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

test('transcript route distinguishes invalid credentials from retryable Auth failures', async () => {
  const env = { SUPABASE_URL: 'https://auth.example', SUPABASE_ANON_KEY: 'sb_publishable_test_key', VIDEO_AUTH_MODE: 'remote', ALLOWED_APP_ORIGINS: 'capacitor://localhost' };
  const originalFetch = globalThis.fetch;
  const request = () => new Request('https://study.example/transcript/' + transcriptFilename, {
    headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Origin: 'capacitor://localhost' }
  });
  try {
    globalThis.fetch = async () => new Response('{"secret":"never returned"}', { status: 401 });
    const invalid = await onRequest({ request: request(), env });
    assert.equal(invalid.status, 401);

    for (const fetcher of [
      async () => new Response('{"secret":"never returned"}', { status: 429, headers: { 'Retry-After': '12' } }),
      async () => new Response('{"secret":"never returned"}', { status: 502 }),
      async () => { throw new Error('private transport details'); }
    ]) {
      globalThis.fetch = fetcher;
      const unavailable = await onRequest({ request: request(), env });
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get('cache-control'), 'no-store');
      assert.equal(unavailable.headers.get('access-control-allow-origin'), 'capacitor://localhost');
      assert.equal(unavailable.headers.get('access-control-allow-credentials'), 'true');
      assert.doesNotMatch(await unavailable.text(), /never returned|private transport details/);
    }
  } finally { globalThis.fetch = originalFetch; }
});


test('transcript endpoint allows playback tickets in query parameter without cookies', async () => {
  const env = {
    SUPABASE_URL: 'https://auth.example',
    SUPABASE_ANON_KEY: 'sb_publishable_test_key',
    VIDEO_TICKET_SECRET: 'test-video-ticket-secret-at-least-32-bytes',
    ALLOWED_APP_ORIGINS: 'capacitor://localhost'
  };
  const auth = require('../functions/_lib/auth.cjs');
  const validTicket = await auth.createPlaybackTicket('123e4567-e89b-12d3-a456-426614174000', transcriptMapping.videoId, 3600, env);
  const mismatchTicket = await auth.createPlaybackTicket('123e4567-e89b-12d3-a456-426614174000', 'other-video', 3600, env);
  const wildcardTicket = await auth.createPlaybackTicket('123e4567-e89b-12d3-a456-426614174000', '*', 3600, env);
  assert.equal(wildcardTicket, null);

  // Valid lesson-scoped ticket in ?ticket= query parameter without cookies
  const allowed = await onRequest({
    request: new Request('https://study.example/transcript/' + transcriptFilename + '?ticket=' + encodeURIComponent(validTicket), {
      headers: { Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), passage);

  // A ticket for another video cannot access this transcript.
  const mismatched = await onRequest({
    request: new Request('https://study.example/transcript/' + transcriptFilename + '?ticket=' + encodeURIComponent(mismatchTicket), {
      headers: { Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(mismatched.status, 401);

  // Legacy `token` query parameters are not accepted.
  const tokenQuery = await onRequest({
    request: new Request('https://study.example/transcript/' + transcriptFilename + '?token=' + encodeURIComponent(validTicket), {
      headers: { Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(tokenQuery.status, 401);
});
