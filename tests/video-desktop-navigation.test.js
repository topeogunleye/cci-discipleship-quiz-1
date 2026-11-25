const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const helpers = source.slice(source.indexOf('  var lessonVideoVisits ='), source.indexOf('  function lessonVideoGroups('));
function context(extra = {}) {
  const ctx = { V: { name: 'lesson-video' }, ...extra };
  vm.createContext(ctx);
  vm.runInContext(helpers, ctx);
  return ctx;
}
test('visit selection follows stable video IDs, stays deck-scoped, and safely falls back', () => {
  const ctx = context();
  const videos = [{ id: 'one', title: 'First' }, { id: 'two', title: 'Second' }];
  ctx.rememberLessonVideoVisit('chapter', videos[1], 123);
  ctx.rememberLessonVideoVisit('chapter', videos[1]);
  let route = ctx.lessonVideoVisitRoute('chapter', videos.slice().reverse());
  assert.equal(route.videoIndex, 0);
  assert.equal(route.videoTime, 123);
  assert.equal(ctx.lessonVideoVisitRoute('other', videos).videoTime, 0);
  route = ctx.lessonVideoVisitRoute('chapter', [videos[0]]);
  assert.equal(route.videoIndex, 0);
  assert.equal(route.videoTime, 0);
  assert.equal(context().lessonVideoVisitRoute('chapter', videos).videoTime, 0, 'new visit has no retained learner state');
});
test('study headings distinguish video scope, whole chapter and older saved sessions', () => {
  const ctx = context();
  const videos = [{ id: 'one', title: 'Original long recording title' }];
  const video = ctx.lessonVideoStudyHeading({ name: 'flash', opts: { videoId: 'one' } }, 11, videos);
  assert.equal(video.title, 'Video 1 · Flashcards');
  assert.equal(video.subtitle, videos[0].title);
  assert.equal(ctx.lessonVideoStudyHeading({ name: 'quiz', opts: { videoId: null } }, 11, videos).title, 'Chapter 11 Quiz');
  const legacy = ctx.lessonVideoStudyHeading({ name: 'flash', opts: {} }, 11, videos);
  assert.equal(legacy.title, 'Flashcards');
  assert.match(legacy.subtitle, /Saved study session/);
  assert.equal(ctx.lessonVideoStudyHeading({ name: 'quiz', opts: { videoId: 'removed' } }, 11, videos).title, 'Quiz');
});
test('breakpoint changes move existing controls and retain focus', () => {
  function node() {
    return {
      children: [], parentNode: null,
      appendChild(child) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(n => n !== child); this.children.push(child); child.parentNode = this; if (child.onMove) child.onMove(); },
      insertBefore(child, before) { this.appendChild(child); this.children.splice(this.children.indexOf(child), 1); this.children.splice(this.children.indexOf(before), 0, child); },
      querySelector() { return null; }
    };
  }
  const header = node(), summary = node(), title = node(), nav = node(), topbar = node(), slot = node(), paragraph = node();
  summary.appendChild(title); summary.appendChild(paragraph); summary.querySelector = () => paragraph;
  slot.appendChild(nav);
  const nodes = { '.lesson-video-top-title': header, '.lesson-video-summary-copy': summary, '#lesson-video-title': title, '.lesson-video-navigation': nav, '.lesson-video-topbar': topbar, '.lesson-video-navigation-slot': slot };
  const focus = { focus() { document.activeElement = focus; } };
  const document = { activeElement: focus };
  let visibleAdjustments = 0;
  nav.contains = element => element === focus;
  nav.scrollIntoView = options => { assert.equal(options.block, 'nearest'); visibleAdjustments++; };
  nav.onMove = () => { document.activeElement = null; };
  const page = { querySelector: s => nodes[s], contains: n => n === focus };
  let change;
  const query = { matches: true, addEventListener(event, callback) { assert.equal(event, 'change'); change = callback; } };
  const ctx = context({ app: { querySelector: () => page }, document, window: { matchMedia: () => query } });
  ctx.syncLessonVideoLayout();
  assert.equal(nav.parentNode, topbar);
  query.matches = false; change();
  assert.equal(nav.parentNode, slot);
  assert.equal(summary.children[0], title);
  assert.equal(document.activeElement, focus);
  assert.equal(visibleAdjustments, 2, 'focused navigation stays visible on both sides of the breakpoint');
  ctx.V.name = 'chapter'; ctx.app.querySelector = () => { throw Error('must not inspect unrelated views'); };
  ctx.syncLessonVideoLayout();
});

test('status text tokens meet normal-text contrast in both themes', () => {
  const brand = fs.readFileSync(require.resolve('../brand.css'), 'utf8');
  const token = name => brand.match(new RegExp('--' + name + ':\\s*(#[a-f0-9]{6})', 'i'))[1];
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const [foreground, background] of [['cci-burgundy', 'cci-burgundy-soft'], ['cci-burgundy-on-dark', 'cci-burgundy-soft-dark']]) {
    const values = [luminance(token(foreground)), luminance(token(background))].sort((a,b) => b-a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5);
  }
  const css = fs.readFileSync(require.resolve('../style.css'), 'utf8');
  assert.match(css, /\.step-badge\.in-progress\s*\{[^}]*color: var\(--accent-text\)/);
  assert.match(css, /\.video-study-body \.coaching-first-tooltip\s*\{[^}]*color: var\(--accent-text\)/);
});

test('short-screen player fit uses header position and survives scroll without remounting', () => {
  let resize, fit;
  const frame = { getBoundingClientRect: () => ({ top: 14 }) };
  const page = {
    querySelector: selector => selector === '.lesson-video-frame' ? frame : null,
    style: { setProperty(name, value) { assert.equal(name, '--lesson-video-fit-width'); fit = parseFloat(value); } }
  };
  const ctx = context({
    app: { querySelector: () => page }, document: {},
    window: { innerWidth: 800, innerHeight: 360, scrollY: 180, addEventListener(name, fn) { assert.equal(name, 'resize'); resize = fn; } }
  });
  ctx.syncLessonVideoLayout();
  assert.ok(Math.abs(fit * 9 / 16 - 154) < .01, '360px viewport minus 194px header position and 12px clearance');
  ctx.window.innerHeight = 390;
  resize();
  assert.ok(Math.abs(fit * 9 / 16 - 184) < .01);
  assert.equal(page.querySelector('.lesson-video-frame'), frame);
});

test('repeated navigation keeps the same direction focused and falls back at boundaries', () => {
  const calls = [];
  const previous = { disabled: false, focus: options => calls.push(['previous', options.preventScroll]) };
  const next = { disabled: false, focus: options => calls.push(['next', options.preventScroll]) };
  const nav = {
    querySelector(selector) {
      if (selector === '[data-video-nav="next"]') return next;
      if (selector === '[data-video-nav="previous"]') return previous;
      return previous.disabled ? next : previous;
    },
    scrollIntoView: options => calls.push(['scroll', options.block, options.behavior])
  };
  const ctx = context({ app: { querySelector: () => nav }, returnToLessonVideo: () => assert.fail('must not scroll to the player after Previous/Next') });
  ctx.restoreLessonVideoSelectionFocus('next');
  ctx.restoreLessonVideoSelectionFocus('next');
  assert.deepEqual(calls.slice(0, 4), [['scroll', 'nearest', 'instant'], ['next', true], ['scroll', 'nearest', 'instant'], ['next', true]]);
  next.disabled = true;
  ctx.restoreLessonVideoSelectionFocus('next');
  assert.deepEqual(calls.at(-1), ['previous', true]);
  next.disabled = false; previous.disabled = true;
  ctx.restoreLessonVideoSelectionFocus('previous');
  assert.deepEqual(calls.at(-1), ['next', true]);
});

test('catalog selection reveals desktop navigation or the smaller-screen recording heading', () => {
  const calls = [];
  const header = { scrollIntoView: options => calls.push(options.block) };
  const nav = { parentNode: header };
  const title = { focus: options => calls.push(options.preventScroll), scrollIntoView: () => calls.push('title') };
  const ctx = context({ app: { querySelector: selector => selector === '.lesson-video-navigation' ? nav : header }, document: { getElementById: () => title }, returnToLessonVideo: () => calls.push('player') });
  ctx.restoreLessonVideoSelectionFocus('');
  assert.deepEqual(calls, ['start', true]);
  nav.parentNode = {};
  ctx.restoreLessonVideoSelectionFocus('');
  assert.deepEqual(calls.slice(-2), ['title', true]);
  ctx.app.querySelector = () => null;
  ctx.restoreLessonVideoSelectionFocus('');
  assert.equal(calls.at(-1), 'player');
});

test('the video selection event restores navigation after rendering the new recording', () => {
  const calls = [];
  const handler = source.slice(source.indexOf("      case 'lesson-video-select':"), source.indexOf("      case 'lesson-video-play':"));
  const ctx = context({
    V: { name: 'lesson-video', id: 'chapter', videoIndex: 4, videoTime: 56 },
    lessonVideosForDeck: () => Array.from({ length: 6 }, (_, i) => ({ id: 'video-' + i })),
    document: { getElementById: () => ({ pause: () => calls.push('pause') }) },
    syncHashWithView: () => calls.push('history'),
    render: keep => { assert.equal(keep, true); calls.push('render'); },
    returnToLessonVideo: () => assert.fail('must keep the navigation visible')
  });
  ctx.restoreLessonVideoSelectionFocus = direction => calls.push(direction);
  vm.runInContext('function selectVideo(t) { switch ("lesson-video-select") {' + handler + '} }', ctx);
  ctx.selectVideo({ dataset: { index: '5', videoNav: 'next' } });
  assert.deepEqual(calls, ['pause', 'history', 'render', 'next']);
  assert.equal(ctx.V.videoIndex, 5);
  assert.equal(ctx.V.videoTime, 0);
});

test('a background video-page render preserves existing navigation focus', () => {
  const document = { body: {}, activeElement: { getAttribute: () => 'previous' }, getElementById: () => null };
  let adjustments = 0;
  const button = { disabled: false, focus: () => { document.activeElement = button; } };
  const nav = { querySelector: () => button, scrollIntoView: () => { adjustments++; } };
  const app = { querySelector: selector => selector === '.lesson-video-navigation' ? nav : null };
  Object.defineProperty(app, 'innerHTML', { set() { document.activeElement = document.body; } });
  const ctx = context({
    app, document, window: { scrollTo: () => {} }, MAIN_TABS: [], views: { 'lesson-video': () => '<section></section>' },
    closeBiblePreview: () => {}, banner: () => '', animateRouteChange: false
  });
  const renderSource = source.slice(source.indexOf('  function render(keep)'), source.indexOf('  function viewToHash('));
  vm.runInContext(renderSource, ctx);
  ctx.render(true);
  assert.equal(document.activeElement, button);
  assert.equal(adjustments, 1);
  ctx.render(false);
  assert.equal(document.activeElement, document.body, 'an ordinary route render must not steal focus');
});
