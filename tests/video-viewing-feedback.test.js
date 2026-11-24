const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function showLessonVideoFeedback('), source.indexOf('  function cardMatchesVideo('));
const { bindLessonVideoFeedback, seekLessonTranscript } = vm.runInNewContext(helpers + ';({bindLessonVideoFeedback,seekLessonTranscript})');

function fixture() {
  const status = { textContent: '' }, retry = { hidden: true };
  const listeners = {};
  const player = {
    currentTime: 56, duration: 120, readyState: 0, paused: true, loads: 0,
    pause() { this.paused = true; },
    load() { this.loads++; this.currentTime = 0; },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  retry.addEventListener = (name, callback) => { retry[name] = callback; };
  const feedback = { querySelector: selector => selector === 'button' ? retry : status };
  return { player, status, retry, feedback, listeners };
}

test('loading, buffering, recovery and errors provide persistent status without automatic reloads', () => {
  const f = fixture();
  bindLessonVideoFeedback(f.player, f.feedback);
  assert.match(f.status.textContent, /Loading/);
  f.listeners.waiting();
  assert.match(f.status.textContent, /Buffering/);
  f.listeners.playing();
  assert.equal(f.status.textContent, '');
  f.listeners.stalled();
  assert.equal(f.retry.hidden, false);
  f.player.error = { code: 2 };
  f.listeners.error();
  assert.match(f.status.textContent, /connection/);
  assert.equal(f.player.loads, 0);
  f.listeners.canplay();
  assert.notEqual(f.status.textContent, '', 'A stale ready event must not hide an error');
  f.retry.click();
  assert.equal(f.player.loads, 1);
  assert.equal(f.retry.hidden, true);
  f.player.error = null;
  f.player.readyState = 1;
  f.listeners.loadedmetadata();
  assert.equal(f.player.currentTime, 56);
  assert.equal(f.player.paused, true);
  assert.equal(f.status.textContent, '');
  f.listeners.canplay();
  assert.equal(f.player.loads, 1, 'Recovery must not start a retry loop');
});

test('decode failures give safe guidance and retry clamps an old position to the new duration', () => {
  const f = fixture();
  bindLessonVideoFeedback(f.player, f.feedback);
  f.player.error = { code: 4, message: 'private internal detail' };
  f.listeners.error();
  assert.match(f.status.textContent, /another browser/);
  assert.doesNotMatch(f.status.textContent, /private internal detail/);
  f.retry.click();
  f.player.error = null;
  f.player.readyState = 1;
  f.player.duration = 30;
  f.listeners.loadedmetadata();
  assert.equal(f.player.currentTime, 30);
});

test('a source-level failure offers retry even when the video has no MediaError', () => {
  const f = fixture();
  let failSource;
  f.player.querySelector = () => ({ addEventListener: (name, handler) => { failSource = handler; } });
  bindLessonVideoFeedback(f.player, f.feedback);
  failSource();
  assert.match(f.status.textContent, /could not load/);
  assert.equal(f.retry.hidden, false);
  assert.equal(f.player.loads, 0);
});

test('transcript seek confirms timestamp, offers return and preserves paused or playing state', () => {
  const f = fixture();
  const back = { hidden: true };
  const details = { querySelector: selector => selector === '.lesson-transcript-status' ? f.status : back };
  seekLessonTranscript(f.player, details, 56.6);
  assert.equal(f.player.currentTime, 56.6);
  assert.match(f.status.textContent, /00:00:56.*remains paused/);
  assert.equal(back.hidden, false);
  f.player.paused = false;
  seekLessonTranscript(f.player, details, 90);
  assert.equal(f.player.paused, false);
  assert.match(f.status.textContent, /00:01:30.*continues/);
  seekLessonTranscript(f.player, details, 999);
  assert.equal(f.player.currentTime, 120);
  seekLessonTranscript(f.player, details, -1);
  assert.equal(f.player.currentTime, 120);
});
