const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const bible = require('../functions/_lib/youversion.cjs');
const loadFunction = require('./helpers/load-function.cjs');
const response = data => new Response(JSON.stringify(data));
const catalog = [{ id: '1', abbreviation: 'KJV', title: 'King James', copyright: 'fixture copyright' }, { id: '2', abbreviation: 'NKJV', title: 'New King James', copyright: 'fixture copyright' }];

test('references preserve chapter, verse ranges, comma selections and single-chapter books', () => {
  assert.deepEqual(bible.passageIds('John 3:16–18'), ['JHN.3.16-18']);
  assert.deepEqual(bible.passageIds('Hebrews 1:3, 5–6, 13–14'), ['HEB.1.3', 'HEB.1.5-6', 'HEB.1.13-14']);
  assert.deepEqual(bible.passageIds('Genesis 6–9'), ['GEN.6', 'GEN.7', 'GEN.8', 'GEN.9']);
  assert.deepEqual(bible.passageIds('Jude 24–25'), ['JUD.1.24-25']);
  for (const ref of ['https://evil.example', 'John 0:1', 'John 3:18-16', 'Genesis 1-150', 'Unknown 3:1']) assert.equal(bible.passageIds(ref), null);
});

test('all authored Bible reference links can be resolved without rewriting learner decks', () => {
  for (const file of fs.readdirSync('decks').filter(f => f.endsWith('.txt'))) {
    const text = fs.readFileSync('decks/' + file, 'utf8');
    for (const match of text.matchAll(/https:\/\/www\.esv\.org\/verses\/([^/>]+)\//g)) {
      const reference = decodeURIComponent(match[1].replace(/\+/g, ' '));
      assert.ok(bible.passageIds(reference), file + ': ' + reference);
    }
  }
});

test('catalog follows pagination, requests licensed English versions and keeps publishers without organizations', async () => {
  let count = 0;
  const result = await bible.versions('test-key', async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('language_ranges[]'), 'en');
    assert.equal(parsed.searchParams.has('all_available'), false);
    assert.equal(options.headers['X-YVP-App-Key'], 'test-key');
    count++;
    if (count === 1) return response({ data: [{ id: 2, abbreviation: 'NKJV', title: 'NKJV', language_tag: 'en', organization_id: null }], next_page_token: 'next' });
    assert.equal(parsed.searchParams.get('page_token'), 'next');
    return response({ data: [{ id: 1, abbreviation: 'KJV', language_tag: 'en-US' }, { id: 3, language_tag: 'fr' }] });
  });
  assert.equal(count, 2);
  assert.deepEqual(result.map(v => v.id), ['1', '2']);
});

test('NKJV is preferred and returns actual version, copyright and passage link', async () => {
  const result = await bible.passage('John 3:16', 'NKJV', catalog, 'key', async url => {
    assert.match(url, /\/bibles\/2\/passages\/JHN.3.16\?format=text$/);
    return response({ content: 'Fixture verse text.' });
  });
  assert.equal(result.fallback, false);
  assert.equal(result.version.copyright, 'fixture copyright');
  assert.equal(result.url, 'https://www.bible.com/bible/2/JHN.3.16');
});

test('publisher promotional attribution is retained when the catalog copyright is empty', async () => {
  bible.__test.clearCatalogCache();
  const versions = await bible.versions('promotional-notice', async () => response({ data: [{
    id: 1588, abbreviation: 'AMP', language_tag: 'en', copyright: ' ', promotional_content: 'Synthetic AMP publisher notice'
  }] }));
  assert.equal(versions[0].copyright, 'Synthetic AMP publisher notice');
  bible.__test.clearCatalogCache();
});

test('missing attribution is resolved from detailed metadata before text is served', async () => {
  const versions = [{ id: '111', abbreviation: 'NIV11', copyright: '' }], urls = [];
  const fetcher = async url => {
    urls.push(url);
    return response(url.endsWith('/bibles/111') ? { promotional_content: 'Synthetic NIV publisher notice' } : { content: 'Synthetic verse' });
  };
  const result = await bible.passage('John 3:16', '111', versions, 'details-key', fetcher);
  assert.equal(result.version.copyright, 'Synthetic NIV publisher notice');
  assert.equal(result.fallback, false);
  assert.match(urls[0], /\/bibles\/111$/);
  await bible.passage('John 3:16', '111', versions, 'details-key', fetcher);
  assert.equal(urls.length, 3, 'resolved attribution is reused with the catalog metadata');
  let textCalls = 0;
  const unavailable = await bible.passage('John 3:16', '111', [{ id: '111', abbreviation: 'NIV11', copyright: '' }], 'no-notice', async url => {
    if (url.includes('/passages/')) textCalls++;
    return response({});
  });
  assert.equal(unavailable.status, 404);
  assert.equal(textCalls, 0);
});

test('unlicensed or missing passages fall back with a label and no mixed translations', async () => {
  const result = await bible.passage('John 3:16,18', 'NKJV', catalog, 'key', async url => {
    if (url.includes('/2/') && url.includes('3.18')) return new Response('', { status: 403 });
    return response({ content: url.includes('/1/') ? 'KJV fixture' : 'NKJV fixture' });
  });
  assert.equal(result.fallback, true);
  assert.equal(result.version.abbreviation, 'KJV');
  assert.equal(result.text, 'KJV fixture\n\nKJV fixture');
  const absent = await bible.passage('John 3:16', 'NKJV', catalog.slice(0, 1), 'key', async () => response({ content: 'KJV fixture' }));
  assert.equal(absent.fallback, true);
});

test('outages and rate limits do not fan out through the translation catalog', async () => {
  let requests = 0;
  await assert.rejects(() => bible.passage('John 3:16', 'NKJV', catalog, 'key', async () => { requests++; return new Response('', { status: 429 }); }));
  assert.equal(requests, 1);
});

test('every authored multipart citation retains a translated link for every resolved segment', async () => {
  let checked = 0;
  for (const file of fs.readdirSync('decks').filter(f => f.endsWith('.txt'))) {
    for (const match of fs.readFileSync('decks/' + file, 'utf8').matchAll(/https:\/\/www\.esv\.org\/verses\/([^/>]+)\//g)) {
      const reference = decodeURIComponent(match[1].replace(/\+/g, ' ')), ids = bible.passageIds(reference);
      if (ids.length < 2) continue;
      const result = await bible.passage(reference, 'NKJV', catalog, 'fixture', async () => response({ content: 'fixture' }));
      assert.deepEqual(result.links.map(link => link.url), ids.map(id => 'https://www.bible.com/bible/2/' + id), reference);
      assert.equal(new Set(result.links.map(link => link.label)).size, ids.length, reference);
      checked++;
    }
  }
  assert.equal(checked, 23);
});

test('missing or unlicensed text has a distinct not-found status after bounded fallbacks', async () => {
  const empty = await bible.passage('John 3:16', 'NKJV', catalog, 'fixture', async () => response({ content: ' ' }));
  assert.equal(empty.status, 404);
  const missing = await bible.passage('John 3:16', 'NKJV', catalog, 'fixture', async () => new Response(null, { status: 404 }));
  assert.equal(missing.status, 404);
});

test('Function rejects invalid references/origins, hides upstream errors and never exposes the key', async () => {
  let calls = 0;
  const handler = loadFunction('functions/api/bible.js', {
    modules: { '../_lib/youversion.cjs': { ...bible, versions: async () => { calls++; throw new Error('private-key'); } } }
  }).onRequestGet;
  const request = q => new Request('https://study.example/api/bible' + q);
  assert.equal((await handler({ request: request('?q=invalid'), env: {} })).status, 400);
  assert.equal((await handler({ request: request(''), env: {} })).status, 503);
  assert.equal(calls, 0);
  const denied = await handler({ request: new Request('https://study.example/api/bible', { headers: { Origin: 'https://other.example' } }), env: { YOUVERSION_APP_KEY: 'private-key' } });
  assert.equal(denied.status, 403);
  const failed = await handler({ request: request(''), env: { YOUVERSION_APP_KEY: 'private-key' } });
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await failed.text(), /private-key/);
});

test('catalog caches in-memory and deduplicates concurrent fetches', async () => {
  bible.__test.clearCatalogCache();
  let calls = 0;
  const mockFetcher = async () => {
    calls++;
    return response({ data: [{ id: 12, abbreviation: 'ASV', title: 'American Standard', language_tag: 'en' }] });
  };
  const [first, concurrent] = await Promise.all([
    bible.versions('cache-test-key', mockFetcher),
    bible.versions('cache-test-key', mockFetcher)
  ]);
  assert.equal(calls, 1, 'concurrent calls should share inflight fetch');
  assert.deepEqual(first, concurrent);
  const cached = await bible.versions('cache-test-key', mockFetcher);
  assert.equal(calls, 1, 'subsequent call should return cached catalog');
  assert.deepEqual(cached, first);
  bible.__test.clearCatalogCache();
});

test('Function returns cacheable headers on successful catalog and passage queries', async () => {
  const handler = loadFunction('functions/api/bible.js', {
    modules: { '../_lib/youversion.cjs': {
      ...bible,
      versions: async () => [{ id: '12', abbreviation: 'ASV', title: 'ASV' }],
      passage: async () => ({ text: 'In the beginning...', version: { id: '12', abbreviation: 'ASV' }, status: 200 })
    } }
  }).onRequestGet;
  const env = {
    YOUVERSION_APP_KEY: 'test-key',
    ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 200 }) }
  };
  const versionsRes = await handler({
    request: new Request('https://study.example/api/bible', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }),
    env
  });
  assert.equal(versionsRes.status, 200);
  assert.match(versionsRes.headers.get('Cache-Control'), /public, max-age=3600/);

  const passageRes = await handler({
    request: new Request('https://study.example/api/bible?q=Genesis%201:1', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }),
    env
  });
  assert.equal(passageRes.status, 200);
  assert.match(passageRes.headers.get('Cache-Control'), /public, max-age=3600/);
});


function previewUi(fetcher) {
  const vm = require('node:vm'), listeners = {}, timers = new Map();
  const elements = { app: {}, modal: {}, toast: {} };
  const window = { DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: id => timers.delete(id),
    location: { protocol: 'https:', origin: 'https://study.example' } };
  const document = { getElementById: id => elements[id], querySelectorAll: () => [], addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  const source = fs.readFileSync('js/app.js', 'utf8').replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = [{id:'1', abbreviation:'KJV', title:'King James'}];
    window.ui = { state: S, load: loadBiblePreviewText, picker: bibleVersionPicker,
      activate: function(link, preview) { activeBiblePreview = {link:link,preview:preview}; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: fetcher });
  const nodes = Object.fromEntries(['[data-bible-version]', '.bible-preview-version', '.bible-preview-notice', '.bible-preview-copyright', '.bible-preview-open', '.bible-preview-text', '.bible-preview-fallback', '.bible-preview-parts'].map(key => [key, { value: 'ASV', textContent: '', innerHTML: '', hidden: false }]));
  const preview = { querySelector: key => nodes[key] }, link = { textContent: 'John 3:16' };
  window.ui.activate(link, preview);
  return { ui: window.ui, nodes, preview, link, timers, change: target => listeners.change.forEach(fn => fn({ target })) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('preview switching does not save preference; Settings does, and fallback text names the actual version', async () => {
  const harness = previewUi(async url => {
    assert.match(url, /version=1/);
    return response({ text: 'Fixture', version: catalog[0], fallback: false, url: 'https://www.bible.com/bible/1/JHN.3.16' });
  });
  harness.change({ dataset: { bibleVersion: 'preview' }, value: '1' });
  await flush();
  assert.equal(harness.ui.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  assert.equal(harness.nodes['.bible-preview-version'].textContent, 'KJV');
  assert.match(harness.nodes['.bible-preview-copyright'].textContent, /fixture copyright/);
  harness.change({ dataset: { bibleVersion: 'default' }, value: '1' });
  assert.equal(harness.ui.state.settings.bibleVersion, '1');
  const fallback = previewUi(async () => response({ text: 'Fixture', version: catalog[0], fallback: true }));
  fallback.ui.load(fallback.link, fallback.preview);
  await flush();
  assert.match(fallback.nodes['.bible-preview-notice'].textContent, /ASV unavailable — showing KJV/);
  assert.equal(fallback.ui.state.settings.bibleVersion, 'APIBIBLE_NKJV');
});

test('a slower earlier translation response cannot replace the latest selection', async () => {
  const requests = [];
  const h = previewUi(() => new Promise(resolve => requests.push(resolve)));
  h.ui.load(h.link, h.preview, 'ASV');
  h.ui.load(h.link, h.preview, '1');
  requests[1](response({ text: 'Latest fixture', version: catalog[0], fallback: false }));
  await flush();
  requests[0](response({ text: 'Stale fixture', version: catalog[1], fallback: false }));
  await flush();
  assert.equal(h.nodes['.bible-preview-text'].textContent, 'Latest fixture');
});

test('preview timeout replaces the loading state with a retry message', async () => {
  const h = previewUi((url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  h.ui.load(h.link, h.preview);
  h.timers.get(20000)();
  await flush();
  assert.match(h.nodes['.bible-preview-fallback'].textContent, /took too long/);
});

test('successful text clears the hidden loading description and renders all external links', async () => {
  const h = previewUi(async () => response({ text: 'fixture', version: catalog[0], links: [
    { label: 'Hebrews 1:3', url: 'https://www.bible.com/bible/1/HEB.1.3' },
    { label: 'Hebrews 1:5–6', url: 'https://www.bible.com/bible/1/HEB.1.5-6' },
    { label: 'Hebrews 1:13–14', url: 'https://www.bible.com/bible/1/HEB.1.13-14' }
  ] }));
  h.ui.load(h.link, h.preview);
  await flush();
  assert.equal(h.nodes['.bible-preview-fallback'].textContent, '');
  assert.equal(h.nodes['.bible-preview-fallback'].hidden, true);
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open Hebrews 1:3 on YouVersion');
  assert.match(h.nodes['.bible-preview-parts'].innerHTML, /HEB\.1\.5-6/);
  assert.match(h.nodes['.bible-preview-parts'].innerHTML, /HEB\.1\.13-14/);
  assert.equal(h.nodes['.bible-preview-parts'].hidden, false);
});

test('passage failures distinguish invalid, missing, limited, upstream and network causes', async () => {
  for (const [status, expected] of [[400, /reference cannot be previewed/], [404, /No passage text was found/], [429, /Try again in 120 seconds/], [503, /temporarily unavailable/]]) {
    const h = previewUi(async () => new Response('{}', { status, headers: { 'Retry-After': '120' } }));
    h.ui.load(h.link, h.preview);
    await flush();
    assert.match(h.nodes['.bible-preview-fallback'].textContent, expected);
  }
  const empty = previewUi(async () => response({ text: '', version: catalog[0] }));
  empty.ui.load(empty.link, empty.preview); await flush();
  assert.match(empty.nodes['.bible-preview-fallback'].textContent, /No passage text was found/);
  const network = previewUi(async () => { throw new TypeError('Failed to fetch'); });
  network.ui.load(network.link, network.preview); await flush();
  assert.match(network.nodes['.bible-preview-fallback'].textContent, /Check your connection/);
});
