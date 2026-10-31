const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

test('web app manifest declares standalone install metadata and valid icon assets', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
    assert.ok(icon, `Missing ${size}px PNG icon`);
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.match(read('index.html'), /rel="manifest" href="manifest\.webmanifest"/);
});

test('service worker uses versioned shell/deck caches and an offline navigation fallback', () => {
  const serviceWorker = read('service-worker.js');
  assert.match(serviceWorker, /CACHE_PREFIX\s*=\s*'cci-study-pwa-'/);
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*CACHE_PREFIX \+ 'v29'/);
  assert.match(serviceWorker, /decks\/manifest\.json/);
  assert.match(serviceWorker, /content\/devotionals\.json/);
  assert.match(serviceWorker, /content\/sermons\.json/);
  assert.match(serviceWorker, /js\/native-bridge\.bundle\.js/);
  assert.match(serviceWorker, /js\/mobile-study\.js/);
  assert.match(serviceWorker, /js\/sermons\.js/);
  assert.match(serviceWorker, /js\/sermons-ui\.js/);
  assert.match(serviceWorker, /cache\.addAll\(deckFiles\.map/);
  assert.match(serviceWorker, /offline\.html/);
  assert.match(serviceWorker, /SKIP_WAITING/);
  assert.match(serviceWorker, /url\.href\.startsWith\(deckBase\)/);
  assert.match(serviceWorker, /return await cache\.match\(request\) \|\| new Response\('Offline and this deck is not cached\.'/);
  assert.match(read('offline.html'), /You are offline/);
});

test('activation deletes previous app caches and deck assets absent from the current manifest', async () => {
  const scope = 'https://example.test/app/';
  const url = file => new URL(file, scope).href;
  const activeEntries = new Map([
    [url('./'), {}],
    [url('decks/manifest.json'), { json: async () => ['current.txt'] }],
    [url('decks/current.txt'), {}],
    [url('decks/removed.txt'), {}],
    [url('settings.json'), {}]
  ]);
  const cacheStore = new Map([
    ['cci-study-pwa-v29', activeEntries],
    ['cci-study-pwa-v28', new Map()],
    ['cci-study-pwa-v27', new Map()],
    ['cci-study-pwa-v26', new Map()],
    ['cci-study-pwa-v3', new Map()],
    ['cci-sermon-downloads-v1', new Map([['saved-audio.mp3', {}]])],
    ['unrelated-app-cache', new Map()]
  ]);
  const caches = {
    keys: async () => Array.from(cacheStore.keys()),
    delete: async name => cacheStore.delete(name),
    open: async name => {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      const entries = cacheStore.get(name);
      const key = request => typeof request === 'string' ? request : request.url;
      return {
        match: async request => entries.get(key(request)) || null,
        keys: async () => Array.from(entries.keys()).map(href => ({ url: href })),
        delete: async request => entries.delete(key(request))
      };
    }
  };
  const listeners = {};
  let claimed = false;
  let activation;
  const self = {
    registration: { scope },
    clients: { claim: async () => { claimed = true; } },
    addEventListener: (name, handler) => { listeners[name] = handler; },
    skipWaiting: () => {}
  };

  vm.runInNewContext(read('service-worker.js'), { self, caches, URL });
  listeners.activate({ waitUntil: promise => { activation = promise; } });
  await activation;

  assert.equal(cacheStore.has('cci-study-pwa-v28'), false);
  assert.equal(cacheStore.has('cci-study-pwa-v27'), false);
  assert.equal(cacheStore.has('cci-study-pwa-v26'), false);
  assert.equal(cacheStore.has('cci-study-pwa-v3'), false);
  assert.equal(cacheStore.has('cci-sermon-downloads-v1'), true);
  assert.equal(cacheStore.has('unrelated-app-cache'), true);
  assert.equal(activeEntries.has(url('decks/manifest.json')), true);
  assert.equal(activeEntries.has(url('decks/current.txt')), true);
  assert.equal(activeEntries.has(url('decks/removed.txt')), false);
  assert.equal(activeEntries.has(url('settings.json')), true);
  assert.equal(claimed, true);
});

test('deck requests refresh from network and fall back to the cached copy offline', async () => {
  const scope = 'https://example.test/app/';
  const deckUrl = new URL('decks/section.txt', scope).href;
  const entries = new Map([[deckUrl, { text: async () => 'old deck' }]]);
  let offline = false;
  const cache = {
    match: async request => entries.get(request.url) || null,
    put: async (request, response) => entries.set(request.url, response)
  };
  const listeners = {};
  const self = {
    location: new URL(scope),
    registration: { scope },
    addEventListener: (name, handler) => { listeners[name] = handler; }
  };
  vm.runInNewContext(read('service-worker.js'), {
    self,
    caches: { open: async () => cache },
    URL,
    fetch: async () => {
      if (offline) throw new Error('offline');
      return { ok: true, text: async () => 'fresh deck', clone() { return this; } };
    },
    Response
  });

  async function requestDeck() {
    let responsePromise;
    listeners.fetch({
      request: { method: 'GET', url: deckUrl, mode: 'cors' },
      respondWith: promise => { responsePromise = promise; }
    });
    return responsePromise;
  }

  assert.equal(await (await requestDeck()).text(), 'fresh deck');
  assert.equal(await (await entries.get(deckUrl)).text(), 'fresh deck');
  offline = true;
  assert.equal(await (await requestDeck()).text(), 'fresh deck');
});

test('downloaded sermon audio serves cached full and byte-range responses offline without automatic shell caching', async () => {
  const scope = 'https://example.test/app/';
  const savedUrl = new URL('media/sermon.mp3', scope).href;
  const missingUrl = new URL('media/not-downloaded.mp3', scope).href;
  const saved = new Response(new Uint8Array([1, 2, 3, 4, 5, 6]), { headers: { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': '6' } });
  const audioCache = { match: async key => (typeof key === 'string' ? key : key.url) === savedUrl ? saved.clone() : null };
  let shellWrites = 0;
  const shellCache = { match: async () => null, put: async () => { shellWrites++; } };
  const listeners = {};
  const self = { location: new URL(scope), registration: { scope }, addEventListener: (name, handler) => { listeners[name] = handler; } };
  let online = false, networkCalls = 0;
  vm.runInNewContext(read('service-worker.js'), {
    self,
    caches: { open: async name => name === 'cci-sermon-downloads-v1' ? audioCache : shellCache },
    URL,
    Headers,
    Response,
    Blob,
    fetch: async () => { networkCalls++; if (!online) throw new Error('offline'); return new Response(new Uint8Array([9, 8]), { headers: { 'content-type': 'audio/mpeg' } }); }
  });

  async function mediaRequest(url, range, explicitDownload) {
    const headers = new Headers();
    if (range) headers.set('Range', range);
    if (explicitDownload) headers.set('X-Sermon-Download', '1');
    let responsePromise;
    listeners.fetch({ request: { method: 'GET', url, mode: 'cors', destination: explicitDownload ? '' : 'audio', headers }, respondWith: promise => { responsePromise = promise; } });
    return responsePromise;
  }
  const rangeResponse = await mediaRequest(savedUrl, 'bytes=2-4');
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), 'bytes 2-4/6');
  assert.deepEqual(Array.from(new Uint8Array(await rangeResponse.arrayBuffer())), [3, 4, 5]);
  const fullResponse = await mediaRequest(savedUrl);
  assert.equal(fullResponse.status, 200);
  assert.deepEqual(Array.from(new Uint8Array(await fullResponse.arrayBuffer())), [1, 2, 3, 4, 5, 6]);
  const offlineResponse = await mediaRequest(missingUrl);
  assert.equal(offlineResponse.status, 503);
  assert.match(await offlineResponse.text(), /not been downloaded/i);
  online = true;
  const streamingResponse = await mediaRequest(missingUrl);
  assert.equal(streamingResponse.status, 200);
  assert.equal(streamingResponse.headers.get('content-type'), 'audio/mpeg');
  const downloadResponse = await mediaRequest(missingUrl, null, true);
  assert.equal(downloadResponse.status, 200);
  assert.equal((await downloadResponse.headers.get('content-type')), 'audio/mpeg');
  assert.equal(shellWrites, 0);
  assert.equal(networkCalls, 3);
});

test('PWA source and offline build contain their required registration/assets', () => {
  const app = read('js/app.js');
  const page = read('index.html');
  const build = read('scripts/build.js');
  assert.match(app, /protocol !== 'http:' && protocol !== 'https:'/);
  assert.match(app, /register\('service-worker\.js'\)/);
  assert.match(page, /js\/storage\.js/);
  assert.match(page, /js\/native-bridge\.bundle\.js/);
  assert.match(page, /js\/mobile-study\.js/);
  assert.match(build, /service-worker\.js/);
  assert.match(build, /manifest\.webmanifest/);
  assert.match(build, /'icons'/);
});

test('standalone dist package includes all PWA runtime assets', () => {
  const dist = path.join(root, 'dist');
  for (const file of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'offline.html', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'decks/manifest.json', 'content/devotionals.json', 'content/sermons.json']) {
    assert.ok(fs.existsSync(path.join(dist, file)), `Missing dist/${file}`);
  }
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script\s+src=|<link rel="stylesheet"/i);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  const worker = fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8');
  assert.match(worker, /CACHE_NAME\s*=\s*CACHE_PREFIX \+ 'v29'/);
  assert.match(worker, /SERMON_AUDIO_CACHE/);
  const coreBlock = worker.match(/const CORE_FILES = \[([\s\S]*?)\];/);
  assert.ok(coreBlock, 'Service worker defines its core precache files');
  const coreFiles = Array.from(coreBlock[1].matchAll(/'([^']+)'/g), match => match[1]);
  for (const file of coreFiles) {
    const relative = file === './' ? 'index.html' : file.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(dist, relative)), `Missing dist/${relative}, listed in service-worker precache`);
    if (/\.(?:m?js|css)$/i.test(relative)) {
      const asset = fs.readFileSync(path.join(dist, relative), 'utf8');
      assert.doesNotMatch(asset, /[ \t]+$/m, `Trailing whitespace in dist/${relative}`);
    }
  }
});
