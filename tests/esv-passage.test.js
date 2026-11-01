const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/api/esv-passage.js'), 'utf8')
  .replace(/^export async function onRequestGet/m, 'async function onRequestGet');

function loadHandler(fetchImpl) {
  return vm.runInNewContext(source + '\nonRequestGet', {
    URL,
    Response,
    fetch: fetchImpl
  });
}

test('ESV passage function requires a configured secret and validates passage references', async () => {
  let requests = 0;
  const handler = loadHandler(async () => { requests++; throw new Error('unexpected upstream request'); });
  const missingKey = await handler({
    request: new Request('https://study.example/api/esv-passage?q=John+3%3A16'),
    env: {}
  });
  assert.equal(missingKey.status, 503);
  assert.match((await missingKey.json()).error, /not configured/i);

  const invalidReference = await handler({
    request: new Request('https://study.example/api/esv-passage?q=https%3A%2F%2Fevil.example'),
    env: { ESV_API_KEY: 'secret' }
  });
  assert.equal(invalidReference.status, 400);
  assert.equal(requests, 0);
});

test('ESV passage function calls the official API with its secret header and returns uncached text', async () => {
  let upstreamUrl;
  let upstreamHeaders;
  const handler = loadHandler(async (url, options) => {
    upstreamUrl = new URL(url);
    upstreamHeaders = options.headers;
    return new Response(JSON.stringify({ passages: ['For God so loved the world. (ESV)'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  const response = await handler({
    request: new Request('https://study.example/api/esv-passage?q=John+3%3A16'),
    env: { ESV_API_KEY: 'test-esv-key' }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { text: 'For God so loved the world. (ESV)' });
  assert.equal(upstreamUrl.origin + upstreamUrl.pathname, 'https://api.esv.org/v3/passage/text/');
  assert.equal(upstreamUrl.searchParams.get('q'), 'John 3:16');
  assert.equal(upstreamUrl.searchParams.get('include-short-copyright'), 'true');
  assert.equal(upstreamHeaders.Authorization, 'Token test-esv-key');
  assert.equal(upstreamHeaders.Accept, 'application/json');
});
