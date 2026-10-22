const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appJsSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const devotionalsJson = JSON.parse(fs.readFileSync(path.join(root, 'content', 'devotionals.json'), 'utf8'));

function createTestAppEnvironment() {
  const dom = {
    app: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    modal: { innerHTML: '', querySelector: () => null },
    toast: { textContent: '', className: '' }
  };

  const windowMock = {
    DeckParser: require('../js/parser.js'),
    StudyLogic: require('../js/study.js'),
    StudyStorage: require('../js/storage.js'),
    MobileStudy: require('../js/mobile-study.js'),
    document: {
      getElementById: id => {
        if (id === 'app') return dom.app;
        if (id === 'modal') return dom.modal;
        if (id === 'toast') return dom.toast;
        if (id === 'starter-fallback') return { textContent: '""' };
        if (id === 'devotionals-fallback') return { textContent: JSON.stringify(devotionalsJson) };
        return null;
      },
      addEventListener: () => {},
      documentElement: { removeAttribute: () => {}, setAttribute: () => {} },
      activeElement: null
    },
    location: { protocol: 'http:' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null,
    fetch: () => Promise.reject(new Error('offline')),
    scrollTo: () => {}
  };

  const instrumentedSource = appJsSource.replace(
    '  boot();',
    '  window.__testApi = { views: views, renderSidebar: renderSidebar, S: S, render: render, setV: function(v) { V = v; }, setDevotionals: function(d) { DEVOTIONALS = d; } };\n  window.testAppReady = boot();'
  );

  vm.runInNewContext(instrumentedSource, {
    window: windowMock,
    document: windowMock.document,
    Date: { now: () => 1700000000000 },
    setInterval: () => 1,
    clearInterval: () => {}
  });

  if (windowMock.__testApi) {
    windowMock.__testApi.setDevotionals(devotionalsJson);
  }

  return { dom, testApi: windowMock.__testApi };
}

test('renderSidebar outputs accessible desktop navigation with 5 tabs and active state', () => {
  const { testApi } = createTestAppEnvironment();
  const sidebarHtml = testApi.renderSidebar('practice');

  assert.match(sidebarHtml, /class="app-sidebar"/);
  assert.match(sidebarHtml, /class="brand-title">Study<\/span>/);
  assert.match(sidebarHtml, /data-tab="home"/);
  assert.match(sidebarHtml, /data-tab="journey"/);
  assert.match(sidebarHtml, /class="sidebar-tab-btn active"[^>]*data-tab="practice"/);
  assert.match(sidebarHtml, /data-tab="progress"/);
  assert.match(sidebarHtml, /data-tab="settings"/);
});

test('views.home provides both mobile and desktop layouts for seamless responsiveness', () => {
  const { testApi } = createTestAppEnvironment();
  testApi.S.decks = [
    { id: 'd1', title: 'Discipleship Experience (Section 1) Soteriology', cards: [{ id: 'c1' }, { id: 'c2' }] }
  ];
  const homeHtml = testApi.views.home();

  // Mobile layout container
  assert.match(homeHtml, /class="home-mobile-layout"/);
  // Desktop layout container
  assert.match(homeHtml, /class="home-desktop-layout"/);

  // Desktop components (Images 1 & 2)
  assert.match(homeHtml, /class="desktop-view-title">Study<\/h1>/);
  assert.match(homeHtml, /class="desktop-hero-card grad-hero-indigo"/);
  assert.match(homeHtml, /class="desktop-hero-svg"/);
  assert.match(homeHtml, /class="desktop-stats-row"/);
  assert.match(homeHtml, /class="stat-caption">Mastered<\/span>/);
  assert.match(homeHtml, /class="stat-caption">Due today<\/span>/);
  assert.match(homeHtml, /class="stat-caption">Cards<\/span>/);
  assert.match(homeHtml, /class="desktop-lessons-grid"/);
  assert.match(homeHtml, /class="home-col-side"/);
  assert.match(homeHtml, /class="desktop-plan-box"/);
});

test('views.practice includes desktop mode selectors, deck grid, and sticky launch bar', () => {
  const { testApi } = createTestAppEnvironment();
  testApi.S.decks = [
    { id: 'd1', title: 'Discipleship Experience (Section 1) Soteriology', cards: [{ id: 'c1' }] }
  ];
  const practiceHtml = testApi.views.practice();

  // Mobile layout container
  assert.match(practiceHtml, /class="practice-mobile-layout"/);
  // Desktop layout container
  assert.match(practiceHtml, /class="practice-desktop-layout"/);

  // Desktop practice components (Images 3 & 4)
  assert.match(practiceHtml, /class="practice-desktop-header"/);
  assert.match(practiceHtml, /Start a Challenge/);
  assert.match(practiceHtml, /Start Exam/);
  assert.match(practiceHtml, /Multiple choice/);
  assert.match(practiceHtml, /Flip and recall/);
  assert.match(practiceHtml, /class="desktop-cover-grid"/);
  assert.match(practiceHtml, /All lessons/);
  assert.match(practiceHtml, /Mixed review/);
  assert.match(practiceHtml, /class="desktop-sticky-launch-bar"/);
  assert.match(practiceHtml, /class="btn pill primary desktop-launch-button"/);
});

test('views.devotional provides desktop hero banner and split reader layout', () => {
  const { testApi } = createTestAppEnvironment();
  testApi.setV({ name: 'devotional', id: 'devotional-soteriology' });
  const devHtml = testApi.views.devotional();

  assert.match(devHtml, /class="devotional-desktop-hero-banner/);
  assert.match(devHtml, /class="devotional-desktop-split-container"/);
  assert.match(devHtml, /class="devotional-desktop-side-rail"/);
  assert.match(devHtml, /class="devotional-reading-card"/);
  assert.match(devHtml, /class="callout-title">Reflection<\/h2>/);
  assert.match(devHtml, /Today’s step/);
});

test('style.css defines responsive breakpoints at 768px (tablet) and 1024px (desktop)', () => {
  const styleCss = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

  assert.match(styleCss, /@media\s*\(min-width:\s*768px\)/);
  assert.match(styleCss, /@media\s*\(min-width:\s*1024px\)/);
  assert.match(styleCss, /\.app-sidebar/);
  assert.match(styleCss, /\.desktop-hero-card/);
  assert.match(styleCss, /\.desktop-stats-row/);
  assert.match(styleCss, /\.desktop-lessons-grid/);
  assert.match(styleCss, /\.desktop-practice-modes-row/);
  assert.match(styleCss, /\.desktop-cover-grid/);
  assert.match(styleCss, /\.desktop-sticky-launch-bar/);
  assert.match(styleCss, /\.devotional-desktop-split-container/);
  assert.match(styleCss, /\.chapter-desktop-modal-sheet/);
});
