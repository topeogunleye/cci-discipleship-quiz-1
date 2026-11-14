const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { createCachedFetch, TTL_SECONDS } = require('../functions/_lib/api-bible-cache.cjs');
const loadFunction = require('./helpers/load-function.cjs');
const CONTENT = { data: { content: 'Synthetic Scripture', copyright: 'Publisher attribution' }, meta: { fumsToken: 'view-token' } };
const url = 'https://rest.api.bible/v1/bibles/fixture-id/passages/JHN.3.16?content-type=text';
const options = key => ({ headers: { 'api-key': key }, cache: 'no-store' });
function memoryCache() {
  const values = new Map();
  return { values, match: async key => values.get(key.url)?.clone(), put: async (key, value) => { values.set(key.url, value.clone()); } };
}

test('API.Bible cache serves identical attributed content and view tokens for seven days, then refreshes', async () => {
  const cache = memoryCache(), statuses = [];
  let now = 1700000000000, calls = 0;
  const cachedFetch = createCachedFetch({ cache, origin: 'https://study.example', cryptoImpl: webcrypto, now: () => now,
    onStatus: status => statuses.push(status), fetcher: async () => { calls++; return Response.json(CONTENT); } });
  assert.deepEqual(await (await cachedFetch(url, options('secret'))).json(), CONTENT);
  now += TTL_SECONDS * 1000 - 1;
  assert.deepEqual(await (await cachedFetch(url, options('secret'))).json(), CONTENT);
  assert.equal(calls, 1);
  assert.deepEqual(statuses, ['MISS', 'HIT']);
  now++;
  await cachedFetch(url, options('secret'));
  assert.equal(calls, 2, 'expired content is fetched again, never served stale');
  assert.equal([...cache.values.values()][0].headers.get('Cache-Control'), 'public, max-age=604800');
});

test('cache isolates credentials, editions and verse ranges and never puts keys in cache URLs', async () => {
  const cache = memoryCache(); let calls = 0;
  const cachedFetch = createCachedFetch({ cache, origin: 'https://study.example', cryptoImpl: webcrypto,
    fetcher: async () => { calls++; return Response.json(CONTENT); } });
  await cachedFetch(url, options('private-key-a'));
  await cachedFetch(url, options('private-key-b'));
  await cachedFetch(url.replace('fixture-id', 'other-edition'), options('private-key-a'));
  await cachedFetch(url.replace('JHN.3.16', 'JHN.3.17'), options('private-key-a'));
  assert.equal(calls, 4);
  assert.doesNotMatch(JSON.stringify([...cache.values.keys()]), /private-key|JHN|fixture-id/);
});

test('errors, empty text, missing copyright and metadata are not cached; outages never use expired text', async () => {
  const cache = memoryCache(); let calls = 0;
  const responses = [new Response(null, { status: 429 }), Response.json({ data: { content: '', copyright: 'notice' } }), Response.json({ data: { content: 'No copyright' } }), Response.json({ data: [] })];
  const cachedFetch = createCachedFetch({ cache, origin: 'https://study.example', cryptoImpl: webcrypto,
    fetcher: async () => { calls++; return responses.shift(); } });
  for (let i = 0; i < 3; i++) await cachedFetch(url, options('key'));
  await cachedFetch('https://rest.api.bible/v1/bibles?language=eng', options('key'));
  assert.equal(cache.values.size, 0);
  assert.equal(calls, 4);
});

test('cache failures bypass storage and concurrent misses share one upstream request', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json(CONTENT); };
  const cachedFetch = createCachedFetch({ cache: { match: async () => { throw new Error('cache unavailable'); }, put: async () => { throw new Error('cache unavailable'); } },
    origin: 'https://study.example', cryptoImpl: webcrypto, fetcher });
  const results = await Promise.all([cachedFetch(url, options('coalesce-key')), cachedFetch(url, options('coalesce-key'))]);
  assert.deepEqual(await results[0].json(), CONTENT);
  assert.deepEqual(await results[1].json(), CONTENT);
  assert.equal(calls, 1);
});

test('an expired passage is not served when its refresh is rate limited', async () => {
  const cache = memoryCache(); let now = 1700000000000, calls = 0;
  const cachedFetch = createCachedFetch({ cache, origin: 'https://study.example', cryptoImpl: webcrypto, now: () => now,
    fetcher: async () => ++calls === 1 ? Response.json(CONTENT) : new Response('Quota exhausted', { status: 429 }) });
  assert.equal((await cachedFetch(url, options('expiry-failure-key'))).status, 200);
  now += TTL_SECONDS * 1000;
  const result = await cachedFetch(url, options('expiry-failure-key'));
  assert.equal(result.status, 429);
  assert.equal(await result.text(), 'Quota exhausted');
  assert.equal(calls, 2);
});

test('live Function cache hits avoid upstream quota and retain no-store client responses and FUMS tokens', async () => {
  const cache = memoryCache(); let upstream = 0, reservations = 0;
  const handler = loadFunction('functions/api/api-bible.js', {
    caches: { default: cache },
    fetch: async target => {
      upstream++;
      return Response.json(target.includes('?language=eng') ? { data: [{ id: 'cache-nkjv', abbreviationLocal: 'NKJV', language: { id: 'eng' } }] } : CONTENT);
    }
  }).onRequestGet;
  const env = { API_BIBLE_KEY: 'integration-cache-secret', ESV_RATE_LIMITER: { fetch: async () => { reservations++; return new Response(null, { status: 204 }); } } };
  const request = () => new Request('https://study.example/api/api-bible?q=John%203:16&version=APIBIBLE_NKJV', { headers: { 'CF-Connecting-IP': '127.0.0.1' } });
  const first = await handler({ request: request(), env });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Bible-Cache'), 'MISS');
  const second = await handler({ request: request(), env });
  assert.equal(second.headers.get('X-Bible-Cache'), 'HIT');
  assert.equal(second.headers.get('Cache-Control'), 'no-store');
  const body = await second.json();
  assert.deepEqual(body.fumsTokens, ['view-token']);
  assert.equal(body.version.abbreviation, 'NKJV');
  assert.equal(body.version.copyright, CONTENT.data.copyright);
  assert.equal(upstream, 2, 'one catalog request and one passage request');
  assert.equal(reservations, upstream);
});
