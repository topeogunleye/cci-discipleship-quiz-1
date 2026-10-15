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
