const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const MobileStudy = require('../js/mobile-study.js');

const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const cards = ['q1', 'q2', 'q3'].map(id => ({ deckId: 'chapter', card: { id, question: id, answer: 'A', options: ['A', 'B', 'C', 'D'] } }));
const decks = [{ id: 'chapter', title: 'Section 1 Test chapter', cards: cards.map(item => item.card) }];
const json = value => JSON.parse(JSON.stringify(value));
function session(mode = 'quiz', opts = {}) {
  const options = { videoId: 'video-one', studySource: 'video', shuf: true, ...opts };
  options.sessionScopeKey = MobileStudy.sessionScopeKey(mode, cards, options, ['chapter']);
  return { name: mode, cards: cards.map(item => ({ ...item, optionOrder: [2, 0, 3, 1] })), i: 1, picked: null, score: 1,
    answers: [{ item: cards[0], ok: true, selected: 'A' }], marks: {}, opts: options, ids: ['chapter'] };
}
function appHarness() {
  const handlers = {};
  let focus = 0;
  const button = { focus() { focus++; }, disabled: false };
  const elements = Object.fromEntries(['app', 'modal', 'toast'].map(id => [id, { innerHTML: '', querySelector: () => button, querySelectorAll: () => [button] }]));
  const window = {
    DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'), MobileStudy,
    StudyLogic: require('../js/study.js'), CCITranscripts: require('../js/transcripts.js'),
    localStorage: { getItem: () => null, setItem() {} },
    location: { protocol: 'https:', origin: 'https://test.invalid', href: 'https://test.invalid/app/' }
  };
  const document = { getElementById: id => elements[id], querySelector: () => null, contains: () => true, activeElement: button,
    addEventListener(name, fn) { (handlers[name] ||= []).push(fn); } };
  const wrapped = source.replace('  boot();', `
    var recorded = [], studied = 0;
    render = function () {};
    renderVideoStudyModal = function () { modal.innerHTML = 'video-study-modal'; };
    triggerHaptic = function () {};
    trackStudied = function () { studied++; };
    scheduleCloudProgressSync = function () {};
    syncHashWithView = function () {};
    save = function () { recorded.push(JSON.parse(JSON.stringify(S))); return Promise.resolve(); };
    seed = function () {};
    applyDataMigrations = function () { return Promise.resolve(); };
    window.testApp = {
      state: () => S, view: () => V, setView: v => { V = v; },
      begin, startVideoStudyModal, resumeStudySession, closeModal, confirmSessionStart, saveActiveSession,
      step, pick, stepVideoStudy, pickVideoStudy, sessionScopeLabel, startDailyStudy, startDue, startWeakSpots, startChallenge,
      pending: () => ({ start: pendingSessionStart, resume: pendingSessionResume }),
      setOwner: (requested, active) => { requestedStorageOwnerId = requested; activeStorageOwnerId = active; },
      switchStorageOwner, setAdapter: value => { storageAdapter = value; },
      saved: () => recorded, studied: () => studied,
      setVideos: value => { LESSON_VIDEOS = value; },
      flash: views.flash, results: views.results, home: views.home, settings: views.settings, chapter: views.chapter, rememberLessonVideoVisit, syncVideoStudyResume
    };
  `);
  vm.runInNewContext(wrapped, { window, document, URL, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} });
  const app = window.testApp;
  app.state().decks = json(decks);
  const click = (act, data = {}) => {
    const target = { dataset: { act, v: 'known', ...data }, matches: () => false, closest: selector => selector === '[data-act]' ? target : null };
    handlers.click.forEach(fn => fn({ target }));
  };
  const key = (value, shiftKey = false) => {
    const event = { key: value, shiftKey, target: { tagName: 'BUTTON', closest: () => null }, preventDefault() { this.defaultPrevented = true; } };
    handlers.keydown.forEach(fn => fn(event));
    return event;
  };
  return { app, elements, click, key, focus: () => focus, document };
}

test('chapter Current selection follows a recording visit without claiming watched progress', () => {
  const { app } = appHarness();
  const videos = [{ id: 'video-one', deckId: 'chapter', title: 'First' }, { id: 'video-two', deckId: 'chapter', title: 'Second' }];
  app.setVideos(videos);
  app.setView({ name: 'chapter', id: 'chapter' });
  app.state().pausedSession = MobileStudy.snapshot(session('flash'));
  const saved = json(app.state().pausedSession);
  app.rememberLessonVideoVisit('chapter', videos[1], 0);
  const markup = app.chapter();
  assert.match(markup, /data-index="1" aria-current="step" aria-label="Second, Current selection"/);
  assert.doesNotMatch(markup, /data-index="0" aria-current/);
  assert.deepEqual(json(app.state().pausedSession), saved);
  assert.deepEqual(json(app.state().watchHistory), {});
});

test('Home continuation opens the saved recording position without replacing unfinished practice or autoplaying', () => {
  const { app, click } = appHarness();
  const saved = MobileStudy.snapshot(session('flash'));
  app.state().pausedSession = saved;
  app.state().watchHistory = { 'video-one': { deckId: 'chapter', time: 35, duration: 100, updatedAt: Date.now() } };
  app.setVideos([{ id: 'video-one', deckId: 'chapter', title: 'Recording & context', videoUrl: '/api/videos/video-one' }]);
  const markup = app.home();
  assert.match(markup, /Continue flashcards/);
  assert.match(markup, /Continue watching: Recording &amp; context · 0:35/);
  assert.match(markup, /data-act="resume-study"/);
  click('continue-watching', { id: 'chapter', index: '0', time: '35' });
  assert.equal(app.view().name, 'lesson-video');
  assert.equal(app.view().videoTime, 35);
  assert.equal(app.view().autoPlayVideo, undefined);
  assert.equal(app.state().pausedSession, saved);
});

test('session identity includes video, question pool, source, mode, chapters and settings; ignores randomized ordering', () => {
  const opts = session().opts;
  const key = MobileStudy.sessionScopeKey('quiz', cards, opts, ['chapter']);
  assert.equal(key, MobileStudy.sessionScopeKey('quiz', cards.slice().reverse(), opts, ['chapter']));
  assert.notEqual(MobileStudy.sessionScopeKey('flash', cards, { shuf: false }, ['chapter']), MobileStudy.sessionScopeKey('flash', cards.slice().reverse(), { shuf: false }, ['chapter']));
  for (const change of [{ videoId: 'video-two' }, { videoId: null, studySource: 'chapter' }, { limit: 2 }, { shuf: false }, { unk: true }, { studySource: 'daily' }, { duration: 60000 }, { saveBest: false }]) {
    assert.notEqual(key, MobileStudy.sessionScopeKey('quiz', cards, { ...opts, ...change }, ['chapter']));
  }
  assert.notEqual(key, MobileStudy.sessionScopeKey('flash', cards, opts, ['chapter']));
  assert.notEqual(key, MobileStudy.sessionScopeKey('quiz', cards.slice(1), opts, ['chapter']));
  assert.notEqual(key, MobileStudy.sessionScopeKey('quiz', cards, opts, ['other']));
});

test('new study launches without a confirmation when there is no unfinished session', () => {
  const { app, elements } = appHarness();
  app.begin('quiz', cards, {}, ['chapter']);
  assert.equal(app.view().name, 'quiz');
  assert.equal(app.state().pausedSession.cards.length, 3);
  assert.equal(elements.modal.innerHTML, '');
  assert.equal(app.pending().start, null);
});

for (const video of [false, true]) test(`${video ? 'video' : 'chapter'} start leaves unfinished work untouched until replacement is confirmed`, () => {
  const { app, elements, click } = appHarness();
  const saved = MobileStudy.snapshot(session());
  app.state().pausedSession = saved;
  app.state().progress = { chapter: { cards: { q1: { attempts: 1 } }, best: 80 } };
  const progress = json(app.state().progress);
  if (video) {
    app.setView({ name: 'lesson-video', id: 'chapter' });
    app.startVideoStudyModal('flash', cards, { videoId: 'video-two' }, ['chapter'], { deckId: 'chapter', videoIndex: 1, currentTime: 10 });
  } else app.begin('flash', cards, { videoId: null, studySource: 'chapter' }, ['chapter']);
  assert.equal(app.state().pausedSession, saved);
  assert.equal(app.saved().length, 0);
  assert.match(elements.modal.innerHTML, /Saved session[\s\S]*Requested session/);
  assert.match(elements.modal.innerHTML, /Recorded ratings and learning progress stay saved/);
  click('replace-unfinished-session');
  const next = video ? app.view().videoStudy : app.view();
  assert.equal(next.name, 'flash');
  assert.equal(next.i, 0);
  assert.equal(next.answers.length, 0);
  assert.deepEqual(json(app.state().progress), progress);
  assert.equal(app.state().pausedSession.name, 'flash');
});

test('matching requests offer resume and restore the exact position, order, answer and score', () => {
  const { app, elements, click, focus } = appHarness();
  const existing = session();
  existing.i = 0;
  existing.picked = 1;
  app.state().pausedSession = MobileStudy.snapshot(existing);
  app.begin(existing.name, cards, existing.opts, existing.ids);
  assert.match(elements.modal.innerHTML, /Resume or start fresh/);
  assert.ok(focus() > 0);
  click('resume-unfinished-session');
  assert.equal(app.view().i, 0);
  assert.equal(app.view().picked, 1);
  assert.equal(app.view().score, 1);
  assert.equal(app.view().answers.length, 1);
  assert.deepEqual(json(app.view().cards[0].optionOrder), [2, 0, 3, 1]);
  app.pick(1);
  assert.equal(app.studied(), 0);
});

test('legacy version-one snapshots survive reload and are never guessed to match a new request', () => {
  const { app, elements, click } = appHarness();
  const legacy = MobileStudy.snapshot(session('flash'));
  delete legacy.opts.sessionScopeKey;
  delete legacy.opts.videoId;
  legacy.flipped = true;
  legacy.marks = { q1: 'known' };
  app.state().pausedSession = json(legacy);
  app.begin('flash', cards, {}, ['chapter']);
  assert.match(elements.modal.innerHTML, /Earlier saved session/);
  assert.doesNotMatch(elements.modal.innerHTML, /Resume or start fresh/);
  click('resume-unfinished-session');
  assert.equal(app.view().i, 1);
  assert.equal(app.view().flipped, true);
  assert.equal(app.view().marks.q1, 'known');
  assert.equal(app.state().pausedSession.version, 1);
});

test('cancel button, backdrop and Escape preserve saved work and restore focus', () => {
  for (const escape of [false, true]) {
    const { app, click, key, focus, elements } = appHarness();
    const saved = MobileStudy.snapshot(session());
    app.state().pausedSession = saved;
    app.begin('flash', cards, {}, ['chapter']);
    if (escape) key('Escape'); else click('close');
    assert.equal(app.state().pausedSession, saved);
    assert.equal(app.view().name, 'home');
    assert.equal(app.pending().start, null);
    assert.equal(app.pending().resume, null);
    assert.equal(elements.modal.innerHTML, '');
    assert.ok(focus() >= 2);
    assert.equal(app.saved().length, 0);
  }
});

test('cancelling a switch from an active video session restores its overlay without hidden keyboard changes', () => {
  const { app, key, elements } = appHarness();
  const existing = session('flash');
  app.setView({ name: 'lesson-video', id: 'chapter', videoStudy: existing });
  app.state().pausedSession = MobileStudy.snapshot(existing);
  app.begin('quiz', cards, {}, ['chapter']);
  key('ArrowRight');
  assert.equal(existing.i, 1);
  key('Escape');
  assert.equal(app.view().videoStudy, existing);
  assert.equal(elements.modal.innerHTML, 'video-study-modal');
  assert.equal(existing.i, 1);
});

test('video resume uses the saved recording and media position, not the currently viewed chapter', () => {
  const { app, elements } = appHarness();
  elements['lesson-video-player'] = { paused: false, pause() { this.paused = true; } };
  const existing = session();
  existing.returnToVideo = { deckId: 'chapter', videoIndex: 4, currentTime: 125.5 };
  app.state().pausedSession = json(MobileStudy.snapshot(existing));
  app.setView({ name: 'lesson-video', id: 'different', videoIndex: 0 });
  app.resumeStudySession();
  assert.equal(app.view().id, 'chapter');
  assert.equal(app.view().videoIndex, 4);
  assert.equal(app.view().videoTime, 125.5);
  assert.equal(app.view().videoStudy.i, 1);
  assert.equal(app.view().videoStudy.score, 1);
  assert.equal(app.view().videoStudy.opts.videoId, 'video-one');
  assert.equal(elements['lesson-video-player'].paused, true);
});

test('revisiting or restoring answered quiz cards cannot record another attempt or increment score', () => {
  for (const video of [false, true]) {
    const { app } = appHarness();
    const existing = session();
    if (video) app.setView({ name: 'lesson-video', videoStudy: existing }); else app.setView(existing);
    if (video) { app.stepVideoStudy(-1); app.pickVideoStudy(1); } else { app.step(-1); app.pick(1); }
    assert.equal(existing.picked, 1);
    assert.equal(existing.score, 1);
    assert.equal(existing.answers.length, 1);
    assert.equal(app.studied(), 0);
    const restored = MobileStudy.restore({ ...MobileStudy.snapshot(existing), picked: null }, decks);
    assert.equal(restored.picked, 1, 'old snapshots infer answered state from submitted answers');
  }
});

test('restored flashcard ratings are shown and do not count twice when revisited', () => {
  for (const video of [false, true]) {
    const { app, click } = appHarness();
    const existing = session('flash');
    existing.i = 0;
    existing.flipped = true;
    existing.marks = { q1: 'unknown' };
    if (video) app.setView({ name: 'lesson-video', videoStudy: existing }); else app.setView(existing);
    assert.match(app.flash(existing), /Rating saved: Still learning/);
    assert.doesNotMatch(app.flash(existing), /data-act="mark"/);
    click('mark');
    assert.equal(existing.marks.q1, 'unknown');
    assert.equal(existing.i, 1);
    assert.equal(app.studied(), 0);
  }
});

test('pending choices cannot write into another account, and launches wait for profile loading', () => {
  const { app, click, elements } = appHarness();
  const saved = MobileStudy.snapshot(session());
  app.state().pausedSession = saved;
  app.begin('flash', cards, {}, ['chapter']);
  app.setOwner('new-account', null);
  click('replace-unfinished-session');
  assert.equal(app.state().pausedSession, saved);
  assert.equal(app.saved().length, 0);
  app.begin('quiz', cards, {}, ['chapter']);
  app.resumeStudySession();
  assert.equal(app.view().name, 'home');
  assert.match(elements.toast.textContent, /profile is loading/);
});

test('changing local profiles saves the active session to its owner and clears active state', async () => {
  const { app } = appHarness();
  const accountSaved = MobileStudy.snapshot(session('flash'));
  const profile = { ...json(app.state()), seeded: false, pausedSession: accountSaved };
  app.setAdapter({ load: async () => ({ ok: true, backend: 'test', raw: JSON.stringify(profile) }) });
  app.setView(session());
  await app.switchStorageOwner('account-one');
  assert.equal(app.saved()[0].pausedSession.name, 'quiz', 'guest session is captured before loading account data');
  assert.equal(app.view().name, 'home');
  assert.equal(app.state().pausedSession.name, 'flash', 'account session stays separate');
  app.resumeStudySession();
  assert.equal(app.view().name, 'flash');
});

test('scope labels expose the exact video and changed settings with escaped dialog content', () => {
  const { app, elements } = appHarness();
  app.setVideos([{ id: 'video-one', title: '<First recording>' }, { id: 'video-two', title: 'Second recording' }]);
  app.state().pausedSession = MobileStudy.snapshot(session());
  app.begin('quiz', cards, { videoId: 'video-two', limit: 2, unk: true, shuf: true }, ['chapter']);
  assert.match(elements.modal.innerHTML, /&lt;First recording&gt;/);
  assert.match(elements.modal.innerHTML, /Second recording/);
  assert.match(elements.modal.innerHTML, /2 questions · Skip mastered questions · Shuffled/);
  assert.match(elements.modal.innerHTML, /role="dialog" aria-modal="true" aria-labelledby="session-switch-title"/);
});

for (const method of ['startDailyStudy', 'startDue', 'startWeakSpots', 'startChallenge']) test(`${method} protects existing unfinished work through the shared start guard`, () => {
  const { app, elements, click } = appHarness();
  app.state().progress = { chapter: { cards: { q1: { attempts: 2, misses: 1, box: 1, dueAt: 0 } } } };
  const saved = MobileStudy.snapshot(session());
  app.state().pausedSession = saved;
  app[method]();
  assert.match(elements.modal.innerHTML, /Saved session[\s\S]*Requested session/);
  assert.equal(app.state().pausedSession, saved);
  click('close');
  assert.equal(app.view().name, 'home');
  assert.equal(app.saved().length, 0);
});

for (const act of ['resume-study', 'resume-paused-study', 'resume-video-study']) test(`${act} restores submitted answers and position rather than initializing a new session`, () => {
  const { app, click } = appHarness();
  app.state().pausedSession = json(MobileStudy.snapshot(session()));
  click(act);
  assert.equal(app.view().name, 'quiz');
  assert.equal(app.view().i, 1);
  assert.equal(app.view().answers.length, 1);
  assert.equal(app.view().score, 1);
});

test('new answers and ratings after resume count once while previous work remains recorded', () => {
  const { app, click } = appHarness();
  app.state().pausedSession = json(MobileStudy.snapshot(session()));
  app.resumeStudySession();
  app.pick(1);
  app.pick(1);
  assert.equal(app.view().score, 2);
  assert.equal(app.view().answers.length, 2);
  assert.equal(app.studied(), 1);
  assert.equal(app.state().progress.chapter.cards.q2.attempts, 1);
  const flash = session('flash');
  flash.answers = [];
  flash.score = 0;
  app.state().pausedSession = json(MobileStudy.snapshot(flash));
  app.resumeStudySession();
  click('mark');
  assert.equal(app.studied(), 2);
  assert.equal(app.view().marks.q2, 'known');
  app.step(-1);
  click('mark');
  assert.equal(app.studied(), 2);
  assert.equal(app.state().progress.chapter.cards.q2.attempts, 2);
});

test('a refreshed snapshot retains its scope key and exam configuration without a storage schema change', () => {
  const original = session('exam', { duration: 180000, videoId: null, studySource: 'chapter', limit: 2 });
  original.remaining = 98000;
  const first = json(MobileStudy.snapshot(original));
  const restored = MobileStudy.restore(first, decks);
  const second = json(MobileStudy.snapshot(restored));
  assert.equal(second.version, 1);
  assert.equal(second.opts.sessionScopeKey, original.opts.sessionScopeKey);
  assert.equal(second.remaining, 98000);
  assert.equal(second.i, original.i);
  assert.equal(second.answers.length, original.answers.length);
  assert.equal(second.opts.duration, 180000);
});

test('cancelling a request leaves saved study preferences unchanged', () => {
  const { app, click } = appHarness();
  app.state().pausedSession = MobileStudy.snapshot(session());
  app.begin('flash', cards, { studySource: 'chapter', shuf: true }, ['chapter']);
  assert.equal(app.state().settings.shuffle, false);
  click('close');
  assert.equal(app.state().settings.shuffle, false);
});

test('profile changes close a pending video switch instead of leaving the old overlay visible', async () => {
  const { app, elements } = appHarness();
  const profile = { ...json(app.state()), seeded: false, pausedSession: null };
  app.setAdapter({ load: async () => ({ ok: true, backend: 'test', raw: JSON.stringify(profile) }) });
  app.setView({ name: 'lesson-video', id: 'chapter', videoStudy: session('flash') });
  app.begin('quiz', cards, {}, ['chapter']);
  await app.switchStorageOwner('another-owner');
  assert.equal(elements.modal.innerHTML, '');
  assert.equal(app.view().name, 'home');
  assert.equal(app.state().pausedSession, null);
});

test('completed video results do not become a new unfinished snapshot during lifecycle saving', async () => {
  const { app } = appHarness();
  app.setView({ name: 'lesson-video', videoStudy: { ...session(), results: { kind: 'quiz' } } });
  await app.saveActiveSession();
  assert.equal(app.state().pausedSession, null);
  assert.equal(app.saved().length, 0);
});

test('mixed-practice entry labels round-trip without changing session identity or legacy origins', () => {
  const { app } = appHarness();
  const mixed = session('quiz', { studySource: 'challenge', entryPoint: 'mixed-practice' });
  const originalKey = mixed.opts.sessionScopeKey;
  assert.equal(originalKey, MobileStudy.sessionScopeKey('quiz', mixed.cards, { ...mixed.opts, entryPoint: 'challenge' }, mixed.ids));
  const restored = MobileStudy.restore(json(MobileStudy.snapshot(mixed)), decks);
  assert.equal(restored.opts.sessionScopeKey, originalKey);
  assert.match(app.sessionScopeLabel(restored), /Quiz · Mixed practice/);
  assert.equal(restored.i, mixed.i);
  assert.equal(restored.answers.length, mixed.answers.length);
  const legacy = session('quiz', { studySource: 'challenge' });
  const before = json(legacy);
  assert.match(app.sessionScopeLabel(legacy), /Quiz · Challenge/);
  assert.doesNotMatch(app.sessionScopeLabel(legacy), /Mixed practice/);
  assert.deepEqual(json(legacy), before);
});

test('Home offers direct lesson entry and a separate Details button', () => {
  const { app } = appHarness();
  const html = app.home();
  const articles = Array.from(html.matchAll(/<article class="desktop-lesson-card[\s\S]*?<\/article>/g), m => m[0]);
  assert.ok(articles.length);
  for (const article of articles) {
    assert.match(article, /<button[^>]+data-act="open-chapter"[^>]+aria-label="Open lesson /);
    assert.match(article, /<button[^>]+data-act="lesson-detail-open"[^>]+aria-label="Details for /);
    assert.equal((article.match(/<button /g) || []).length, 2);
  }
});

test('video results prioritize missed-answer review while retaining return and retake', () => {
  const { app } = appHarness();
  const result = { kind: 'quiz', score: 0, total: 3, all: cards, missed: cards, opts: {}, ids: ['chapter'], returnToVideo: { deckId: 'chapter', videoIndex: 0 } };
  app.setView({ name: 'lesson-video', videoStudy: { results: result } });
  app.state().progress.chapter = { cards: {}, best: null };
  const before = json(app.state());
  const footer = app.results(result).split('result-actions completion-actions-bar')[1];
  assert.match(footer, /data-act="results-return-video">Return to video/);
  assert.doesNotMatch(footer, /data-act="results-continue"/);
  assert.match(footer, /data-act="review">Review 3 missed questions/);
  assert.match(footer, /data-act="again">Retake quiz/);
  assert.match(footer, /class="btn primary full" data-act="review"/);
  assert.doesNotMatch(footer, /class="btn primary full video-study-return-btn"/);
  const perfectFooter = app.results({ ...result, missed: [], score: 3 }).split('result-actions completion-actions-bar')[1];
  assert.match(perfectFooter, /class="btn primary full video-study-return-btn"/);
  app.results(result);
  assert.deepEqual(json(app.state()), before, 'rendering or returning must not score another attempt');
});

test('Home curates three unmastered lessons while Journey keeps the full catalogue', () => {
  const { app } = appHarness();
  app.state().decks = Array.from({ length: 5 }, (_, i) => ({ id: 'lesson-' + i, title: 'Section ' + (i + 1) + ' Topic ' + i, cards: [{ id: 'q-' + i, question: 'Question', answer: 'A', options: ['A', 'B', 'C', 'D'] }] }));
  app.state().progress['lesson-0'] = { cards: { 'q-0': { box: 2 } } };
  const html = app.home();
  const mobile = html.split('mobile-home-content')[1].split('desktop-home-content')[0];
  assert.equal((mobile.match(/class="desktop-lesson-card /g) || []).length, 3);
  assert.match(mobile, /data-tab="journey">View all lessons/);
  assert.doesNotMatch(mobile, /data-id="lesson-0"/);
  assert.match(mobile, /data-id="lesson-1"/);
  assert.equal(app.state().decks.length, 5, 'curation must not remove catalogue data');
});

test('exam results offer the same Home destination before and after answer review', () => {
  const { app } = appHarness();
  const html = app.results({ kind: 'exam', score: 1, total: 1, all: cards.slice(0, 1), review: [{ item: cards[0], selected: 'A', ok: true }] });
  assert.match(html, /exam-summary-return[\s\S]*<h1>Exam results<\/h1>/);
  assert.equal((html.match(/data-act="home">Back to study<\/button>/g) || []).length, 2);
  assert.ok(html.indexOf('Back to study') < html.indexOf('Answer review'));
  assert.ok(html.lastIndexOf('Back to study') > html.indexOf('Answer review'));
});

test('Settings toggles expose their setting name and current state', () => {
  const { app } = appHarness();
  for (const enabled of [false, true]) {
    app.state().settings.shuffle = enabled;
    const html = app.settings();
    assert.match(html, new RegExp('data-act="toggle-shuffle" aria-label="Shuffle flashcards: ' + (enabled ? 'On' : 'Off') + '" aria-pressed="' + enabled + '"'));
    assert.match(html, /data-act="toggle-streak" aria-label="Show daily streak: (On|Off)" aria-pressed="(true|false)"/);
    assert.match(html, /data-act="toggle-draft-devotionals" aria-label="Show draft devotionals: (On|Off)" aria-pressed="(true|false)"/);
  }
});

test('closing video practice refreshes only its Resume control, preserving player and progress', () => {
  const { app, elements } = appHarness();
  const saved = MobileStudy.snapshot(session('flash'));
  app.state().pausedSession = saved;
  const before = json(app.state());
  let removed = 0, markup = '';
  const actions = {
    querySelector(selector) { assert.equal(selector, '.resume-study-btn'); return { remove() { removed++; } }; },
    insertAdjacentHTML(where, html) { assert.equal(where, 'afterbegin'); markup = html; }
  };
  elements.app.querySelector = selector => {
    assert.equal(selector, '.watch-saved-session', 'only refresh the saved-session disclosure, never reconstruct the player');
    return actions;
  };
  app.syncVideoStudyResume();
  assert.equal(removed, 1);
  assert.match(markup, /aria-label="Resume study:[^"]* · 2 of 3">Resume study/);
  assert.deepEqual(json(app.state()), before);
  app.state().pausedSession = null;
  app.syncVideoStudyResume();
  assert.equal(removed, 2);
  assert.equal(markup, '');
});


test('refreshing Resume retains focus or returns it to navigation when saved work is removed', () => {
  const { app, elements, document } = appHarness();
  const practice = { focus() { document.activeElement = practice; } };
  const makeResume = () => ({ remove() { current = null; document.activeElement = null; }, focus() { document.activeElement = current; } });
  let current = makeResume();
  document.activeElement = current;
  elements.app.querySelector = selector => selector === '.study-page-navigation > summary' ? practice : ({
    querySelector(selector) { return selector === '.resume-study-btn' ? current : practice; },
    insertAdjacentHTML(where, html) { current = html ? makeResume() : null; }
  });
  app.state().pausedSession = MobileStudy.snapshot(session('flash'));
  app.syncVideoStudyResume();
  assert.equal(document.activeElement, current);
  app.state().pausedSession = null;
  app.syncVideoStudyResume();
  assert.equal(document.activeElement, practice);
});
