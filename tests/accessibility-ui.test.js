'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

// Run the real renderers and key listener without booting storage or network.
function appUi() {
  const listeners = {};
  const document = {
    activeElement: null,
    getElementById: id => elements[id] || null,
    querySelector: () => null,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); }
  };
  const body = target('BODY');
  const front = target('BUTTON', 'front');
  const back = target('BUTTON', 'back');
  front.focus = () => { document.activeElement = front; };
  back.focus = () => { document.activeElement = back; };
  let html = '';
  const elements = {
    app: {
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; document.activeElement = body; },
      querySelector(selector) {
        const answer = html.includes('flash-card-back');
        if (answer && selector.includes('.flip-cue-button')) return back;
        if (!answer && selector.includes('.flip')) return front;
        // The old .flip selection found a non-focusable div on the answer side.
        if (answer && selector === '.flip') return { focus() {} };
        return null;
      }
    },
    modal: { innerHTML: '', querySelector: () => null },
    toast: { textContent: '', className: '' }
  };
  const window = {
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    StudyLogic: require('../js/study.js'),
    MobileStudy: require('../js/mobile-study.js'),
    location: { protocol: 'https:', origin: 'https://study.example', href: 'https://study.example/' },
    scrollTo() {}
  };
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8').replace('  boot();', `
    window.ui = {
      state: S, settings: views.settings, nav: renderTabBar, render: render,
      setView: function (view) { V = view; },
      interceptSteps: function (fn) { step = fn; stepVideoStudy = fn; }
    };
  `);
  vm.runInNewContext(source, { window, document, URL });
  return {
    ui: window.ui, document, front, back,
    key(key, element, extra) {
      const event = { key, target: element || document.activeElement || body, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const fn of listeners.keydown) fn(event);
      return event;
    }
  };
}

function target(tagName, flip) {
  return {
    tagName,
    isContentEditable: tagName === 'EDITOR',
    closest(selector) {
      return selector.split(',').some(part => {
        const s = part.trim();
        return s === tagName.toLowerCase() ||
          (flip === 'front' && s === 'button.flip[data-act="flip"]') ||
          (flip === 'back' && s === 'button.flip-cue-button') ||
          (tagName === 'EDITOR' && s === '[contenteditable]');
      }) ? this : null;
    }
  };
}

test('quiz activation belongs to focused controls, including video-study controls', () => {
  const { ui, key } = appUi();
  let steps = 0;
  ui.interceptSteps(() => steps++);
  for (const view of [
    { name: 'quiz', picked: 0 },
    { name: 'exam', picked: 0 },
    { name: 'lesson-video', videoStudy: { name: 'quiz', picked: 0 } }
  ]) {
    ui.setView(view);
    for (const tag of ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'SELECT', 'EDITOR']) {
      const e = key('Enter', target(tag));
      assert.equal(steps, 0, `${view.name}: Enter on ${tag} must not advance`);
      assert.ok(!e.defaultPrevented, 'Native activation must remain available');
    }
  }
});

test('quiz Enter shortcut still advances from question text, but not modified events', () => {
  const { ui, key } = appUi();
  let steps = 0;
  ui.interceptSteps(() => steps++);
  ui.setView({ name: 'quiz', picked: 0 });
  key('Enter', target('H2'));
  assert.equal(steps, 1);
  key('Enter', target('H2'), { ctrlKey: true });
  key('Enter', target('H2'), { defaultPrevented: true });
  key('Enter', target('H2'), { isComposing: true });
  assert.equal(steps, 1);
});

test('Space flips a flashcard in both directions with focus retained on a real control', () => {
  const app = appUi();
  const card = { id: 'one', question: 'Question?', options: ['Answer', 'Other'], answer: 'A' };
  app.ui.state.decks = [{ id: 'lesson', title: 'Soteriology', cards: [card] }];
  app.ui.setView({ name: 'flash', cards: [{ deckId: 'lesson', card }], i: 0, flipped: false, opts: {} });
  app.ui.render();
  assert.equal(app.document.activeElement, app.front);
  assert.equal(app.key(' ').defaultPrevented, true);
  assert.equal(app.document.activeElement, app.back);
  assert.equal(app.key(' ').defaultPrevented, true);
  assert.equal(app.document.activeElement, app.front);
});

test('theme buttons expose exactly one pressed choice for each saved theme', () => {
  const { ui } = appUi();
  for (const theme of ['auto', 'light', 'dark']) {
    ui.state.settings.theme = theme;
    const choices = [...ui.settings().matchAll(/<button[^>]*data-act="set-theme"[^>]*>/g)].map(m => m[0]);
    assert.equal(choices.length, 3);
    assert.equal(choices.filter(s => s.includes('aria-pressed="true"')).length, 1);
    assert.ok(choices.find(s => s.includes(`data-theme="${theme}"`)).includes('aria-pressed="true"'));
  }
});

test('mobile navigation exposes the current destination with a supported state', () => {
  const { ui } = appUi();
  for (const page of ['home', 'journey', 'practice', 'progress', 'settings']) {
    const html = ui.nav(page);
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map(m => m[0]);
    assert.equal(buttons.filter(s => s.includes('aria-current="page"')).length, 1);
    assert.ok(buttons.find(s => s.includes(`data-tab="${page}"`)).includes('aria-current="page"'));
    assert.doesNotMatch(html, /aria-selected/);
  }
});
