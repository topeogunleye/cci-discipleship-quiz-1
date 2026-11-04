'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/api/videos.js'), 'utf8')
  .replace("import auth from '../_lib/auth.cjs';", "const auth = require('../_lib/auth.cjs');")
  .replace(/export function /g, 'function ')
  .replace(/export async function /g, 'async function ')
  .replace(/export const __test = /, 'const __test = ');

function loadHandlers(fetcher) {
  return vm.runInNewContext(source + '\n({ onRequest, onRequestOptions, __test })', {
    require: request => request === '../_lib/auth.cjs' ? require('../functions/_lib/auth.cjs') : require(request), URL, Request, Response, Headers, fetch: fetcher
  });
}

const environment = r2 => ({
  SUPABASE_URL: 'https://auth.example',
  SUPABASE_ANON_KEY: 'sb_publishable_test_key',
  LESSON_VIDEOS: r2
});

test('private video endpoint rejects unauthenticated access before reading R2', async () => {
  let r2Reads = 0;
  const handlers = loadHandlers(async () => new Response('{}', { status: 401 }));
  const response = await handlers.onRequest({
    request: new Request('https://study.example/api/videos?key=Lesson/video.mp4'),
    env: environment({ get: async () => { r2Reads++; return null; } })
  });
  assert.equal(response.status, 401);
  assert.equal(r2Reads, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('private video endpoint validates keys and streams authenticated byte ranges', async () => {
  const seen = [];
  const handlers = loadHandlers(async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 }));
  const bucket = { get: async (key, options) => {
    seen.push({ key, options });
    return { size: 10, httpEtag: 'etag', range: { offset: 2, length: 4 }, body: new Response('2345').body };
  } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const invalid = await handlers.onRequest({ request: new Request('https://study.example/api/videos?key=../private.mp4', { headers: { Cookie: '__Host-cci-video-session=header.payload.signature' } }), env: environment(bucket) });
    assert.equal(invalid.status, 404);
    assert.equal(seen.length, 0);
    const response = await handlers.onRequest({ request: new Request('https://study.example/api/videos?key=Lesson%2Fvideo.mp4', { headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Range: 'bytes=2-5' } }), env: environment(bucket) });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(await response.text(), '2345');
    assert.equal(seen[0].key, 'Lesson/video.mp4');
    const invalidRange = await handlers.onRequest({ request: new Request('https://study.example/api/videos?key=Lesson%2Fvideo.mp4', { headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Range: 'bytes=20-25' } }), env: environment(bucket) });
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers.get('content-range'), 'bytes */10');
  } finally { globalThis.fetch = originalFetch; }
});

test('catalog maps all uploaded objects to manifest decks without publishing media URLs', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'decks/manifest.json'), 'utf8'));
  const titles = new Set(manifest.map(file => fs.readFileSync(path.join(root, 'decks', file), 'utf8').match(/^DECK:\s*(.+)$/m)?.[1]).filter(Boolean));
  const deckIds = new Set([...titles].map(title => 'd-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')));
  assert.equal(catalog.videos.length, 109);
  assert.equal(new Set(catalog.videos.map(item => item.id)).size, 109);
  for (const item of catalog.videos) {
    assert.ok(deckIds.has(item.deckId), `${item.id} must reference a canonical manifest deck`);
    assert.match(item.objectKey, /\.mp4$/i);
    assert.equal(Object.hasOwn(item, 'videoUrl'), false);
    assert.equal(Object.hasOwn(item, 'credentials'), false);
  }
  const localVideoRoot = path.join(root, 'public/videos');
  if (fs.existsSync(localVideoRoot)) {
    const keys = new Set();
    const collect = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(file);
        else if (/\.mp4$/i.test(entry.name)) keys.add(path.relative(localVideoRoot, file).replace(/\\/g, '/'));
      }
    };
    collect(localVideoRoot);
    assert.equal(keys.size, 109);
    for (const item of catalog.videos) assert.ok(keys.has(item.objectKey), `${item.id} must map to a local R2 object key`);
  }
});
