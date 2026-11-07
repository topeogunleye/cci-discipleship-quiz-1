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

function loadHandlers(fetcher, mockCaches) {
  return vm.runInNewContext(source + '\n({ onRequest, onRequestOptions, __test })', {
    require: request => request === '../_lib/auth.cjs' ? require('../functions/_lib/auth.cjs') : (request === '../_lib/video-catalog.cjs' ? videoCatalog : require(request)), URL, Request, Response, Headers, caches: mockCaches || undefined, fetch: fetcher
  });
}

const environment = r2 => ({
  SUPABASE_URL: 'https://auth.example',
  SUPABASE_ANON_KEY: 'sb_publishable_test_key',
  VIDEO_TICKET_SECRET: 'test-video-ticket-secret-at-least-32-bytes',
  VIDEO_AUTH_MODE: 'remote',
  LESSON_VIDEOS: r2
});

function makeEs256Fixture(options) {
  options = options || {};
  const pair = options.pair || crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = { ...pair.publicKey.export({ format: 'jwk' }), kid: options.kid || 'lesson-key-1', alg: 'ES256', use: 'sig', key_ops: ['verify'] };
  const claims = {
    iss: 'https://auth.example/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: '123e4567-e89b-12d3-a456-426614174000', exp: Math.floor(Date.now() / 1000) + 3600,
    ...(options.claims || {})
  };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = encode({ alg: 'ES256', kid: options.kid || 'lesson-key-1', typ: 'JWT' }) + '.' + encode(claims);
  const signature = crypto.sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { pair, publicKey, claims, token: input + '.' + signature };
}

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

test('local JWKS authorization avoids Supabase user lookup on every video range', async () => {
  const fixture = makeEs256Fixture();
  const bucketReads = [];
  const authFetches = [];
  const bucket = { get: async (key, options) => {
    bucketReads.push({ key, options });
    return { size: 10, httpEtag: 'etag', range: { offset: 0, length: 4 }, body: new Response('data').body };
  }, head: async () => ({ size: 10, httpEtag: 'etag' }) };
  const originalFetch = globalThis.fetch;
  require('../functions/_lib/auth.cjs').__test.resetJwksCache();
  globalThis.fetch = async url => {
    authFetches.push(String(url));
    return new Response(JSON.stringify({ keys: [fixture.publicKey] }), { status: 200 });
  };
  try {
    const handlers = loadHandlers();
    const key = catalogData.videos[0].objectKey;
    for (const range of ['bytes=0-3', 'bytes=4-7']) {
      const response = await handlers.onRequest({
        request: new Request('https://study.example/api/videos?key=' + encodeURIComponent(key), {
          headers: { Cookie: '__Host-cci-video-session=' + encodeURIComponent(fixture.token), Range: range }
        }),
        env: { ...environment(bucket), VIDEO_AUTH_MODE: undefined }
      });
      assert.equal(response.status, 206);
    }
    assert.equal(bucketReads.length, 2);
    assert.deepEqual(authFetches, ['https://auth.example/auth/v1/.well-known/jwks.json']);
    assert.ok(authFetches.every(url => !url.endsWith('/auth/v1/user')), 'range requests must not call Supabase Auth user endpoint');
  } finally {
    globalThis.fetch = originalFetch;
    require('../functions/_lib/auth.cjs').__test.resetJwksCache();
  }
});

test('catalog maps all uploaded objects to manifest decks without publishing media URLs', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'decks/manifest.json'), 'utf8'));
  const titles = new Set(manifest.map(file => fs.readFileSync(path.join(root, 'decks', file), 'utf8').match(/^DECK:\s*(.+)$/m)?.[1]).filter(Boolean));
  const deckIds = new Set([...titles].flatMap(title => {
    const raw = 'd-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slugged = 'd-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return [raw, slugged];
  }));
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
  assert.match(appSource, /Video Flashcards \(' \+ videoCards\.length \+ '\)/);
  assert.match(appSource, /Video Quiz \(' \+ videoCards\.length \+ '\)/);
});

test('lesson video study modal launches overlay without unmounting player, pauses video, and auto-saves progress', () => {
  const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(appSource, /startVideoStudyModal/);
  assert.match(appSource, /renderVideoStudyModal/);
  assert.match(appSource, /closeVideoStudyModal/);
  assert.match(appSource, /stepVideoStudy/);
  assert.match(appSource, /pickVideoStudy/);
  assert.match(appSource, /finishVideoStudy/);
  assert.match(appSource, /class="sheet video-study-modal"/);
  assert.match(appSource, /data-act="close-video-study"/);
  assert.match(appSource, /data-act="resume-video-study"/);
  assert.match(appSource, /data-act="results-return-video"/);

  const styleSource = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(styleSource, /.video-study-scrim/);
  assert.match(styleSource, /#modal .video-study-modal/);
  assert.match(styleSource, /@media\s*\(max-width:\s*767px\)/);
  assert.match(styleSource, /@media\s*\(min-width:\s*768px\)/);
  assert.match(styleSource, /.video-study-header/);
  assert.match(styleSource, /.video-study-close-btn/);
  assert.match(styleSource, /.video-study-body/);
  assert.match(styleSource, /\.bible-reference-preview\.is-open\s*\{/);
  assert.match(styleSource, /\.bible-reference-preview\s*\{[^}]*z-index:\s*2200/s);
  const videoModalStart = styleSource.indexOf('/* ---------- Video Lesson In-Page Study Modal ---------- */');
  const desktopModalStart = styleSource.indexOf('@media (min-width: 768px)', videoModalStart);
  const desktopModalStyles = styleSource.slice(desktopModalStart, styleSource.indexOf('.video-study-header', desktopModalStart));
  assert.doesNotMatch(desktopModalStyles, /transform:\s*translate\(-50%/);

  const body = {
    appendChild(node) {
      if (node.parentNode && node.parentNode.children) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      this.children = this.children.filter(child => child !== node);
      node.parentNode = null;
      return node;
    },
    children: []
  };
  const elements = {
    app: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    modal: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    toast: { textContent: '', className: '' },
    'lesson-video-player': { paused: false, currentTime: 42.5, pause() { this.paused = true; }, addEventListener() {}, removeEventListener() {}, getAttribute() { return ''; } },
    's-unk': { checked: false },
    's-shuf': { checked: false },
    's-len': { value: '0' }
  };
  let capturedEvents = {};
  const doc = {
    body,
    getElementById: id => elements[id],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { (capturedEvents[name] || (capturedEvents[name] = [])).push(fn); },
    activeElement: { focus() {} },
    documentElement: { clientWidth: 390, setAttribute() {}, removeAttribute() {} },
    contains: () => true
  };
  const win = {
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    CCITranscripts: require('../js/transcripts.js'),
    MobileStudy: require('../js/mobile-study.js'),
    StudyLogic: require('../js/study.js'),
    CCIAccount: { create: () => ({ init: () => Promise.resolve({ configured: false }) }) },
    location: { protocol: 'https:', origin: 'https://study.example', href: 'https://study.example/' },
    innerHeight: 844,
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollTo: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null
  };
  const testWrapper = appSource.replace('  boot();', `
    boot();
    window._test = {
      getV: () => V,
      setV: val => { V = val; },
      getS: () => S,
      setup: setup,
      start: start,
      closeVideoStudyModal: closeVideoStudyModal,
      stepVideoStudy: stepVideoStudy,
      renderVideoStudyModal: renderVideoStudyModal,
      openBiblePreview: openBiblePreview,
      closeBiblePreview: closeBiblePreview
    };
  `);
  vm.runInNewContext(testWrapper, {
    window: win,
    document: doc,
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    fetch: () => new Promise(() => {}),
    setTimeout: () => {},
    clearTimeout: () => {}
  });
  const t = win._test;
  const deckId = 'd-test-chapter';
  t.getS().decks = [{
    id: deckId,
    title: 'Section 1 Test Chapter',
    cards: [
      { id: 'c1', question: 'Question 1', options: ['A', 'B', 'C', 'D'], answer: 'A' },
      { id: 'c2', question: 'Question 2', options: ['A', 'B', 'C', 'D'], answer: 'B' }
    ]
  }];
  t.setV({ name: 'lesson-video', id: deckId, videoIndex: 0, videoTime: 10 });

  // Setup pauses video
  t.setup('flash', deckId);
  assert.equal(elements['lesson-video-player'].paused, true, 'Video must pause when study setup opens');

  // Start study modal
  t.start();
  assert.equal(t.getV().name, 'lesson-video', 'V.name must remain lesson-video');
  assert.ok(t.getV().videoStudy, 'videoStudy session must be active');
  assert.match(elements.modal.innerHTML, /video-study-modal/);

  // Clicking the answer-side surface in the modal returns to the question and persists that state.
  t.getV().videoStudy.flipped = true;
  t.getS().pausedSession = require('../js/mobile-study.js').snapshot(t.getV().videoStudy);
  t.renderVideoStudyModal();
  assert.match(elements.modal.innerHTML, /flash-card-back/);
  const flipSurfaceClick = capturedEvents.click.find(handler => handler.toString().includes("closest('[data-flip-surface]')"));
  assert.ok(flipSurfaceClick, 'global flip-surface click handler should be registered');
  const flipSurface = {};
  flipSurfaceClick({ target: { closest: selector => selector === '[data-flip-surface]' ? flipSurface : null } });
  assert.equal(t.getV().videoStudy.flipped, false);
  assert.equal(t.getS().pausedSession.flipped, false);
  assert.match(elements.modal.innerHTML, /class="flip" data-act="flip"/);

  // The explicit answer-side cue and keyboard activation also toggle in both directions.
  const modalClickHandler = flipSurfaceClick;
  const flipButton = { dataset: { act: 'flip' }, matches: () => false };
  modalClickHandler({ target: { closest: selector => selector === '[data-act]' ? flipButton : null } });
  assert.equal(t.getV().videoStudy.flipped, true, 'answer-side flip cue should return to the answer');
  const flashKeydownHandler = capturedEvents.keydown.find(handler => handler.toString().includes('button.flip-cue-button') && handler.toString().includes('V.videoStudy.flipped'));
  assert.ok(flashKeydownHandler, 'flashcard keyboard handler should be registered');
  const keyboardFlipTarget = { tagName: 'BUTTON', closest: selector => selector.includes('button.flip-cue-button') ? {} : null };
  let defaultPrevented = false;
  flashKeydownHandler({ key: ' ', target: keyboardFlipTarget, preventDefault() { defaultPrevented = true; } });
  assert.equal(defaultPrevented, true);
  assert.equal(t.getV().videoStudy.flipped, false, 'Space should flip the answer back to the question');
  flashKeydownHandler({ key: 'Enter', target: keyboardFlipTarget, preventDefault() {} });
  assert.equal(t.getV().videoStudy.flipped, true, 'Enter should flip the question to the answer');
  t.getV().videoStudy.flipped = false;
  t.getS().pausedSession = require('../js/mobile-study.js').snapshot(t.getV().videoStudy);
  t.renderVideoStudyModal();

  // Bible previews are moved outside the modal clipping/transform context while open, then restored.
  const previewClasses = new Set();
  const wrapperClasses = new Set();
  const wrapper = {
    children: [],
    classList: { add: name => wrapperClasses.add(name), remove: name => wrapperClasses.delete(name) },
    contains: node => node === link,
    appendChild(node) {
      if (node.parentNode && node.parentNode.children) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      this.children.push(node); node.parentNode = this; return node;
    },
    insertBefore(node, sibling) { this.children.splice(this.children.indexOf(sibling), 0, node); node.parentNode = this; return node; }
  };
  const link = {
    isConnected: true,
    textContent: 'Romans 8:33–34',
    attrs: { 'aria-controls': 'bible-reference-preview-test' },
    closest: selector => selector === '.bible-reference-wrap' ? wrapper : null,
    getAttribute: name => link.attrs[name],
    setAttribute: (name, value) => { link.attrs[name] = value; },
    getBoundingClientRect: () => ({ left: 350, right: 380, top: 100, bottom: 120, width: 30, height: 20 })
  };
  const previewParts = { '.bible-preview-text': { textContent: '', hidden: true }, '.bible-preview-fallback': { textContent: '', hidden: false } };
  const preview = {
    parentNode: wrapper,
    nextSibling: null,
    classList: { add: name => previewClasses.add(name), remove: name => previewClasses.delete(name) },
    style: {},
    contains: node => node === preview,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 180, width: 300, height: 180 }),
    querySelector: selector => previewParts[selector]
  };
  wrapper.children.push(preview);
  elements['bible-reference-preview-test'] = preview;
  t.openBiblePreview(link, true);
  assert.equal(preview.parentNode, body, 'open preview should be portaled to document.body');
  assert.ok(previewClasses.has('is-open'));
  assert.equal(link.attrs['aria-expanded'], 'true');
  t.closeBiblePreview(false);
  assert.equal(preview.parentNode, wrapper, 'closed preview should return to its citation wrapper');
  assert.ok(!previewClasses.has('is-open'));
  assert.equal(link.attrs['aria-expanded'], 'false');

  // Advance card
  t.stepVideoStudy(1);
  assert.equal(t.getV().videoStudy.i, 1);
  assert.equal(t.getS().pausedSession.i, 1);

  // Close study modal auto-saves in-flight progress
  t.closeVideoStudyModal();
  assert.equal(t.getV().videoStudy, null);
  assert.equal(elements.modal.innerHTML, '');
  assert.ok(t.getS().pausedSession);
  assert.equal(t.getS().pausedSession.returnToVideo.deckId, deckId);
  assert.equal(t.getS().pausedSession.i, 1);

  // Re-opening setup offers resume shortcut
  t.setup('flash', deckId);
  assert.match(elements.modal.innerHTML, /data-act="resume-video-study"/);
  assert.match(elements.modal.innerHTML, /Resume saved flashcards/);
});


test('authenticated video byte ranges stream from private R2 without using Cache API', async () => {
  let cacheCalls = 0;
  const mockCaches = {
    default: {
      match: async () => { cacheCalls++; return null; },
      put: async () => { cacheCalls++; }
    }
  };

  let r2Gets = 0;
  let r2Heads = 0;
  const bucket = {
    get: async (key, options) => {
      r2Gets++;
      return {
        size: 100,
        httpEtag: 'video-etag-1',
        range: { offset: 10, length: 20 },
        body: new Response('01234567890123456789').body
      };
    },
    head: async key => {
      r2Heads++;
      return { size: 100, httpEtag: 'video-etag-1' };
    }
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '123e4567-e89b-12d3-a456-426614174000' }), { status: 200 });
  const handlers = loadHandlers(
    globalThis.fetch,
    mockCaches
  );

  const catalogKey = catalogData.videos[0].objectKey;
  const catalogUrl = 'https://study.example/api/videos?key=' + encodeURIComponent(catalogKey);
  const authHeaders = {
    Cookie: '__Host-cci-video-session=header.payload.signature',
    Range: 'bytes=10-29',
    Origin: 'https://study.example'
  };

  // Each authorized range is served from the private R2 binding.
  const first = await handlers.onRequest({
    request: new Request(catalogUrl, { headers: authHeaders }),
    env: environment(bucket)
  });
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('content-range'), 'bytes 10-29/100');
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal(first.headers.get('access-control-allow-origin'), 'https://study.example');
  assert.equal(await first.text(), '01234567890123456789');
  assert.equal(r2Gets, 1);
  assert.equal(cacheCalls, 0, 'private media bytes and metadata must not be cached');

  // A repeated range still reads R2; no unmeasured cache policy is assumed.
  const second = await handlers.onRequest({
    request: new Request(catalogUrl, { headers: authHeaders }),
    env: environment(bucket)
  });
  assert.equal(second.status, 206);
  assert.equal(second.headers.get('content-range'), 'bytes 10-29/100');
  assert.equal(second.headers.get('cache-control'), 'private, no-store');
  assert.equal(await second.text(), '01234567890123456789');
  assert.equal(r2Gets, 2, 'each authorized byte-range request reads the private object');

  // HEAD requests read current object metadata from R2.
  const firstHead = await handlers.onRequest({
    request: new Request(catalogUrl, { method: 'HEAD', headers: authHeaders }),
    env: environment(bucket)
  });
  assert.equal(firstHead.status, 200);
  assert.equal(firstHead.headers.get('content-length'), '100');
  assert.equal(r2Heads, 1);

  const secondHead = await handlers.onRequest({
    request: new Request(catalogUrl, { method: 'HEAD', headers: authHeaders }),
    env: environment(bucket)
  });
  assert.equal(secondHead.status, 200);
  assert.equal(secondHead.headers.get('content-length'), '100');
  assert.equal(r2Heads, 2, 'subsequent HEAD requests do not rely on stale cached metadata');

  // Unauthenticated request: Must fail with 401 and NOT return cached media
  try {
    const unauth = await handlers.onRequest({
      request: new Request(catalogUrl, { headers: { Range: 'bytes=10-29' } }),
      env: environment(bucket)
    });
    assert.equal(unauth.status, 401);
    assert.equal(r2Gets, 2);
    assert.equal(cacheCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('video endpoint accepts a catalog-scoped playback ticket and rejects access-token URLs', async () => {
  const auth = require('../functions/_lib/auth.cjs');
  const seen = [];
  const handlers = loadHandlers();
  const bucket = {
    get: async (key, options) => {
      seen.push({ key, options });
      return { size: 10, httpEtag: 'etag', range: { offset: 0, length: 5 }, body: new Response('01234').body };
    },
    head: async key => ({ size: 10, httpEtag: 'etag' })
  };
  const env = {
    ...environment(bucket),
    ALLOWED_APP_ORIGINS: 'capacitor://localhost'
  };
  const validKey = catalogData.videos[0].objectKey;
  const videoId = catalogData.videos[0].id;
  const validTicket = await auth.createPlaybackTicket('123e4567-e89b-12d3-a456-426614174000', videoId, 3600, env);
  const mismatchTicket = await auth.createPlaybackTicket('123e4567-e89b-12d3-a456-426614174000', 'other-video', 3600, env);

  // 1. Success with a lesson-scoped ?ticket= and Range header, no cookies
  const ticketResponse = await handlers.onRequest({
    request: new Request('https://study.example/api/videos?key=' + encodeURIComponent(validKey) + '&ticket=' + encodeURIComponent(validTicket), {
      headers: { Range: 'bytes=0-4', Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(ticketResponse.status, 206);
  assert.equal(await ticketResponse.text(), '01234');
  assert.equal(ticketResponse.headers.get('access-control-allow-origin'), 'capacitor://localhost');

  // A ticket for another catalog video is rejected.
  const mismatchResponse = await handlers.onRequest({
    request: new Request('https://study.example/api/videos?key=' + encodeURIComponent(validKey) + '&ticket=' + encodeURIComponent(mismatchTicket), {
      headers: { Range: 'bytes=0-4', Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(mismatchResponse.status, 401);

  // Access tokens are never accepted from query strings.
  const tokenQueryResponse = await handlers.onRequest({
    request: new Request('https://study.example/api/videos?key=' + encodeURIComponent(validKey) + '&token=' + encodeURIComponent(validTicket), {
      headers: { Range: 'bytes=0-4', Origin: 'capacitor://localhost' }
    }),
    env
  });
  assert.equal(tokenQueryResponse.status, 401);
});


test('hybrid video study scopes questions to active video and preserves Section 11 mappings', () => {
  const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const elements = {
    app: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    modal: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    toast: { textContent: '', className: '' },
    'lesson-video-player': { paused: false, currentTime: 25.0, pause() { this.paused = true; }, addEventListener() {}, removeEventListener() {}, getAttribute() { return ''; } },
    's-unk': { checked: false },
    's-shuf': { checked: false },
    's-len': { value: '0' }
  };
  const doc = {
    body: { appendChild: n => n, removeChild: n => n },
    getElementById: id => elements[id],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    activeElement: { focus() {} },
    documentElement: { clientWidth: 390, setAttribute() {}, removeAttribute() {} },
    contains: () => true
  };
  const win = {
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    CCITranscripts: require('../js/transcripts.js'),
    MobileStudy: require('../js/mobile-study.js'),
    StudyLogic: require('../js/study.js'),
    CCIAccount: { create: () => ({ init: () => Promise.resolve({ configured: false }) }) },
    location: { protocol: 'https:', origin: 'https://study.example', href: 'https://study.example/' },
    innerHeight: 844,
    setTimeout: () => 0,
    clearTimeout: () => {},
    scrollTo: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null
  };
  const testWrapper = appSource.replace('  boot();', `
    boot();
    window._test = {
      getV: () => V,
      setV: val => { V = val; },
      getS: () => S,
      setup: setup,
      start: start,
      render: render,
      lessonVideosForDeck: lessonVideosForDeck,
      cardsForVideo: cardsForVideo,
      setLessonVideos: val => { LESSON_VIDEOS = val; },
      parseReferenceLinks: parseReferenceLinks,
      resolveVideoForRef: resolveVideoForRef,
      renderReferenceNote: renderReferenceNote
    };
  `);
  vm.runInNewContext(testWrapper, {
    window: win,
    document: doc,
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    fetch: () => new Promise(() => {}),
    setTimeout: () => {},
    clearTimeout: () => {}
  });
  const t = win._test;

  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8'));
  t.setLessonVideos(catalog.videos);

  // Verify Section 11 videos are found even with truncated slug
  const sec11Videos = t.lessonVideosForDeck('d-discipleship-experience-section-11-believers-authority-chari');
  assert.equal(sec11Videos.length, 15, 'Section 11 must return all 15 videos');

  // Verify cardsForVideo matching
  const testDeck = {
    id: 'd-test',
    cards: [
      { id: 'c1', question: 'Q1', ref: 'DID JESUS RISE FROM THE DEAD. V — 01:19' },
      { id: 'c2', question: 'Q2', ref: 'DID JESUS RISE FROM THE DEAD. IV — 05:20' },
      { id: 'c3', question: 'Q3', ref: 'OTHER LESSON' }
    ]
  };
  const video = { id: 'section-10-did-jesus-rise-from-the-dead-v', deckId: 'd-test', title: 'DID JESUS RISE FROM THE DEAD. V' };
  t.setLessonVideos([...catalog.videos, video]);
  const matched = t.cardsForVideo(testDeck, video);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].id, 'c1');

  // Verify scoped setup
  t.getS().decks = [testDeck];
  t.setV({ name: 'lesson-video', id: 'd-test', videoIndex: 0 });
  t.setup('quiz', 'd-test', video.id);
  assert.equal(t.getV().setup.videoId, video.id);
  assert.equal(t.getV().setup.cards.length, 1);
  assert.match(elements.modal.innerHTML, /Start video quiz/);
  assert.match(elements.modal.innerHTML, /Video 1: DID JESUS RISE FROM THE DEAD\. V/);

  // Progressive study scoping: intermediate videos only have video actions, final video includes chapter capstone
  const v1 = { id: 'test-v1', deckId: 'd-test', title: 'Part One' };
  const v2 = { id: 'test-v2', deckId: 'd-test', title: 'Part Two' };
  t.setLessonVideos([v1, v2]);
  testDeck.cards = [
    { id: 'c1', question: 'Q1', ref: 'Part One' },
    { id: 'c2', question: 'Q2', ref: 'Part Two' }
  ];

  // 1. Intermediate video (index 0): only Video buttons, NO Chapter buttons
  t.setV({ name: 'lesson-video', id: 'd-test', videoIndex: 0 });
  t.render();
  assert.match(elements.app.innerHTML, /Video Flashcards \(1\)/);
  assert.match(elements.app.innerHTML, /Video Quiz \(1\)/);
  assert.doesNotMatch(elements.app.innerHTML, /Chapter Flashcards/);
  assert.doesNotMatch(elements.app.innerHTML, /Chapter Quiz/);

  // 2. Final video (index 1): has both Video and Chapter buttons
  t.setV({ name: 'lesson-video', id: 'd-test', videoIndex: 1 });
  t.render();
  assert.match(elements.app.innerHTML, /Video Flashcards \(1\)/);
  assert.match(elements.app.innerHTML, /Video Quiz \(1\)/);
  assert.match(elements.app.innerHTML, /Chapter Flashcards \(2\)/);
  assert.match(elements.app.innerHTML, /Chapter Quiz \(2\)/);

  // 3. Intermediate video with 0 cards renders graceful fallback message
  testDeck.cards = [{ id: 'c2', question: 'Q2', ref: 'Part Two' }];
  t.setV({ name: 'lesson-video', id: 'd-test', videoIndex: 0 });
  t.render();
  assert.match(elements.app.innerHTML, /Video practice questions in preparation · Chapter quiz available on the final lesson/);

  // Dynamic question count dropdown filtering
  // Roman numeral boundary matching: BAPTISM I must only match Part I, not II, III, IV, or V
  const multiPartDeck = {
    id: 'd-test',
    cards: [
      { id: 'b1', question: 'Q1', ref: 'BAPTISM I — 01:35' },
      { id: 'b2', question: 'Q2', ref: 'BAPTISM II — 04:52' },
      { id: 'b3', question: 'Q3', ref: 'BAPTISM III — 11:44' },
      { id: 'b4', question: 'Q4', ref: 'BAPTISM IV — 06:41' },
      { id: 'b5', question: 'Q5', ref: 'BAPTISM V — 05:23' }
    ]
  };
  const b1Video = { id: 'section-12-baptism-i', deckId: 'd-test', title: 'BAPTISM I' };
  const matchedBaptism = t.cardsForVideo(multiPartDeck, b1Video);
  assert.equal(matchedBaptism.length, 1, 'BAPTISM I must match only Part I card');
  assert.equal(matchedBaptism[0].id, 'b1');

  // Case A: 27 questions (reproduces user scenario: 30 option must not be shown)
  const cards27 = [];
  for (let i = 1; i <= 27; i++) {
    cards27.push({ id: 'c' + i, question: 'Q' + i, ref: 'Part One' });
  }
  testDeck.cards = cards27;
  t.setup('quiz', 'd-test', v1.id);
  assert.match(elements.modal.innerHTML, /<option value="0">All cards \(27\)<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="10">10<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="20">20<\/option>/);
  assert.doesNotMatch(elements.modal.innerHTML, /<option value="30">30<\/option>/);
  assert.doesNotMatch(elements.modal.innerHTML, /<option value="50">50<\/option>/);

  // Case B: 8 questions (small count: offers 5, omits 10/20/30)
  testDeck.cards = cards27.slice(0, 8);
  t.setup('quiz', 'd-test', v1.id);
  assert.match(elements.modal.innerHTML, /<option value="0">All cards \(8\)<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="5">5<\/option>/);
  assert.doesNotMatch(elements.modal.innerHTML, /<option value="10">10<\/option>/);

  // Case C: Chapter quiz with 75 cards (shows 10, 20, 30, 50, but not 100)
  const cards75 = [];
  for (let i = 1; i <= 75; i++) {
    cards75.push({ id: 'ch' + i, question: 'Q' + i, ref: 'Part One' });
  }
  testDeck.cards = cards75;
  t.setup('quiz', 'd-test');
  assert.match(elements.modal.innerHTML, /<option value="0">All cards \(75\)<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="10">10<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="20">20<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="30">30<\/option>/);
  assert.match(elements.modal.innerHTML, /<option value="50">50<\/option>/);

  // Interactive Reference Timestamp Linking
  t.setLessonVideos(catalog.videos);
  // 1. Single reference with timestamp
  const refSingle = 'BAPTISM I — [01:35] - [02:50]';
  const linksSingle = t.parseReferenceLinks(refSingle, 'd-discipleship-experience-section-12-church-history');
  assert.equal(linksSingle.length, 1);
  assert.equal(linksSingle[0].timeStr, '01:35');
  assert.equal(linksSingle[0].timeSec, 95);
  assert.equal(linksSingle[0].video.id, 'section-12-baptism-i');

  // 2. Render reference note with 3s pre-roll (95 - 3 = 92)
  const cardWithRef = { id: 'c-test', ref: refSingle };
  const htmlRef = t.renderReferenceNote(cardWithRef, 'd-discipleship-experience-section-12-church-history');
  assert.match(htmlRef, /class="ref-timestamp-btn"/);
  assert.match(htmlRef, /data-act="seek-video-reference"/);
  assert.match(htmlRef, /data-video-id="section-12-baptism-i"/);
  assert.match(htmlRef, /data-time="92"/);
  assert.match(htmlRef, /BAPTISM I · 01:35/);

  // 3. Multi-video reference parsing
  const refMulti = 'HOW TO ATTRACT ANGELS I — [13:17] - [14:06]; HOW TO ATTRACT ANGELS II — [03:27] - [04:50]';
  const linksMulti = t.parseReferenceLinks(refMulti, 'd-discipleship-experience-section-12-church-history');
  assert.equal(linksMulti.length, 2);
  assert.equal(linksMulti[0].video.id, 'section-12-how-to-attract-angels-i');
  assert.equal(linksMulti[0].timeStr, '13:17');
  assert.equal(linksMulti[1].video.id, 'section-12-how-to-attract-angels-ii');
  assert.equal(linksMulti[1].timeStr, '03:27');

  // 4. Non-timestamp fallback
  const refNoTime = 'Not found in the provided sources — N/A';
  const htmlNoTime = t.renderReferenceNote({ id: 'c-none', ref: refNoTime });
  assert.doesNotMatch(htmlNoTime, /ref-timestamp-btn/);
  assert.match(htmlNoTime, /Not found in the provided sources/);
});
