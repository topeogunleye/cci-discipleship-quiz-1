'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const auth = require('../functions/_lib/auth.cjs');

function loadFunction(file, exportName) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/import auth from ['"][^'"]+['"];/, "const auth = require('../functions/_lib/auth.cjs');")
    .replace(/export async function /g, 'async function ')
    .replace(/export function /g, 'function ');
  return vm.runInNewContext(source + `\n${exportName}`, { require, URL, Response, Headers, Request });
}

const config = loadFunction('functions/api/auth/config.js', '({ onRequestGet, onRequestOptions })');
const session = loadFunction('functions/api/auth/session.js', '({ onRequestPost, onRequestOptions })');

function makeEs256Token(pair, options) {
  options = options || {};
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const kid = options.kid || 'auth-key-1';
  const claims = {
    iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: '123e4567-e89b-12d3-a456-426614174000', exp: Math.floor(Date.now() / 1000) + 3600,
    ...(options.claims || {})
  };
  const input = encode({ alg: options.alg || 'ES256', kid, typ: 'JWT' }) + '.' + encode(claims);
  const signature = crypto.sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return input + '.' + signature;
}

function exportEs256PublicKey(pair, kid) {
  return { ...pair.publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig', key_ops: ['verify'] };
}

function makeRemoteValidatedSessionToken(exp) {
  return 'e30.' + Buffer.from(JSON.stringify({ sub: '123e4567-e89b-12d3-a456-426614174000', exp: exp || Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.c2ln';
}

test('configured current and legacy native origins can discover accounts and preflight sessions', () => {
  const origins = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
  const env = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
    ALLOWED_APP_ORIGINS: fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8').match(/^ALLOWED_APP_ORIGINS\s*=\s*"([^"]+)"/m)[1]
  };
  for (const origin of origins) {
    const accountConfig = config.onRequestGet({ request: new Request('https://study.example/api/auth/config', { headers: { Origin: origin } }), env });
    const preflight = session.onRequestOptions({ request: new Request('https://study.example/api/auth/session', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), env });
    assert.equal(accountConfig.status, 200);
    assert.equal(preflight.status, 204);
    for (const response of [accountConfig, preflight]) {
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.match(response.headers.get('vary'), /Origin/);
    }
  }
  const rejected = session.onRequestOptions({ request: new Request('https://study.example/api/auth/session', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } }), env });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('account config exposes only the public Supabase URL and publishable key with explicit native CORS', async () => {
  const response = config.onRequestGet({
    request: new Request('https://study.example/api/auth/config', { headers: { Origin: 'capacitor://localhost' } }),
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key', SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak', ALLOWED_APP_ORIGINS: 'capacitor://localhost' }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.deepEqual(await response.json(), { configured: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key' });
});

test('account config accepts the Pages publishable-key variable and rejects an Authorization header pasted as its value', async () => {
  const request = new Request('https://study.example/api/auth/config');
  const valid = config.onRequestGet({
    request,
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key' }
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { configured: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key' });

  const prefixed = config.onRequestGet({
    request,
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'Authorization: Token sb_publishable_test_key' }
  });
  assert.equal(prefixed.status, 503);
  assert.deepEqual(await prefixed.json(), { configured: false });
});

test('session endpoint rejects unapproved origins and sets an HttpOnly secure video cookie for a valid user', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key', ALLOWED_APP_ORIGINS: 'capacitor://localhost' };
  const forbidden = await session.onRequestPost({
    request: new Request('https://study.example/api/auth/session', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'header.payload.signature' }) }),
    env
  });
  assert.equal(forbidden.status, 403);

  const originalFetch = globalThis.fetch;
  let authorization;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://project.supabase.co/auth/v1/user');
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  };
  try {
    const sessionToken = makeRemoteValidatedSessionToken();
    const accepted = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', { method: 'POST', headers: { Origin: 'capacitor://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: sessionToken }) }),
      env
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    assert.match(accepted.headers.get('set-cookie'), /__Host-cci-video-session=/);
    assert.match(accepted.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=None/);
    assert.match(accepted.headers.get('set-cookie'), /Max-Age=(?:600|59\d)/, 'cookie lifetime should follow the access token expiry');
    assert.equal(authorization, 'Bearer ' + sessionToken);
  } finally { globalThis.fetch = originalFetch; }
});

test('video cookie lifetime never exceeds the access token or one-hour cap', () => {
  assert.match(auth.videoCookie('access-token', 90), /Max-Age=90(?:;|$)/);
  assert.match(auth.videoCookie('access-token', 7200), /Max-Age=3600(?:;|$)/);
  assert.match(auth.videoCookie('', 3600), /Max-Age=0(?:;|$)/);
});

test('session endpoint refuses to issue a video cookie for a token without a future expiration', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const response = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: makeRemoteValidatedSessionToken(Math.floor(Date.now() / 1000) - 1) })
      }),
      env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' }
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  } finally { globalThis.fetch = originalFetch; }
});

test('session endpoint refuses to bind a cookie when token subject differs from validated Supabase user', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '223e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const response = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: makeRemoteValidatedSessionToken() })
      }),
      env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' }
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  } finally { globalThis.fetch = originalFetch; }
});

test('session endpoint clears the existing cookie without contacting Supabase', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('clear must not validate a token'); };
  try {
    const response = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) }),
      env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  } finally { globalThis.fetch = originalFetch; }
});

test('session renewal distinguishes invalid tokens from retryable Supabase failures', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
  const originalFetch = globalThis.fetch;
  const request = () => new Request('https://study.example/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://study.example' },
    body: JSON.stringify({ accessToken: makeRemoteValidatedSessionToken() })
  });
  try {
    globalThis.fetch = async () => new Response('{"message":"invalid"}', { status: 401 });
    const invalid = await session.onRequestPost({ request: request(), env });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.headers.get('set-cookie'), null);

    for (const scenario of [
      { label: 'rate limited', fetch: async () => new Response('{"secret":"do not expose"}', { status: 429, headers: { 'Retry-After': '19' } }), retryAfter: '19' },
      { label: 'server error', fetch: async () => new Response('{"secret":"do not expose"}', { status: 503 }), retryAfter: '30' },
      { label: 'network failure', fetch: async () => { throw new Error('private network details'); }, retryAfter: '30' }
    ]) {
      globalThis.fetch = scenario.fetch;
      const response = await session.onRequestPost({ request: request(), env });
      assert.equal(response.status, 503, scenario.label);
      assert.equal(response.headers.get('retry-after'), scenario.retryAfter);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://study.example');
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.doesNotMatch(await response.text(), /do not expose|private network details/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('server token validation rejects invalid and missing tokens', async () => {
  assert.equal(await auth.getAuthenticatedUser('', { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-key' }, async () => { throw new Error('must not fetch'); }), null);
  assert.equal(await auth.getAuthenticatedUser('short', { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-key' }, async () => { throw new Error('must not fetch'); }), null);
});

test('local Supabase JWT verification checks ES256 signature, issuer, audience, role, subject, exp, and nbf', async () => {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
  const originalFetch = globalThis.fetch;
  let jwksRequests = 0;
  auth.__test.resetJwksCache();
  globalThis.fetch = async url => {
    jwksRequests++;
    assert.equal(String(url), 'https://project.supabase.co/auth/v1/.well-known/jwks.json');
    return new Response(JSON.stringify({ keys: [exportEs256PublicKey(pair, 'auth-key-1')] }), { status: 200 });
  };
  try {
    const token = makeEs256Token(pair, { claims: { nbf: Math.floor(Date.now() / 1000) - 1 } });
    assert.deepEqual(await auth.verifySupabaseAccessToken(token, env), { id: '123e4567-e89b-12d3-a456-426614174000' });
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { exp: Math.floor(Date.now() / 1000) - 1 } }), env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { aud: 'anon' } }), env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { iss: 'https://wrong.example/auth/v1' } }), env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { role: 'service_role' } }), env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { sub: 'wrong-user' } }), env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { claims: { nbf: Math.floor(Date.now() / 1000) + 120 } }), env), null);
    const tamperedParts = token.split('.');
    tamperedParts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(tamperedParts[1], 'base64url').toString()), sub: '123e4567-e89b-12d3-a456-426614174001' })).toString('base64url');
    assert.equal(await auth.verifySupabaseAccessToken(tamperedParts.join('.'), env), null);
    assert.equal(await auth.verifySupabaseAccessToken('not.a.jwt', env), null);
    assert.equal(await auth.verifySupabaseAccessToken(makeEs256Token(pair, { alg: 'none' }), env), null);
    assert.equal(jwksRequests, 1, 'verification should use the cached public key after the first lookup');
  } finally {
    globalThis.fetch = originalFetch;
    auth.__test.resetJwksCache();
  }
});

test('local Supabase JWT verification refreshes JWKS once when a key id rotates', async () => {
  const oldPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const nextPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const env = { SUPABASE_URL: 'https://rotation.example', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
  const originalFetch = globalThis.fetch;
  let jwksRequests = 0;
  auth.__test.resetJwksCache();
  globalThis.fetch = async () => {
    jwksRequests++;
    return new Response(JSON.stringify({ keys: jwksRequests === 1
      ? [exportEs256PublicKey(oldPair, 'old-key')]
      : [exportEs256PublicKey(nextPair, 'new-key')] }), { status: 200 });
  };
  try {
    const oldToken = makeEs256Token(oldPair, { kid: 'old-key', claims: { iss: 'https://rotation.example/auth/v1' } });
    const nextToken = makeEs256Token(nextPair, { kid: 'new-key', claims: { iss: 'https://rotation.example/auth/v1' } });
    assert.ok(await auth.verifySupabaseAccessToken(oldToken, env));
    assert.ok(await auth.verifySupabaseAccessToken(nextToken, env));
    assert.equal(jwksRequests, 2, 'unknown kid should trigger one refresh for rotation');
  } finally {
    globalThis.fetch = originalFetch;
    auth.__test.resetJwksCache();
  }
});

test('legacy HS256 verification requires a protected secret or explicit remote compatibility mode', async () => {
  const secret = 'test-only-supabase-jwt-secret-with-sufficient-entropy';
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key', SUPABASE_JWT_SECRET: secret };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
    iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: '123e4567-e89b-12d3-a456-426614174000', exp: Math.floor(Date.now() / 1000) + 3600
  });
  const token = input + '.' + crypto.createHmac('sha256', secret).update(input).digest('base64url');
  assert.deepEqual(await auth.verifySupabaseAccessToken(token, env), { id: '123e4567-e89b-12d3-a456-426614174000' });
  await assert.rejects(auth.verifySupabaseAccessToken(token, { ...env, SUPABASE_JWT_SECRET: '' }), error => error.name === 'AuthServiceUnavailableError');
});

test('server token validation throws a safe retryable error for Supabase outages and rejects only 401 credentials', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key' };
  const token = 'header.payload.signature';
  const invalid = await auth.getAuthenticatedUser(token, env, async () => new Response('not included', { status: 401 }));
  assert.equal(invalid, null);

  for (const scenario of [
    { status: 429, headers: { 'Retry-After': '17' }, retryAfter: 17 },
    { status: 500, headers: {}, retryAfter: 30 },
    { status: 403, headers: {}, retryAfter: 30 }
  ]) {
    await assert.rejects(
      auth.getAuthenticatedUser(token, env, async () => new Response('secret upstream response', { status: scenario.status, headers: scenario.headers })),
      error => error.name === 'AuthServiceUnavailableError' && error.retryAfter === scenario.retryAfter
    );
  }
  await assert.rejects(
    auth.getAuthenticatedUser(token, env, async () => { throw new Error('private transport detail'); }),
    error => error.name === 'AuthServiceUnavailableError' && error.retryAfter === 30
  );
  await assert.rejects(
    auth.getAuthenticatedUser(token, env, async () => new Response('invalid json', { status: 200 })),
    error => error.name === 'AuthServiceUnavailableError'
  );

  const response = auth.authServiceUnavailableResponse(new Request('https://study.example/api/videos', { headers: { Origin: 'capacitor://localhost' } }), { ALLOWED_APP_ORIGINS: 'capacitor://localhost' }, { retryAfter: 17 });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '17');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.doesNotMatch(await response.text(), /secret|private/);
});

test('Supabase service-role and secret keys are rejected before being exposed to the browser', async () => {
  const makeJwt = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.equal(auth.isPublishableKey(makeJwt('anon')), true);
  assert.equal(auth.isPublishableKey(makeJwt('service_role')), false);
  assert.equal(auth.isPublishableKey('sb_secret_private_key_value'), false);
  const response = config.onRequestGet({ request: new Request('https://study.example/api/auth/config'), env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: makeJwt('service_role') } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { configured: false });
});

test('progress migration enforces row-level security and version-checked owner-scoped writes', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261103000000_user_progress.sql'), 'utf8');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /p_data ->> 'schemaVersion' <> '2'/i);
  assert.match(migration, /where user_id = current_user_id and version = p_expected_version/i);
  assert.match(migration, /grant execute on function public\.get_user_progress\(\) to authenticated/i);
  assert.match(migration, /grant execute on function public\.sync_user_progress\(bigint, jsonb\) to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|all)[^;]+on table public\.user_progress to authenticated/i);
});

test('Phase 4 migration hardens progress indexes and bounds RPC statement timeouts for connection pooling', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107000000_progress_indexing_and_pooling.sql'), 'utf8');
  assert.match(migration, /create index if not exists idx_user_progress_updated_at\s+on public\.user_progress\s*\(updated_at desc\);/i);
  assert.match(migration, /create index if not exists idx_user_progress_user_version\s+on public\.user_progress\s*\(user_id,\s*version\);/i);
  assert.match(migration, /alter function public\.get_user_progress\(\)\s+set statement_timeout = '5s';/i);
  assert.match(migration, /alter function public\.sync_user_progress\(bigint,\s*jsonb\)\s+set statement_timeout = '10s';/i);
});


test('session endpoint generates and returns a scoped playback ticket in JSON response', async () => {
  const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key', ALLOWED_APP_ORIGINS: 'capacitor://localhost' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const sessionToken = makeRemoteValidatedSessionToken();
    const response = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', {
        method: 'POST',
        headers: { Origin: 'capacitor://localhost', 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: sessionToken, key: 'lesson/video1.mp4' })
      }),
      env
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.user.id, '123e4567-e89b-12d3-a456-426614174000');
    assert.ok(typeof data.ticket === 'string' && data.ticket.length > 20);

    // Verify the ticket directly with auth.verifyPlaybackTicket
    const verified = await auth.verifyPlaybackTicket(data.ticket, 'lesson/video1.mp4', env);
    assert.ok(verified);
    assert.equal(verified.id, '123e4567-e89b-12d3-a456-426614174000');

    // Scoped ticket for 'lesson/video1.mp4' fails for 'lesson/video2.mp4'
    const wrongKey = await auth.verifyPlaybackTicket(data.ticket, 'lesson/video2.mp4', env);
    assert.equal(wrongKey, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
