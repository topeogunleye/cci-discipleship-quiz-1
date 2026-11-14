const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const loadFunction = require('./helpers/load-function.cjs');

const root = path.join(__dirname, '..');
const response = (data, status) => new Response(JSON.stringify(data.text && !data.version ? { cache: { book: 43, verseCount: 1, bookLimit: 438 }, ...data } : data), { status: status || 200 });
const flush = () => new Promise(resolve => setImmediate(resolve));

/* ---------- server: /api/esv-passage limits and quota scope ---------- */

const esvSource = fs.readFileSync(path.join(root, 'functions/api/esv-passage.js'), 'utf8')
  .replace(/export function /g, 'function ').replace(/export async function /g, 'async function ');

function esvHandler(fetchImpl) {
  return vm.runInNewContext(esvSource + '\n({ onRequestGet })', { URL, Request, Response, Headers, fetch: fetchImpl });
}

function esvRequest(reference, env, handler) {
  return handler.onRequestGet({
    request: new Request('https://study.example/api/esv-passage?q=' + encodeURIComponent(reference), { headers: { 'CF-Connecting-IP': '198.51.100.7' } }),
    env
  });
}

test('ESV requests stay within one chapter and the 500-verse / half-book limits', async () => {
  let upstream = 0;
  const handler = esvHandler(async () => { upstream++; return response({ passages: ['text (ESV)'] }); });
  const env = { ESV_API_KEY: 'key', ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 204 }) } };

  // The longest chapter, and a full chapter selection, are fine.
  assert.equal((await esvRequest('Psalm 119', env, handler)).status, 200);
  assert.equal((await esvRequest('Psalm 119:1-176', env, handler)).status, 200);
  assert.equal((await esvRequest('John 3:16,18-21', env, handler)).status, 200);
  const accepted = upstream;

  for (const bad of ['Psalm 119:1-177', 'Psalm 119:1-100,101-177', 'Psalm 151', 'Genesis 1-2', 'Genesis 1:1-2:3', 'Genesis', 'John 3:20-16', 'John 3:0', 'Romans 8:1-39,40-300']) {
    assert.equal((await esvRequest(bad, env, handler)).status, 400, bad + ' should be rejected');
  }
  assert.equal(upstream, accepted, 'rejected references never reach the ESV API');
  const two = await esvRequest('John 3:16', env, handler);
  assert.equal(two.headers.get('Cache-Control'), 'no-store', 'ESV text is never put in a shared or persistent cache');
});

test('ESV requests reserve quota from the ESV scope of the private limiter', async () => {
  const seen = [];
  const handler = esvHandler(async () => response({ passages: ['text (ESV)'] }));
  const env = { ESV_API_KEY: 'key', ESV_RATE_LIMITER: { fetch: async request => { seen.push({ url: request.url, ip: request.headers.get('X-ESV-Client-IP') }); return new Response(null, { status: 204 }); } } };
  assert.equal((await esvRequest('John 3:16', env, handler)).status, 200);
  assert.deepEqual(seen, [{ url: 'https://esv-rate-limiter.internal/check/esv', ip: '198.51.100.7' }]);

  const exhausted = { ESV_API_KEY: 'key', ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 429, headers: { 'Retry-After': '1200' } }) } };
  const limited = await esvRequest('John 3:16', exhausted, handler);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '1200');
});

test('YouVersion requests reserve quota from their own scope', async () => {
  const seen = [];
  const handler = loadFunction('functions/api/bible.js', {
    fetch: async () => response({}),
    modules: { '../_lib/youversion.cjs': {
      passageIds: () => ['JHN.3.16'],
      versions: async (key, fetcher) => { await fetcher('https://upstream.test/bibles', {}); return [{ id: '12', abbreviation: 'ASV', title: 'ASV' }]; },
      passage: async () => ({ text: 'x', version: { abbreviation: 'ASV' } })
    } }
  }).onRequestGet;
  const env = { YOUVERSION_APP_KEY: 'k', ESV_RATE_LIMITER: { fetch: async request => { seen.push(request.url); return new Response(null, { status: 204 }); } } };
  await handler({ request: new Request('https://study.example/api/bible', { headers: { 'CF-Connecting-IP': '198.51.100.7' } }), env });
  assert.deepEqual(seen, ['https://esv-rate-limiter.internal/check/youversion']);
});

/* ---------- client: ESV in the translation dropdown and preview ---------- */

function previewUi(fetcher) {
  const listeners = {}, timers = new Map();
  const clock = { now: Date.now() };
  class ClockDate extends Date { static now() { return clock.now; } }
  const elements = { app: {}, modal: {}, toast: {} };
  const window = { DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: id => timers.delete(id),
    location: { protocol: 'https:', origin: 'https://study.example' } };
  const document = { getElementById: id => elements[id], querySelectorAll: () => [], addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = [{id:'1', abbreviation:'KJV', title:'King James'}];
    window.ui = { state: S, load: loadBiblePreviewText, picker: bibleVersionPicker, options: bibleVersionOptions, valid: validBibleVersion,
      cacheGet: esvCacheGet, cachePut: esvCachePut, cacheEntries: function () { return esvPassageCache; },
      activate: function(link, preview) { activeBiblePreview = {link:link,preview:preview}; },
      cancel: function() { biblePreviewRequest.controller.abort(); biblePreviewRequest = null; activeBiblePreview = null; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: fetcher, Date: ClockDate });
  const nodes = {
    '[data-bible-version]': { value: 'ASV', textContent: '', hidden: false },
    '.bible-preview-version': { textContent: '' }, '.bible-preview-notice': { textContent: '' }, '.bible-preview-copyright': { textContent: '' },
    '.bible-preview-open': { href: '', textContent: 'Open passage on YouVersion' }, '.bible-preview-text': { textContent: '', hidden: true },
    '.bible-preview-fallback': { textContent: '', hidden: false }, '.bible-preview-esv-link': { hidden: true },
    '.bible-preview-youversion-link': { href: '', hidden: true }
  };
  const preview = { querySelector: key => nodes[key] }, link = { textContent: 'John 3:16' };
  window.ui.activate(link, preview);
  return { ui: window.ui, nodes, preview, link, timers, advance: ms => { clock.now += ms; }, change: target => listeners.change.forEach(fn => fn({ target })) };
}

test('ESV is offered in the preview and Settings dropdown and can be saved as the default', () => {
  const h = previewUi(async () => response({}));
  assert.equal(h.ui.valid('ESV'), 'ESV');
  assert.equal(h.ui.valid('esv'), 'APIBIBLE_NKJV');
  const options = h.ui.options('ASV', '');
  assert.match(options, /<option value="ESV">ESV — English Standard Version \(Crossway\)<\/option>/);
  assert.equal((options.match(/<option /g) || []).length, 6);
  assert.doesNotMatch(options, /value="ASV"/);
  assert.doesNotMatch(options, /value="1"/, 'duplicate KJV provider row is hidden');
  assert.match(h.ui.options('ESV', ''), /value="ESV" selected/);
  assert.equal(h.ui.state.settings.bibleVersion, 'APIBIBLE_NKJV', 'NKJV is the initial default');
  h.change({ dataset: { bibleVersion: 'default' }, value: 'ESV' });
  assert.equal(h.ui.state.settings.bibleVersion, 'ESV');
});

test('displayed ESV has a primary ESV passage button and a secondary YouVersion link', async () => {
  const urls = [];
  const h = previewUi(async url => { urls.push(url); return response({ text: 'For God so loved the world. (ESV)' }); });
  h.change({ dataset: { bibleVersion: 'preview' }, value: 'ESV' });
  await flush();
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/api\/esv-passage\?q=John%203%3A16$/);
  assert.equal(h.nodes['.bible-preview-text'].textContent, 'For God so loved the world. (ESV)');
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  assert.match(h.nodes['.bible-preview-copyright'].textContent, /ESV® Bible.*Crossway.*Used by permission/);
  assert.equal(h.nodes['.bible-preview-notice'].textContent, '');
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, false);
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.esv.org/John+3:16/');
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on ESV');
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, false);
  assert.equal(h.nodes['.bible-preview-youversion-link'].href, 'https://www.bible.com/search/bible?q=John%203%3A16');
  assert.equal(h.ui.state.settings.bibleVersion, 'APIBIBLE_NKJV', 'a preview choice does not change the saved default');
});

test('reopening an ESV passage uses the in-memory copy instead of another API request', async () => {
  let requests = 0;
  const h = previewUi(async () => { requests++; return response({ text: 'Fixture (ESV)' }); });
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(requests, 1);
  assert.equal(h.nodes['.bible-preview-text'].textContent, 'Fixture (ESV)');
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, false);
});

test('ESV external links follow the current reference, including books with spaces and verse ranges', async () => {
  const h = previewUi(async () => response({ text: 'Synthetic ESV' }));
  h.link.textContent = '1 Corinthians 13:4–7';
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.esv.org/1+Corinthians+13:4-7/');
  assert.equal(h.nodes['.bible-preview-youversion-link'].href, 'https://www.bible.com/search/bible?q=1%20Corinthians%2013%3A4%E2%80%937');
  h.link.textContent = 'Jude 24–25';
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.esv.org/Jude+24-25/');
});

test('legacy YouVersion ESV preferences use Crossway while keeping the saved ID', async () => {
  const urls = [];
  const h = previewUi(async url => { urls.push(url); return response({ text: 'Synthetic ESV' }); });
  h.ui.state.settings.bibleVersion = '59';
  h.ui.load(h.link, h.preview, '59');
  await flush();
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/api\/esv-passage/);
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  assert.equal(h.ui.state.settings.bibleVersion, '59');
});

test('the in-memory ESV copy is bounded', async () => {
  let requests = 0;
  const h = previewUi(async () => { requests++; return response({ text: 'Fixture (ESV)' }); });
  for (let verse = 1; verse <= 10; verse++) {
    h.link.textContent = 'John 3:' + verse;
    h.ui.load(h.link, h.preview, 'ESV');
    await flush();
  }
  assert.equal(requests, 10);
  h.link.textContent = 'John 3:1'; // evicted: only the 8 most recent passages are kept
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(requests, 11);
  h.link.textContent = 'John 3:10'; // still cached
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(requests, 11);
});

test('ESV cache evicts by 500 verses even when fewer than eight passages are stored', () => {
  const h = previewUi(async () => response({}));
  for (let chapter = 1; chapter <= 3; chapter++) h.ui.cachePut('Psalms ' + chapter, 'Synthetic chapter', { book: 19, verseCount: 176, bookLimit: 1230 });
  assert.equal(h.ui.cacheGet('Psalms 1'), null);
  assert.equal(h.ui.cacheEntries().length, 2);
  assert.equal(h.ui.cacheEntries().reduce((sum, entry) => sum + entry.verseCount, 0), 352);
});

test('ESV cache enforces per-book limits across passages and refuses unknown or oversized counts', () => {
  const h = previewUi(async () => response({}));
  h.ui.cachePut('2 John 1:1-4', 'Synthetic text', { book: 63, verseCount: 4, bookLimit: 6 });
  h.ui.cachePut('2 John 1:5-8', 'Synthetic text', { book: 63, verseCount: 4, bookLimit: 6 });
  assert.equal(h.ui.cacheGet('2 John 1:1-4'), null);
  assert.equal(h.ui.cacheEntries().length, 1);
  h.ui.cachePut('2 John 1', 'Full book', { book: 63, verseCount: 13, bookLimit: 6 });
  h.ui.cachePut('Unknown', 'Synthetic text');
  assert.equal(h.ui.cacheEntries().length, 1);
  h.ui.cachePut('John 3:16', 'Other book', { book: 43, verseCount: 1, bookLimit: 438 });
  assert.equal(h.ui.cacheEntries().length, 2);
});

test('ESV server uses returned verse ranges to provide safe cache accounting and rejects excessive book coverage', async () => {
  let parsed;
  const handler = esvHandler(async () => response({ passages: ['Synthetic text'], parsed }));
  const env = { ESV_API_KEY: 'key', ESV_RATE_LIMITER: { fetch: async () => new Response(null, { status: 204 }) } };
  // Crossway encodes book*1,000,000 + chapter*1,000 + verse.
  parsed = [[19119001, 19119176]];
  let result = await esvRequest('Psalm 119', env, handler);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).cache, { book: 19, verseCount: 176, bookLimit: 1230 });
  parsed = [[43003016, 43003018], [43003020, 43003020]];
  result = await esvRequest('John 3:16-18,20', env, handler);
  assert.deepEqual((await result.json()).cache, { book: 43, verseCount: 4, bookLimit: 438 });
  parsed = [[63001001, 63001013]];
  assert.equal((await esvRequest('2 John 1:1-13', env, handler)).status, 400);
  parsed = [[43003001, 43004001]];
  assert.equal((await esvRequest('John 3', env, handler)).status, 400);
});

for (const [label, esvReply] of [
  ['an error status', () => response({ error: 'The ESV passage service is temporarily unavailable.' }, 503)],
  ['a rate-limit', () => response({ error: 'Too many passage requests.' }, 429)],
  ['an empty body', () => response({})],
  ['a network failure', () => { throw new TypeError('network'); }]
]) {
  test('ESV falls back to AMP with a clear notice when the ESV API returns ' + label, async () => {
    const urls = [];
    const h = previewUi(async url => {
      urls.push(url);
      if (/\/api\/esv-passage/.test(url)) return esvReply();
      return response({ text: 'AMP fixture', version: { id: '1588', abbreviation: 'AMP', title: 'Amplified Bible', copyright: 'AMP publisher notice', publisher: '' }, fallback: false, url: 'https://www.bible.com/bible/1588/JHN.3.16' });
    });
    h.ui.load(h.link, h.preview, 'ESV');
    await flush();
    assert.match(urls[0], /\/api\/esv-passage/);
    assert.match(urls[1], /\/api\/bible\?q=John%203%3A16&version=1588&fallback=none$/);
    assert.equal(h.nodes['.bible-preview-text'].textContent, 'AMP fixture');
    assert.equal(h.nodes['.bible-preview-version'].textContent, 'AMP');
    assert.equal(h.nodes['.bible-preview-notice'].textContent, 'ESV ' + (label === 'a rate-limit' ? 'temporarily rate-limited' : 'unavailable') + ' — showing Amplified (AMP). Your saved default is unchanged.');
    assert.match(h.nodes['.bible-preview-copyright'].textContent, /AMP publisher notice/);
    assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true, 'the ESV notice is only shown with ESV text');
    assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, true, 'a fallback has just its actual translation link');
    assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/1588/JHN.3.16');
    assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on YouVersion');
    assert.equal(h.ui.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  });
}

test('NKJV rate limiting shows ESV attribution and ESV links, and provider cooldown avoids repeated API calls', async () => {
  const urls = [];
  const h = previewUi(async url => {
    urls.push(url);
    if (url.includes('/esv-passage')) return response({ text: 'Synthetic ESV fixture' });
    if (url.includes('/api-bible')) return new Response(null, { status: 429, headers: { 'Retry-After': '3600' } });
    assert.fail('AMP should not be requested when ESV loads');
  });
  h.ui.state.settings.bibleVersion = '114';
  h.ui.load(h.link, h.preview, '114'); await flush();
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  assert.equal(h.nodes['.bible-preview-notice'].textContent, 'NKJV temporarily rate-limited — showing ESV. Your saved default is unchanged.');
  assert.match(h.nodes['.bible-preview-copyright'].textContent, /Crossway/);
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.esv.org/John+3:16/');
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on ESV');
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, false);
  h.ui.load(h.link, h.preview, 'APIBIBLE_MSG'); await flush();
  assert.equal(urls.filter(url => url.includes('/api-bible')).length, 1, 'MSG shares API.Bible cooldown with NKJV');
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  assert.equal(h.ui.state.settings.bibleVersion, '114');
});

test('a selected AMP failure tries ESV once and never repeats AMP', async () => {
  const urls = [];
  const h = previewUi(async url => {
    urls.push(url);
    return url.includes('/esv-passage') ? response({ text: 'Synthetic ESV fixture' }) : new Response(null, { status: 503 });
  });
  h.ui.load(h.link, h.preview, '1588'); await flush();
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  assert.equal(urls.length, 2);
  assert.match(h.nodes['.bible-preview-notice'].textContent, /AMP unavailable — showing ESV/);
});

test('provider cooldown expires at Retry-After and does not block other providers', async () => {
  let requests = 0;
  const h = previewUi(async url => {
    if (url.includes('/esv-passage')) return response({ text: 'Synthetic ESV fixture' });
    requests++;
    return new Response(null, { status: 429, headers: { 'Retry-After': '2' } });
  });
  // A clock is injected into the VM rather than waiting or contacting a real API.
  h.ui.load(h.link, h.preview, 'APIBIBLE_NKJV'); await flush();
  h.ui.load(h.link, h.preview, 'APIBIBLE_MSG'); await flush();
  assert.equal(requests, 1);
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'ESV');
  h.advance(2001);
  h.ui.load(h.link, h.preview, 'APIBIBLE_KJV'); await flush();
  assert.equal(requests, 2);
});

test('if both ESV and the AMP fallback fail, the preview shows the unavailable message', async () => {
  const h = previewUi(async () => response({ error: 'down' }, 503));
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'Unavailable');
  assert.match(h.nodes['.bible-preview-fallback'].textContent, /unavailable/i);
  assert.match(h.nodes['.bible-preview-notice'].textContent, /ESV and Amplified \(AMP\) are unavailable/);
  assert.match(h.nodes['.bible-preview-open'].href, /www.bible.com/);
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true);
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, true);
});

test('switching away from ESV restores the YouVersion link and hides the ESV notice', async () => {
  const h = previewUi(async url => /esv-passage/.test(url)
    ? response({ text: 'ESV text (ESV)' })
    : response({ text: 'KJV text', version: { id: '1', abbreviation: 'KJV', title: 'King James', copyright: 'c', publisher: '' }, fallback: false, url: 'https://www.bible.com/bible/1/JHN.3.16' }));
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, false);
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, false);
  h.ui.load(h.link, h.preview, '1');
  await flush();
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true);
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, true);
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on YouVersion');
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/1/JHN.3.16');
});

test('closing a preview during an ESV request does not trigger the AMP fallback', async () => {
  const urls = [];
  const h = previewUi((url, options) => new Promise((resolve, reject) => {
    urls.push(url);
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  h.ui.load(h.link, h.preview, 'ESV');
  h.ui.cancel();
  await flush();
  assert.equal(urls.length, 1, 'no second request after an abort');
  assert.equal(h.nodes['.bible-preview-fallback'].textContent, 'Loading Bible passage…', 'closing does not update the dismissed preview');
});

test('a slower AMP fallback cannot overwrite a newer successful translation or its links', async () => {
  let finishAmp;
  const h = previewUi(async url => {
    if (url.includes('esv-passage')) return new Response(null, { status: 503 });
    if (url.includes('version=1588')) return new Promise(resolve => { finishAmp = resolve; });
    return response({ text: 'KJV fixture', version: { id: '1', abbreviation: 'KJV', copyright: 'KJV notice' }, url: 'https://www.bible.com/bible/1/JHN.3.16' });
  });
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(typeof finishAmp, 'function');
  h.ui.load(h.link, h.preview, '1');
  await flush();
  finishAmp(response({ text: 'Late AMP fixture', version: { id: '1588', abbreviation: 'AMP', copyright: 'AMP notice' }, url: 'https://www.bible.com/bible/1588/JHN.3.16' }));
  await flush();
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'KJV');
  assert.equal(h.nodes['.bible-preview-text'].textContent, 'KJV fixture');
  assert.match(h.nodes['.bible-preview-copyright'].textContent, /KJV notice/);
  assert.equal(h.nodes['.bible-preview-notice'].textContent, '');
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/1/JHN.3.16');
  assert.equal(h.nodes['.bible-preview-youversion-link'].hidden, true);
});
