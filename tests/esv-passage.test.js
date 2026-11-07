const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

test('ESV passage function calls the official API with its secret header and returns edge-cached text with CORS', async () => {
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
    request: new Request('https://study.example/api/esv-passage?q=John+3%3A16'),
    env: { ESV_API_KEY: 'test-esv-key' }
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /public.*max-age=604800/);
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

test('ESV passage function uses Cloudflare Cache API and avoids upstream fetch on cache hit', async () => {
  let upstreamRequests = 0;
  const cachedEntries = new Map();
  const mockCaches = {
    default: {
      match: async req => {
        const url = req.url || (typeof req === 'string' ? req : '');
        return cachedEntries.get(url) || null;
      },
      put: async (req, res) => {
        const url = req.url || (typeof req === 'string' ? req : '');
        cachedEntries.set(url, res);
      }
    }
  };

  const handlers = loadHandler(async () => {
    upstreamRequests++;
    return new Response(JSON.stringify({ passages: ['In the beginning was the Word. (ESV)'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }, mockCaches);

  // First request: cache miss, calls upstream and stores in cache
  const first = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+1%3A1'),
    env: { ESV_API_KEY: 'test-esv-key' }
  });
  assert.equal(first.status, 200);
  assert.equal(upstreamRequests, 1);
  assert.deepEqual(await first.json(), { text: 'In the beginning was the Word. (ESV)' });
  assert.equal(cachedEntries.size, 1);

  // Second request: cache hit, does NOT call upstream
  const second = await handlers.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=John+1%3A1'),
    env: { ESV_API_KEY: 'test-esv-key' }
  });
  assert.equal(second.status, 200);
  assert.equal(upstreamRequests, 1, 'upstream API must NOT be called on cache hit');
  assert.deepEqual(await second.json(), { text: 'In the beginning was the Word. (ESV)' });
});
