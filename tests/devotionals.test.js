const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const parser = require(path.join(root, 'js', 'parser.js'));
const StudyLogic = require(path.join(root, 'js', 'study.js'));
const StudyStorage = require(path.join(root, 'js', 'storage.js'));
const MobileStudy = require(path.join(root, 'js', 'mobile-study.js'));
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const files = JSON.parse(fs.readFileSync(path.join(root, 'decks', 'manifest.json'), 'utf8'));
const starter = files.map(file => fs.readFileSync(path.join(root, 'decks', file), 'utf8')).join('\n\n');
const articles = JSON.parse(fs.readFileSync(path.join(root, 'content', 'devotionals.json'), 'utf8'));

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'deck';
}

function visibleText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim();
}

test('twelve devotional drafts match manifest order, source decks, references, and length rules', () => {
  assert.equal(articles.length, 12);
  const ids = new Set();
  for (let index = 0; index < files.length; index++) {
    const deck = parser.parseDecks(fs.readFileSync(path.join(root, 'decks', files[index]), 'utf8')).decks[0];
    const article = articles[index];
    assert.ok(article && typeof article.id === 'string');
    assert.equal(ids.has(article.id), false, `Duplicate article id: ${article.id}`);
    ids.add(article.id);
    assert.equal(article.lessonId, 'd-' + slug(deck.title));
    assert.equal(article.status, 'draft', `${article.id} must remain pending leader review`);
    assert.equal(article.gradient, `deck-grad-${index + 1}`);
    assert.ok(Array.isArray(article.body));
    const wordCount = article.body.join(' ').trim().split(/\s+/).length;
    assert.ok(wordCount >= 150 && wordCount <= 250, `${article.id} body is ${wordCount} words`);
    assert.equal(Object.hasOwn(article, 'scriptureText'), false, 'No unlicensed quotation is bundled');
    assert.ok(Array.isArray(article.sources) && article.sources.length > 0);
    assert.ok(article.sources.every(source => source.kind === 'deck' && source.deckId === article.lessonId));
    const deckBibleLines = deck.questions.map(question => question.bible || '').filter(Boolean);
    for (const source of article.sources) {
      assert.ok(Array.isArray(source.references));
      for (const reference of source.references) {
        assert.ok(deckBibleLines.some(line => line.includes(reference)), `${reference} is absent from ${files[index]} BIBLE fields`);
      }
    }
    assert.ok(article.sources.some(source => source.references.includes(article.scripture)));
  }
});

async function bootTestApp() {
  let stored = JSON.stringify({
    decks: [],
    progress: {},
    settings: { theme: 'auto' },
    onboarding: { completed: true, goal: 'habit', dailyMinutes: 10, startingTopic: 'soteriology', preferredTime: 'anytime', committed: true },
    streak: { lastStreakDate: null },
    devotions: {},
    completedToday: {},
    seeded: false,
    dataVersion: 0
  });
  const listeners = {};
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    modal: { innerHTML: '', querySelector: () => null },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) },
    'devotional-fallback': { textContent: JSON.stringify(articles) }
  };
  const document = {
    activeElement: null,
    getElementById: id => elements[id],
    addEventListener: (name, handler) => { listeners[name] = handler; },
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} },
    contains: () => false
  };
  const window = {
    DeckParser: parser,
    StudyLogic,
    StudyStorage,
    MobileStudy,
    location: { protocol: 'file:', href: 'file:///index.html' },
    scrollTo: () => {},
    __dispatchClick: event => listeners.click(event)
  };
  const instrumented = appSource.replace('  boot();', `
    window.__testApi = {
      setDraftsVisible: function (visible) { S.settings.showDraftDevotionals = visible; },
      settings: function () { return S.settings; },
      renderView: function (name, id) { V = { name: name, id: id }; return views[name](); },
      openChapterInfo: function (id) {
        window.__dispatchClick({ target: { closest: function () { return { dataset: { act: 'chapter-info', id: id } }; } } });
        return modal.innerHTML;
      },
      firstDeckId: function () { return S.decks[0].id; }
    };
    window.testAppReady = boot();
  `);
  assert.notEqual(instrumented, appSource, 'Test instrumentation point must still exist');
  vm.runInNewContext(instrumented, {
    window,
    document,
    localStorage: {
      getItem: () => stored,
      setItem: (_, value) => { stored = value; }
    }
  });
  await window.testAppReady;
  return { appHtml: elements.app.innerHTML, api: window.__testApi, getStored: () => JSON.parse(stored) };
}

test('default local production state hides all draft articles; local opt-in shows the feed', async () => {
  const instance = await bootTestApp();
  assert.equal(instance.getStored().dataVersion, 10);
  assert.equal(instance.getStored().settings.showDraftDevotionals, false);
  assert.deepEqual(instance.getStored().devotions, { read: [], saved: [], carouselHiddenOn: null });
  assert.doesNotMatch(instance.appHtml, /Daily Devotionals/);
  assert.ok(articles.every(article => !instance.appHtml.includes(article.title)));

  instance.api.setDraftsVisible(true);
  const optedInHome = instance.api.renderView('home');
  assert.match(optedInHome, /Daily Devotionals/);
  assert.ok(articles.some(article => optedInHome.includes(article.title)));
});

test('Journey, chapter detail, and chapter info show topic names without section labels', async () => {
  const instance = await bootTestApp();
  const journey = visibleText(instance.api.renderView('journey'));
  const chapter = visibleText(instance.api.renderView('chapter', instance.api.firstDeckId()));
  const info = visibleText(instance.api.openChapterInfo(instance.api.firstDeckId()));
  for (const [surface, text] of [['Journey', journey], ['chapter detail', chapter], ['chapter info', info]]) {
    assert.doesNotMatch(text, /section\s*\d+/i, `${surface} exposes a section number`);
    assert.doesNotMatch(text, /\bsection\b/i, `${surface} exposes a section label`);
  }
  assert.match(journey, /Soteriology/);
  assert.match(chapter, /Soteriology/);
  assert.match(info, /Soteriology/);
});
