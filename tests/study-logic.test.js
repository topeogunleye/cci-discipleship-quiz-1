const assert = require('node:assert/strict');
const test = require('node:test');
const StudyLogic = require('../js/study.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const at = new Date(2026, 0, 12, 10, 30).getTime();

function dayOffset(days) {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

test('Leitner review advances correct cards and resets missed cards', () => {
  const firstCorrect = StudyLogic.review(null, true, at);
  assert.equal(firstCorrect.box, 2);
  assert.equal(firstCorrect.dueAt, dayOffset(3));
  assert.equal(firstCorrect.attempts, 1);
  assert.equal(firstCorrect.misses, 0);

  const secondCorrect = StudyLogic.review(firstCorrect, true, at);
  assert.equal(secondCorrect.box, 3);
  assert.equal(secondCorrect.dueAt, dayOffset(7));

  const miss = StudyLogic.review(secondCorrect, false, at);
  assert.equal(miss.box, 1);
  assert.equal(miss.dueAt, dayOffset(1));
  assert.equal(miss.attempts, 3);
  assert.equal(miss.misses, 1);
});

test('Leitner box 4 remains capped at the 14-day interval', () => {
  const record = { box: 4, dueAt: at, attempts: 4, misses: 0, lastSeen: at };
  const reviewed = StudyLogic.review(record, true, at);
  assert.equal(reviewed.box, 4);
  assert.equal(reviewed.dueAt, dayOffset(14));
});

test('due-today includes new, overdue, and later-today cards only', () => {
  const midnight = new Date(at);
  midnight.setHours(0, 0, 0, 0);
  const endToday = new Date(at);
  endToday.setHours(24, 0, 0, 0);
  const items = [
    { id: 'new' },
    { id: 'overdue', record: { box: 1, dueAt: midnight.getTime() - 1 } },
    { id: 'later', record: { box: 2, dueAt: endToday.getTime() - 1 } },
    { id: 'tomorrow-midnight', record: { box: 2, dueAt: endToday.getTime() } },
    { id: 'tomorrow', record: { box: 2, dueAt: endToday.getTime() + 1 } }
  ];
  assert.deepEqual(StudyLogic.dueItems(items, at).map(item => item.id), ['new', 'overdue', 'later']);
});

test('legacy known and unknown marks migrate to boxes 2 and 1', () => {
  const known = StudyLogic.migrateLegacyMark('known', at);
  const unknown = StudyLogic.migrateLegacyMark('unknown', at);
  assert.deepEqual(known, { box: 2, dueAt: dayOffset(3), attempts: 0, misses: 0, lastSeen: null });
  assert.deepEqual(unknown, { box: 1, dueAt: at, attempts: 0, misses: 0, lastSeen: null });
});

test('review stats count attempts, misses, and last-seen time', () => {
  const first = StudyLogic.review(null, false, at);
  const second = StudyLogic.review(first, true, at + DAY_MS);
  assert.equal(second.attempts, 2);
  assert.equal(second.misses, 1);
  assert.equal(second.lastSeen, at + DAY_MS);
  assert.equal(StudyLogic.missRate(second), 0.5);
});

test('weak spots rank cards by highest miss rate across decks', () => {
  const cards = [
    { id: 'steady', deckId: 'a', record: { box: 3, dueAt: at, attempts: 8, misses: 1, lastSeen: at } },
    { id: 'weak', deckId: 'b', record: { box: 1, dueAt: at, attempts: 4, misses: 3, lastSeen: at } },
    { id: 'unseen', deckId: 'c' },
    { id: 'also-weak', deckId: 'd', record: { box: 1, dueAt: at, attempts: 2, misses: 1, lastSeen: at } }
  ];
  assert.deepEqual(StudyLogic.weakSpots(cards, 2).map(card => card.id), ['weak', 'also-weak']);
});

test('exam question selection samples without mutating the source list', () => {
  const cards = ['a', 'b', 'c', 'd'];
  const selected = StudyLogic.examQuestions(cards, 2, () => 0);
  assert.equal(selected.length, 2);
  assert.deepEqual(cards, ['a', 'b', 'c', 'd']);
  assert.equal(new Set(selected).size, 2);
  assert.equal(StudyLogic.examQuestions(cards, 0, () => 0).length, 4);
});

test('backup reminder triggers after 14 days or 50 studied cards, whichever comes first', () => {
  const reminder = StudyLogic.newBackupReminder(at);
  assert.equal(StudyLogic.backupReminderDue(reminder, at + 14 * DAY_MS - 1), false);
  assert.equal(StudyLogic.backupReminderDue(reminder, at + 14 * DAY_MS), true);
  assert.equal(StudyLogic.backupReminderDue(StudyLogic.recordStudied(reminder, 49, at), at), false);
  assert.equal(StudyLogic.backupReminderDue(StudyLogic.recordStudied(reminder, 50, at), at), true);
});

test('dismissing backup reminder resets both its age and studied-card count', () => {
  const active = StudyLogic.recordStudied(StudyLogic.newBackupReminder(at), 50, at);
  const dismissed = StudyLogic.resetBackupReminder(at + DAY_MS);
  assert.equal(dismissed.anchorAt, at + DAY_MS);
  assert.equal(dismissed.cardsStudied, 0);
  assert.equal(StudyLogic.backupReminderDue(dismissed, at + DAY_MS), false);
  assert.ok(StudyLogic.backupReminderDue(active, at + DAY_MS));
});
