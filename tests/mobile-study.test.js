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


test('parseChapterTitle extracts section number, section label, and clean topic', () => {
  const parsed1 = MobileStudy.parseChapterTitle('Discipleship Experience (Section 1) Soteriology');
  assert.equal(parsed1.sectionNum, 1);
  assert.equal(parsed1.sectionLabel, 'Section 1');
  assert.equal(parsed1.topic, 'Soteriology');

  const parsed12 = MobileStudy.parseChapterTitle('(Section 12) Church History');
  assert.equal(parsed12.sectionNum, 12);
  assert.equal(parsed12.sectionLabel, 'Section 12');
  assert.equal(parsed12.topic, 'Church History');

  const custom = MobileStudy.parseChapterTitle('My Custom Topic');
  assert.equal(custom.sectionNum, null);
  assert.equal(custom.sectionLabel, 'Lesson');
  assert.equal(custom.topic, 'My Custom Topic');
});

test('getChapterSteps returns four study steps with soft unlock states', () => {
  const deck = {
    id: 'd1',
    title: 'Discipleship Experience (Section 1) Soteriology',
    cards: [
      { id: 'c1', question: 'Q1' },
      { id: 'c2', question: 'Q2' },
      { id: 'c3', question: 'Q3' }
    ]
  };

  // Case A: Fresh deck (not studied yet)
  const freshSteps = MobileStudy.getChapterSteps(deck, { cards: {} });
  assert.equal(freshSteps.length, 4);
  assert.equal(freshSteps[0].id, 'flash');
  assert.equal(freshSteps[0].state, 'unlocked');
  assert.equal(freshSteps[1].id, 'quiz');
  assert.equal(freshSteps[1].state, 'recommended-next');
  assert.equal(freshSteps[2].id, 'weak');
  assert.equal(freshSteps[2].state, 'unlocked');
  assert.equal(freshSteps[3].id, 'exam');
  assert.equal(freshSteps[3].state, 'unlocked');

  // Case B: In-progress deck with quiz completed and a weak spot
  const inProgProgress = {
    best: { score: 2, total: 3, pct: 67 },
    cards: {
      c1: { box: 2, attempts: 2, misses: 0 },
      c2: { box: 1, attempts: 2, misses: 1 },
      c3: { box: 0, attempts: 0, misses: 0 }
    }
  };
  const inProgSteps = MobileStudy.getChapterSteps(deck, inProgProgress);
  assert.equal(inProgSteps[0].state, 'in-progress');
  assert.equal(inProgSteps[1].state, 'complete');
  assert.equal(inProgSteps[2].state, 'in-progress');
  assert.match(inProgSteps[2].meta, /1 card to strengthen/);

  // Case C: Fully mastered deck
  const masteredProgress = {
    best: { score: 3, total: 3, pct: 100 },
    cards: {
      c1: { box: 2, attempts: 2, misses: 0 },
      c2: { box: 2, attempts: 2, misses: 0 },
      c3: { box: 2, attempts: 2, misses: 0 }
    }
  };
  const masteredSteps = MobileStudy.getChapterSteps(deck, masteredProgress);
  assert.equal(masteredSteps[0].state, 'complete');
  assert.equal(masteredSteps[1].state, 'complete');
  assert.equal(masteredSteps[2].state, 'complete');
  assert.equal(masteredSteps[3].state, 'complete');
});
