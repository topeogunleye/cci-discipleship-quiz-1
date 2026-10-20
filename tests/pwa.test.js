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
  assert.match(serviceWorker, /CACHE_NAME\s*=\s*CACHE_PREFIX \+ 'v14'/);
  assert.match(serviceWorker, /decks\/manifest\.json/);
  assert.match(serviceWorker, /js\/native-bridge\.bundle\.js/);
  assert.match(serviceWorker, /js\/mobile-study\.js/);
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
    ['cci-study-pwa-v14', activeEntries],
    ['cci-study-pwa-v3', new Map()],
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

  assert.equal(cacheStore.has('cci-study-pwa-v3'), false);
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
  for (const file of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'offline.html', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'decks/manifest.json']) {
    assert.ok(fs.existsSync(path.join(dist, file)), `Missing dist/${file}`);
  }
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script\s+src=|<link rel="stylesheet"/i);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
});
