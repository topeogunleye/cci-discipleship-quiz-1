'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const home = 'https://cci-discipleship-quiz.pages.dev/';

test('public home is useful without JavaScript and declares one consistent search identity', () => {
  const html = read('dist/index.html');
  assert.match(html, /<h1>CCI Discipleship/);
  assert.match(html, /href="app\/"/);
  assert.doesNotMatch(html, /name="robots" content="noindex"|id="app"|supabase\.bundle/);
  const canonical = [...html.matchAll(/rel="canonical" href="([^"]+)"/g)];
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0][1], home);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@type'], 'WebSite');
  assert.equal(schema.url, home);
  assert.match(html, /property="og:url" content="https:\/\/cci-discipleship-quiz.pages.dev\/"/);
  assert.match(html, /name="twitter:card" content="summary"/);
  assert.deepEqual([...read('dist/sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(x => x[1]), [home]);
  assert.match(read('dist/robots.txt'), /Sitemap: https:\/\/cci-discipleship-quiz.pages.dev\/sitemap.xml/);
  assert.doesNotMatch(read('dist/robots.txt'), /^Disallow:/m, 'noindex documents must remain crawlable');
  assert.match(read('dist/404.html'), /name="robots" content="noindex"/);
  assert.match(read('dist/404.html'), /Page not found/);
});

test('web and native entries resolve shared resources without changing API origins', () => {
  const web = read('dist/app/index.html');
  const native = read('dist-native/index.html');
  assert.match(web, /<base href="\.\.\/">/);
  assert.doesNotMatch(native, /<base /);
  for (const html of [web, native]) assert.match(html, /name="robots" content="noindex"/);
  const webBase = new URL('../', new URL('app/', home));
  assert.equal(new URL('js/supabase.bundle.js', webBase).href, home + 'js/supabase.bundle.js');
  assert.equal(new URL('service-worker.js', webBase).href, home + 'service-worker.js');
  assert.equal(JSON.parse(read('dist-native/manifest.webmanifest')).start_url, './');
  for (const output of ['dist', 'dist-native']) {
    const core = read(output + '/service-worker.js').match(/const CORE_FILES = \[([\s\S]*?)\];/)[1];
    for (const [, file] of core.matchAll(/'([^']+)'/g)) {
      const asset = file.endsWith('/') ? file + 'index.html' : file;
      assert.ok(fs.existsSync(path.join(root, output, asset)), `${output}/${asset} must be precacheable`);
    }
  }
  assert.match(read('dist/offline.html'), /href="\.\/app\/"/);
  assert.match(read('dist-native/offline.html'), /href="\.\/"/);
});

test('legacy study links and authentication callbacks keep their query and fragment', () => {
  function visit(search, hash) {
    let target = null;
    vm.runInNewContext(read('js/landing.js'), {
      window: { location: { search, hash, replace: value => { target = value; } }, addEventListener: () => {} },
      navigator: {}, URLSearchParams
    });
    return target;
  }
  assert.equal(visit('', '#/chapter/my-deck'), 'app/#/chapter/my-deck');
  assert.equal(visit('?from=bookmark', '#/settings'), 'app/?from=bookmark#/settings');
  assert.equal(visit('', '#access_token=test-only&type=signup'), 'app/#access_token=test-only&type=signup');
  assert.equal(visit('?code=test-only', ''), 'app/?code=test-only');
  assert.equal(visit('', '#error=access_denied'), 'app/#error=access_denied');
  assert.equal(visit('?redirect=https://example.org', ''), null);
  assert.equal(visit('', '#chapters'), null);
  assert.equal(visit('', ''), null);
});

test('legacy hash links also forward when the public landing is already open', () => {
  const listeners = {};
  let target = null;
  const location = { search: '', hash: '', replace: value => { target = value; } };
  vm.runInNewContext(read('js/landing.js'), {
    window: { location, addEventListener: (name, handler) => { listeners[name] = handler; } },
    navigator: {}, URLSearchParams
  });
  location.hash = '#/journey';
  listeners.hashchange();
  assert.equal(target, 'app/#/journey');
});

test('offline navigation keeps the landing and study app as separate documents', async () => {
  const listeners = {};
  const cache = new Map([
    [home, new Response('public landing')],
    [home + 'app/', new Response('study app')],
    [home + 'offline.html', new Response('offline notice')]
  ]);
  vm.runInNewContext(read('service-worker.js'), {
    self: { location: new URL(home), registration: { scope: home }, addEventListener: (name, handler) => { listeners[name] = handler; } },
    caches: { open: async () => ({ match: async request => cache.get(typeof request === 'string' ? request : request.url) }) },
    URL, Response, fetch: async () => { throw new Error('offline'); }
  });
  async function navigate(pathname) {
    let result;
    listeners.fetch({ request: { method: 'GET', url: home + pathname, mode: 'navigate' }, respondWith: promise => { result = promise; } });
    return (await result).text();
  }
  assert.equal(await navigate(''), 'public landing');
  assert.equal(await navigate('app/'), 'study app');
  assert.equal(await navigate('missing-page'), 'offline notice');
});
