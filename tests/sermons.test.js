const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const SermonLogic = require(path.join(root, 'js', 'sermons.js'));
const SermonAudio = require(path.join(root, 'js', 'sermon-audio.js'));
const parser = require(path.join(root, 'js', 'parser.js'));
const StudyLogic = require(path.join(root, 'js', 'study.js'));
const StudyStorage = require(path.join(root, 'js', 'storage.js'));
const MobileStudy = require(path.join(root, 'js', 'mobile-study.js'));

const sermon = overrides => Object.assign({
  id: 'sunday-one', title: 'Sunday One', speaker: 'Pastor', date: '2026-10-25', scripture: 'John 3:16',
  body: ['A paragraph.'], readMinutes: 2, status: 'published', deckFile: 'sunday-one.txt',
  audio: { url: 'https://media.example.org/one.mp3', durationSec: 1800, sizeBytes: 14000000 }
}, overrides);

test('every shipped sermon is valid, has a parseable deck and (when bundled) its audio file', () => {
  const list = JSON.parse(read('content/sermons.json'));
  assert.ok(Array.isArray(list));
  const ids = new Set();
  for (const entry of list) {
    assert.deepEqual(SermonLogic.validateSermon(entry), [], `sermon ${entry.id} must validate`);
    assert.ok(!ids.has(entry.id), `duplicate sermon id ${entry.id}`);
    ids.add(entry.id);
    if (entry.deckFile) {
      const parsed = parser.parseDecks(read(path.join('content', 'sermons', entry.deckFile)));
      assert.equal(parsed.decks.length, 1, `${entry.deckFile} must contain exactly one DECK`);
      assert.ok(parsed.decks[0].questions.length >= 1);
      assert.deepEqual(parsed.errors || [], []);
    }
    if (entry.audio && !SermonLogic.isRemoteUrl(entry.audio.url)) {
      assert.ok(fs.existsSync(path.join(root, entry.audio.url)), `${entry.audio.url} must exist`);
    }
  }
});

test('validateSermon rejects incomplete or unsafe entries', () => {
  assert.deepEqual(SermonLogic.validateSermon(sermon()), []);
  assert.ok(SermonLogic.validateSermon(sermon({ id: 'Bad Id' })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ date: '25/10/2026' })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ body: [] })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ status: 'live' })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ deckFile: '../secret.txt' })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ audio: { url: 'http://insecure.example/a.mp3', durationSec: 10 } })).length, 'http audio is refused');
  assert.ok(SermonLogic.validateSermon(sermon({ audio: { url: 'javascript:alert(1)', durationSec: 10 } })).length);
  assert.ok(SermonLogic.validateSermon(sermon({ audio: { url: 'https://x.example/a.mp3', durationSec: 0 } })).length);
  assert.deepEqual(SermonLogic.validateSermon(sermon({ audio: undefined, deckFile: undefined })), [], 'audio and deck are optional');
});

test('visibleSermons hides drafts by default, skips invalid entries and sorts newest first', () => {
  const list = [
    sermon({ id: 'older', date: '2026-09-01' }),
    sermon({ id: 'draft', date: '2026-11-01', status: 'draft' }),
    sermon({ id: 'newest', date: '2026-10-25' }),
    { id: 'broken' }
  ];
  assert.deepEqual(SermonLogic.visibleSermons(list, false).map(s => s.id), ['newest', 'older']);
  assert.deepEqual(SermonLogic.visibleSermons(list, true).map(s => s.id), ['draft', 'newest', 'older']);
  assert.deepEqual(SermonLogic.visibleSermons(null, true), []);
});

test('sermon decks are built in memory with stable ids and never collide with course decks', () => {
  const parsed = parser.parseDecks(read('content/sermons/sample-sermon.txt')).decks[0];
  const built = SermonLogic.buildSermonDeck(sermon({ id: 'sample-sermon' }), parsed);
  assert.equal(built.id, 'd-sermon-sample-sermon');
  assert.equal(built.kind, 'sermon');
  assert.equal(built.cards[0].id, 'd-sermon-sample-sermon.q1');
  assert.equal(built.cards.length, parsed.questions.length);
  assert.equal(SermonLogic.buildSermonDeck(sermon(), { questions: [] }), null);
});

test('playback helpers: resume, seek, speed, formatting and saved state normalisation', () => {
  assert.equal(SermonLogic.resumePosition(3, 1800), 0, 'ignore the first seconds');
  assert.equal(SermonLogic.resumePosition(754.9, 1800), 754);
  assert.equal(SermonLogic.resumePosition(1795, 1800), 0, 'a finished sermon restarts');
  assert.equal(SermonLogic.clampSeek(-5, 100), 0);
  assert.equal(SermonLogic.clampSeek(500, 100), 100);
  assert.equal(SermonLogic.nextSpeed(1), 1.25);
  assert.equal(SermonLogic.nextSpeed(2), 0.75);
  assert.equal(SermonLogic.formatClock(65), '1:05');
  assert.equal(SermonLogic.formatClock(3725), '1:02:05');
  assert.equal(SermonLogic.formatSize(14000000), '13.4 MB');
  assert.equal(SermonLogic.formatMinutes(1800), '30 min');
  assert.deepEqual(SermonLogic.normalizeSermonState(null), { positions: {}, played: {}, speed: 1 });
  assert.deepEqual(
    SermonLogic.normalizeSermonState({ positions: { 'ok-id': 61.4, 'BAD ID': 5, neg: -3 }, played: { 'ok-id': 1, nope: 0 }, speed: 3 }),
    { positions: { 'ok-id': 61 }, played: { 'ok-id': true }, speed: 1 }
  );
});

function fakeStore(options) {
  options = options || {};
  const files = new Map();
  const cache = {
    put: async (url, response) => { if (options.full) throw new Error('quota'); files.set(url, response); },
    match: async url => files.get(url) ? { blob: async () => files.get(url).blobValue } : undefined,
    delete: async url => files.delete(url)
  };
  const revoked = [];
  const store = SermonAudio.createAudioStore({
    caches: { open: async name => { assert.equal(name, SermonAudio.CACHE_NAME); return cache; } },
    fetch: async (url) => {
      if (options.offline) throw new TypeError('Failed to fetch');
      if (options.status) return { ok: false, status: options.status };
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
      let sent = false;
      return {
        ok: true, status: 200,
        headers: { get: name => ({ 'content-length': '6', 'content-type': 'audio/mpeg' })[name.toLowerCase()] },
        body: { getReader: () => ({ read: async () => { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; } }) }
      };
    },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: u => revoked.push(u) },
    storage: { persist: async () => true }
  });
  return { store, files, revoked };
}

test('offline audio store downloads into its own cache, reports progress and plays back from the copy', async () => {
  const url = 'https://media.example.org/one.mp3';
  assert.ok(!SermonAudio.CACHE_NAME.startsWith('cci-study-pwa-'), 'must not be wiped by the app-shell cache cleanup');
  const { store, files } = fakeStore();
  assert.equal(store.supported(), true);
  assert.equal(await store.isDownloaded(url), false);
  assert.deepEqual(await store.playable(url), { src: url, local: false });
  const progress = [];
  // Response/Blob are Node globals; the fake cache stores whatever it is given.
  await store.download(url, { onProgress: value => progress.push(value) });
  assert.ok(progress.length >= 1 && progress[progress.length - 1] === 1);
  assert.equal(await store.isDownloaded(url), true);
  const entry = files.get(url);
  entry.blobValue = await entry.blob();
  assert.deepEqual(await store.playable(url), { src: 'blob:test', local: true });
  assert.equal(await store.remove(url), true);
  assert.equal(await store.isDownloaded(url), false);
});

test('offline audio store gives plain-language errors and reports when it is unsupported', async () => {
  const url = 'https://media.example.org/one.mp3';
  await assert.rejects(fakeStore({ offline: true }).store.download(url), /Could not download this recording/);
  await assert.rejects(fakeStore({ status: 403 }).store.download(url), /\(403\)/);
  await assert.rejects(fakeStore({ full: true }).store.download(url), /Not enough storage/);
  const none = SermonAudio.createAudioStore({});
  assert.equal(none.supported(), false);
  assert.equal(await none.isDownloaded(url), false);
  await assert.rejects(none.download(url), /not available/);
});

test('native app downloads go through the bridge and play from the saved file', async () => {
  const calls = [];
  const store = SermonAudio.createAudioStore({
    native: {
      isNative: true,
      audioExists: async name => calls.push(['exists', name]) && true,
      downloadAudio: async (url, name) => calls.push(['download', url, name]),
      audioSrc: async name => 'capacitor://localhost/_capacitor_file_/' + name,
      deleteAudio: async name => calls.push(['delete', name])
    }
  });
  const url = 'https://media.example.org/one.mp3';
  await store.download(url);
  const file = SermonAudio.nativeFileName(url);
  assert.match(file, /^sermon-audio\/[0-9a-f]+\.audio$/);
  assert.deepEqual(calls[0], ['download', url, file]);
  assert.deepEqual(await store.playable(url), { src: 'capacitor://localhost/_capacitor_file_/' + file, local: true });
  await store.remove(url);
  assert.deepEqual(calls[calls.length - 1], ['delete', file]);
  const bridge = read('js/native-bridge.mjs');
  for (const pattern of [/Filesystem\.downloadFile/, /Directory\.Data/, /convertFileSrc/, /Filesystem\.deleteFile/]) assert.match(bridge, pattern);
});

test('app: Sermons tab lists sermons, reader shows player, text and study buttons; sermon decks stay out of the course', async () => {
  const appSource = read('js/app.js');
  const deckFiles = JSON.parse(read('decks/manifest.json'));
  const starter = deckFiles.map(file => read(path.join('decks', file)).trimEnd()).join('\n\n');
  const list = JSON.parse(read('content/sermons.json'));
  const decks = {};
  for (const entry of list) decks[entry.deckFile] = read(path.join('content', 'sermons', entry.deckFile));
  let stored = JSON.stringify({ decks: [], progress: {}, settings: { theme: 'auto', showDraftDevotionals: true }, seeded: false, dataVersion: 0, onboarding: { completed: true, goal: 'habit', dailyMinutes: 10, startingTopic: 'soteriology', preferredTime: 'anytime', committed: false } });
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) },
    'sermons-fallback': { textContent: JSON.stringify({ sermons: list, decks }) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: () => {},
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} },
    activeElement: null
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, MobileStudy, SermonLogic, SermonAudio, location: { protocol: 'file:' }, scrollTo: () => {}, addEventListener: () => {} };
  const source = appSource.replace('  boot();', '  window.shellTestApi = { render: render, setView: function (view) { V = view; }, state: function () { return S; }, deck: deck }; window.testAppReady = boot();');
  vm.runInNewContext(source, { window, document, localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
  await window.testAppReady;

  const S = window.shellTestApi.state();
  assert.equal(S.decks.length, deckFiles.length, 'course decks only');
  assert.ok(S.decks.every(d => !/^d-sermon-/.test(d.id)), 'sermon decks must not be saved with the course decks');
  assert.ok(!JSON.parse(stored).decks.some(d => /^d-sermon-/.test(d.id)));
  assert.ok(window.shellTestApi.deck('d-sermon-sample-sermon'), 'study engine can still find the sermon deck');
  assert.equal(window.shellTestApi.deck('d-sermon-sample-sermon').cards.length, 5);

  window.shellTestApi.setView({ name: 'sermons' });
  window.shellTestApi.render();
  const html = () => elements.app.innerHTML;
  assert.match(html(), /data-tab="sermons" aria-selected="true"/);
  assert.match(html(), /The Good Shepherd \(Sample\)/);
  assert.match(html(), /data-act="open-sermon" data-id="sample-sermon"/);
  assert.match(html(), /Draft/);

  window.shellTestApi.setView({ name: 'sermon', id: 'sample-sermon' });
  window.shellTestApi.render();
  assert.match(html(), /<aside class="desktop-sidebar">/);
  assert.match(html(), /class="sermon-player-card"/);
  assert.match(html(), /data-act="sermon-toggle" data-id="sample-sermon"/);
  assert.match(html(), /type="range"/);
  assert.match(html(), /Replace it with the written version of a real Sunday sermon/);
  assert.match(html(), /data-act="sermon-study" data-mode="quiz" data-id="d-sermon-sample-sermon"/);
  assert.match(html(), /data-act="sermon-study" data-mode="flash" data-id="d-sermon-sample-sermon"/);

  window.shellTestApi.setView({ name: 'sermon', id: 'missing' });
  window.shellTestApi.render();
  assert.match(html(), /Sermon not found/);

  S.settings.showDraftDevotionals = false;
  window.shellTestApi.setView({ name: 'sermons' });
  window.shellTestApi.render();
  assert.match(html(), /No sermons yet/, 'drafts stay hidden unless the draft setting is on');
});

test('build bundles the sermon index and decks for offline/file use and ships the new scripts', () => {
  const page = read('index.html');
  for (const script of ['js/sermons.js', 'js/sermon-audio.js']) assert.match(page, new RegExp(script.replace('.', '\\.')));
  assert.match(page, /id="sermons-fallback"/);
  const dist = read('dist/index.html');
  assert.match(dist, /id="sermons-fallback">\{"sermons":\[\{"id":"sample-sermon"/);
  assert.ok(fs.existsSync(path.join(root, 'dist', 'content', 'sermons', 'audio', 'sample-sermon.mp3')));
});
