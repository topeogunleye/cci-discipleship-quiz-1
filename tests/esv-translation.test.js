const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const response = (data, status) => new Response(JSON.stringify(data), { status: status || 200 });
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
  const auth = require('../functions/_lib/auth.cjs');
  const bibleSource = fs.readFileSync(path.join(root, 'functions/api/bible.js'), 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
  const handler = vm.runInNewContext(bibleSource + '\nonRequestGet', {
    URL, Request, Response, AbortSignal, auth,
    fetch: async () => response({}),
    bible: {
      passageIds: () => ['JHN.3.16'],
      versions: async (key, fetcher) => { await fetcher('https://upstream.test/bibles', {}); return [{ id: '12', abbreviation: 'ASV', title: 'ASV' }]; },
      passage: async () => ({ text: 'x', version: { abbreviation: 'ASV' } })
    }
  });
  const env = { YOUVERSION_APP_KEY: 'k', ESV_RATE_LIMITER: { fetch: async request => { seen.push(request.url); return new Response(null, { status: 204 }); } } };
  await handler({ request: new Request('https://study.example/api/bible', { headers: { 'CF-Connecting-IP': '198.51.100.7' } }), env });
  assert.deepEqual(seen, ['https://esv-rate-limiter.internal/check/youversion']);
});

/* ---------- client: ESV in the translation dropdown and preview ---------- */

function previewUi(fetcher) {
  const listeners = {}, timers = new Map();
  const elements = { app: {}, modal: {}, toast: {} };
  const window = { DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: id => timers.delete(id),
    location: { protocol: 'https:', origin: 'https://study.example' } };
  const document = { getElementById: id => elements[id], querySelectorAll: () => [], addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = [{id:'1', abbreviation:'KJV', title:'King James'}];
    window.ui = { state: S, load: loadBiblePreviewText, picker: bibleVersionPicker, options: bibleVersionOptions, valid: validBibleVersion,
      activate: function(link, preview) { activeBiblePreview = {link:link,preview:preview}; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: fetcher });
  const nodes = {
    '[data-bible-version]': { value: 'ASV', textContent: '', hidden: false },
    '.bible-preview-version': { textContent: '' }, '.bible-preview-notice': { textContent: '' }, '.bible-preview-copyright': { textContent: '' },
    '.bible-preview-open': { href: '', textContent: 'Open passage on YouVersion' }, '.bible-preview-text': { textContent: '', hidden: true },
    '.bible-preview-fallback': { textContent: '', hidden: false }, '.bible-preview-esv-link': { hidden: true }
  };
  const preview = { querySelector: key => nodes[key] }, link = { textContent: 'John 3:16' };
  window.ui.activate(link, preview);
  return { ui: window.ui, nodes, preview, link, timers, change: target => listeners.change.forEach(fn => fn({ target })) };
}

test('ESV is offered in the preview and Settings dropdown and can be saved as the default', () => {
  const h = previewUi(async () => response({}));
  assert.equal(h.ui.valid('ESV'), 'ESV');
  assert.equal(h.ui.valid('esv'), 'ASV');
  const options = h.ui.options('ASV', '');
  assert.match(options, /<option value="ESV">ESV — English Standard Version \(Crossway\)<\/option>/);
  assert.ok(options.indexOf('value="ASV"') < options.indexOf('value="ESV"') && options.indexOf('value="ESV"') < options.indexOf('value="1"'));
  assert.match(h.ui.options('ASV', 'crossway'), /value="ESV"/);
  assert.doesNotMatch(h.ui.options('ASV', 'crossway'), /King James/);
  assert.match(h.ui.options('ESV', ''), /value="ESV" selected/);
  assert.equal(h.ui.state.settings.bibleVersion, 'ASV', 'ASV remains the default');
  h.change({ dataset: { bibleVersion: 'default' }, value: 'ESV' });
  assert.equal(h.ui.state.settings.bibleVersion, 'ESV');
});

test('choosing ESV loads text from /api/esv-passage with the ESV notice and a link to esv.org', async () => {
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
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on ESV.org');
  assert.equal(h.ui.state.settings.bibleVersion, 'ASV', 'a preview choice does not change the saved default');
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

for (const [label, esvReply] of [
  ['an error status', () => response({ error: 'The ESV passage service is temporarily unavailable.' }, 503)],
  ['a rate-limit', () => response({ error: 'Too many passage requests.' }, 429)],
  ['an empty body', () => response({})],
  ['a network failure', () => { throw new TypeError('network'); }]
]) {
  test('ESV falls back to ASV with a clear notice when the ESV API returns ' + label, async () => {
    const urls = [];
    const h = previewUi(async url => {
      urls.push(url);
      if (/\/api\/esv-passage/.test(url)) return esvReply();
      return response({ text: 'ASV fixture', version: { id: '12', abbreviation: 'ASV', title: 'American Standard Version', copyright: 'Public domain.', publisher: '' }, fallback: false, url: 'https://www.bible.com/bible/12/JHN.3.16' });
    });
    h.ui.load(h.link, h.preview, 'ESV');
    await flush();
    assert.match(urls[0], /\/api\/esv-passage/);
    assert.match(urls[1], /\/api\/bible\?q=John%203%3A16&version=ASV$/);
    assert.equal(h.nodes['.bible-preview-text'].textContent, 'ASV fixture');
    assert.equal(h.nodes['.bible-preview-version'].textContent, 'ASV');
    assert.equal(h.nodes['.bible-preview-notice'].textContent, 'ESV unavailable — showing ASV. Your saved default is unchanged.');
    assert.match(h.nodes['.bible-preview-copyright'].textContent, /Public domain\./);
    assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true, 'the ESV notice is only shown with ESV text');
    assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/12/JHN.3.16');
    assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on YouVersion');
    assert.equal(h.ui.state.settings.bibleVersion, 'ASV');
  });
}

test('if both ESV and the ASV fallback fail, the preview shows the unavailable message', async () => {
  const h = previewUi(async () => response({ error: 'down' }, 503));
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-version'].textContent, 'Unavailable');
  assert.match(h.nodes['.bible-preview-fallback'].textContent, /unavailable/i);
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true);
});

test('switching away from ESV restores the YouVersion link and hides the ESV notice', async () => {
  const h = previewUi(async url => /esv-passage/.test(url)
    ? response({ text: 'ESV text (ESV)' })
    : response({ text: 'KJV text', version: { id: '1', abbreviation: 'KJV', title: 'King James', copyright: 'c', publisher: '' }, fallback: false, url: 'https://www.bible.com/bible/1/JHN.3.16' }));
  h.ui.load(h.link, h.preview, 'ESV');
  await flush();
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, false);
  h.ui.load(h.link, h.preview, '1');
  await flush();
  assert.equal(h.nodes['.bible-preview-esv-link'].hidden, true);
  assert.equal(h.nodes['.bible-preview-open'].textContent, 'Open passage on YouVersion');
  assert.equal(h.nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/1/JHN.3.16');
});

test('closing a preview during an ESV request does not trigger the ASV fallback', async () => {
  const urls = [];
  const h = previewUi((url, options) => new Promise((resolve, reject) => {
    urls.push(url);
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  h.ui.load(h.link, h.preview, 'ESV');
  h.timers.get(20000)(); // request timeout aborts the in-flight ESV request
  await flush();
  assert.equal(urls.length, 1, 'no second request after an abort');
  assert.match(h.nodes['.bible-preview-fallback'].textContent, /took too long/);
});
