'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { create } = require('../js/account.js');
const Sync = require('../js/progress-sync.js');

test('browser account discovers the Supabase global without dependency injection', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let clientCreated = false, configRequested = false;
  const browser = {
    Supabase: { createClient(url, key) {
      assert.equal(url, 'https://project.supabase.co');
      assert.equal(key, 'public-key');
      clientCreated = true;
      return { auth: {
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        async getSession() { return { data: { session: null } }; }
      } };
    } },
    location: { protocol: 'https:', origin: 'https://study.example' }
  };
  const context = {
    self: browser, window: browser, setTimeout, clearTimeout,
    fetch: async url => {
      assert.equal(url, 'https://study.example/api/auth/config');
      configRequested = true;
      return new Response(JSON.stringify({ configured: true, url: 'https://project.supabase.co', publishableKey: 'public-key' }));
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/account.js'), 'utf8'), context);
  const service = browser.CCIAccount.create();
  assert.equal((await service.init()).configured, true);
  assert.equal(configRequested, true);
  assert.equal(clientCreated, true);
  service.destroy();
});

function localStore() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), values };
}

test('account service prepares a private video session cookie without exposing the token in a URL', async () => {
  let change, session = null, posted, sessionRequests = 0;
  const token = 'header.payload.signature-private-token';
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; },
    async signInWithPassword() { session = { access_token: token, user: { id: 'user-1', email: 'learner@example.com' } }; change('SIGNED_IN', session); return { data: { session, user: session.user } }; },
    async signOut() { session = null; change('SIGNED_OUT', null); return {}; }
  } }) };
  const fetch = async (url, options) => {
    if (url.endsWith('/api/auth/config')) return new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
    sessionRequests++;
    posted = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: localStore() });
  await service.init();
  const signedIn = await service.signIn('learner@example.com', 'long-password');
  assert.equal(signedIn.user.id, 'user-1');
  assert.equal(signedIn.videoReady, true);
  assert.equal(posted.url, 'https://study.example/api/auth/session');
  assert.equal(posted.options.credentials, 'include');
  assert.equal(JSON.parse(posted.options.body).accessToken, token);
  assert.doesNotMatch(posted.url, /private-token/);
  await service.syncVideoSession(signedIn.session, true);
  assert.equal(sessionRequests, 2, 'force refresh prepares the cookie again for the same access token');
  await service.signOut();
  assert.equal(sessionRequests, 3);
  assert.deepEqual(JSON.parse(posted.options.body), { clear: true });
  assert.equal(service.status().user, null);
  assert.equal(service.status().videoReady, false);
});

test('cloud progress sync retries a compare-and-set conflict and merges both sides', async () => {
  let call = 0, session = { access_token: 'header.payload.signature', user: { id: 'user-2' } };
  const remoteData = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 2, misses: 1, lastSeen: 20 } }, best: null } }, completedToday: {}, streak: { lastStreakDate: null } };
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; }
  }, async rpc(name, args) {
    if (name === 'get_user_progress') return { data: call === 0 ? { version: 0, data: null } : { version: 1, data: remoteData } };
    call++;
    if (call === 1) return { data: { ok: false, version: 1, data: remoteData } };
    return { data: { ok: true, version: 2, data: args.p_data } };
  } }) };
  const fetch = async url => url.endsWith('/api/auth/config')
    ? new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }))
    : new Response(JSON.stringify({ ok: true }));
  const localStorage = localStore();
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage });
  await service.init();
  const local = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 3, misses: 1, lastSeen: 30 } }, best: null } }, completedToday: {}, streak: { lastStreakDate: null } };
  const result = await service.syncProgress(local, Sync);
  assert.equal(result.version, 2);
  assert.deepEqual(result.snapshot.progress.d1.cards.q1, { attempts: 5, misses: 2, lastSeen: 30 });
  assert.equal(call, 2);
  assert.equal(localStorage.values.has('cci-study-progress-base.user-2'), true);
});

test('repeating an explicit guest import does not add the same attempts twice', async () => {
  let remote = { version: 0, data: null };
  const session = { access_token: 'header.payload.signature', user: { id: 'user-import' } };
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; }
  }, async rpc(name, args) {
    if (name === 'get_user_progress') return { data: remote };
    if (args.p_expected_version !== remote.version) return { data: { ok: false, ...remote } };
    remote = { version: remote.version + 1, data: args.p_data };
    return { data: { ok: true, ...remote } };
  } }) };
  const fetch = async url => url.endsWith('/api/auth/config')
    ? new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }))
    : new Response(JSON.stringify({ ok: true }));
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: null });
  await service.init();
  const empty = Sync.empty();
  const guest = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 3, misses: 1, lastSeen: 30 } }, best: { pct: 75, date: 30 } } }, completedToday: { '2026-11-03': 3 }, streak: { lastStreakDate: '2026-11-03' } };
  const first = await service.syncProgress(empty, Sync, guest);
  const second = await service.syncProgress(first.snapshot, Sync, guest);
  assert.equal(first.snapshot.progress.d1.cards.q1.attempts, 3);
  assert.equal(second.snapshot.progress.d1.cards.q1.attempts, 3);
  assert.equal(second.snapshot.completedToday['2026-11-03'], 3);
  assert.equal(second.deviceId, first.deviceId);
  assert.equal(second.snapshot.deviceCounters[second.deviceId].guestImport.progress.d1.cards.q1.attempts, 3);
});
