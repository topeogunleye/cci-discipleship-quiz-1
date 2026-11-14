const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loadFunction = require('./helpers/load-function.cjs');
const bible = require('../functions/_lib/api-bible.cjs');
const json = data => new Response(JSON.stringify(data));
const fixture = [
  { id: 'fixture-kjv', abbreviation: 'engKJV', language: { id: 'eng' } },
  { id: 'fixture-nkjv', abbreviation: 'engNKJV', language: { id: 'eng' } },
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
  assert.deepEqual(catalog.map(v => v.id), ['APIBIBLE_KJV', 'APIBIBLE_NKJV', 'APIBIBLE_MSG', 'APIBIBLE_GNT']);
  assert.equal(paths.length, 1);
  for (const abbreviation of ['KJV', 'NKJV', 'MSG', 'GNT']) {
    const result = await bible.passage('John 3:16–18,20', 'APIBIBLE_' + abbreviation, 'fixture-key', fetcher);
    assert.equal(result.version.abbreviation, abbreviation);
    assert.equal(result.version.copyright, 'Publisher copyright');
    assert.equal(result.provider, 'api-bible');
    assert.deepEqual(result.fumsTokens, ['view-token', 'view-token']);
    assert.equal(result.version.upstreamId, undefined);
    const youVersionId = { KJV: 1, NKJV: 114, MSG: 97 }[abbreviation];
    if (youVersionId) assert.deepEqual(result.links.map(link => link.url), [
      'https://www.bible.com/bible/' + youVersionId + '/JHN.3.16-18',
      'https://www.bible.com/bible/' + youVersionId + '/JHN.3.20'
    ]);
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
  assert.equal((await bible.passage('John 3:16', 'APIBIBLE_NKJV', 'unlicensed-key', fetcher)).status, 404);
  assert.equal(calls, 1, 'NKJV is never requested when absent from the accessible catalog');
});

test('NKJV rejects unattributed passages and never returns partial multipart text', async () => {
  const calls = [];
  const result = await bible.passage('John 3:16,18', 'APIBIBLE_NKJV', 'multipart-nkjv', async url => {
    calls.push(url);
    if (url.includes('?language=eng')) return json({ data: fixture });
    if (url.includes('3.18')) return json({ data: { content: '' } });
    return json({ data: { content: 'Synthetic first segment', copyright: 'Publisher notice' } });
  });
  assert.equal(result.status, 404);
  assert.equal(result.text, undefined);
  assert.equal(calls.length, 3);
  const unattributed = await bible.passage('John 3:16', 'APIBIBLE_NKJV', 'unattributed-nkjv', async url =>
    json(url.includes('?language=eng') ? { data: fixture } : { data: { content: 'Synthetic text' } }));
  assert.equal(unattributed.status, 404);
  assert.equal(unattributed.text, undefined);
});

const additional = ['RV', 'DRA', 'T4T', 'LXXup', 'OJPS', 'OKE'].map(abbreviation => ({ id: 'fixture-' + abbreviation, abbreviationLocal: abbreviation, language: { id: 'eng' } }));

test('new catalog checks real passage access before exposing curated editions, deduplicates checks and keeps tokens private', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('?language=eng')) return json({ data: [...additional, ...fixture] });
    assert.match(url, /\/passages\/GEN.1.1\?/);
    if (url.includes('fixture-DRA')) return new Response(null, { status: 403 });
    return json({ data: { content: 'Synthetic access check', copyright: 'Publisher notice' }, meta: { fumsToken: 'probe-only-token' } });
  };
  const [catalog, concurrent] = await Promise.all([bible.verifiedVersions('verified-key', fetcher), bible.verifiedVersions('verified-key', fetcher)]);
  assert.deepEqual(catalog, concurrent);
  assert.equal(calls.length, 8, 'one metadata request plus six editions and GNT sample passages');
  assert.deepEqual(catalog.map(v => v.abbreviation), ['RV', 'T4T', 'LXXUP', 'OJPS', 'OKE', 'GNT']);
  assert.equal(catalog.find(v => v.abbreviation === 'OKE').group, 'Additional editions');
  assert.match(catalog.find(v => v.abbreviation === 'OKE').coverage, /Torah/);
  assert.doesNotMatch(JSON.stringify(catalog), /probe-only-token|upstreamId/);
  await bible.verifiedVersions('verified-key', fetcher);
  assert.equal(calls.length, 8, 'verified availability is cached for a day');
});

test('specialist editions reject books outside their coverage without requesting unrelated text', async () => {
  let calls = 0;
  const fetcher = async url => {
    calls++;
    assert.match(url, /\?language=eng$/);
    return json({ data: additional });
  };
  for (const version of ['LXXUP', 'OJPS', 'OKE']) {
    assert.equal((await bible.passage('John 3:16', 'APIBIBLE_' + version, 'coverage-key', fetcher)).status, 404);
  }
  assert.equal((await bible.passage('Psalms 1:1', 'APIBIBLE_OKE', 'coverage-key', fetcher)).status, 404);
  assert.equal(calls, 1);
});

test('GNT is omitted from the picker catalog when its passage license is unavailable', async () => {
  const catalog = await bible.verifiedVersions('gnt-unlicensed', async url => {
    if (url.includes('?language=eng')) return json({ data: fixture });
    return new Response(null, { status: 403 });
  });
  assert.deepEqual(catalog, []);
});

test('API.Bible endpoint validates, protects quota, hides secrets and prevents client passage caching', async () => {
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
  const result = await handler({ request: new Request('https://study.example/api/api-bible?q=John%203:16,18&version=APIBIBLE_NKJV', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }), env });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const body = await result.text();
  assert.doesNotMatch(body, /success-secret|upstreamId/);
  assert.match(body, /Publisher notice/);
  assert.equal(JSON.parse(body).fumsTokens.length, 2);
  assert.equal(JSON.parse(body).version.abbreviation, 'NKJV');
  assert.equal(calls, 3);
  assert.equal(reservations, calls);
});

function ui(fetcher) {
  const scripts = [], listeners = {};
  const window = { DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    StudyLogic: require('../js/study.js'), MobileStudy: require('../js/mobile-study.js'),
    setTimeout, clearTimeout, location: { protocol: 'https:', origin: 'https://study.example' } };
  const document = { getElementById: () => ({}), querySelectorAll: () => [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    createElement: () => ({}), head: { appendChild: script => scripts.push(script) } };
  const source = fs.readFileSync('js/app.js', 'utf8').replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = [{id:'12', abbreviation:'ASV', title:'American Standard Version'}];
    window.testApi = { request: requestBiblePassage, options: bibleVersionOptions, valid: validBibleVersion,
      report: reportApiBibleView, state: S, load: loadBiblePreviewText, catalog: loadBibleVersions,
      clearCatalog: function() { bibleVersions = []; bibleVersionsLoaded = false; },
      setCatalog: function(versions) { bibleVersions = versions; },
      restore: function(raw) { loadSavedState(raw); return S; }, backup: validateBackup,
      activate: function(link, preview) { activeBiblePreview = {link:link, preview:preview}; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: fetcher });
  return { api: window.testApi, window, scripts, listeners };
}

test('dropdown contains the three licensed choices, preserves saved selection, and routes each to API.Bible', async () => {
  const urls = [];
  const { api, listeners } = ui(async url => {
    urls.push(url);
    return json({ text: 'Synthetic text', provider: 'api-bible', version: { abbreviation: new URL(url, 'https://study.example').searchParams.get('version').slice(9) } });
  });
  for (const abbreviation of ['KJV', 'NKJV', 'MSG']) {
    const id = 'APIBIBLE_' + abbreviation;
    assert.equal(api.valid(id), id);
    assert.match(api.options(id, abbreviation), new RegExp('value="' + id + '" selected'));
    listeners.change.forEach(fn => fn({ target: { dataset: { bibleVersion: 'default' }, value: id } }));
    assert.equal(api.state.settings.bibleVersion, id);
    await api.request('John 3:16', id, new AbortController().signal);
    assert.match(urls.at(-1), new RegExp('/api/api-bible.*version=' + id));
  }
});

test('new and legacy NKJV preferences use API.Bible without rewriting saved IDs or adding duplicate choices', async () => {
  for (const id of ['APIBIBLE_NKJV', 'NKJV', '114', '2']) {
    const urls = [];
    const { api, listeners } = ui(async url => {
      urls.push(url);
      return json({ text: 'Synthetic NKJV', provider: 'api-bible', fallback: false, version: { abbreviation: 'NKJV' } });
    });
    if (id === '2') api.setCatalog([{ id: '2', abbreviation: 'engNKJV', title: 'New King James Version' }]);
    listeners.change.forEach(fn => fn({ target: { dataset: { bibleVersion: 'default' }, value: id } }));
    const result = await api.request('John 3:16', id, new AbortController().signal);
    assert.equal(result.version.abbreviation, 'NKJV');
    assert.equal(result.fallback, false);
    assert.equal(api.state.settings.bibleVersion, id);
    assert.equal(api.valid(id), id);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/api\/api-bible.*version=APIBIBLE_NKJV/);
    const html = api.options(id, '');
    assert.match(html, new RegExp('value="' + id + '" selected'));
    assert.equal((html.match(/New King James Version/g) || []).length, 1);
  }
});

test('removed GNT is not offered while its saved preference remains intact', async () => {
  const { api, listeners } = ui(async () => json({ versions: [] }));
  assert.doesNotMatch(api.options('ASV', ''), /APIBIBLE_GNT/);
  listeners.change.forEach(fn => fn({ target: { dataset: { bibleVersion: 'default' }, value: 'APIBIBLE_GNT' } }));
  assert.equal(api.state.settings.bibleVersion, 'APIBIBLE_GNT');
  assert.doesNotMatch(api.options('APIBIBLE_GNT', ''), /APIBIBLE_GNT/);
  assert.match(api.options('APIBIBLE_GNT', ''), /value="APIBIBLE_NKJV" selected/);
});

test('NKJV is the initial default and is used when no valid preference is saved', () => {
  const { api } = ui(async () => json({}));
  assert.equal(api.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  for (const raw of [null, '{}', '{"settings":{}}', '{"settings":{"bibleVersion":"invalid"}}']) {
    assert.equal(api.restore(raw).settings.bibleVersion, 'APIBIBLE_NKJV');
  }
});

test('saved profiles and backups retain old and new translation IDs and study progress', () => {
  const { api } = ui(async () => json({}));
  for (const id of ['APIBIBLE_KJV', 'APIBIBLE_NKJV', 'NKJV', '114', 'APIBIBLE_GNT', 'APIBIBLE_MSG', '3034', 'ESV']) {
    const data = { settings: { bibleVersion: id }, seeded: true,
      decks: [{ id: 'd1', title: 'Study', cards: [{ id: 'q1', question: 'Question', options: ['A', 'B', 'C', 'D'], answer: 'A' }] }],
      progress: { d1: { cards: { q1: { attempts: 3, misses: 1 } }, best: { pct: 80 } } } };
    const state = api.restore(JSON.stringify(data));
    assert.equal(state.settings.bibleVersion, id);
    assert.equal(state.progress.d1.cards.q1.attempts, 3);
    const restored = api.backup(JSON.stringify({ format: 'cci-discipleship-quiz-backup', version: 1, data }));
    assert.equal(restored.settings.bibleVersion, id);
    assert.equal(restored.progress.d1.cards.q1.attempts, 3);
  }
});

test('NKJV failures request KJV once and never substitute a different translation', async () => {
  for (const outcome of [403, 404, 429, 503, 'network', 'empty', 'wrong-version']) {
    const urls = [];
    const { api } = ui(async url => {
      urls.push(url);
      if (url.includes('version=APIBIBLE_NKJV')) {
        if (typeof outcome === 'number') return new Response(null, { status: outcome });
        if (outcome === 'network') throw new TypeError('Offline');
        return json({ text: outcome === 'empty' ? '' : 'Synthetic ASV', provider: 'api-bible', version: { abbreviation: 'ASV' } });
      }
      return json({ text: 'Synthetic KJV', provider: 'api-bible', version: { abbreviation: 'KJV' } });
    });
    const result = await api.request('John 3:16', 'NKJV', new AbortController().signal);
    assert.equal(result.version.abbreviation, 'KJV', String(outcome));
    assert.equal(result.fallback, true);
    assert.equal(urls.length, 2);
    assert.match(urls[1], /version=APIBIBLE_KJV/);
    assert.equal(api.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  }
});

test('failed KJV fallback leaves NKJV unavailable; cancellation never triggers a fallback', async () => {
  for (const outcome of ['denied', 'wrong-version']) {
    const urls = [];
    const { api } = ui(async url => {
      urls.push(url);
      if (url.includes('version=APIBIBLE_NKJV') || outcome === 'denied') return new Response(null, { status: 403 });
      return json({ text: 'Synthetic ASV', provider: 'api-bible', version: { abbreviation: 'ASV' } });
    });
    await assert.rejects(api.request('John 3:16', 'APIBIBLE_NKJV', new AbortController().signal));
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => url.includes('/api/api-bible')));
  }
  const controller = new AbortController();
  let calls = 0;
  const { api } = ui(async () => { calls++; controller.abort(); throw new Error('aborted'); });
  await assert.rejects(api.request('John 3:16', 'NKJV', controller.signal));
  assert.equal(calls, 1);
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

test('same-translation backup uses API.Bible before accepting another YouVersion translation', async () => {
  for (const outcome of ['missing', 'fallback']) {
    const urls = [];
    const { api } = ui(async url => {
      urls.push(url);
      if (url.includes('/api/api-bible')) return json({ text: 'Synthetic ASV', provider: 'api-bible', fallback: false, version: { abbreviation: 'ASV' } });
      return outcome === 'missing' ? new Response(null, { status: 503 }) : json({ text: 'Synthetic BSB', fallback: true, version: { abbreviation: 'BSB' } });
    });
    const result = await api.request('John 3:16', 'ASV', new AbortController().signal);
    assert.equal(result.version.abbreviation, 'ASV');
    assert.equal(result.fallback, false);
    assert.equal(urls.length, 2);
    assert.match(urls[1], /version=APIBIBLE_ASV/);
  }
});

test('catalog retries unavailable YouVersion metadata without adding editions or spending API.Bible quota', async () => {
  let unavailable = true;
  const urls = [];
  const h = ui(async url => {
    urls.push(url);
    assert.ok(url.endsWith('/api/bible'));
    return unavailable ? new Response(null, { status: 503 }) : json({ versions: [
      { id: 'APIBIBLE_RV', abbreviation: 'RV', title: 'Revised Version 1885' },
      { id: 'APIBIBLE_GNT', abbreviation: 'GNT', title: 'Good News Translation' },
      { id: 'APIBIBLE_OJPS', abbreviation: 'OJPS', title: 'JPS Tanakh 1917', group: 'Additional editions', coverage: 'Old Testament' },
      { id: 'APIBIBLE_NIV', abbreviation: 'NIV', title: 'Uncurated version' }
    ] });
  });
  h.api.clearCatalog();
  await h.api.catalog();
  assert.doesNotMatch(h.api.options('ASV', ''), /APIBIBLE_RV/);
  unavailable = false;
  await h.api.catalog();
  const html = h.api.options('ASV', '');
  assert.doesNotMatch(html, /APIBIBLE_RV|APIBIBLE_GNT|APIBIBLE_NIV|optgroup|>ASV —/);
  assert.equal((html.match(/<option /g) || []).length, 6);
  assert.equal(urls.length, 2);
  await h.api.catalog();
  assert.equal(urls.length, 2, 'complete catalogs do not fetch again during this session');
  for (const abbreviation of ['RV', 'DRA', 'T4T', 'LXXUP', 'OJPS', 'OKE']) {
    assert.equal(h.api.valid('APIBIBLE_' + abbreviation), 'APIBIBLE_' + abbreviation);
  }
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
      text: 'Synthetic MSG text', provider: 'api-bible', version: { abbreviation: 'MSG', copyright: 'Publisher copyright' }, fumsTokens: ['displayed-token'], url: 'https://www.bible.com/bible/97/JHN.3.16'
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
  assert.equal(nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/97/JHN.3.16');
  assert.equal(nodes['.bible-preview-open'].textContent, 'Open passage on YouVersion');
  assert.equal(h.window.fumsData.length, 1);
  assert.equal(h.api.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  fail = true;
  h.api.load(link, preview, 'APIBIBLE_MSG');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes['.bible-preview-notice'].textContent, 'MSG unavailable — showing ASV. Your saved default is unchanged.');
  assert.match(nodes['.bible-preview-copyright'].textContent, /Provided by YouVersion/);
  assert.match(nodes['.bible-preview-open'].href, /www.bible.com/);
  assert.equal(h.window.fumsData.length, 1, 'fallback text is not counted as an API.Bible view');
});

test('NKJV preview displays the actual translation, copyright, link and view tracking while keeping the saved preference', async () => {
  for (const savedId of ['APIBIBLE_NKJV', 'NKJV', '114']) {
    let unavailable = false, kjvUnavailable = false;
    const h = ui(async url => {
      const version = new URL(url, 'https://study.example').searchParams.get('version');
      if (!version) return json({ versions: [] });
      if ((version === 'APIBIBLE_NKJV' && unavailable) || kjvUnavailable) return new Response(null, { status: 403 });
      const abbreviation = version.slice(9);
      return json({ text: 'Synthetic ' + abbreviation, provider: 'api-bible', fallback: false,
        version: { abbreviation, copyright: abbreviation + ' publisher notice' }, fumsTokens: [abbreviation + '-view'],
        url: 'https://www.bible.com/bible/' + (abbreviation === 'NKJV' ? '114' : '1') + '/JHN.3.16' });
    });
    const nodes = Object.fromEntries(['[data-bible-version]', '.bible-preview-version', '.bible-preview-notice', '.bible-preview-copyright', '.bible-preview-open', '.bible-preview-text', '.bible-preview-fallback', '.bible-preview-esv-link', '.bible-preview-parts'].map(key => [key, { value: savedId, dataset: {}, textContent: '', innerHTML: '', hidden: false }]));
    const preview = { querySelector: key => nodes[key] }, link = { textContent: 'John 3:16' };
    h.api.state.settings.bibleVersion = savedId;
    h.api.activate(link, preview);
    h.api.load(link, preview, savedId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes['.bible-preview-version'].textContent, 'NKJV');
    assert.equal(nodes['.bible-preview-text'].textContent, 'Synthetic NKJV');
    assert.equal(nodes['.bible-preview-notice'].textContent, '');
    assert.equal(nodes['.bible-preview-copyright'].textContent, 'NKJV publisher notice Provided by API.Bible.');
    assert.equal(nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/114/JHN.3.16');
    assert.equal(h.window.fumsData.length, 1);
    unavailable = true;
    h.api.load(link, preview, savedId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes['.bible-preview-version'].textContent, 'KJV');
    assert.equal(nodes['.bible-preview-text'].textContent, 'Synthetic KJV');
    assert.equal(nodes['.bible-preview-notice'].textContent, 'NKJV unavailable — showing KJV. Your saved default is unchanged.');
    assert.equal(nodes['.bible-preview-copyright'].textContent, 'KJV publisher notice Provided by API.Bible.');
    assert.equal(nodes['.bible-preview-open'].href, 'https://www.bible.com/bible/1/JHN.3.16');
    assert.equal(h.window.fumsData.length, 2);
    kjvUnavailable = true;
    h.api.load(link, preview, savedId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes['.bible-preview-version'].textContent, 'Unavailable');
    assert.equal(nodes['.bible-preview-text'].textContent, '');
    assert.match(nodes['.bible-preview-fallback'].textContent, /cannot be previewed/);
    assert.equal(h.window.fumsData.length, 2);
    assert.equal(h.api.state.settings.bibleVersion, savedId);
    const switchPreview = { dataset: { bibleVersion: 'preview' }, value: 'APIBIBLE_MSG' };
    h.listeners.change.forEach(fn => fn({ target: switchPreview }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.api.state.settings.bibleVersion, savedId, 'preview choices do not save a new default');
  }
});
