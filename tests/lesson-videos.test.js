'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');
const transcriptTools = require('../js/transcripts.js');
const videoCatalog = require('../functions/_lib/video-catalog.cjs');
const catalogData = require('../content/lesson-videos.json');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/api/videos.js'), 'utf8')
  .replace("import auth from '../_lib/auth.cjs';", "const auth = require('../_lib/auth.cjs');")
  .replace("import videoCatalog from '../_lib/video-catalog.cjs';", "const videoCatalog = require('../_lib/video-catalog.cjs');")
  .replace(/export function /g, 'function ')
  .replace(/export async function /g, 'async function ')
  .replace(/export const __test = /, 'const __test = ');

function loadHandlers(fetcher) {
  return vm.runInNewContext(source + '\n({ onRequest, onRequestOptions, __test })', {
    require: request => request === '../_lib/auth.cjs' ? require('../functions/_lib/auth.cjs') : (request === '../_lib/video-catalog.cjs' ? videoCatalog : require(request)), URL, Request, Response, Headers, fetch: fetcher
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

test('private video endpoint reports invalid credentials separately from retryable Auth failures', async () => {
  let r2Reads = 0;
  const handlers = loadHandlers();
  const bucket = { get: async () => { r2Reads++; return null; } };
  const originalFetch = globalThis.fetch;
  const request = () => new Request('https://study.example/api/videos?key=' + encodeURIComponent(catalogData.videos[0].objectKey), {
    headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Origin: 'capacitor://localhost' }
  });
  try {
    globalThis.fetch = async () => new Response('{"error":"private upstream detail"}', { status: 401 });
    const invalid = await handlers.onRequest({ request: request(), env: { ...environment(bucket), ALLOWED_APP_ORIGINS: 'capacitor://localhost' } });
    assert.equal(invalid.status, 401);
    assert.equal(r2Reads, 0);

    globalThis.fetch = async () => new Response('{"error":"private upstream detail"}', { status: 429, headers: { 'Retry-After': '24' } });
    const limited = await handlers.onRequest({ request: request(), env: { ...environment(bucket), ALLOWED_APP_ORIGINS: 'capacitor://localhost' } });
    assert.equal(limited.status, 503);
    assert.equal(limited.headers.get('retry-after'), '24');
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.equal(limited.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    assert.equal(limited.headers.get('access-control-allow-credentials'), 'true');
    assert.doesNotMatch(await limited.text(), /private upstream detail/);
    assert.equal(r2Reads, 0);

    globalThis.fetch = async () => { throw new Error('upstream secret details'); };
    const unavailable = await handlers.onRequest({ request: request(), env: { ...environment(bucket), ALLOWED_APP_ORIGINS: 'capacitor://localhost' } });
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('retry-after'), '30');
    assert.equal(r2Reads, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('private video endpoint validates keys and streams authenticated byte ranges', async () => {
  const seen = [];
  const handlers = loadHandlers(async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 }));
  const bucket = { get: async (key, options) => {
    seen.push({ key, options });
    return { size: 10, httpEtag: 'etag', range: { offset: 2, length: 4 }, body: new Response('2345').body };
  }, head: async key => { seen.push({ key, head: true }); return { size: 10, httpEtag: 'etag' }; } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  try {
    const invalid = await handlers.onRequest({ request: new Request('https://study.example/api/videos?key=../private.mp4', { headers: { Cookie: '__Host-cci-video-session=header.payload.signature' } }), env: environment(bucket) });
    assert.equal(invalid.status, 404);
    assert.equal(seen.length, 0);
    const unlisted = await handlers.onRequest({ request: new Request('https://study.example/api/videos?key=Unlisted%2Fprivate.mp4', { headers: { Cookie: '__Host-cci-video-session=header.payload.signature' } }), env: environment(bucket) });
    assert.equal(unlisted.status, 404);
    assert.equal(seen.length, 0, 'safe but unlisted keys must never reach R2');
    const catalogKey = catalogData.videos[0].objectKey;
    const catalogUrl = 'https://study.example/api/videos?key=' + encodeURIComponent(catalogKey);
    const response = await handlers.onRequest({ request: new Request(catalogUrl, { headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Range: 'bytes=2-5' } }), env: environment(bucket) });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(await response.text(), '2345');
    assert.equal(seen[0].key, catalogKey);
    const head = await handlers.onRequest({ request: new Request(catalogUrl, { method: 'HEAD', headers: { Cookie: '__Host-cci-video-session=header.payload.signature' } }), env: environment(bucket) });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    const invalidRange = await handlers.onRequest({ request: new Request(catalogUrl, { headers: { Cookie: '__Host-cci-video-session=header.payload.signature', Range: 'bytes=20-25' } }), env: environment(bucket) });
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

test('only unambiguous, metadata-equivalent, or explicitly confirmed English SRTs are mapped', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8'));
  const transcriptManifest = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-transcripts.json'), 'utf8'));
  const videosById = new Map(catalog.videos.map(video => [video.id, video]));
  const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const transcriptTitle = file => file.replace(/\.srt$/i, '')
    .replace(/-Celebration-Church-International-LMS(?:-2)?-mp4-[a-f0-9-]+$/i, '')
    .replace(/-mp4-[a-f0-9-]+$/i, '');
  const sourceFiles = fs.readdirSync(path.join(root, 'transcript')).filter(file => /\.srt$/i.test(file)).sort();
  const candidatesByTitle = new Map();
  for (const file of sourceFiles) {
    const key = normalize(transcriptTitle(file));
    if (!candidatesByTitle.has(key)) candidatesByTitle.set(key, []);
    candidatesByTitle.get(key).push(file);
    const source = fs.readFileSync(path.join(root, 'transcript', file), 'utf8');
    assert.ok(transcriptTools.parseSrt(source).length > 0, `${file} must contain valid timed cues`);
  }

  assert.equal(transcriptManifest.schemaVersion, 1);
  assert.equal(transcriptManifest.language, 'en');
  assert.equal(sourceFiles.length, 133);
  assert.equal(transcriptManifest.transcripts.length, catalog.videos.length);
  assert.equal(new Set(transcriptManifest.transcripts.map(item => item.videoId)).size, catalog.videos.length);
  const confirmed = transcriptManifest.transcripts.filter(item => item.selection && item.selection.basis === 'user-confirmed');
  const metadataEquivalent = transcriptManifest.transcripts.filter(item => item.selection && item.selection.basis === 'metadata-only-duplicates');
  assert.equal(metadataEquivalent.length, 17);
  assert.equal(confirmed.length, 1, 'Only the user-selected Predestination II source is approved among differing candidates');
  assert.equal(confirmed[0].videoId, 'section-03-predestination-ii');
  assert.equal(confirmed[0].file, 'PREDESTINATION-II-Celebration-Church-International-LMS-mp4-a3c50da1-fa0b.srt');
  assert.equal(confirmed[0].selection.basis, 'user-confirmed');
  assert.equal(confirmed[0].selection.sourceSha256, '46d50c1c21e6e8e2cee1d1065400e2321d08191464002ecb8b2455dec9943f76');

  const mappedIds = new Set();
  const mappedFiles = new Set();
  for (const item of transcriptManifest.transcripts) {
    const video = videosById.get(item.videoId);
    assert.ok(video, `${item.videoId} must exist in the video catalog`);
    assert.equal(normalize(video.title), normalize(transcriptTitle(item.file)));
    assert.ok(sourceFiles.includes(item.file), `${item.file} must exist`);
    assert.equal(mappedFiles.has(item.file), false, `${item.file} must be mapped only once`);
    mappedIds.add(item.videoId);
    mappedFiles.add(item.file);
    const candidates = candidatesByTitle.get(normalize(video.title));
    const hashes = candidates.map(file => fs.readFileSync(path.join(root, 'transcript', file)));
    const unambiguous = candidates.length === 1 || hashes.every(contents => contents.equals(hashes[0]));
    if (!unambiguous) {
      if (item.selection && item.selection.basis === 'metadata-only-duplicates') {
        assert.deepEqual([item.file, ...item.selection.equivalentFiles].sort(), candidates.slice().sort(), 'All known variants must be included in the equivalence check');
        const payload = file => transcriptTools.parseSrt(fs.readFileSync(path.join(root, 'transcript', file), 'utf8')).map(({ start, end, text }) => ({ start, end, text }));
        const selected = payload(item.file);
        for (const candidate of candidates) assert.deepEqual(payload(candidate), selected, `${video.title} must have identical cue text and timing`);
      } else {
        assert.equal(item, confirmed[0], `${video.title} requires its own explicit source confirmation`);
      }
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'transcript', item.file), 'utf8').replace(/\r\n?/g, '\n')).digest('hex'), item.selection.sourceSha256);
    }
    const vtt = transcriptTools.toWebVtt(fs.readFileSync(path.join(root, 'transcript', item.file), 'utf8'));
    assert.match(vtt, /^WEBVTT\n\n/);
    assert.doesNotMatch(vtt, /\d{2}:\d{2}:\d{2},\d{3} -->/);
  }

  const missing = [];
  const ambiguous = [];
  for (const video of catalog.videos) {
    const candidates = candidatesByTitle.get(normalize(video.title)) || [];
    if (!candidates.length) missing.push(video.id);
    else {
      const hashes = candidates.map(file => fs.readFileSync(path.join(root, 'transcript', file)));
      const identical = hashes.every(contents => contents.equals(hashes[0]));
      if (candidates.length > 1 && !identical) ambiguous.push(video.id);
      else assert.ok(mappedIds.has(video.id), `${video.id} has one confirmed transcript and must be mapped`);
    }
  }
  assert.equal(ambiguous.length, 18);
  assert.equal(ambiguous.filter(id => mappedIds.has(id)).length, 18);
  assert.equal(ambiguous.filter(id => !mappedIds.has(id)).length, 0);
  assert.deepEqual(missing, []);
  assert.deepEqual(catalog.videos.filter(video => !mappedIds.has(video.id)), [], 'Every recording must have an explicit transcript mapping');
});

test('lesson video view clearly communicates chapter study scope and card counts', () => {
  const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(appSource, /Chapter Flashcards \(' \+ d\.cards\.length \+ '\)/);
  assert.match(appSource, /Chapter Quiz \(' \+ d\.cards\.length \+ '\)/);
  assert.match(appSource, /aria-label="Study Chapter ' \+ section \+ ' \(/);
  assert.match(appSource, /reinforce Chapter ' \+ section \+ ' \(/);
  assert.match(appSource, /scopeNote = '<p class="note" style="margin-top:4px;margin-bottom:var\(--space-md\);">' \+/);
});
