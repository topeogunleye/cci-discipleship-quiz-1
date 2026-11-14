const assert = require('node:assert/strict');
const test = require('node:test');
const loadFunction = require('./helpers/load-function.cjs');

test('API.Bible and YouVersion expose app budget denials and preserve long Retry-After values', async () => {
  for (const [file, query, key] of [
    ['api-bible', '?q=John%203:16&version=APIBIBLE_NKJV', 'API_BIBLE_KEY'],
    ['bible', '?q=John%203:16&version=1588&fallback=none', 'YOUVERSION_APP_KEY']
  ]) {
    const handler = loadFunction('functions/api/' + file + '.js', { fetch: async () => assert.fail('the denied reservation must not contact the provider') }).onRequestGet;
    const response = await handler({ request: new Request('https://study.example/api/' + file + query, { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), env: {
      [key]: 'diagnostics-' + file, ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '2000000', 'X-Bible-Limit-Reason': 'monthly-budget' } }) }
    } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '2000000');
    assert.equal(response.headers.get('X-Bible-Limit-Source'), 'app');
    const body = await response.json();
    assert.equal(body.reason, 'monthly-budget');
    assert.equal(body.source, 'app');
  }
});

test('ESV distinguishes provider throttling from app throttling without converting it to a generic outage', async () => {
  const handler = loadFunction('functions/api/esv-passage.js', { fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }) }).onRequestGet;
  const result = await handler({ request: new Request('https://study.example/api/esv-passage?q=John%203:16', { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), env: {
    ESV_API_KEY: 'synthetic-key', ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 204 }) }
  } });
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('Retry-After'), '120');
  assert.equal(result.headers.get('X-Bible-Limit-Source'), 'provider');
  assert.equal((await result.json()).source, 'provider');
});
