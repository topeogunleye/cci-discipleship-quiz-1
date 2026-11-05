const assert = require('node:assert/strict');
const test = require('node:test');
const { createStorage } = require('../js/storage.js');

function fakeIndexedDB(options = {}) {
  const values = new Map();
  const state = { opened: 0, writes: 0, reads: 0 };
  const indexedDB = {
    open() {
      state.opened++;
      const request = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction() {
            const transaction = {};
            const objectStore = {
              openCursor() {
                const request = {};
                const entries = Array.from(values.entries());
                let index = 0;
                function next() {
                  queueMicrotask(() => {
                    if (options.failWrite) { transaction.error = new Error('write failed'); transaction.onerror(); return; }
                    const entry = entries[index++];
                    request.result = entry ? {
                      key: entry[0], value: entry[1],
                      update(value) { values.set(entry[0], value); },
                      continue: next
                    } : null;
                    request.onsuccess();
                    if (!entry) transaction.oncomplete();
                  });
                }
                next();
                return request;
              },
              get(key) {
                const result = {};
                queueMicrotask(() => {
                  state.reads++;
                  if (options.failRead) { result.error = new Error('read failed'); result.onerror(); }
                  else if (options.failConfirm && state.writes > 0) { result.result = 'unconfirmed'; result.onsuccess(); }
                  else { result.result = values.has(key) ? values.get(key) : undefined; result.onsuccess(); }
                });
                return result;
              },
              put(value, key) {
                state.writes++;
                queueMicrotask(() => {
                  if (options.failWrite) { transaction.error = new Error('write failed'); transaction.onerror(); }
                  else { values.set(key, value); transaction.oncomplete(); }
                });
              }
            };
            transaction.objectStore = () => objectStore;
            return transaction;
          }
        };
        request.result = db;
        request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    }
  };
  return { indexedDB, values, state };
}

function mockLocalStorage(initial) {
  const values = new Map(initial ? [['flashdecks.v1', initial]] : []);
  return {
    values,
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index]; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('saves and loads current study state through IndexedDB', async () => {
  const idb = fakeIndexedDB();
  const storage = createStorage({ indexedDB: idb.indexedDB, localStorage: mockLocalStorage() });
  const raw = JSON.stringify({ decks: [{ id: 'd1', cards: [] }], progress: { d1: { cards: {} } } });

  const saved = await storage.save(raw);
  assert.equal(saved.backend, 'indexedDB');
  assert.equal(saved.ok, true);
  const loaded = await storage.load();
  assert.equal(loaded.raw, raw);
  assert.equal(loaded.backend, 'indexedDB');
  assert.equal(loaded.ok, true);
});

test('migrates flashdecks.v1 to IndexedDB and removes it only after readback confirms', async () => {
  const legacy = JSON.stringify({ decks: [{ id: 'd1' }], progress: { d1: { cards: { 'd1.q1': 'known' } } } });
  const idb = fakeIndexedDB();
  const localStorage = mockLocalStorage(legacy);
  const storage = createStorage({ indexedDB: idb.indexedDB, localStorage });

  const result = await storage.load();
  assert.equal(result.raw, legacy);
  assert.equal(result.backend, 'indexedDB');
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(idb.values.get('current'), legacy);
  assert.equal(localStorage.getItem('flashdecks.v1'), null);
});

test('keeps the legacy key and falls back when IndexedDB migration cannot be confirmed', async () => {
  const legacy = JSON.stringify({ decks: [{ id: 'd1' }], progress: {} });
  const idb = fakeIndexedDB({ failWrite: true });
  const localStorage = mockLocalStorage(legacy);
  const storage = createStorage({ indexedDB: idb.indexedDB, localStorage });

  const result = await storage.load();
  assert.equal(result.raw, legacy);
  assert.equal(result.backend, 'localStorage');
  assert.equal(result.ok, true);
  assert.match(result.notice, /migration failed/i);
  assert.equal(localStorage.getItem('flashdecks.v1'), legacy);
});

test('does not remove flashdecks.v1 when IndexedDB readback does not match', async () => {
  const legacy = '{"old":"state"}';
  const idb = fakeIndexedDB({ failConfirm: true });
  const localStorage = mockLocalStorage(legacy);
  const result = await createStorage({ indexedDB: idb.indexedDB, localStorage }).load();
  assert.equal(result.backend, 'localStorage');
  assert.equal(result.migrated, false);
  assert.equal(localStorage.getItem('flashdecks.v1'), legacy);
});

test('falls back to localStorage when IndexedDB is unavailable and reports failed writes', async () => {
  const legacy = '{"old":true}';
  const localStorage = mockLocalStorage(legacy);
  const unavailable = await createStorage({ indexedDB: null, localStorage }).load();
  assert.equal(unavailable.raw, legacy);
  assert.equal(unavailable.backend, 'localStorage');
  assert.equal(unavailable.ok, true);

  const failed = await createStorage({ indexedDB: null, localStorage: null }).save('{}');
  assert.equal(failed.ok, false);
  assert.equal(failed.backend, 'unavailable');
  assert.match(failed.notice, /could not be saved/i);
});

test('writes the new state to the legacy fallback if IndexedDB save fails', async () => {
  const localStorage = mockLocalStorage();
  const storage = createStorage({ indexedDB: fakeIndexedDB({ failWrite: true }).indexedDB, localStorage });
  const result = await storage.save('{"saved":true}');
  assert.equal(result.backend, 'localStorage');
  assert.equal(result.ok, true);
  assert.equal(localStorage.getItem('flashdecks.v1'), '{"saved":true}');
});

test('storage preserves onboarding and streak data', async () => {
  const idb = fakeIndexedDB();
  const storage = createStorage({ indexedDB: idb.indexedDB, localStorage: mockLocalStorage() });
  const state = {
    decks: [],
    progress: {},
    settings: { theme: 'dark', showStreak: true },
    onboarding: { completed: true, goal: 'exam', dailyMinutes: 15, startingTopic: 'christology', preferredTime: 'morning', committed: true },
    streak: { lastStreakDate: '2026-10-20' },
    dataVersion: 9
  };
  const raw = JSON.stringify(state);
  const saveResult = await storage.save(raw);
  assert.equal(saveResult.ok, true);

  const loadResult = await storage.load();
  const parsed = JSON.parse(loadResult.raw);
  assert.equal(parsed.onboarding.completed, true);
  assert.equal(parsed.onboarding.goal, 'exam');
  assert.equal(parsed.onboarding.dailyMinutes, 15);
  assert.equal(parsed.onboarding.startingTopic, 'christology');
  assert.equal(parsed.onboarding.committed, true);
  assert.equal(parsed.streak.lastStreakDate, '2026-10-20');
  assert.equal(parsed.dataVersion, 9);
});

test('keeps guest and account study data in separate IndexedDB and localStorage records', async () => {
  const idb = fakeIndexedDB();
  const localStorage = mockLocalStorage();
  const storage = createStorage({ indexedDB: idb.indexedDB, localStorage });
  await storage.save('{"owner":"guest"}');
  await storage.save('{"owner":"alice"}', 'user-alice');
  await storage.save('{"owner":"bob"}', 'user-bob');

  assert.equal((await storage.load()).raw, '{"owner":"guest"}');
  assert.equal((await storage.load('user-alice')).raw, '{"owner":"alice"}');
  assert.equal((await storage.load('user-bob')).raw, '{"owner":"bob"}');
  assert.equal(idb.values.get('current'), '{"owner":"guest"}');
  assert.equal(idb.values.get('account:user-alice'), '{"owner":"alice"}');
  assert.equal(idb.values.get('account:user-bob'), '{"owner":"bob"}');
});

test('keeps account namespaces separate in the localStorage fallback too', async () => {
  const localStorage = mockLocalStorage();
  const storage = createStorage({ indexedDB: null, localStorage });
  await storage.save('{"owner":"guest"}');
  await storage.save('{"owner":"alice"}', 'user-alice');
  assert.equal((await storage.load()).raw, '{"owner":"guest"}');
  assert.equal((await storage.load('user-alice')).raw, '{"owner":"alice"}');
  assert.equal(localStorage.getItem('flashdecks.v1'), '{"owner":"guest"}');
  assert.equal(localStorage.getItem('flashdecks.v1.account.user-alice'), '{"owner":"alice"}');
});

test('retired data cleanup visits guest and inactive accounts without changing shared data', async () => {
  const db = fakeIndexedDB(), local = mockLocalStorage();
  const retained = {
    decks: [{ id: 'custom-sermon-notes', title: 'My sermon notes', cards: [] }],
    progress: { 'custom-sermon-notes': { best: { pct: 80 }, cards: {} } },
    settings: { theme: 'dark', shuffle: true, showDraftDevotionals: true, otherSetting: 'keep' },
    completedToday: { '2026-11-05': 4 }, streak: { lastStreakDate: '2026-11-05' },
    onboarding: { completed: true }, devotions: { saved: { devotion: true } },
    pausedSession: { type: 'quiz', i: 2 }, cloudSyncDeviceId: 'device-keep', unknownField: { keep: true }
  };
  const raw = JSON.stringify({ ...retained, sermons: { progress: { sermon: { score: 100 } }, downloads: {}, reminders: {} }, settings: { ...retained.settings, experience: 'sermons', showDraftSermons: true } });
  for (const key of ['current', 'account:user-one', 'account:user-two']) db.values.set(key, raw);
  db.values.set('shared-unknown', raw);
  db.values.set('account:broken', '{bad json');
  for (const key of ['flashdecks.v1', 'flashdecks.v1.account.user-one', 'flashdecks.v1.account.user-two']) local.values.set(key, raw);
  local.values.set('sb-project-auth-token', raw);
  local.values.set('cci-study-progress-base.user-one', raw);
  local.values.set('flashdecks.v1.backup', raw);
  const storage = createStorage({ indexedDB: db.indexedDB, localStorage: local });
  assert.deepEqual(await storage.removeRetiredSermonData(), { ok: true });
  for (const key of ['current', 'account:user-one', 'account:user-two']) assert.deepEqual(JSON.parse(db.values.get(key)), retained);
  for (const key of ['flashdecks.v1', 'flashdecks.v1.account.user-one', 'flashdecks.v1.account.user-two']) assert.deepEqual(JSON.parse(local.values.get(key)), retained);
  assert.equal(db.values.get('shared-unknown'), raw);
  assert.equal(db.values.get('account:broken'), '{bad json');
  for (const key of ['sb-project-auth-token', 'cci-study-progress-base.user-one', 'flashdecks.v1.backup']) assert.equal(local.values.get(key), raw);
  const before = [...db.values.entries()];
  await storage.removeRetiredSermonData();
  assert.deepEqual([...db.values.entries()], before, 'cleanup is idempotent');
});

test('local-only cleanup preserves malformed profiles and save prevents retired fields returning', async () => {
  const local = mockLocalStorage('{bad json');
  local.values.set('flashdecks.v1.account.inactive', JSON.stringify({ progress: { lesson: 1 }, sermons: { progress: {} } }));
  const storage = createStorage({ indexedDB: null, localStorage: local });
  assert.deepEqual(await storage.removeRetiredSermonData(), { ok: true });
  assert.equal(local.values.get('flashdecks.v1'), '{bad json');
  assert.deepEqual(JSON.parse(local.values.get('flashdecks.v1.account.inactive')), { progress: { lesson: 1 } });
  await storage.save(JSON.stringify({ progress: { lesson: 2 }, sermons: {}, settings: { theme: 'dark', experience: 'sermons' } }), 'inactive');
  assert.deepEqual(JSON.parse(local.values.get('flashdecks.v1.account.inactive')), { progress: { lesson: 2 }, settings: { theme: 'dark' } });
});

test('failed cleanup reports failure and preserves records for the next launch', async () => {
  const db = fakeIndexedDB({ failWrite: true });
  const raw = JSON.stringify({ progress: { lesson: 3 }, sermons: {} });
  db.values.set('current', raw);
  const storage = createStorage({ indexedDB: db.indexedDB, localStorage: null });
  assert.deepEqual(await storage.removeRetiredSermonData(), { ok: false });
  assert.equal(db.values.get('current'), raw);
});
