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

test('browser network and CORS failures are normalized before surfacing to learners', async () => {
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: null } }; },
    async signInWithPassword() { return { error: new Error('Load failed') }; },
    async signUp() { return { error: new Error('Request has been blocked by CORS policy') }; }
  } }) };
  const fetch = async url => new Response(url.endsWith('/api/auth/config')
    ? JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }) : '{}');
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: localStore() });
  await service.init();
  assert.equal((await service.signIn('learner@example.com', 'very-long-password')).error,
    'Account services could not be reached. Check your connection and try again.');
  assert.equal((await service.signUp('learner@example.com', 'very-long-password')).error,
    'The account service is temporarily unavailable. Please try again.');
  service.destroy();
});

test('native Android account requests use the hosted API while web development stays on localhost', async t => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../js/account.js'), 'utf8');
  for (const scenario of [
    { name: 'Android native localhost', native: true, expected: 'https://cci-discipleship-quiz.pages.dev' },
    { name: 'ordinary web localhost', native: false, expected: 'http://localhost' },
    { name: 'native deployment override', native: true, globalBase: 'https://preview.example/', expected: 'https://preview.example' },
    { name: 'explicit option takes priority', native: true, globalBase: 'https://preview.example', optionBase: 'https://test.example/', expected: 'https://test.example' }
  ]) {
    await t.test(scenario.name, async () => {
      const requests = [];
      const browser = {
        CciNative: { isNative: scenario.native },
        location: { protocol: 'http:', origin: 'http://localhost' },
        Supabase: { createClient: () => ({ auth: {
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: null } }; }
        } }) }
      };
      if (scenario.globalBase) browser.CCI_API_BASE = scenario.globalBase;
      vm.runInNewContext(source, {
        self: browser, window: browser, setTimeout, clearTimeout,
        fetch: async url => {
          requests.push(url);
          return new Response(url.endsWith('/api/auth/config')
            ? JSON.stringify({ configured: true, url: 'https://project.supabase.co', publishableKey: 'public-key' }) : '{}');
        }
      });
      const service = browser.CCIAccount.create({ apiBase: scenario.optionBase });
      assert.equal((await service.init()).configured, true);
      assert.equal(service.apiBase, scenario.expected);
      assert.equal(requests[0], scenario.expected + '/api/auth/config');
      assert.ok(requests.every(url => url.startsWith(scenario.expected + '/api/')));
      service.destroy();
    });
  }
});

function localStore() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), values };
}

test('account initialization distinguishes a lost connection from missing configuration and can retry', async () => {
  let configRequests = 0, mode = 'offline';
  const changes = [], storage = localStore();
  storage.setItem('flashdecks.v1', '{"progress":"preserved"}');
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session: null } }; }
  } }) };
  const fetch = async url => {
    if (!url.endsWith('/api/auth/config')) return new Response('{}');
    configRequests++;
    if (mode === 'offline') throw new TypeError('Network request failed');
    if (mode === 'unconfigured') return new Response('{"configured":false}', { status: 503 });
    return new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
  };
  const service = create({ fetch, Supabase, localStorage: storage });
  assert.equal((await service.init(status => changes.push(status.initializationState))).initializationState, 'unavailable');
  assert.match(service.status().initializationError, /connection.*try again/i);
  mode = 'unconfigured';
  assert.equal((await service.retry()).initializationState, 'unconfigured');
  mode = 'ready';
  const recovered = await service.retry();
  assert.equal(recovered.initializationState, 'ready');
  assert.equal(recovered.configured, true);
  assert.equal(recovered.initializationError, '');
  assert.equal(configRequests, 3);
  assert.ok(changes.includes('unavailable'));
  assert.ok(changes.includes('unconfigured'));
  assert.equal(changes.at(-1), 'ready', 'retry retains the original status callback');
  assert.equal(storage.getItem('flashdecks.v1'), '{"progress":"preserved"}');
  service.destroy();
});

test('failed session initialization cleans up its subscription and retry creates only one active client', async () => {
  let clients = 0, unsubscribed = 0, stopped = 0;
  const Supabase = { createClient: () => {
    const attempt = ++clients;
    return { auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() { unsubscribed++; } } } }; },
      stopAutoRefresh() { stopped++; },
      async getSession() { return attempt === 1 ? { error: new Error('Session storage unavailable') } : { data: { session: null } }; }
    } };
  } };
  const fetch = async url => new Response(url.endsWith('/api/auth/config')
    ? JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }) : '{}');
  const service = create({ fetch, Supabase, localStorage: localStore() });
  assert.equal((await service.init()).initializationState, 'unavailable');
  assert.equal(unsubscribed, 1);
  assert.equal(stopped, 1);
  const retry = service.retry();
  assert.equal(service.retry(), retry, 'concurrent retries share the same initialization');
  assert.equal((await retry).initializationState, 'ready');
  await service.init();
  await service.retry();
  assert.equal(clients, 2, 'an already connected service keeps its existing client');
  assert.equal(unsubscribed, 1);
  service.destroy();
  assert.equal(unsubscribed, 2);
  assert.equal(stopped, 2);
});

test('destroying a pending account initialization prevents stale setup from restoring it', async () => {
  let resolveConfig, clients = 0;
  const fetch = () => new Promise(resolve => { resolveConfig = resolve; });
  const Supabase = { createClient() { clients++; throw new Error('stale configuration must not create a client'); } };
  const service = create({ fetch, Supabase, localStorage: localStore() });
  const pending = service.init();
  assert.equal(service.status().initializationState, 'loading');
  service.destroy();
  resolveConfig(new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' })));
  await pending;
  assert.equal(clients, 0);
  assert.equal(service.status().initializationState, 'idle');
  assert.equal(service.status().configured, false);
});

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

test('video sessions do not remotely revalidate every four minutes; transient failures still retry', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const timers = new Map();
  let nextTimer = 1, change, session = null, mode = 'ready';
  const browser = {
    location: { protocol: 'https:', origin: 'https://study.example' },
    addEventListener() {}, removeEventListener() {}
  };
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; },
    async signInWithPassword() {
      session = { access_token: 'same-access-token', user: { id: 'user-renewal', email: 'learner@example.com' } };
      change('SIGNED_IN', session);
      return { data: { session, user: session.user } };
    },
    async signOut() { session = null; change('SIGNED_OUT', null); return {}; }
  } }) };
  const context = {
    self: browser, window: browser, Supabase,
    setTimeout(callback, delay) { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/account.js'), 'utf8'), context);
  const fetch = async url => {
    if (url.endsWith('/api/auth/config')) return new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
    if (mode === 'unavailable') return new Response('{}', { status: 503 });
    return new Response('{"ok":true}', { status: 200 });
  };
  const service = browser.CCIAccount.create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: localStore() });
  await service.init();
  const signedIn = await service.signIn('learner@example.com', 'long-password');
  assert.equal(signedIn.videoReady, true);
  assert.equal(timers.size, 0, 'a successful cookie setup should not schedule a forced remote validation');

  mode = 'unavailable';
  await service.syncVideoSession(signedIn.session, true);
  assert.deepEqual(Array.from(timers.values()).map(timer => timer.delay), [30000], 'transient failures keep a bounded retry');
  await service.signOut();
  assert.equal(timers.size, 0, 'sign-out cancels pending video-session retries');
  service.destroy();
});

test('transient video-session failures preserve the signed-in user and ready player state', async () => {
  let change, session = null, mode = 'ready';
  const token = 'header.payload.signature-private-token';
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; },
    async signInWithPassword() { session = { access_token: token, user: { id: 'user-video', email: 'learner@example.com' } }; change('SIGNED_IN', session); return { data: { session, user: session.user } }; }
  } }) };
  const fetch = async url => {
    if (url.endsWith('/api/auth/config')) return new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
    if (mode === 'invalid') return new Response('{}', { status: 401 });
    if (mode === 'unavailable') return new Response('{}', { status: 503, headers: { 'Retry-After': '7' } });
    return new Response('{"ok":true}', { status: 200 });
  };
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: localStore() });
  await service.init();
  const signedIn = await service.signIn('learner@example.com', 'long-password');
  assert.equal(signedIn.videoReady, true);

  mode = 'unavailable';
  assert.equal(await service.syncVideoSession(signedIn.session, true), false);
  assert.equal(service.status().user.id, 'user-video');
  assert.equal(service.status().videoReady, true, 'a transient renewal failure must not remove the playing video');
  assert.match(service.status().videoAccessError, /temporarily unavailable/i);

  const otherSession = { access_token: 'header.other.signature', user: { id: 'user-other', email: 'other@example.com' } };
  session = otherSession;
  change('SIGNED_IN', otherSession);
  mode = 'unavailable';
  await service.syncVideoSession(otherSession, true);
  assert.equal(service.status().user.id, 'user-other');
  assert.equal(service.status().videoReady, false, 'video readiness must not carry across users when renewal fails');

  mode = 'invalid';
  assert.equal(await service.syncVideoSession(otherSession, true), false);
  assert.equal(service.status().user.id, 'user-other', 'invalid video credentials do not silently sign the app out');
  assert.equal(service.status().videoReady, false);
  assert.match(service.status().videoAccessError, /no longer valid/i);
  service.destroy();
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


test('cloud progress sync applies backoff delays when resolving compare-and-set conflicts', async () => {
  let call = 0;
  const sleepDelays = [];
  const session = { access_token: 'header.payload.signature', user: { id: 'user-backoff' } };
  const remoteData = { schemaVersion: 2, progress: { d1: { cards: { q1: { attempts: 1, misses: 0, lastSeen: 10 } }, best: null } }, completedToday: {}, streak: { lastStreakDate: null }, deviceCounters: {} };
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; }
  }, async rpc(name, args) {
    if (name === 'get_user_progress') return { data: { version: call, data: remoteData } };
    call++;
    if (call < 3) return { data: { ok: false, version: call, data: remoteData } };
    return { data: { ok: true, version: call + 1, data: args.p_data } };
  } }) };
  const fetch = async () => new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
  const sleep = async ms => { sleepDelays.push(ms); };
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: null, sleep });
  await service.init();

  const local = Sync.empty();
  const result = await service.syncProgress(local, Sync);
  assert.equal(result.version, 4);
  assert.equal(call, 3);
  assert.equal(sleepDelays.length, 2);
  assert.ok(sleepDelays[0] >= 30, 'first backoff delay should be at least base delay');
  assert.ok(sleepDelays[1] >= sleepDelays[0], 'second backoff delay should be >= first');
});

test('cloud progress sync aborts before calling writeProgress when snapshot exceeds 5 MB limit', async () => {
  let writeCalled = false;
  const session = { access_token: 'header.payload.signature', user: { id: 'user-limit' } };
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; }
  }, async rpc(name, args) {
    if (name === 'get_user_progress') return { data: { version: 0, data: null } };
    if (name === 'sync_user_progress') { writeCalled = true; return { data: { ok: true, version: 1, data: args.p_data } }; }
    return { data: null };
  } }) };
  const fetch = async () => new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: null });
  await service.init();

  const oversized = {
    schemaVersion: 2,
    progress: { d1: { cards: { q1: { attempts: 1, misses: 0, overflow: 'z'.repeat(Sync.MAX_SNAPSHOT_BYTES + 50) } }, best: null } },
    completedToday: {},
    streak: { lastStreakDate: null }
  };

  await assert.rejects(
    async () => { await service.syncProgress(oversized, Sync); },
    /Progress snapshot exceeds maximum allowed size of 5 MB/
  );
  assert.equal(writeCalled, false, 'writeProgress RPC must NOT be called when payload exceeds 5 MB');
});


test('account service exposes playback ticket from session response and clears on sign out', async () => {
  let change, session = null;
  const token = 'header.payload.signature-test-token';
  const Supabase = { createClient: () => ({ auth: {
    onAuthStateChange(callback) { change = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { return { data: { session } }; },
    async signInWithPassword() { session = { access_token: token, user: { id: 'user-ticket', email: 'learner@example.com' } }; change('SIGNED_IN', session); return { data: { session, user: session.user } }; },
    async signOut() { session = null; change('SIGNED_OUT', null); return {}; }
  } }) };
  const fetch = async url => {
    if (url.endsWith('/api/auth/config')) return new Response(JSON.stringify({ configured: true, url: 'https://supabase.example', publishableKey: 'public-key' }));
    return new Response(JSON.stringify({ ok: true, ticket: 'signed-ticket-abc-123' }), { status: 200 });
  };
  const service = create({ apiBase: 'https://study.example', fetch, Supabase, localStorage: localStore() });
  await service.init();
  assert.equal(service.playbackTicket(), '');
  const signedIn = await service.signIn('learner@example.com', 'long-password');
  assert.equal(signedIn.user.id, 'user-ticket');
  assert.equal(signedIn.videoReady, true);
  assert.equal(service.status().ticket, 'signed-ticket-abc-123');
  assert.equal(service.playbackTicket(), 'signed-ticket-abc-123');
  await service.signOut();
  assert.equal(service.status().ticket, null);
  assert.equal(service.playbackTicket(), '');
});
