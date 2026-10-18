const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const parser = require(path.join(root, 'js', 'parser.js'));
const deckFiles = JSON.parse(fs.readFileSync(path.join(root, 'decks', 'manifest.json'), 'utf8'));
const starter = deckFiles.map(file => fs.readFileSync(path.join(root, 'decks', file), 'utf8')).join('\n\n');

test('bundled starter decks parse without errors', () => {
  const result = parser.parseDecks(starter);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors, null, 2));
  assert.equal(result.decks.length, (starter.match(/^DECK:/gm) || []).length);
  assert.ok(result.decks.reduce((n, deck) => n + deck.questions.length, 0) >= 300);
  assert.ok(result.decks.every(deck => deck.questions.every(question =>
    question.question && question.options.length === 4 && /^[ABCD]$/.test(question.answer)
  )));
});

test('parser reports incomplete questions instead of silently accepting them', () => {
  const result = parser.parseDecks(`DECK: Test\n\nQ1. Example?\nA. One\nB. Two\nANSWER: E`);
  assert.equal(result.decks[0].questions.length, 0);
  assert.ok(result.errors.some(error => /missing C, D/.test(error.message)));
  assert.ok(result.errors.some(error => /invalid ANSWER/.test(error.message)));
});

test('exported deck text can be parsed back without changing card content', () => {
  const source = `DECK: Round trip\n\nQ1. First question?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta\nANSWER: C\nEXPLANATION: Because gamma is stated in the lesson.\nREF: Lesson 1, slide 3\n\nQ2. Second question?\nA. Red\nB. Green\nC. Blue\nD. Gold\nANSWER: B\n`;
  const parsed = parser.parseDecks(source).decks[0];
  const exported = parser.serializeDeck(parsed);
  const restored = parser.parseDecks(exported).decks[0];
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.questions.map(({ question, options, answer, explanation, ref }) => ({ question, options, answer, explanation, ref })))),
    JSON.parse(JSON.stringify(parsed.questions.map(({ question, options, answer, explanation, ref }) => ({ question, options, answer, explanation, ref }))))
  );
  assert.match(exported, /ANSWER: C\nEXPLANATION: Because gamma is stated in the lesson\.\nREF: Lesson 1, slide 3/);
  assert.doesNotMatch(exported, /EXPLANATION:\s*\n|REF:\s*\n/);
});
