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

test('duplicate provider editions have one row and retain an existing saved provider ID', () => {
  const { testApi } = setupTestEnvironment([
    { id: '12', abbreviation: 'ASV', title: 'American Standard Version' },
    { id: '1', abbreviation: 'KJV', title: 'King James Version' },
    { id: '206', abbreviation: 'engWEBUS', title: 'World English Bible US' },
    { id: '999', abbreviation: 'WEBUS', title: 'World English Bible US duplicate' }
  ]);
  let html = testApi.bibleVersionOptions('ASV', '');
  assert.equal((html.match(/>ASV —/g) || []).length, 1);
  assert.equal((html.match(/>KJV —/g) || []).length, 1);
  assert.equal((html.match(/World English Bible US/g) || []).length, 1);
  html = testApi.bibleVersionOptions('12', '');
  assert.match(html, /value="12" selected/);
  assert.doesNotMatch(html, /value="ASV"/);
});

test('specialist options are grouped with coverage labels and remain searchable and selectable', () => {
  const { testApi } = setupTestEnvironment([
    { id: 'APIBIBLE_RV', abbreviation: 'RV', title: 'Revised Version 1885' },
    { id: 'APIBIBLE_OKE', abbreviation: 'OKE', title: 'Targum Onkelos (Etheridge)', group: 'Additional editions', coverage: 'Torah only (Genesis–Deuteronomy)' }
  ]);
  const html = testApi.bibleVersionOptions('APIBIBLE_OKE', '');
  assert.match(html, /<optgroup label="Additional editions"><option value="APIBIBLE_OKE" selected/);
  assert.match(html, /Torah only/);
  assert.ok(html.indexOf('value="APIBIBLE_RV"') < html.indexOf('<optgroup'));
  assert.match(testApi.bibleVersionOptions('APIBIBLE_OKE', 'onkelos'), /value="APIBIBLE_OKE" selected/);
});

test('search results do not silently become the active translation', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', 'amp');
  assert.match(html, /value="" disabled selected>Choose a translation/);
  assert.match(html, /value="1588">AMP — Amplified Bible/);
  assert.doesNotMatch(html, /value="ASV"/, 'ASV should be filtered out when query is "amp"');
  assert.doesNotMatch(html, /value="ESV"/);
  assert.doesNotMatch(html, /value="111"/);
});

test('bibleVersionOptions matches partial titles case-insensitively', () => {
  const { testApi } = setupTestEnvironment();
  const html = testApi.bibleVersionOptions('ASV', 'crossway');
  assert.match(html, /value="ESV">ESV/);
  assert.match(html, /value="" disabled selected/);
  assert.doesNotMatch(html, /value="1588"/);
});

test('Enter explicitly accepts the first search result but not the disabled no-match placeholder', () => {
  const { listeners, testApi } = setupTestEnvironment();
  let changes = 0;
  const select = { value: '', get selectedIndex() { return this.options.findIndex(option => option.value === this.value); }, options: [{ disabled: true, value: '' }, { disabled: false, value: '1588' }], dispatchEvent: () => { changes++; } };
  const target = { hasAttribute: name => name === 'data-bible-version-search', closest: () => ({ querySelector: () => select }) };
  listeners.keydown.forEach(fn => fn({ key: 'Enter', target, preventDefault() {} }));
  assert.equal(select.value, '1588');
  assert.equal(changes, 1);
  assert.equal(testApi.state.settings.bibleVersion, 'APIBIBLE_KJV');
  select.value = 'ASV'; select.options = [{ disabled: true, value: 'ASV' }];
  listeners.keydown.forEach(fn => fn({ key: 'Enter', target, preventDefault() {} }));
  assert.equal(changes, 1);
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
  assert.match(statusEl.textContent, /Choose a translation/);

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
