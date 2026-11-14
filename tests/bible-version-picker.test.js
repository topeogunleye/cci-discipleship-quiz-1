const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function setup(catalog = []) {
  const listeners = {}, pickers = [];
  const window = {
    DeckParser: require('../js/parser.js'), StudyStorage: require('../js/storage.js'),
    MobileStudy: require('../js/mobile-study.js'), setTimeout, clearTimeout,
    location: { protocol: 'https:', origin: 'https://study.example' }
  };
  const document = { getElementById: () => ({}), querySelectorAll: selector => selector === '.bible-version-picker' ? pickers : [],
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); } };
  const source = fs.readFileSync('js/app.js', 'utf8').replace('  boot();', `
    save = function() {}; toast = function() {};
    bibleVersions = ${JSON.stringify(catalog)};
    window.testApi = { state: S, options: bibleVersionOptions, picker: bibleVersionPicker, update: updateBiblePickerSelect,
      request: requestBiblePassage,
      activatePreview: function() { activeBiblePreview = {link:{},preview:{}}; loadBiblePreviewText = function() {}; } };
  `);
  vm.runInNewContext(source, { window, document, URL, AbortController, fetch: async () => Response.json({ versions: [] }) });
  return { api: window.testApi, listeners, pickers };
}

function fakePicker(kind) {
  const notice = { textContent: 'Your saved translation is no longer offered here. Previews use NKJV until you choose another translation. More translations are available on YouVersion.' };
  const select = { dataset: { bibleVersion: kind, currentVersion: 'APIBIBLE_NKJV' }, value: 'APIBIBLE_NKJV', innerHTML: '' };
  const picker = { querySelector: selector => selector === '[data-bible-version]' ? select : selector === '[data-bible-picker-notice]' ? notice : null };
  select.closest = () => picker;
  return { picker, select, notice };
}

test('Settings and preview pickers offer exactly AMP, NIV, NKJV, KJV, MSG and ESV, without search', () => {
  const { api } = setup([
    { id: '3034', abbreviation: 'BSB', title: 'Berean Standard Bible' },
    { id: 'APIBIBLE_GNT', abbreviation: 'GNT', title: 'Good News Translation' },
    { id: 'APIBIBLE_OKE', abbreviation: 'OKE', title: 'Onkelos' }
  ]);
  for (const settings of [true, false]) {
    const html = api.picker(settings);
    assert.deepEqual([...html.matchAll(/<option[^>]*>([^ ]+) —/g)].map(match => match[1]), ['AMP', 'NIV', 'NKJV', 'KJV', 'MSG', 'ESV']);
    assert.match(html, /value="APIBIBLE_NKJV" selected/);
    assert.doesNotMatch(html, /<input|search|optgroup|BSB|GNT|OKE/i);
    assert.match(html, /More translations are available on YouVersion/);
  }
});

test('retained translations preserve saved provider IDs without duplicate picker rows', () => {
  const { api } = setup([{ id: '888', abbreviation: 'engAMP', title: 'Amplified Bible' }]);
  for (const [id, abbreviation] of [['888', 'AMP'], ['113', 'NIV'], ['NKJV', 'NKJV'], ['114', 'NKJV'], ['1', 'KJV'], ['97', 'MSG'], ['59', 'ESV']]) {
    api.state.settings.bibleVersion = id;
    const html = api.picker(true);
    assert.match(html, new RegExp('value="' + id + '" selected>' + abbreviation + ' —'));
    assert.equal((html.match(/<option /g) || []).length, 6);
    assert.equal(api.state.settings.bibleVersion, id);
  }
});

test('removed saved preferences stay intact while the picker selects NKJV', () => {
  const { api } = setup([{ id: '3034', abbreviation: 'BSB', title: 'Berean Standard Bible' }]);
  for (const id of ['ASV', '12', '3034', 'APIBIBLE_GNT', 'APIBIBLE_OKE']) {
    api.state.settings.bibleVersion = id;
    const html = api.picker(true);
    assert.match(html, /value="APIBIBLE_NKJV" selected/);
    assert.match(html, /Your saved translation is no longer offered here/);
    assert.equal((html.match(/<option /g) || []).length, 6);
    assert.equal(api.state.settings.bibleVersion, id);
  }
});

test('catalog refresh keeps temporary preview choices separate from the saved default', () => {
  const { api, listeners } = setup();
  const select = { dataset: { bibleVersion: 'preview', currentVersion: 'ESV' }, value: 'ESV', innerHTML: '' };
  api.update({ querySelector: () => select });
  assert.match(select.innerHTML, /value="ESV" selected/);
  assert.equal(api.state.settings.bibleVersion, 'APIBIBLE_NKJV');
  listeners.change.forEach(fn => fn({ target: { dataset: { bibleVersion: 'default' }, value: '111' } }));
  assert.equal(api.state.settings.bibleVersion, '111');
});

test('choosing a supported Settings default immediately clears the stale removed-translation warning', () => {
  const { api, listeners, pickers } = setup();
  api.state.settings.bibleVersion = '3034';
  const { picker, select, notice } = fakePicker('default');
  pickers.push(picker);
  select.value = '1588';
  listeners.change.forEach(fn => fn({ target: select }));
  assert.equal(api.state.settings.bibleVersion, '1588');
  assert.equal(notice.textContent, 'More translations are available on YouVersion.');
  assert.doesNotMatch(api.picker(true), /no longer offered/);
});

test('a supported temporary preview choice clears the warning across catalog refreshes without saving it', () => {
  const { api, listeners } = setup();
  api.state.settings.bibleVersion = '3034';
  api.activatePreview();
  const { picker, select, notice } = fakePicker('preview');
  for (const id of ['1588', 'APIBIBLE_NKJV']) {
    select.value = id;
    listeners.change.forEach(fn => fn({ target: select }));
    api.update(picker);
    assert.equal(notice.textContent, 'More translations are available on YouVersion.');
    assert.equal(api.state.settings.bibleVersion, '3034');
  }
  select.dataset.userSelected = 'false';
  api.update(picker);
  assert.match(notice.textContent, /no longer offered/, 'reopening reflects the still-unchanged saved preference');
});

test('catalog refresh also clears a stale warning when a retained legacy ID is recognized', () => {
  const { api } = setup([{ id: '888', abbreviation: 'AMP', title: 'Amplified Bible' }]);
  api.state.settings.bibleVersion = '888';
  const { picker, notice } = fakePicker('default');
  api.update(picker);
  assert.equal(notice.textContent, 'More translations are available on YouVersion.');
  assert.equal(api.state.settings.bibleVersion, '888');
});
