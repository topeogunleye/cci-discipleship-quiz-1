'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const parser = require('../js/parser.js');
const StudyLogic = require('../js/study.js');
const StudyStorage = require('../js/storage.js');
const MobileStudy = require('../js/mobile-study.js');

test('bundle optimization keeps dist/index.html under 800 KB and generates external starter-decks.js', () => {
  const distHtml = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(distHtml.length < 800000, `dist/index.html size (${distHtml.length} bytes) must be under 800 KB to prevent mobile payload bloat`);
  assert.match(distHtml, /<script type="application\/json" id="starter-fallback">""<\/script>/, 'dist/index.html must not embed 1 MB monolithic starter text');

  const starterDecksPath = path.join(root, 'dist/decks/starter-decks.js');
  assert.ok(fs.existsSync(starterDecksPath), 'dist/decks/starter-decks.js must exist for fallback/file: mode');
  const starterDecksContent = fs.readFileSync(starterDecksPath, 'utf8');
  assert.match(starterDecksContent, /^window\.CCI_STARTER_DECKS = "DECK:/);
});

test('service worker precaches canonical decks without downloading the duplicate starter bundle', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.doesNotMatch(sw, /'decks\/starter-decks\.js'/);
  assert.match(sw, /'decks\/manifest\.json'/);
});

test('app dynamically loads starter-decks.js when in file: mode without embedded starter text', async () => {
  const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const starterText = fs.readFileSync(path.join(root, 'dist/decks/starter-decks.js'), 'utf8');

  let scriptLoaded = false;
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: '""' }
  };
  const windowObj = {
    DeckParser: parser,
    StudyLogic,
    StudyStorage,
    MobileStudy,
    location: { protocol: 'file:' },
    scrollTo: () => {}
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: () => {},
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} },
    createElement: tag => ({ tagName: tag, src: '', onload: null, onerror: null }),
    head: {
      appendChild: s => {
        if (s.src === 'decks/starter-decks.js') {
          scriptLoaded = true;
          const ctx = vm.createContext({ window: windowObj });
          vm.runInContext(starterText, ctx);
          if (typeof s.onload === 'function') process.nextTick(s.onload);
        }
      }
    }
  };
  let stored = null;
  const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
  vm.runInNewContext(testAppSource, {
    window: windowObj,
    document,
    localStorage: { getItem: () => null, setItem: (_, value) => { stored = value; } },
    setTimeout: (fn, ms) => setTimeout(fn, ms)
  });
  await windowObj.testAppReady;
  assert.ok(scriptLoaded, 'app should dynamically load decks/starter-decks.js in file: mode');
  assert.ok(stored, 'app should initialize study state with starter decks');
  const state = JSON.parse(stored);
  assert.ok(state.decks.length >= 12, 'should have parsed all canonical decks');
});
