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
