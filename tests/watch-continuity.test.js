'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const MobileStudy = require('../js/mobile-study.js');
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const helpers = source.slice(source.indexOf('  var lessonVideoVisits ='), source.indexOf('  function lessonVideoGroups('));
const plain = value => JSON.parse(JSON.stringify(value));
function context(history = {}) {
  const videos = [{ id: 'first', deckId: 'lesson', title: 'First' }, { id: 'second', deckId: 'lesson', title: 'Second' }];
  const ctx = { S: { watchHistory: MobileStudy.normalizeWatchHistory(history), pausedSession: { cards: ['unfinished'] } },
    activeStorageOwnerId: 'owner-a', requestedStorageOwnerId: 'owner-a', MobileStudy,
    deck: id => id === 'lesson' ? { id, title: 'Lesson' } : null,
    lessonVideosForDeck: id => id === 'lesson' ? videos : [] };
  vm.createContext(ctx);
  vm.runInContext(helpers, ctx);
  return { ctx, videos };
}

test('watch history keeps bounded numeric positions and drops URLs, invalid records and inherited keys', () => {
  const raw = JSON.parse('{"first":{"deckId":"lesson","time":124,"duration":100,"updatedAt":10,"url":"https://private.invalid/token"},"__proto__":{"deckId":"lesson","time":5,"updatedAt":12},"invalid":{"deckId":"lesson","time":-1,"updatedAt":20}}');
  assert.deepEqual(MobileStudy.normalizeWatchHistory(raw), { first: { deckId: 'lesson', time: 100, duration: 100, updatedAt: 10 } });
  assert.deepEqual(MobileStudy.normalizeWatchHistory(undefined), {});
  assert.deepEqual(MobileStudy.normalizeWatchHistory([]), {});
  const many = Object.fromEntries(Array.from({ length: 220 }, (_, i) => ['v' + i, { deckId: 'lesson', time: 1, updatedAt: i + 1 }]));
  const retained = MobileStudy.normalizeWatchHistory(many);
  assert.equal(Object.keys(retained).length, 200);
  assert.equal(retained.v0, undefined);
  assert.ok(retained.v219);
});

test('reopened recording routes use stable catalogue IDs and exclude removed or unrelated media', () => {
  const history = { second: { deckId: 'lesson', time: 42, duration: 200, updatedAt: 10 },
    removed: { deckId: 'lesson', time: 77, updatedAt: 20 } };
  const { ctx, videos } = context(plain(history));
  const continuation = ctx.recentWatching();
  assert.equal(continuation.video.id, 'second');
  assert.equal(continuation.time, 42);
  const route = ctx.lessonVideoVisitRoute('lesson', videos.slice().reverse());
  assert.equal(route.videoIndex, 0);
  assert.equal(route.videoTime, 42);
  assert.equal(route.autoPlayVideo, undefined);
  assert.equal(ctx.lessonVideoVisitRoute('other', []).videoTime, 0);
  assert.equal(ctx.resumeTime({ time: 199, duration: 200 }), 0, 'an end position offers replay without claiming completion');
});

test('playback checkpoints preserve unfinished study and cannot cross profile/loading boundaries', () => {
  const { ctx, videos } = context();
  const saved = ctx.S.pausedSession;
  assert.equal(ctx.savePlaybackPosition('lesson', videos[0], { currentTime: 36, duration: 100 }, 'owner-a'), true);
  assert.equal(ctx.S.watchHistory.first.time, 36);
  assert.equal(ctx.S.pausedSession, saved);
  ctx.activeStorageOwnerId = 'owner-b';
  ctx.requestedStorageOwnerId = 'owner-b';
  ctx.S = { watchHistory: {}, pausedSession: null };
  assert.equal(ctx.savePlaybackPosition('lesson', videos[0], { currentTime: 80, duration: 100 }, 'owner-a'), false);
  assert.equal(ctx.recentWatching(), null);
  ctx.requestedStorageOwnerId = 'owner-c';
  assert.equal(ctx.savePlaybackPosition('lesson', videos[0], { currentTime: 80 }, 'owner-b'), false);
  ctx.requestedStorageOwnerId = 'owner-b';
  for (const currentTime of [0, -1, Infinity, NaN]) assert.equal(ctx.savePlaybackPosition('lesson', videos[0], { currentTime }, 'owner-b'), false);
  assert.deepEqual(plain(ctx.S.watchHistory), {});
});

test('next recording choices follow the saved catalogue position without altering study or claiming completion', () => {
  const { ctx, videos } = context();
  ctx.S.decks = [{ id: 'lesson', title: 'Soteriology' }];
  const before = plain(ctx.S);
  assert.deepEqual(plain(ctx.nextRecordingChoices(null).map(item => item.video.id)), ['first', 'second']);
  assert.deepEqual(plain(ctx.nextRecordingChoices({ deck: ctx.S.decks[0], video: videos[0] }).map(item => item.video.id)), ['second']);
  assert.deepEqual(plain(ctx.nextRecordingChoices({ deck: ctx.S.decks[0], video: videos[1] })), []);
  assert.deepEqual(plain(ctx.S), before);
});

test('watching tool tabs retain the player, transcript state and saved study while updating focus/selection', () => {
  const { ctx } = context();
  ctx.V = { name: 'lesson-video' };
  let focused = '';
  const tabs = Object.fromEntries(['transcript','recordings'].map(tool => [tool, {
    dataset: { tool }, disabled: false, attributes: {},
    setAttribute(name,value) { this.attributes[name] = value; }, focus() { focused = tool; }
  }]));
  const panels = { transcript: { open: true, search: 'salvation' }, recordings: { open: false } };
  const side = { dataset: { watchTool: 'transcript' },
    querySelectorAll() { return Object.values(tabs); },
    querySelector(selector) {
      const tab = selector.match(/data-tool="(transcript|recordings)"/);
      if (tab) return tabs[tab[1]];
      const panel = selector.match(/^#watch-(transcript|recordings)-panel$/);
      return panel ? panels[panel[1]] : null;
    }
  };
  ctx.app = { querySelector(selector) { assert.equal(selector, '.lesson-video-side', 'tool switching never queries/remounts the player'); return side; } };
  const before = plain(ctx.S);
  ctx.selectWatchTool('recordings', true);
  assert.equal(focused, 'recordings');
  assert.equal(side.dataset.watchTool, 'recordings');
  assert.equal(tabs.recordings.attributes['aria-selected'], 'true');
  assert.equal(tabs.transcript.tabIndex, -1);
  assert.equal(panels.recordings.open, true);
  ctx.selectWatchTool('transcript', true);
  assert.equal(focused, 'transcript');
  assert.equal(panels.transcript.search, 'salvation');
  assert.deepEqual(plain(ctx.S), before);
  tabs.recordings.disabled = true;
  ctx.selectWatchTool('recordings', true);
  assert.equal(side.dataset.watchTool, 'transcript', 'an unavailable tool is not selected by keyboard');
  // A mobile disclosure may have been closed before resizing to desktop tabs.
  panels.transcript.open = false;
  const page = { querySelector(selector) { return selector === '.lesson-video-side' ? side : null; } };
  ctx.app.querySelector = selector => selector === '.lesson-video-page' ? page : side;
  ctx.window = { innerWidth: 1024 };
  ctx.document = { activeElement: null };
  ctx.syncLessonVideoLayout();
  assert.equal(panels.transcript.open, true, 'desktop resize opens the selected tool without remounting the player');
});
