'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

function setupAppEnvironment(initialHash, savedState) {
  const elements = {
    app: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    modal: { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] },
    toast: { textContent: '', className: '' }
  };
  const eventListeners = {};
  const historyStack = [];

  const storageValues = new Map();
  if (savedState) {
    const raw = typeof savedState === 'string' ? savedState : JSON.stringify(savedState);
    storageValues.set('flashdecks.v1', raw);
  }

  const mockLocalStorage = {
    get length() { return storageValues.size; },
    key: (i) => Array.from(storageValues.keys())[i],
    getItem: (k) => storageValues.has(k) ? storageValues.get(k) : null,
    setItem: (k, v) => storageValues.set(k, String(v)),
    removeItem: (k) => storageValues.delete(k)
  };

  const win = {
    location: {
      protocol: 'https:',
      origin: 'https://study.example',
      pathname: '/',
      search: '',
      hash: initialHash || '',
      get href() {
        return this.origin + this.pathname + this.search + this.hash;
      },
      set href(val) {
        const u = new URL(val, this.origin);
        this.pathname = u.pathname;
        this.search = u.search;
        this.hash = u.hash;
      }
    },
    history: {
      state: null,
      pushState(state, title, url) {
        this.state = state;
        if (url) {
          const hashIdx = url.indexOf('#');
          win.location.hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
        }
        historyStack.push({ state, url });
      },
      replaceState(state, title, url) {
        this.state = state;
        if (url) {
          const hashIdx = url.indexOf('#');
          win.location.hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
        }
        if (historyStack.length) historyStack[historyStack.length - 1] = { state, url };
        else historyStack.push({ state, url });
      }
    },
    addEventListener(event, fn) {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(fn);
    },
    dispatchEvent(event, data) {
      (eventListeners[event] || []).forEach(fn => fn(data || {}));
    },
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    CCITranscripts: require('../js/transcripts.js'),
    MobileStudy: require('../js/mobile-study.js'),
    StudyLogic: require('../js/study.js'),
    CCIAccount: { create: () => ({ init: () => Promise.resolve({ configured: false }) }) },
    innerHeight: 844,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: () => {},
    scrollTo: () => {},
    localStorage: mockLocalStorage,
    indexedDB: null
  };

  const doc = {
    body: { appendChild: n => n, removeChild: n => n },
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    activeElement: { focus() {} },
    documentElement: { clientWidth: 390, setAttribute() {}, removeAttribute() {} },
    contains: () => true
  };

  const testWrapper = appSource.replace('  boot();', `
    window._test = {
      getV: () => V,
      setV: val => { V = val; },
      getS: () => S,
      setS: val => { S = val; },
      go: go,
      render: render,
      boot: boot,
      Routing: Routing
    };
  `);

  vm.runInNewContext(testWrapper, {
    window: win,
    document: doc,
    URL,
    Request,
    Response,
    Headers,
    console
  });

  return { win, doc, elements, historyStack, test: win._test, Routing: win.Routing };
}

function toPojo(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('viewToHash maps all application views to clean URL hashes', () => {
  const { Routing } = setupAppEnvironment();

  assert.equal(Routing.viewToHash({ name: 'home' }), '#/');
  assert.equal(Routing.viewToHash({ name: 'journey' }), '#/journey');
  assert.equal(Routing.viewToHash({ name: 'chapter', id: 'deck_1' }), '#/chapter/deck_1');
  assert.equal(Routing.viewToHash({ name: 'lesson-video', id: 'deck_1', videoIndex: 0 }), '#/video/deck_1/0');
  assert.equal(Routing.viewToHash({ name: 'lesson-video', id: 'deck_2', videoIndex: 3 }), '#/video/deck_2/3');
  assert.equal(Routing.viewToHash({ name: 'lesson-video', id: 'deck_2', videoIndex: 1, videoTime: 125.7 }), '#/video/deck_2/1?t=125');
  assert.equal(Routing.viewToHash({ name: 'practice' }), '#/practice');
  assert.equal(Routing.viewToHash({ name: 'progress' }), '#/progress');
  assert.equal(Routing.viewToHash({ name: 'settings' }), '#/settings');
  assert.equal(Routing.viewToHash({ name: 'devotional', id: 'dev_grace' }), '#/devotional/dev_grace');
  assert.equal(Routing.viewToHash({ name: 'streak' }), '#/streak');
  assert.equal(Routing.viewToHash({ name: 'picker', mode: 'quiz' }), '#/picker/quiz');
  assert.equal(Routing.viewToHash({ name: 'picker', mode: 'flash' }), '#/picker/flash');
  assert.equal(Routing.viewToHash({ name: 'edit', id: 'deck_3' }), '#/edit/deck_3');
  assert.equal(Routing.viewToHash({ name: 'import' }), '#/import');
  assert.equal(Routing.viewToHash({ name: 'onboarding' }), '#/onboarding');
  assert.equal(Routing.viewToHash({ name: 'quiz', id: 'deck_1' }), '#/study/quiz/deck_1');
  assert.equal(Routing.viewToHash({ name: 'quiz', ids: ['deck_2'] }), '#/study/quiz/deck_2');
  assert.equal(Routing.viewToHash({ name: 'flash', id: 'deck_1' }), '#/study/flash/deck_1');
  assert.equal(Routing.viewToHash({ name: 'exam' }), '#/study/exam');
  assert.equal(Routing.viewToHash({ name: 'results' }), '#/results');
});

test('hashToView parses canonical paths and aliases gracefully', () => {
  const { Routing } = setupAppEnvironment();

  assert.deepEqual(toPojo(Routing.hashToView('')), { name: 'home' });
  assert.deepEqual(toPojo(Routing.hashToView('#')), { name: 'home' });
  assert.deepEqual(toPojo(Routing.hashToView('#/')), { name: 'home' });
  assert.deepEqual(toPojo(Routing.hashToView('#/home')), { name: 'home' });
  assert.deepEqual(toPojo(Routing.hashToView('#/journey')), { name: 'journey' });

  // Chapters & Decks
  assert.deepEqual(toPojo(Routing.hashToView('#/chapter/deck_2')), { name: 'chapter', id: 'deck_2' });
  assert.deepEqual(toPojo(Routing.hashToView('#/deck/deck_3')), { name: 'chapter', id: 'deck_3' });

  // Videos
  assert.deepEqual(toPojo(Routing.hashToView('#/video/deck_1')), { name: 'lesson-video', id: 'deck_1', videoIndex: 0, videoTime: 0 });
  assert.deepEqual(toPojo(Routing.hashToView('#/video/deck_1/2')), { name: 'lesson-video', id: 'deck_1', videoIndex: 2, videoTime: 0 });
  assert.deepEqual(toPojo(Routing.hashToView('#/video/deck_1/2?t=45')), { name: 'lesson-video', id: 'deck_1', videoIndex: 2, videoTime: 45 });
  assert.deepEqual(toPojo(Routing.hashToView('#/lesson-video/deck_2/1?t=90')), { name: 'lesson-video', id: 'deck_2', videoIndex: 1, videoTime: 90 });

  // Navigation tabs and aliases
  assert.deepEqual(toPojo(Routing.hashToView('#/practice')), { name: 'practice' });
  assert.deepEqual(toPojo(Routing.hashToView('#/progress')), { name: 'progress' });
  assert.deepEqual(toPojo(Routing.hashToView('#/stats')), { name: 'progress' });
  assert.deepEqual(toPojo(Routing.hashToView('#/settings')), { name: 'settings' });
  assert.deepEqual(toPojo(Routing.hashToView('#/account')), { name: 'settings' });

  // Devotionals, streak, picker, etc.
  assert.deepEqual(toPojo(Routing.hashToView('#/devotional/dev_faith')), { name: 'devotional', id: 'dev_faith' });
  assert.deepEqual(toPojo(Routing.hashToView('#/streak')), { name: 'streak', returnTo: 'home' });
  assert.deepEqual(toPojo(Routing.hashToView('#/picker/quiz')), { name: 'picker', mode: 'quiz', from: 'home', pickerMulti: false, pickerMixed: false });

  // Study routes
  assert.deepEqual(toPojo(Routing.hashToView('#/study/quiz/deck_1')), { name: 'study', mode: 'quiz', id: 'deck_1' });
  assert.deepEqual(toPojo(Routing.hashToView('#/quiz/deck_1')), { name: 'study', mode: 'quiz', id: 'deck_1' });
  assert.deepEqual(toPojo(Routing.hashToView('#/study/flash/deck_2')), { name: 'study', mode: 'flash', id: 'deck_2' });
  assert.deepEqual(toPojo(Routing.hashToView('#/flash/deck_2')), { name: 'study', mode: 'flash', id: 'deck_2' });
  assert.deepEqual(toPojo(Routing.hashToView('#/study/exam')), { name: 'study', mode: 'exam' });
  assert.deepEqual(toPojo(Routing.hashToView('#/exam')), { name: 'study', mode: 'exam' });

  // Unknown / malformed fallback
  assert.deepEqual(toPojo(Routing.hashToView('#/some/nonexistent/route')), { name: 'home' });
});

test('boot preserves URL hash route on page reload', async () => {
  const { test, win } = setupAppEnvironment('#/chapter/deck_2', {
    seeded: true,
    dataVersion: 4,
    onboarding: { completed: true },
    decks: [{ id: 'deck_2', title: 'Chapter 2: Salvation', cards: [] }]
  });

  await test.boot();
  const v = test.getV();

  assert.equal(v.name, 'chapter');
  assert.equal(v.id, 'deck_2');
  assert.equal(win.location.hash, '#/chapter/deck_2');
});

test('boot preserves lesson video URL and video index on reload', async () => {
  const { test, win } = setupAppEnvironment('#/video/deck_1/1?t=60', {
    seeded: true,
    dataVersion: 4,
    onboarding: { completed: true },
    decks: [{ id: 'deck_1', title: 'Chapter 1: The Father', cards: [] }]
  });

  await test.boot();
  const v = test.getV();

  assert.equal(v.name, 'lesson-video');
  assert.equal(v.id, 'deck_1');
  assert.equal(v.videoIndex, 1);
  assert.equal(v.videoTime, 60);
});

test('boot immediately restores active study session at exact card without data loss', async () => {
  const sampleDeck = {
    id: 'deck_1',
    title: 'Chapter 1',
    cards: [
      { id: 'c1', question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 'A' },
      { id: 'c2', question: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 'B' },
      { id: 'c3', question: 'Q3', options: ['A', 'B', 'C', 'D'], answer: 'C' }
    ]
  };

  const pausedSession = {
    version: 1,
    name: 'quiz',
    cards: [
      { deckId: 'deck_1', cardId: 'c1', optionOrder: [0, 1, 2, 3] },
      { deckId: 'deck_1', cardId: 'c2', optionOrder: [0, 1, 2, 3] },
      { deckId: 'deck_1', cardId: 'c3', optionOrder: [0, 1, 2, 3] }
    ],
    i: 2, // User is currently on question 3
    flipped: false,
    picked: null,
    score: 2,
    answers: [
      { deckId: 'deck_1', cardId: 'c1', ok: true, selected: 'A' },
      { deckId: 'deck_1', cardId: 'c2', ok: true, selected: 'B' }
    ],
    marks: {},
    opts: { limit: 3, shuf: false, unk: false },
    ids: ['deck_1'],
    remaining: null,
    returnToVideo: null
  };

  const { test, win } = setupAppEnvironment('#/study/quiz/deck_1', {
    seeded: true,
    dataVersion: 4,
    onboarding: { completed: true },
    decks: [sampleDeck],
    pausedSession: pausedSession
  });

  await test.boot();
  const v = test.getV();

  // Verifying session was restored to the exact state
  assert.equal(v.name, 'quiz');
  assert.equal(v.i, 2, 'Question index was preserved at 2 (card 3)');
  assert.equal(v.score, 2, 'Score was preserved without reset');
  assert.equal(v.answers.length, 2, 'Prior submitted answers were preserved');
  assert.equal(v.cards.length, 3, 'Full deck cards preserved');
  assert.equal(win.location.hash, '#/study/quiz/deck_1');
});

test('boot falls back gracefully to deck when study route has no paused session', async () => {
  const { test, win } = setupAppEnvironment('#/study/quiz/deck_1', {
    seeded: true,
    dataVersion: 4,
    onboarding: { completed: true },
    decks: [{ id: 'deck_1', title: 'Chapter 1: The Father', cards: [] }],
    pausedSession: null
  });

  await test.boot();
  const v = test.getV();

  assert.equal(v.name, 'chapter');
  assert.equal(v.id, 'deck_1');
  assert.equal(win.location.hash, '#/chapter/deck_1');
});

test('go updates window.location.hash and creates history entries', () => {
  const { test, win, historyStack } = setupAppEnvironment('#/');

  test.go({ name: 'journey' });
  assert.equal(win.location.hash, '#/journey');

  test.go({ name: 'chapter', id: 'deck_2' });
  assert.equal(win.location.hash, '#/chapter/deck_2');

  test.go({ name: 'practice' });
  assert.equal(win.location.hash, '#/practice');

  assert.ok(historyStack.length >= 3);
});

test('popstate updates V and renders target view', () => {
  const { test, win } = setupAppEnvironment('#/journey', {
    seeded: true,
    dataVersion: 4,
    onboarding: { completed: true },
    decks: [{ id: 'deck_3', title: 'Chapter 3', cards: [] }]
  });

  // Navigate to chapter 3
  test.go({ name: 'chapter', id: 'deck_3' });
  assert.equal(test.getV().name, 'chapter');

  // Simulate user pressing browser back to journey
  win.location.hash = '#/journey';
  win.dispatchEvent('popstate', { state: { name: 'journey' } });

  assert.equal(test.getV().name, 'journey');
});
