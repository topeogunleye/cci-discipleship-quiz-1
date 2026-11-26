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
    html: () => html,
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

test('routes leave the primary main landmark to the persistent app container', () => {
  const app = appUi();
  const card = { id: 'one', question: 'Question?', options: ['Answer', 'Other'], answer: 'A' };
  app.ui.state.decks = [{ id: 'lesson', title: 'Soteriology', cards: [card] }];
  const views = [
    { name: 'home' }, { name: 'journey' }, { name: 'settings' },
    { name: 'streak' }, { name: 'lesson-video', id: 'lesson', videoIndex: 0 },
    ...Array.from({ length: 8 }, (_, step) => ({ name: 'onboarding', step }))
  ];
  for (const view of views) {
    app.ui.setView(view);
    app.ui.render();
    assert.match(app.html(), /class="desktop-main"/, view.name);
    if (view.name === 'lesson-video') {
      assert.match(app.html(), /<section class="lesson-video-page" aria-labelledby="lesson-video-title">/);
    }
    assert.doesNotMatch(app.html(), /<main\b|role=["']main["']/i,
      `${view.name}${view.step ?? ''} must not nest another main landmark`);
  }
  const shell = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(shell, /<main\b[^>]*id="app"/);
});

test('quiz feedback has one reading-order instance and preserves supporting references', () => {
  const app = appUi();
  const card = { id: 'one', question: 'Question?', options: ['Answer', 'Other'], answer: 'A', explanation: 'Reason for the answer.', bible: 'John 3:16' };
  app.ui.state.decks = [{ id: 'lesson', title: 'Soteriology', cards: [card] }];
  app.ui.setView({ name: 'quiz', cards: [{ deckId: 'lesson', card }], i: 0, picked: 1, opts: {} });
  app.ui.render();
  const html = app.html();
  assert.equal((html.match(/aria-label="Answer feedback"/g) || []).length, 1);
  assert.equal((html.match(/data-act="next"/g) || []).length, 1);
  assert.ok(html.indexOf('aria-label="Answer feedback"') > html.indexOf('</article>'));
  assert.match(html, /Reason for the answer\./);
  assert.match(html, /<details class="study-references"><summary>Scripture and video references<\/summary>/);
  assert.match(html, /John 3:16/);
  assert.doesNotMatch(html, /quiz-feedback-resize-control|quiz-explanation-card/);
});

test('timed exam feedback never reveals the answer before submission', () => {
  const app = appUi();
  const card = { id: 'one', question: 'Question?', options: ['Answer', 'Other'], answer: 'A', explanation: 'Hidden explanation', bible: 'John 3:16' };
  app.ui.state.decks = [{ id: 'lesson', title: 'Soteriology', cards: [card] }];
  app.ui.setView({ name: 'exam', cards: [{ deckId: 'lesson', card }], i: 0, picked: 1, remaining: 60000, opts: {} });
  app.ui.render();
  assert.match(app.html(), /Answer recorded for review after submission/);
  assert.match(app.html(), /Submit exam/);
  assert.doesNotMatch(app.html(), /Hidden explanation|study-references|Correct\.|Not quite\./);
});
