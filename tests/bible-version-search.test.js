const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

function setupTestEnvironment(customCatalog) {
  const listeners = {};
  const elements = {};
  const window = {
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    MobileStudy: require('../js/mobile-study.js'),
    CCIProgressSync: require('../js/progress-sync.js'),
    CCIAccount: require('../js/account.js'),
    CCITranscripts: require('../js/transcripts.js'),
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    location: { protocol: 'https:', origin: 'https://study.example' }
  };
  const document = {
    getElementById: id => elements[id],
    querySelectorAll: () => [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); }
  };

  const modifiedSource = appSource.replace('  boot();', `
    save = function () {}; toast = function () {}; positionBiblePreview = function () {};
    bibleVersions = ${JSON.stringify(customCatalog || [
      { id: '1588', abbreviation: 'AMP', title: 'Amplified Bible' },
      { id: '12', abbreviation: 'ASV', title: 'American Standard Version' },
      { id: '111', abbreviation: 'NIV11', title: 'New International Version 2011' }
    ])};
    window.testApi = {
      state: S,
      bibleVersionOptions: bibleVersionOptions,
      bibleVersionPicker: bibleVersionPicker,
      updateBibleCatalogStatus: updateBibleCatalogStatus,
      updateBiblePickerSelect: updateBiblePickerSelect,
      loadBibleVersions: loadBibleVersions
    };
  `);

  vm.runInNewContext(modifiedSource, {
    window,
    document,
    URL,
    AbortController,
    Event: class { constructor(type, opts) { this.type = type; Object.assign(this, opts); } },
    fetch: async () => new Response(JSON.stringify({ versions: [] }))
  });

  return { testApi: window.testApi, listeners };
}

test('bibleVersionOptions returns all translations when query is empty', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', '');
  assert.match(html, /value="ASV"[^>]*selected/);
  assert.match(html, /value="ESV"/);
  assert.match(html, /value="1588">AMP — Amplified Bible/);
  assert.match(html, /value="111">NIV11 — New International Version 2011/);
});

test('bibleVersionOptions filters out non-matching selected default when searching for AMP', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', 'amp');
  assert.match(html, /value="1588"[^>]*selected[^>]*>AMP — Amplified Bible/);
  assert.doesNotMatch(html, /value="ASV"/, 'ASV should be filtered out when query is "amp"');
  assert.doesNotMatch(html, /value="ESV"/);
  assert.doesNotMatch(html, /value="111"/);
});

test('bibleVersionOptions matches partial titles case-insensitively', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', 'crossway');
  assert.match(html, /value="ESV"[^>]*selected/);
  assert.doesNotMatch(html, /value="1588"/);
});

test('bibleVersionOptions returns disabled empty placeholder when no translations match', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', 'xyz999');
  assert.match(html, /<option value="ASV" disabled selected>No translations match "xyz999"<\/option>/);
});

test('updateBibleCatalogStatus reports exact match counts and empty state', () => {
  const { testApi } = setupTestEnvironment();
  const statusEl = { textContent: '' };
  const picker = { querySelector: sel => sel === '.bible-catalog-status' ? statusEl : null };

  testApi.updateBibleCatalogStatus(picker, '');
  assert.match(statusEl.textContent, /Translations available/);

  testApi.updateBibleCatalogStatus(picker, 'amp');
  assert.equal(statusEl.textContent, '1 translation found.');

  testApi.updateBibleCatalogStatus(picker, 'version');
  assert.match(statusEl.textContent, /\d+ translations found\./);

  testApi.updateBibleCatalogStatus(picker, 'notfound');
  assert.equal(statusEl.textContent, 'No translations found matching "notfound".');
});

test('updateBiblePickerSelect preserves user query and updates select element', () => {
  const { testApi } = setupTestEnvironment();
  const select = { dataset: { bibleVersion: 'default' }, value: 'ASV', innerHTML: '' };
  const statusEl = { textContent: '' };
  const picker = {
    querySelector: sel => {
      if (sel === '[data-bible-version]') return select;
      if (sel === '.bible-catalog-status') return statusEl;
      return null;
    }
  };

  testApi.updateBiblePickerSelect(picker, 'amp');
  assert.match(select.innerHTML, /value="1588"/);
  assert.doesNotMatch(select.innerHTML, /value="ASV"/);
  assert.equal(statusEl.textContent, '1 translation found.');
});
