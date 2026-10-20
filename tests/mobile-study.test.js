const assert = require('node:assert/strict');
const test = require('node:test');
const MobileStudy = require('../js/mobile-study.js');

function item(deckId, id) {
  return { deckId, card: { id, question: `Question ${id}`, options: ['A', 'B', 'C', 'D'], answer: 'A' } };
}

test('daily study prioritizes due cards and limits the session to ten items', () => {
  const due = Array.from({ length: 12 }, (_, index) => item('due', `d${index}`));
  const all = [item('new', 'n1'), item('known', 'k1')];
  const selected = MobileStudy.selectDailyItems(due, all, candidate => candidate.deckId === 'known', 10);
  assert.equal(selected.length, 10);
  assert.ok(selected.every(candidate => candidate.deckId === 'due'));
});

test('daily study falls back to cards that are not mastered when nothing is due', () => {
  const all = [item('one', 'q1'), item('one', 'q2'), item('two', 'q3')];
  const selected = MobileStudy.selectDailyItems([], all, candidate => candidate.card.id === 'q2', 10);
  assert.deepEqual(selected.map(candidate => candidate.card.id), ['q1', 'q3']);
});

test('paused sessions round-trip against current deck data without changing question content', () => {
  const current = item('section-1', 'q1');
  const session = {
    name: 'quiz', cards: [{ ...current, optionOrder: [2, 0, 3, 1] }], i: 0, flipped: false, picked: 1,
    score: 1, answers: [{ item: { ...current, optionOrder: [2, 0, 3, 1] }, ok: true, selected: 'A' }],
    marks: {}, opts: { limit: 10 }, ids: ['section-1']
  };
  const restored = MobileStudy.restore(MobileStudy.snapshot(session), [{ id: 'section-1', cards: [current.card] }]);
  assert.equal(restored.name, 'quiz');
  assert.deepEqual(restored.cards[0].optionOrder, [2, 0, 3, 1]);
  assert.equal(restored.cards[0].card.question, current.card.question);
  assert.equal(restored.answers[0].selected, 'A');
  assert.equal(restored.score, 1);
});

test('paused sessions are discarded when their saved card no longer exists', () => {
  const snapshot = MobileStudy.snapshot({ name: 'flash', cards: [item('section-1', 'deleted')], i: 0, marks: {}, opts: {}, ids: [] });
  assert.equal(MobileStudy.restore(snapshot, [{ id: 'section-1', cards: [] }]), null);
});

test('selectPlanCards returns three cards with minute estimates, states, and actions', () => {
  const due = [item('d1', 'c1'), item('d1', 'c2')];
  const weak = [item('d1', 'c3')];
  const decks = [
    { id: 'd1', title: 'Discipleship Experience (Section 1) Soteriology', cards: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] }
  ];
  const all = [...due, ...weak];
  const plan = MobileStudy.selectPlanCards({
    dueItems: due,
    weakItems: weak,
    allItems: all,
    decks,
    isMastered: () => false
  });

  assert.equal(plan.length, 3);
  assert.equal(plan[0].id, 'due');
  assert.equal(plan[0].state, 'ready');
  assert.match(plan[0].oneLine, /Review 2 due cards · \d+ min/);

  assert.equal(plan[1].id, 'weak');
  assert.equal(plan[1].state, 'ready');
  assert.match(plan[1].oneLine, /Weak spots · \d+ min/);

  assert.equal(plan[2].id, 'lesson');
  assert.equal(plan[2].state, 'ready');
  assert.equal(plan[2].action, 'setup');
  assert.match(plan[2].oneLine, /Try a new lesson · Soteriology/);
});

test('selectPlanCards marks cards as done when tasks are complete', () => {
  const decks = [
    { id: 'd1', title: 'Section 1', cards: [{ id: 'c1' }] }
  ];
  const all = [item('d1', 'c1')];
  const plan = MobileStudy.selectPlanCards({
    dueItems: [],
    weakItems: [],
    allItems: all,
    decks,
    isMastered: () => true,
    completedToday: { due: true, weak: true, lesson: true }
  });

  assert.equal(plan.length, 3);
  assert.equal(plan[0].state, 'done');
  assert.equal(plan[1].state, 'done');
  // All mastered so 3rd card suggests challenge exam
  assert.equal(plan[2].id, 'exam');
  assert.equal(plan[2].action, 'exam');
});

test('calculateStreak accurately computes consecutive study days', () => {
  const now = new Date(2026, 9, 19, 14, 0).getTime(); // Oct 19, 2026
  const oneDay = 86400000;
  const today = now;
  const yesterday = now - oneDay;
  const twoDaysAgo = now - 2 * oneDay;
  const fourDaysAgo = now - 4 * oneDay;

  // Streak of 3 consecutive days ending today
  assert.equal(MobileStudy.calculateStreak([twoDaysAgo, yesterday, today], now), 3);

  // Active streak of 2 days when studied yesterday (has not studied today yet)
  assert.equal(MobileStudy.calculateStreak([twoDaysAgo, yesterday], now), 2);

  // Streak broken (last studied 4 days ago)
  assert.equal(MobileStudy.calculateStreak([fourDaysAgo], now), 0);

  // Empty timestamps
  assert.equal(MobileStudy.calculateStreak([], now), 0);
});

