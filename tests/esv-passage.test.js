const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const loadFunction = require('./helpers/load-function.cjs');

test('single-chapter shorthand is normalized before ESV validation and retrieval', async () => {
  const seen = [];
  const handler = loadFunction('functions/api/esv-passage.js', { fetch: async url => {
    seen.push(new URL(url).searchParams.get('q'));
    return Response.json({ passages: ['fixture'] });
  } }).onRequestGet;
  const env = { ESV_API_KEY: 'fixture-key', ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 204 }) } };
  for (const [input, expected] of [['Jude 24–25', 'Jude 1:24–25'], ['Philemon 4–6', 'Philemon 1:4–6'], ['2 John 5–6', '2 John 1:5–6'], ['3 John 2', '3 John 1:2'], ['Obadiah 3–4', 'Obadiah 1:3–4'], ['Jude 1:24–25', 'Jude 1:24–25']]) {
    const result = await handler({ request: new Request('https://study.example/api/esv-passage?q=' + encodeURIComponent(input), { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), env });
    assert.equal(result.status, 200, input);
    assert.equal(seen.at(-1), expected);
  }
});

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/api/esv-passage.js'), 'utf8')
  .replace(/export function /g, 'function ')
  .replace(/export async function /g, 'async function ');

function loadHandler(fetchImpl, mockCaches) {
  return vm.runInNewContext(source + '\n({ onRequestGet, onRequestOptions })', {
    URL,
    Request,
    Response,
    Headers,
    caches: mockCaches || undefined,
    fetch: fetchImpl
  });
}

function allowedRateLimiter() {
  return {
    fetch: async () => new Response(null, { status: 204 })
  };
}

test('ESV passage function requires a configured secret and validates passage references', async () => {
  let requests = 0;
  const handlers = loadHandler(async () => { requests++; throw new Error('unexpected upstream request'); });
  const missingKey = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+3%3A16'),
    env: {}
  });
  assert.equal(missingKey.status, 503);
  assert.equal(missingKey.headers.get('Cache-Control'), 'no-store');
  assert.match((await missingKey.json()).error, /not configured/i);

  const invalidReference = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=https%3A%2F%2Fevil.example'),
    env: { ESV_API_KEY: 'secret' }
  });
  assert.equal(invalidReference.status, 400);
  assert.equal(invalidReference.headers.get('Cache-Control'), 'no-store');
  assert.equal(requests, 0);
});

test('ESV passage function calls the official API with its secret header and returns no-store text with CORS', async () => {
  let upstreamUrl;
  let upstreamHeaders;
  const handlers = loadHandler(async (url, options) => {
    upstreamUrl = new URL(url);
    upstreamHeaders = options.headers;
    return new Response(JSON.stringify({ passages: ['For God so loved the world. (ESV)'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  const response = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+3%3A16', {
      headers: { 'CF-Connecting-IP': '198.51.100.7' }
    }),
    env: { ESV_API_KEY: 'test-esv-key', ESV_RATE_LIMITER: allowedRateLimiter() }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { text: 'For God so loved the world. (ESV)' });
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, 'https://api.esv.org/v3/passage/text/');
  assert.equal(upstreamUrl.searchParams.get('q'), 'John 3:16');
  assert.equal(upstreamUrl.searchParams.get('include-short-copyright'), 'true');
  assert.equal(upstreamHeaders.Authorization, 'Token test-esv-key');
  assert.equal(upstreamHeaders.Accept, 'application/json');

  const optionsResponse = handlers.onRequestOptions();
  assert.equal(optionsResponse.status, 204);
  assert.equal(optionsResponse.headers.get('Access-Control-Allow-Origin'), '*');
});

test('ESV passage text is not persisted through the Cloudflare Cache API', async () => {
  let upstreamRequests = 0, cacheCalls = 0;
  const mockCaches = {
    default: {
      match: async () => { cacheCalls++; return null; },
      put: async () => { cacheCalls++; }
    }
  };

  const handlers = loadHandler(async () => {
    upstreamRequests++;
    return new Response(JSON.stringify({ passages: ['In the beginning was the Word. (ESV)'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }, mockCaches);

  // Each request goes to ESV and returns a no-store response.
  const first = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+1%3A1', {
      headers: { 'CF-Connecting-IP': '198.51.100.7' }
    }),
    env: { ESV_API_KEY: 'test-esv-key', ESV_RATE_LIMITER: allowedRateLimiter() }
  });
  assert.equal(first.status, 200);
  assert.equal(upstreamRequests, 1);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await first.json(), { text: 'In the beginning was the Word. (ESV)' });

  // A repeated request is not served from a persistent application cache.
  const second = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+1%3A1', {
      headers: { 'CF-Connecting-IP': '198.51.100.7' }
    }),
    env: { ESV_API_KEY: 'test-esv-key', ESV_RATE_LIMITER: allowedRateLimiter() }
  });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('Cache-Control'), 'no-store');
  assert.equal(upstreamRequests, 2, 'ESV text remains uncached at the edge');
  assert.equal(cacheCalls, 0);
  assert.deepEqual(await second.json(), { text: 'In the beginning was the Word. (ESV)' });
});
