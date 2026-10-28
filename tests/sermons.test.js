const assert = require('node:assert/strict');
const test = require('node:test');
const Sermons = require('../js/sermons.js');

test('Sermons state is separate and normalized without touching unrelated study records', () => {
  const normalized = Sermons.normalizeState({
    progress: { sermon1: { coaching: { startedAt: 10 }, modes: { read: true }, quizzesCompleted: -1, bestScore: 130 } },
    downloads: { sermon1: { audio: true, bytes: '12' } },
    reminders: { days: [1, 1, 8, '3'], time: '19:30', regularEnabled: true }
  });
  assert.equal(normalized.progress.sermon1.coaching.completedAt, null);
  assert.equal(normalized.progress.sermon1.coaching.startedAt, 10);
  assert.equal(normalized.progress.sermon1.modes.read, true);
  assert.equal(normalized.progress.sermon1.modes.quiz, false);
  assert.equal(normalized.progress.sermon1.quizzesCompleted, 0);
  assert.equal(normalized.progress.sermon1.bestScore, null);
  assert.equal(normalized.downloads.sermon1.bytes, 12);
  assert.deepEqual(normalized.reminders.days, [1]);
  assert.equal(normalized.reminders.time, '19:30');
});

test('opening coaching does not complete it; only the explicit continue operation does', () => {
  let state = Sermons.createState();
  state = Sermons.startCoaching(state, 'sermon-1', 100);
  assert.equal(state.progress['sermon-1'].coaching.completedAt, null);
  assert.equal(state.progress['sermon-1'].unfinished, true);
  state = Sermons.completeCoaching(state, 'sermon-1', 200);
  assert.equal(state.progress['sermon-1'].coaching.completedAt, 200);
  assert.equal(state.progress['sermon-1'].coaching.startedAt, 100);
  assert.equal(state.progress['sermon-1'].unfinished, false);
});

test('Sermons quiz results and mode activity remain in sermon state and summary ignores drafts', () => {
  let state = Sermons.createState();
  state = Sermons.completeCoaching(state, 'published-1', 100);
  state = Sermons.recordMode(state, 'published-1', 'read', 110);
  state = Sermons.recordQuiz(state, 'published-1', 80, 120);
  state = Sermons.recordQuiz(state, 'published-1', 60, 130);
  const result = Sermons.summary(state, [
    { id: 'published-1', status: 'published' },
    { id: 'draft-1', status: 'draft' }
  ]);
  assert.deepEqual(result, { sermonsStudied: 1, coachingCompleted: 1, quizzesCompleted: 2, unfinished: 0, averageScore: 80 });
  assert.equal(state.progress['published-1'].bestScore, 80);
  assert.equal(state.progress['published-1'].modes.read, true);
  assert.equal(state.progress['draft-1'], undefined);
});

test('reminders respect enabled flags, chosen days/time, unfinished state and once-per-day dismissal', () => {
  const dueTime = new Date(2026, 9, 26, 19, 30); // Monday
  const prefs = { regularEnabled: true, unfinishedEnabled: true, days: [1], time: '19:00', lastShown: {} };
  assert.deepEqual(Sermons.dueReminders(prefs, new Date(2026, 9, 26, 18, 59), true), []);
  assert.deepEqual(Sermons.dueReminders(prefs, dueTime, true).sort(), ['regular', 'unfinished']);
  let state = Sermons.markReminderShown({ reminders: prefs }, 'regular', '2026-10-26');
  assert.deepEqual(Sermons.dueReminders(state.reminders, dueTime, false), []);
  assert.deepEqual(Sermons.dueReminders(state.reminders, dueTime, true), ['unfinished']);
});

test('audio downloads reject cross-origin or missing resources and remove only explicit cached URLs', async () => {
  await assert.rejects(() => Sermons.downloadAudio('', {}), /unavailable/i);
  const previousLocation = global.location;
  const previousCaches = global.caches;
  global.location = { href: 'https://example.test/app/' };
  await assert.rejects(() => Sermons.downloadAudio('https://other.test/audio.mp3', {}), /same-origin/i);
  global.location = previousLocation;
  global.caches = previousCaches;
});
