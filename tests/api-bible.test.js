const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loadFunction = require('./helpers/load-function.cjs');
const bible = require('../functions/_lib/api-bible.cjs');
const json = data => new Response(JSON.stringify(data));
const fixture = [
  { id: 'fixture-kjv', abbreviation: 'engKJV', language: { id: 'eng' } },
  { id: 'fixture-msg', abbreviationLocal: 'MSG', language: { id: 'eng' } },
  { id: 'fixture-gnt', abbreviation: 'GNT', language: { id: 'eng' } },
  { id: 'other', abbreviation: 'NIV', language: { id: 'eng' } },
  { id: 'foreign', abbreviation: 'MSG', language: { id: 'spa' } }
];

test('API.Bible discovers only selected English translations, caches metadata and normalizes passage ranges', async () => {
  const paths = [];
  const fetcher = async (url, init) => {
    assert.equal(init.headers['api-key'], 'fixture-key');
    paths.push(url);
    if (url.includes('?language=eng')) return json({ data: fixture });
    assert.equal(new URL(url).searchParams.get('content-type'), 'text');
    return json({ data: { content: 'Synthetic passage', copyright: 'Publisher copyright' }, meta: { fumsToken: 'view-token' } });
  };
  const [catalog] = await Promise.all([bible.versions('fixture-key', fetcher), bible.versions('fixture-key', fetcher)]);
  assert.deepEqual(catalog.map(v => v.id), ['APIBIBLE_KJV', 'APIBIBLE_MSG', 'APIBIBLE_GNT']);
  assert.equal(paths.length, 1);
  for (const abbreviation of ['KJV', 'MSG', 'GNT']) {
    const result = await bible.passage('John 3:16–18,20', 'APIBIBLE_' + abbreviation, 'fixture-key', fetcher);
    assert.equal(result.version.abbreviation, abbreviation);
    assert.equal(result.version.copyright, 'Publisher copyright');
    assert.equal(result.provider, 'api-bible');
    assert.deepEqual(result.fumsTokens, ['view-token', 'view-token']);
    assert.equal(result.version.upstreamId, undefined);
    assert.match(paths.at(-2), /\/passages\/JHN.3.16-JHN.3.18\?/);
    assert.match(paths.at(-1), /\/passages\/JHN.3.20\?/);
  }
  await bible.passage('Jude 24-25', 'APIBIBLE_KJV', 'fixture-key', fetcher);
  assert.match(paths.at(-1), /\/passages\/JUD.1.24-JUD.1.25/);
  await bible.passage('Genesis 1-2', 'APIBIBLE_KJV', 'fixture-key', fetcher);
  assert.match(paths.at(-2), /\/chapters\/GEN.1\?/);
  assert.match(paths.at(-1), /\/chapters\/GEN.2\?/);
});

test('unlicensed API.Bible versions and invalid references never fetch passage text', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json({ data: [] }); };
  assert.equal((await bible.passage('John 3:16', 'APIBIBLE_MSG', 'unlicensed-key', fetcher)).status, 404);
  assert.equal(calls, 1);
  assert.equal((await bible.passage('bad', 'APIBIBLE_MSG', 'unlicensed-key', fetcher)).status, 400);
  assert.equal((await bible.passage('John 3:16', 'APIBIBLE_NIV', 'unlicensed-key', fetcher)).status, 400);
  assert.equal(calls, 1);
});

test('API.Bible endpoint validates, protects quota, hides secrets and never caches passages', async () => {
  let calls = 0, reservations = 0;
  const handler = loadFunction('functions/api/api-bible.js', { fetch: async () => {
    calls++;
    return json({ data: fixture });
  } }).onRequestGet;
  const request = query => new Request('https://study.example/api/api-bible' + query, { headers: { 'CF-Connecting-IP': '127.0.0.1' } });
  const query = '?q=John%203:16&version=APIBIBLE_MSG';
  assert.equal((await handler({ request: request(query), env: {} })).status, 503);
  const env = { API_BIBLE_KEY: 'secret-never-expose', ESV_RATE_LIMITER: { fetch: async req => {
    assert.match(req.url, /\/check\/apibible$/); reservations++;
    return new Response(null, { status: 429 });
  } } };
  for (const bad of ['?q=bad&version=APIBIBLE_MSG', query + '&version=APIBIBLE_GNT', '?q=John%203:16&version=APIBIBLE_NIV']) {
    assert.equal((await handler({ request: request(bad), env })).status, 400);
  }
  const denied = await handler({ request: new Request('https://study.example/api/api-bible' + query, { headers: { Origin: 'https://evil.example' } }), env });
  assert.equal(denied.status, 403);
  const result = await handler({ request: request(query), env });
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Retry-After'), '60');
  assert.equal(reservations, 1);
  assert.equal(calls, 0);
  assert.doesNotMatch(await result.text(), /secret-never-expose/);
  const failed = await handler({ request: request(query), env: { API_BIBLE_KEY: 'secret-never-expose' } });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /secret-never-expose/);
});

test('successful endpoint reserves each upstream call and returns only public text, attribution and tracking tokens', async () => {
  let calls = 0, reservations = 0;
  const handler = loadFunction('functions/api/api-bible.js', { fetch: async (url, init) => {
    calls++;
    assert.equal(init.headers['api-key'], 'success-secret');
    return json(url.includes('?language=eng') ? { data: fixture } : {
      data: { content: 'Synthetic passage', copyright: 'Publisher notice' }, meta: { fumsToken: 'view-only-token' }
    });
  } }).onRequestGet;
  const env = { API_BIBLE_KEY: 'success-secret', ESV_RATE_LIMITER: { fetch: async () => {
    reservations++; return new Response(null, { status: 204 });
  } } };
  const result = await handler({ request: new Request('https://study.example/api/api-bible?q=John%203:16,18&version=APIBIBLE_MSG', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }), env });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const body = await result.text();
  assert.doesNotMatch(body, /success-secret|upstreamId/);
  assert.match(body, /Publisher notice/);
  assert.equal(JSON.parse(body).fumsTokens.length, 2);
  assert.equal(calls, 3);
  assert.equal(reservations, calls);
});

function ui(fetcher) {
  const scripts = [], listeners = {};
  const window = { DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    setTimeout, clearTimeout, location: { protocol: 'https:', origin: 'https://study.example' } };
  const document = { getElementById: () => ({}), querySelectorAll: () => [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  const source = fs.readFileSync('js/app.js', 'utf8').replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = [{id:'12', abbreviation:'ASV', title:'American Standard Version'}];
    window.testApi = { request: requestBiblePassage, options: bibleVersionOptions, valid: validBibleVersion,
      report: reportApiBibleView, state: S, load: loadBiblePreviewText,
      activate: function(link, preview) { activeBiblePreview = {link:link, preview:preview}; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: fetcher });
  return { api: window.testApi, window, scripts, listeners };
}

test('dropdown contains all three versions, preserves saved selection, and routes each to API.Bible', async () => {
  const urls = [];
  const { api, listeners } = ui(async url => {
    urls.push(url);
    return json({ text: 'Synthetic text', provider: 'api-bible', version: { abbreviation: 'MSG' } });
  });
  for (const abbreviation of ['KJV', 'MSG', 'GNT']) {
    const id = 'APIBIBLE_' + abbreviation;
    assert.equal(api.valid(id), id);
    assert.match(api.options(id, abbreviation), new RegExp('value="' + id + '" selected'));
    listeners.change.forEach(fn => fn({ target: { dataset: { bibleVersion: 'default' }, value: id } }));
    assert.equal(api.state.settings.bibleVersion, id);
    await api.request('John 3:16', id, new AbortController().signal);
    assert.match(urls.at(-1), new RegExp('/api/api-bible.*version=' + id));
  }
});

test('API.Bible failure uses a labelled fallback; aborted requests do not issue fallback requests', async () => {
  const urls = [];
  const { api } = ui(async url => {
    urls.push(url);
    return url.includes('/api/api-bible') ? new Response(null, { status: 429 }) : json({ text: 'Synthetic ASV', version: { abbreviation: 'ASV' } });
  });
  const result = await api.request('John 3:16', 'APIBIBLE_MSG', new AbortController().signal);
  assert.equal(result.fallback, true);
  assert.equal(result.version.abbreviation, 'ASV');
  assert.equal(urls.length, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.request('John 3:16', 'APIBIBLE_MSG', controller.signal));
  assert.equal(urls.length, 3);
});

test('display tracking queues each displayed passage token and loads the official tracker once', () => {
  const { api, window, scripts } = ui(async () => json({}));
  api.report([]);
  assert.equal(scripts.length, 0);
  api.report(['first']); api.report(['second']);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://pkg.api.bible/fumsV3.min.js');
  assert.equal(window.fumsData.length, 2);
  assert.equal(window.fumsData[0][0], 'trackView');
  assert.deepEqual(Array.from(window.fumsData[1][1]), ['second']);
});

test('rendered preview shows API.Bible attribution, correct link and fallback labels without changing saved default', async () => {
  let fail = false;
  const h = ui(async url => {
    if (url.includes('/api/api-bible')) return fail ? new Response(null, { status: 403 }) : json({
      text: 'Synthetic MSG text', provider: 'api-bible', version: { abbreviation: 'MSG', copyright: 'Publisher copyright' }, fumsTokens: ['displayed-token']
    });
    return json({ text: 'Synthetic ASV text', fallback: false, version: { abbreviation: 'ASV', copyright: 'ASV notice' } });
  });
  const nodes = Object.fromEntries(['[data-bible-version]', '.bible-preview-version', '.bible-preview-notice', '.bible-preview-copyright', '.bible-preview-open', '.bible-preview-text', '.bible-preview-fallback', '.bible-preview-esv-link', '.bible-preview-parts'].map(key => [key, { value: 'ASV', textContent: '', innerHTML: '', hidden: false }]));
  const preview = { querySelector: key => nodes[key] }, link = { textContent: 'John 3:16' };
  h.api.activate(link, preview);
  h.api.load(link, preview, 'APIBIBLE_MSG');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes['.bible-preview-text'].textContent, 'Synthetic MSG text');
  assert.equal(nodes['.bible-preview-copyright'].textContent, 'Publisher copyright Provided by API.Bible.');
  assert.match(nodes['.bible-preview-open'].href, /biblegateway.com.*version=MSG/);
  assert.equal(h.window.fumsData.length, 1);
  assert.equal(h.api.state.settings.bibleVersion, 'ASV');
  fail = true;
  h.api.load(link, preview, 'APIBIBLE_MSG');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes['.bible-preview-notice'].textContent, 'MSG unavailable — showing ASV. Your saved default is unchanged.');
  assert.match(nodes['.bible-preview-copyright'].textContent, /Provided by YouVersion/);
  assert.match(nodes['.bible-preview-open'].href, /www.bible.com/);
  assert.equal(h.window.fumsData.length, 1, 'fallback text is not counted as an API.Bible view');
});
