const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync('workers/esv-rate-limiter/index.js', 'utf8').replace(/export class /g, 'class ').replace(/export function /g, 'function ').replace('export default {', 'const worker = {');
const config = { APIBIBLE_BILLING_RESET_DAY: '13', APIBIBLE_INITIAL_CYCLE_START: '2026-11-13T00:00:00Z', APIBIBLE_INITIAL_USAGE: '155' };
const MINUTE = 60000, HOUR = 60 * MINUTE;
function storage(initial = {}) {
  const data = new Map(Object.entries(initial)); let queue = Promise.resolve();
  return { data, transaction(fn) {
    const pending = queue.then(() => fn({ get: async key => data.get(key), put: async (key, value) => data.set(key, JSON.parse(JSON.stringify(value))), delete: async key => data.delete(key) }));
    queue = pending.catch(() => {}); return pending;
  } };
}
function fixture(initial, env = config) {
  const clock = { now: Date.UTC(2026, 10, 14, 10, 5) };
  class ClockDate extends Date { static now() { return clock.now; } }
  const api = vm.runInNewContext(source + '\n({ worker, EsvDailyQuota, billingCycle })', { URL, Request, Response, Date: ClockDate });
  const state = storage(initial);
  return { ...api, clock, state, data: state.data, quota: new api.EsvDailyQuota({ storage: state }, env) };
}
const reserve = (quota, scope = 'esv') => quota.fetch(new Request('https://quota.internal/reserve?scope=' + scope, { method: 'POST' }));

test('ESV shared rolling minute and hour caps survive clock boundaries', async () => {
  const h = fixture(); h.clock.now = Date.UTC(2026, 10, 14, 10, 5, 59);
  for (let i = 0; i < 55; i++) assert.equal((await reserve(h.quota)).status, 204);
  h.clock.now += 1000;
  let denied = await reserve(h.quota);
  assert.equal(denied.headers.get('X-Bible-Limit-Reason'), 'minute-budget');
  h.clock.now += Number(denied.headers.get('Retry-After')) * 1000;
  assert.equal((await reserve(h.quota)).status, 204);
  const hour = fixture();
  for (let i = 0; i < 900; i++) { if (i && i % 50 === 0) hour.clock.now += 61000; assert.equal((await reserve(hour.quota)).status, 204); }
  hour.clock.now = Date.UTC(2026, 10, 14, 11, 0);
  denied = await reserve(hour.quota);
  assert.equal(denied.headers.get('X-Bible-Limit-Reason'), 'hourly-budget');
  hour.clock.now += Number(denied.headers.get('Retry-After')) * 1000;
  assert.equal((await reserve(hour.quota)).status, 204);
  assert.ok(Object.keys(hour.data.get('minute-buckets')).length <= 61);
});

test('ESV 4500/day budget rolls forward without storing one item per request', async () => {
  const h = fixture();
  for (let hour = 0; hour < 6; hour++) {
    h.clock.now = Date.UTC(2026, 10, 14, hour, 1);
    for (let i = 0; i < 750; i++) { if (i && i % 50 === 0) h.clock.now += 61000; assert.equal((await reserve(h.quota)).status, 204); }
  }
  h.clock.now = Date.UTC(2026, 10, 14, 6, 1);
  const denied = await reserve(h.quota);
  assert.equal(denied.headers.get('X-Bible-Limit-Reason'), 'daily-budget');
  h.clock.now += Number(denied.headers.get('Retry-After')) * 1000;
  assert.equal((await reserve(h.quota)).status, 204);
  assert.ok(Object.keys(h.data.get('hour-buckets')).length <= 25);
});

test('YouVersion uses 9000 per rolling hour with no old 4000/day cap', async () => {
  const minute = Math.floor(Date.UTC(2026, 10, 14, 10, 5) / MINUTE);
  const h = fixture({ 'minute-buckets': { [minute]: 8999 }, 'hour-buckets': { [Math.floor(minute / 60)]: 8999 } });
  assert.equal((await reserve(h.quota, 'youversion')).status, 204);
  h.clock.now = Date.UTC(2026, 10, 14, 11, 0);
  const denied = await reserve(h.quota, 'youversion');
  assert.equal(denied.headers.get('X-Bible-Limit-Reason'), 'hourly-budget');
  h.clock.now += Number(denied.headers.get('Retry-After')) * 1000;
  assert.equal((await reserve(h.quota, 'youversion')).status, 204);
});

test('API.Bible carries 155 forward without the old hourly/daily caps or a restart reset', async () => {
  const h = fixture();
  for (let i = 0; i < 200; i++) assert.equal((await reserve(h.quota, 'apibible')).status, 204);
  assert.equal(h.data.get('monthly-usage').used, 355);
  assert.equal((await reserve(new h.EsvDailyQuota({ storage: h.state }, config), 'apibible')).status, 204);
  assert.equal(h.data.get('monthly-usage').used, 356);
});

test('API.Bible monthly cap is atomic, survives day changes, and resets on the 13th', async () => {
  const start = Date.UTC(2026, 10, 13), end = Date.UTC(2026, 11, 13);
  const h = fixture({ 'monthly-usage': { start, end, used: 4498 } });
  const results = await Promise.all(Array.from({ length: 5 }, () => reserve(h.quota, 'apibible')));
  assert.equal(results.filter(r => r.status === 204).length, 2);
  assert.equal(h.data.get('monthly-usage').used, 4500);
  assert.equal(Number(results[4].headers.get('Retry-After')), Math.ceil((end - h.clock.now) / 1000));
  h.clock.now += 24 * HOUR; assert.equal((await reserve(h.quota, 'apibible')).status, 429);
  h.clock.now = end - 1; assert.equal((await reserve(h.quota, 'apibible')).status, 429);
  h.clock.now = end; assert.equal((await reserve(h.quota, 'apibible')).status, 204);
  assert.equal(h.data.get('monthly-usage').used, 1, 'do not reapply the opening usage next month');
});

test('legacy migration preserves usage and cannot keep reseeding a blocked minute', async () => {
  const h = fixture({ 'request-timestamps': Array.from({ length: 180 }, () => Date.UTC(2026, 10, 14, 10, 4)) });
  assert.equal((await reserve(h.quota)).status, 429);
  assert.equal(h.data.has('request-timestamps'), false);
  h.clock.now += 61000; assert.equal((await reserve(h.quota)).status, 204);
  const month = fixture({ 'hour-buckets': { [Math.floor(h.clock.now / HOUR)]: 200 } });
  assert.equal((await reserve(month.quota, 'apibible')).status, 204);
  assert.equal(month.data.get('monthly-usage').used, 201);
  assert.equal(h.billingCycle(Date.UTC(2027, 1, 28), 31).end, Date.UTC(2027, 2, 31));
  await assert.rejects(reserve(fixture({}, {}).quota, 'apibible'), /not configured/);
});

test('providers have independent counters and burst denials do not reserve upstream quota', async () => {
  const h = fixture(), objects = new Map(), keys = [];
  const env = { ESV_RATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: true }; } }, ESV_DAILY_QUOTA: {
    idFromName: name => name, get: name => {
      if (!objects.has(name)) objects.set(name, new h.EsvDailyQuota({ storage: storage() }, config));
      return { fetch: (url, init) => objects.get(name).fetch(new Request(url, init)) };
    }
  } };
  const call = scope => h.worker.fetch(new Request('https://x.internal/check/' + scope, { method: 'POST', headers: { 'X-ESV-Client-IP': '198.51.100.7' } }), env);
  for (let i = 0; i < 55; i++) assert.equal((await call('esv')).status, 204);
  assert.equal((await call('esv')).status, 429);
  assert.equal((await call('youversion')).status, 204);
  assert.equal((await call('apibible')).status, 204);
  assert.deepEqual([...objects.keys()].sort(), ['apibible-upstream', 'esv-passage-upstream', 'youversion-upstream']);
  assert.ok(keys.includes('apibible:198.51.100.7'));
  env.ESV_RATE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await call('apibible')).headers.get('X-Bible-Limit-Reason'), 'client-burst');
  assert.equal((await call('other')).status, 404);
});
