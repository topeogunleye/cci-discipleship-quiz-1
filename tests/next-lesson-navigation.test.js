const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const MobileStudy = require('../js/mobile-study.js');
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const slug = title => 'd-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const titles = ['Discipleship Experience (Section 1) First', 'Discipleship Experience (Section 2) Second & next', 'Discipleship Experience (Section 3) Final'];
const ids = titles.map(slug);
const starters = titles.map(title => ({ title }));
const decks = titles.map((title, i) => ({ id: ids[i], title, cards: [{ id: 'q' + i, question: 'Question?', options: ['A', 'B', 'C', 'D'], answer: 'A' }] }));
const catalog = ids.flatMap((deckId, i) => [0, 1, 2].map(n => ({ deckId, id: 'v' + i + n, title: 'Recording ' + n, group: n < 2 ? 'First group' : 'Second group', videoUrl: '/api/videos/v' + i + n })));
const plain = value => JSON.parse(JSON.stringify(value));

function harness(signedIn = false) {
  const events = {}, history = [];
  const player = { currentTime: 56, paused: false, pauses: 0, pause() { this.paused = true; this.pauses++; } };
  const elements = Object.fromEntries(['app', 'modal', 'toast'].map(id => [id, { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] }]));
  const document = { getElementById: id => id === 'lesson-video-player' ? player : elements[id],
    querySelector: () => null, contains: () => true, addEventListener(name, callback) { (events[name] ||= []).push(callback); } };
  const window = { DeckParser: require('../js/parser.js'), MobileStudy, StudyStorage: require('../js/storage.js'), StudyLogic: require('../js/study.js'), CCITranscripts: require('../js/transcripts.js'),
    location: { protocol: 'https:', pathname: '/app/', search: '', hash: '', origin: 'https://test.invalid' },
    history: { pushState(state, title, url) { this.state = state; history.push({ state, url }); window.location.hash = url.slice(url.indexOf('#')); }, replaceState(state, title, url) { this.state = state; window.location.hash = url.slice(url.indexOf('#')); } },
    scrollTo() {} };
  const code = source.replace('  boot();', `
    var focusDirection = '', writes = 0;
    render = function () { app.innerHTML = views[V.name](); };
    restoreLessonVideoSelectionFocus = function (direction) { focusDirection = direction; };
    scheduleCloudProgressSync = function () {};
    save = function () { writes++; return Promise.resolve(); };
    window.testApp = {
      configure: function (starters, decks, videos, signedIn) { STARTER_DECKS = starters; S.decks = decks; LESSON_VIDEOS = videos; accountStatus = signedIn ? { user: { id: 'isolated-user' }, videoReady: true } : { user: null, videoReady: false }; },
      state: () => S, view: () => V, setView: view => { V = view; }, render,
      nextLessonDestination, openNextLesson, rememberLessonVideoVisit, lessonVideoVisitRoute,
      hashToView, handleLocationChange, focusDirection: () => focusDirection, writes: () => writes
    };
  `);
  vm.runInNewContext(code, { window, document, URL, setTimeout: () => 0, clearTimeout() {} });
  const app = window.testApp;
  app.configure(plain(starters), plain(decks), plain(catalog), signedIn);
  const click = (act, extra = {}) => {
    const target = { dataset: { act, ...extra }, matches: () => false, closest: selector => selector === '[data-act]' ? target : null };
    events.click.forEach(callback => callback({ target }));
  };
  return { app, elements, player, history, window, click };
}

test('follows curriculum order even when locally stored decks are reordered', () => {
  const { app } = harness();
  app.configure(starters, decks.slice().reverse(), catalog, false);
  assert.deepEqual(plain(app.nextLessonDestination(ids[0])), { kind: 'video', id: ids[1], title: 'Second & next' });
  assert.equal(app.nextLessonDestination(ids[2]).kind, 'last');
  assert.equal(app.nextLessonDestination('custom-deck').kind, 'unknown');
});

test('boundary action is available immediately only on the final recording, including single-video lessons', () => {
  const { app, elements } = harness();
  for (const index of [0, 1, 2]) {
    app.setView({ name: 'lesson-video', id: ids[0], videoIndex: index });
    app.render();
    assert.equal(elements.app.innerHTML.includes('data-act="lesson-video-next-lesson"'), index === 2);
    if (index === 2) {
      assert.match(elements.app.innerHTML, /Next lesson: Second &amp; next/);
      assert.match(elements.app.innerHTML, /data-video-nav="next"[^>]*disabled/);
    }
  }
  app.configure(starters, decks, catalog.filter(v => v.deckId !== ids[0] || v.id === 'v00'), false);
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 0 });
  app.render();
  assert.match(elements.app.innerHTML, /Next lesson: Second &amp; next/);
});

for (const signedIn of [false, true]) test(`${signedIn ? 'signed-in' : 'guest'} transition opens first video at zero without autoplay or progress writes`, () => {
  const { app, elements, player, click, history, window } = harness(signedIn);
  const saved = { version: 1, name: 'flash', cards: [{ deckId: ids[0], cardId: 'q0' }], i: 0, marks: { q0: 'known' }, opts: {}, ids: [ids[0]] };
  app.state().pausedSession = saved;
  app.state().progress = { [ids[0]]: { cards: { q0: { attempts: 2 } }, best: { pct: 80 } } };
  const original = plain(app.state());
  app.rememberLessonVideoVisit(ids[1], catalog.find(v => v.id === 'v12'), 99);
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 2 });
  app.render();
  click('lesson-video-next-lesson');
  assert.deepEqual(plain(app.view()), { name: 'lesson-video', id: ids[1], videoIndex: 0, videoTime: 0 });
  assert.equal(player.paused, true);
  assert.equal(app.focusDirection(), 'next');
  assert.equal(app.state().pausedSession, saved);
  assert.deepEqual(plain(app.state()), original);
  assert.equal(app.writes(), 0);
  assert.equal(history.length, 1);
  assert.equal(window.location.hash, '#/video/' + ids[1] + '/0');
  assert.equal(app.hashToView(window.location.hash).videoIndex, 0, 'reload URL retains first recording');
  assert.doesNotMatch(elements.app.innerHTML, /\bautoplay\b/);
  assert.equal(elements.app.innerHTML.includes('<video '), signedIn, 'private player still requires authorization');
  if (!signedIn) assert.match(elements.app.innerHTML, /data-return-video-index="0"/);
  assert.equal(app.lessonVideoVisitRoute(ids[0], catalog.filter(v => v.deckId === ids[0])).videoTime, 56, 'outgoing visit remains resumable');
});

test('no-video and missing lessons are explicit and never skipped', () => {
  const { app, elements, click } = harness();
  app.configure(starters, decks, catalog.filter(v => v.deckId !== ids[1]), false);
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 2 });
  app.render();
  assert.match(elements.app.innerHTML, /No video available · Open lesson overview/);
  click('lesson-video-next-lesson');
  assert.deepEqual(plain(app.view()), { name: 'chapter', id: ids[1] });
  app.configure(starters, decks.filter(d => d.id !== ids[1]), catalog, false);
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 2 });
  app.render();
  assert.match(elements.app.innerHTML, /Next lesson: Second &amp; next is unavailable on this device/);
  assert.doesNotMatch(elements.app.innerHTML, /data-act="lesson-video-next-lesson"/);
  app.openNextLesson();
  assert.equal(app.view().id, ids[0]);
});

test('final lesson returns to Journey without a completion claim or wraparound', () => {
  const { app, elements, click } = harness();
  app.setView({ name: 'lesson-video', id: ids[2], videoIndex: 2 });
  app.render();
  assert.match(elements.app.innerHTML, /Final lesson · Back to Journey/);
  assert.doesNotMatch(elements.app.innerHTML, /data-act="lesson-video-next-lesson"/);
  app.openNextLesson();
  assert.equal(app.view().id, ids[2]);
  click('nav-tab', { tab: 'journey' });
  assert.equal(app.view().name, 'journey');
});

test('ordinary navigation crosses groups without leaving the lesson; Back/Forward restores explicit routes', () => {
  const { app, click, window } = harness();
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 1 });
  click('lesson-video-select', { index: '2', videoNav: 'next' });
  assert.equal(app.view().id, ids[0]);
  assert.equal(app.view().videoIndex, 2);
  click('lesson-video-next-lesson');
  const destination = window.location.hash;
  window.location.hash = '#/video/' + ids[0] + '/2';
  app.handleLocationChange({ state: { videoTime: 56 } });
  assert.equal(app.view().id, ids[0]);
  assert.equal(app.view().videoIndex, 2);
  window.location.hash = destination;
  app.handleLocationChange({ state: { videoTime: 0 } });
  assert.equal(app.view().id, ids[1]);
  assert.equal(app.view().videoIndex, 0);
  assert.equal(app.view().videoTime, 0);
});

test('transition captures active practice without finishing it', () => {
  const { app } = harness();
  const study = { name: 'flash', cards: [{ deckId: ids[0], card: decks[0].cards[0] }], i: 0, marks: { q0: 'unknown' }, opts: {}, ids: [ids[0]] };
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 2, videoStudy: study });
  app.openNextLesson();
  assert.equal(app.state().pausedSession.marks.q0, 'unknown');
  assert.equal(app.state().pausedSession.name, 'flash');
  assert.equal(app.writes(), 1);
  assert.equal(app.view().id, ids[1]);
});

test('empty current lessons avoid fake video counts and early activation does nothing', () => {
  const { app, elements } = harness();
  app.setView({ name: 'lesson-video', id: ids[0], videoIndex: 0 });
  app.openNextLesson();
  assert.equal(app.view().id, ids[0]);
  app.configure(starters, decks, catalog.filter(v => v.deckId !== ids[0]), false);
  app.render();
  assert.doesNotMatch(elements.app.innerHTML, /Video 1 of 0|data-index="-1"/);
  assert.match(elements.app.innerHTML, /Next lesson: Second &amp; next/);
});

test('real catalog transitions follow all twelve manifest lessons without changing recording order', () => {
  const parser = require('../js/parser.js');
  const curriculum = require('../decks/manifest.json').flatMap(file => parser.parseDecks(fs.readFileSync(require('node:path').join(__dirname, '../decks', file), 'utf8')).decks);
  const realDecks = curriculum.map(d => ({ ...d, id: slug(d.title), cards: [] }));
  const videos = require('../content/lesson-videos.json').videos;
  const { app } = harness();
  app.configure(curriculum, realDecks, videos, false);
  assert.equal(curriculum.length, 12);
  realDecks.forEach((d, index) => {
    const recordingIds = videos.filter(v => v.deckId === d.id).map(v => v.id);
    assert.ok(recordingIds.length > 0);
    const destination = app.nextLessonDestination(d.id);
    if (index === realDecks.length - 1) assert.equal(destination.kind, 'last');
    else {
      assert.equal(destination.kind, 'video');
      assert.equal(destination.id, realDecks[index + 1].id);
    }
    assert.deepEqual(videos.filter(v => v.deckId === d.id).map(v => v.id), recordingIds);
  });
});
