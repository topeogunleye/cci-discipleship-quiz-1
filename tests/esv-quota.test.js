const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'workers/esv-rate-limiter/index.js'), 'utf8')
  .replace(/export class /g, 'class ')
  .replace(/export function /g, 'function ')
  .replace('export default {', 'const worker = {');

function loadWorker(clock) {
  return vm.runInNewContext(source + '\n({ worker, EsvDailyQuota, pruneBuckets, admit })', {
    URL, Request, Response, Date: { now: () => clock.now }
  });
}

function makeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    data,
    storage: {
      async transaction(fn) {
        return fn({
          get: async key => data.get(key),
          put: async (key, value) => { data.set(key, JSON.parse(JSON.stringify(value))); },
          delete: async key => { data.delete(key); }
        });
      }
    }
  };
}

const HOUR = 60 * 60 * 1000;
const reserve = (quota, scope) => quota.fetch(new Request('https://esv-quota.internal/reserve' + (scope ? '?scope=' + scope : ''), { method: 'POST' }));

test('quota is stored as a handful of hourly counters, never one entry per request', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 10, 5) };
  const { EsvDailyQuota } = loadWorker(clock);
  const { data, storage } = makeStorage();
  const quota = new EsvDailyQuota({ storage });
  for (let i = 0; i < 300; i++) assert.equal((await reserve(quota, 'esv')).status, 204);
  const buckets = data.get('hour-buckets');
  assert.equal(Array.isArray(buckets), false);
  assert.deepEqual(Object.values(buckets), [300]);
  assert.equal(data.has('request-timestamps'), false);
});

test('ESV hourly cap stays under the API limit and resets at the next clock hour', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 10, 5) };
  const { EsvDailyQuota } = loadWorker(clock);
  const quota = new EsvDailyQuota({ storage: makeStorage().storage });
  for (let i = 0; i < 900; i++) assert.equal((await reserve(quota, 'esv')).status, 204);
  const denied = await reserve(quota, 'esv');
  assert.equal(denied.status, 429);
  const retryAfter = Number(denied.headers.get('Retry-After'));
  assert.ok(retryAfter > 0 && retryAfter <= 3600, 'retry-after waits for the next hour: ' + retryAfter);
  clock.now += HOUR;
  assert.equal((await reserve(quota, 'esv')).status, 204);
});

test('ESV daily budget of 4000 is enforced across hours and frees up as the window rolls', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 0, 1) };
  const { EsvDailyQuota } = loadWorker(clock);
  const { data, storage } = makeStorage();
  const quota = new EsvDailyQuota({ storage });
  for (let hour = 0; hour < 5; hour++) {
    for (let i = 0; i < 800; i++) assert.equal((await reserve(quota, 'esv')).status, 204);
    clock.now += HOUR;
  }
  const denied = await reserve(quota, 'esv');
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('Retry-After')) > 0);
  assert.ok(Object.keys(data.get('hour-buckets')).length <= 25);
  clock.now += 21 * HOUR; // the oldest buckets are now older than the 25-hour window
  assert.equal((await reserve(quota, 'esv')).status, 204);
});

test('requests accounted before the deploy are migrated from the old timestamp array', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 12, 30) };
  const { EsvDailyQuota } = loadWorker(clock);
  const legacy = Array.from({ length: 3999 }, (_, i) => clock.now - (i % 20) * HOUR);
  const { data, storage } = makeStorage({ 'request-timestamps': legacy });
  const quota = new EsvDailyQuota({ storage });
  assert.equal((await reserve(quota, 'youversion')).status, 204); // 4000th request
  assert.equal(data.has('request-timestamps'), false);
  assert.equal((await reserve(quota, 'youversion')).status, 429);
});

test('unknown quota scopes and routes are rejected', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 10, 0) };
  const { EsvDailyQuota, worker } = loadWorker(clock);
  const quota = new EsvDailyQuota({ storage: makeStorage().storage });
  assert.equal((await reserve(quota, 'other')).status, 404);
  const env = { ESV_RATE_LIMITER: { limit: async () => ({ success: true }) }, ESV_DAILY_QUOTA: {} };
  const headers = { 'X-ESV-Client-IP': '198.51.100.7' };
  assert.equal((await worker.fetch(new Request('https://x.internal/check/other', { method: 'POST', headers }), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://x.internal/check/esv', { method: 'GET', headers }), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://x.internal/check/esv', { method: 'POST' }), env)).status, 400);
});

test('ESV and YouVersion have separate per-IP keys and separate upstream budgets', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 10, 5) };
  const { EsvDailyQuota, worker } = loadWorker(clock);
  const objects = new Map(), limitKeys = [];
  const env = {
    ESV_RATE_LIMITER: { limit: async ({ key }) => { limitKeys.push(key); return { success: true }; } },
    ESV_DAILY_QUOTA: {
      idFromName: name => name,
      get: name => {
        if (!objects.has(name)) objects.set(name, new EsvDailyQuota({ storage: makeStorage().storage }));
        const object = objects.get(name);
        // A Durable Object stub accepts (url, init) just like fetch().
        return { fetch: (url, init) => object.fetch(new Request(url, init)) };
      }
    }
  };
  const call = path => worker.fetch(new Request('https://esv-rate-limiter.internal' + path, { method: 'POST', headers: { 'X-ESV-Client-IP': '198.51.100.7' } }), env);

  for (let i = 0; i < 900; i++) assert.equal((await call('/check/esv')).status, 204);
  assert.equal((await call('/check/esv')).status, 429, 'ESV is out of budget for this hour');
  assert.equal((await call('/check/youversion')).status, 204, 'YouVersion is unaffected by ESV usage');
  assert.deepEqual([...objects.keys()].sort(), ['esv-passage-upstream', 'youversion-upstream']);
  assert.ok(limitKeys.includes('esv:198.51.100.7') && limitKeys.includes('youversion:198.51.100.7'));

  const legacy = await call('/check');
  assert.equal(legacy.status, 429, 'the legacy /check path is accounted to the ESV budget');
});

test('per-IP limiter denial returns 429 without touching the upstream budget', async () => {
  const clock = { now: Date.UTC(2026, 10, 13, 10, 5) };
  const { worker } = loadWorker(clock);
  let touched = false;
  const env = {
    ESV_RATE_LIMITER: { limit: async () => ({ success: false }) },
    ESV_DAILY_QUOTA: { idFromName: () => { touched = true; }, get: () => { touched = true; } }
  };
  const res = await worker.fetch(new Request('https://x.internal/check/esv', { method: 'POST', headers: { 'X-ESV-Client-IP': '198.51.100.7' } }), env);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '60');
  assert.equal(touched, false);
});
