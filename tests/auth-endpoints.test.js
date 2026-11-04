'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('account config exposes only the public Supabase URL and publishable key with explicit native CORS', async () => {
  const response = config.onRequestGet({
    request: new Request('https://study.example/api/auth/config', { headers: { Origin: 'capacitor://localhost' } }),
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test_key', SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak', ALLOWED_APP_ORIGINS: 'capacitor://localhost' }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.deepEqual(await response.json(), { configured: true, url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test_key' });
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
    const accepted = await session.onRequestPost({
      request: new Request('https://study.example/api/auth/session', { method: 'POST', headers: { Origin: 'capacitor://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: 'header.payload.signature' }) }),
      env
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(accepted.headers.get('cache-control'), 'no-store');
    assert.match(accepted.headers.get('set-cookie'), /__Host-cci-video-session=/);
    assert.match(accepted.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=None/);
    assert.equal(authorization, 'Bearer header.payload.signature');
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

test('server token validation rejects invalid and missing tokens', async () => {
  assert.equal(await auth.getAuthenticatedUser('', { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-key' }, async () => { throw new Error('must not fetch'); }), null);
  assert.equal(await auth.getAuthenticatedUser('short', { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-key' }, async () => { throw new Error('must not fetch'); }), null);
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
