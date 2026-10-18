// tests/content-lint.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const parser = require(path.join(root, 'js', 'parser.js'));
const StudyLogic = require(path.join(root, 'js', 'study.js'));
const StudyStorage = require(path.join(root, 'js', 'storage.js'));
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const deckFiles = JSON.parse(fs.readFileSync(path.join(root, 'decks', 'manifest.json'), 'utf8'));
const starter = deckFiles.map(file => fs.readFileSync(path.join(root, 'decks', file), 'utf8')).join('\n\n');
const parsed = parser.parseDecks(starter);

function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

function jaccard(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

const allQuestions = [];
parsed.decks.forEach(deck => {
  deck.questions.forEach(q => {
    if (/^\[Placeholder\b/i.test(q.question)) return;
    allQuestions.push({ deck: deck.title, id: q.id, text: q.question, options: q.options, answer: q.answer, explanation: q.explanation, ref: q.ref, normalized: normalize(q.question).join(' '), tokens: new Set(normalize(q.question)) });
  });
});

test('Check 1: Exact and near-duplicate questions (Jaccard > 0.8)', () => {
  const duplicates = [];
  for (let i = 0; i < allQuestions.length; i++) {
    for (let j = i + 1; j < allQuestions.length; j++) {
      const q1 = allQuestions[i];
      const q2 = allQuestions[j];
      const sim = jaccard(q1.tokens, q2.tokens);
      if (sim > 0.8) {
        duplicates.push({ q1, q2, sim, exact: q1.normalized === q2.normalized });
      }
    }
  }

  console.log('\n--- CONTENT LINT REPORT ---');
  console.log('\n1. EXACT AND NEAR-DUPLICATE QUESTIONS (Jaccard > 0.8):');
  if (duplicates.length === 0) {
    console.log('   None found.');
  } else {
    duplicates.forEach(({ q1, q2, sim, exact }) => {
      console.log(`   [${exact ? 'Exact' : 'Near'}, Jaccard: ${sim.toFixed(2)}]`);
      console.log(`   - ${q1.deck} (${q1.id}): ${q1.text}`);
      console.log(`   - ${q2.deck} (${q2.id}): ${q2.text}`);
    });
  }
  assert.equal(duplicates.length, 0, 'Starter decks contain exact or near-duplicate questions.');
  parsed.decks.forEach(deck => {
    const numbers = deck.questions.map(question => Number(/^q(\d+)$/.exec(question.id)?.[1]));
    assert.ok(
      numbers.every((number, index) => Number.isInteger(number) && (index === 0 || number > numbers[index - 1])),
      `Question IDs in "${deck.title}" should be unique and ordered; gaps are retained to preserve existing IDs.`
    );
  });
});

test.todo('Check 2: Answer-letter distribution (known failing; pending Prompts 2-3)', () => {
  const overall = { A: 0, B: 0, C: 0, D: 0 };
  let total = 0;
  const violations = [];

  console.log('\n2. ANSWER DISTRIBUTION:');
  parsed.decks.forEach(deck => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    deck.questions.forEach(q => {
      counts[q.answer]++;
      overall[q.answer]++;
      total++;
    });

    console.log(`   Deck: ${deck.title}`);
    for (const letter of ['A', 'B', 'C', 'D']) {
      const pct = (counts[letter] / deck.questions.length) * 100;
      console.log(`     ${letter}: ${counts[letter]} (${pct.toFixed(1)}%)`);
      if (pct === 0 || pct >= 50) {
        violations.push(`${deck.title}: ${letter} is ${pct.toFixed(1)}%`);
      }
    }
  });

  console.log('   Overall:');
  for (const letter of ['A', 'B', 'C', 'D']) {
    const pct = (overall[letter] / total) * 100;
    console.log(`     ${letter}: ${overall[letter]} (${pct.toFixed(1)}%)`);
    if (pct < 20 || pct > 30) {
      violations.push(`Overall ${letter} is ${pct.toFixed(1)}%`);
    }
  }
  assert.deepEqual(violations, [], 'Answer-letter distribution is outside the required ranges.');
});

test.todo('Check 3: "Longest option is correct" rate (known failing; pending Prompts 2-3)', () => {
  let longestCorrect = 0;

  allQuestions.forEach(q => {
    const lengths = q.options.map(opt => opt.length);
    const maxLength = Math.max(...lengths);
    const correctIndex = ['A', 'B', 'C', 'D'].indexOf(q.answer);

    if (q.options[correctIndex].length === maxLength) {
      longestCorrect++;
    }
  });

  const rate = (longestCorrect / allQuestions.length) * 100;
  console.log(`\n3. LONGEST OPTION IS CORRECT RATE: ${rate.toFixed(1)}% (${longestCorrect}/${allQuestions.length})`);

  assert.ok(rate <= 40, `Longest option is correct ${rate.toFixed(1)}% of the time, which exceeds the 40% threshold.`);
});

test('Check 4: Position-dependent answer options', () => {
  const allNonePattern = /(all of the above|none of the above)/i;
  const allNoneOptions = [];
  const bothOptions = [];

  allQuestions.forEach(q => {
    q.options.forEach(opt => {
      if (allNonePattern.test(opt)) allNoneOptions.push({ q, opt });
      if (/\bboth\b/i.test(opt)) bothOptions.push({ q, opt });
    });
  });

  console.log('\n4. POSITION-DEPENDENT OPTIONS (all/none of the above):');
  if (allNoneOptions.length === 0) {
    console.log('   None found.');
  } else {
    allNoneOptions.forEach(({ q, opt }) => {
      console.log(`   - ${q.deck} (${q.id}): ${q.text}`);
      console.log(`       -> ${opt}`);
    });
  }
  console.log('   Options containing "both" (reported for review):');
  if (bothOptions.length === 0) {
    console.log('     None found.');
  } else {
    bothOptions.forEach(({ q, opt }) => console.log(`     - ${q.deck} (${q.id}): ${opt}`));
  }

  assert.equal(allNoneOptions.length, 0, 'Found options containing "all of the above" or "none of the above".');
});

test('Check 5: Questions starting with "N." instead of "Q<n>."', () => {
  console.log('\n5. QUESTIONS STARTING WITH "N." FORMAT:');
  const bareQuestions = [];
  let deckTitle = '(unknown deck)';
  starter.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    const deckMatch = trimmed.match(/^DECK:\s*(.+)$/i);
    if (deckMatch) deckTitle = deckMatch[1];
    if (/^\d+\.\s+/.test(trimmed)) {
      bareQuestions.push({ deck: deckTitle, line: index + 1, text: trimmed });
    }
  });

  if (bareQuestions.length === 0) {
    console.log('   None found.');
  } else {
    bareQuestions.forEach(q => console.log(`   - ${q.deck} (line ${q.line}): ${q.text}`));
  }

  assert.equal(bareQuestions.length, 0, 'Found questions using bare number format "N." instead of "Q<n>."');
  assert.equal(
    parsed.warnings.filter(warning => /start with "N\." instead of "Q<n>\."/.test(warning.message)).length,
    0,
    'Parser should not warn about bare-number question labels.'
  );
});

test('explanations-todo.md lists every starter question without an explanation', () => {
  const todo = fs.readFileSync(path.join(__dirname, '..', 'explanations-todo.md'), 'utf8');
  const missing = [];
  const listed = [];

  parsed.decks.forEach(deck => {
    const questionsWithoutExplanation = deck.questions.filter(question => !question.explanation);
    const heading = `## ${deck.title} (${questionsWithoutExplanation.length})`;
    const start = todo.indexOf(heading);
    assert.notEqual(start, -1, `Missing tracking section for ${deck.title}`);
    const end = todo.indexOf('\n## ', start + heading.length);
    const section = todo.slice(start + heading.length, end < 0 ? undefined : end);
    questionsWithoutExplanation.forEach(question => missing.push(`${deck.title}:${question.id.toUpperCase()}`));
    section.match(/\bQ\d+\b/g)?.forEach(id => listed.push(`${deck.title}:${id}`));
  });

  assert.deepEqual(listed, missing);
  assert.equal(missing.length, parsed.decks.reduce((count, deck) => count + deck.questions.filter(question => !question.explanation).length, 0));
});

test('stored progress survives starter duplicate removal and renumbering', async () => {
  const section1 = 'd-discipleship-experience-section-1-soteriology';
  const section6 = 'd-discipleship-experience-section-6-prayer';
  const section7 = 'd-discipleship-experience-section-7-bible-experience-i';
  const section8 = 'd-discipleship-experience-section-8-bible-experience-ii';
  const section12 = 'd-discipleship-experience-section-12-church-history';
  const sourceChurchHistory = parsed.decks.find(deck => deck.title.endsWith('Church History'));
  const makeDeck = (id, duplicateNumber, duplicateText, addCustomCard = false) => {
    const cards = Array.from({ length: 30 }, (_, index) => {
      const number = index + 1;
      return {
        id: `${id}.q${number}`,
        question: number === duplicateNumber ? duplicateText : `Saved card ${number}`,
        options: ['One', 'Two', 'Three', 'Four'],
        answer: 'A'
      };
    });
    if (addCustomCard) cards.push({ id: `${id}.ncustom`, question: 'Custom card', options: ['One', 'Two', 'Three', 'Four'], answer: 'A', explanation: 'Custom explanation', ref: 'Custom reference' });
    return { id, title: id, cards };
  };
  const makeDeckMissingQuestion = (id, missingNumber) => ({
    id,
    title: id,
    cards: Array.from({ length: 30 }, (_, index) => index + 1)
      .filter(number => number !== missingNumber)
      .map(number => ({ id: `${id}.q${number}`, question: `Saved card ${number}`, options: ['One', 'Two', 'Three', 'Four'], answer: 'A' }))
  });
  const saved = {
    decks: [
      makeDeckMissingQuestion(section1, 27),
      makeDeck(section6, 25, 'Why does the lesson warn against making "God, help me" the entirety of one\'s prayer life?', true),
      makeDeckMissingQuestion(section7, 9),
      makeDeck(section8, 29, 'What is the danger of reading Scripture without a Christ-centered lens?'),
      { id: section12, title: sourceChurchHistory.title, cards: sourceChurchHistory.questions.slice(0, 19).map(q => ({ id: `${section12}.${q.id}`, question: q.question, options: q.options, answer: q.answer, explanation: q.id === 'q1' ? 'Stale explanation' : '', ref: q.id === 'q1' ? 'Stale reference' : '' })) }
    ],
    progress: {
      [section6]: { best: null, cards: { [`${section6}.q24`]: 'known', [`${section6}.q25`]: 'unknown', [`${section6}.q26`]: 'known', [`${section6}.q30`]: 'unknown', [`${section6}.ncustom`]: 'known' } },
      [section8]: { best: null, cards: { [`${section8}.q28`]: 'known', [`${section8}.q29`]: 'unknown', [`${section8}.q30`]: 'known' } },
      [section12]: { best: null, cards: { [`${section12}.q19`]: 'known' } }
    },
    settings: { theme: 'auto', shuffle: false },
    seeded: true,
    patched: {}
  };
  let stored = JSON.stringify(saved);
  const storageKeys = [];
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [] },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: () => {},
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
  const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
  vm.runInNewContext(testAppSource, {
    window,
    document,
    localStorage: {
      getItem: key => { storageKeys.push(key); return stored; },
      setItem: (key, value) => { storageKeys.push(key); stored = value; }
    }
  });
  await window.testAppReady;

  const migrated = JSON.parse(stored);
  const soteriology = migrated.decks.find(deck => deck.id === section1);
  const prayer = migrated.decks.find(deck => deck.id === section6);
  const bible1 = migrated.decks.find(deck => deck.id === section7);
  const bible = migrated.decks.find(deck => deck.id === section8);
  const churchHistory = migrated.decks.find(deck => deck.id === section12);
  assert.equal(migrated.dataVersion, 7);
  assert.ok(Number.isFinite(migrated.backupReminder.anchorAt));
  assert.equal(migrated.backupReminder.cardsStudied, 0);
  assert.ok(storageKeys.length > 0 && storageKeys.every(key => key === 'flashdecks.v1'));
  assert.equal(soteriology.cards.find(card => card.id === `${section1}.q27`).question, 'Which illustration is used to explain that a person may appear physically alive while lacking spiritual life?');
  assert.equal(soteriology.cards.find(card => card.id === `${section1}.q27`).options[2], 'A funeral where the body looked unchanged');
  assert.equal(soteriology.cards.find(card => card.id === `${section1}.q1`).explanation, parsed.decks[0].questions[0].explanation);
  assert.equal(soteriology.cards.find(card => card.id === `${section1}.q1`).ref, parsed.decks[0].questions[0].ref);
  assert.equal(bible1.cards.find(card => card.id === `${section7}.q9`).question, 'The Greek word musterion in Ephesians 3, is explained in the lesson as referring to:');
  assert.deepEqual(prayer.cards.filter(card => /^.+\.q\d+$/.test(card.id)).map(card => card.id), Array.from({ length: 29 }, (_, index) => `${section6}.q${index + 1}`));
  assert.equal(prayer.cards.find(card => card.id === `${section6}.q25`).question, 'Saved card 26');
  assert.equal(prayer.cards.find(card => card.id === `${section6}.ncustom`).question, 'Custom card');
  assert.equal(prayer.cards.find(card => card.id === `${section6}.ncustom`).explanation, 'Custom explanation');
  assert.equal(prayer.cards.find(card => card.id === `${section6}.ncustom`).ref, 'Custom reference');
  assert.equal(migrated.progress[section6].cards[`${section6}.q25`].box, 2);
  assert.equal(migrated.progress[section6].cards[`${section6}.q29`].box, 1);
  assert.equal(migrated.progress[section6].cards[`${section6}.ncustom`].box, 2);
  assert.equal(migrated.progress[section6].cards[`${section6}.q30`], undefined);
  assert.deepEqual(bible.cards.map(card => card.id), Array.from({ length: 29 }, (_, index) => `${section8}.q${index + 1}`));
  assert.equal(migrated.progress[section8].cards[`${section8}.q28`].box, 2);
  assert.equal(migrated.progress[section8].cards[`${section8}.q29`].box, 2);
  assert.equal(migrated.progress[section8].cards[`${section8}.q30`], undefined);
  assert.equal(churchHistory.cards.length, 30);
  assert.equal(churchHistory.cards.find(card => card.id === `${section12}.q20`).question, 'What did Sabellianism teach about the Father, Son and Holy Spirit?');
  assert.equal(churchHistory.cards.find(card => card.id === `${section12}.q30`).answer, 'C');
  assert.equal(churchHistory.cards.find(card => card.id === `${section12}.q1`).explanation, sourceChurchHistory.questions[0].explanation);
  assert.equal(churchHistory.cards.find(card => card.id === `${section12}.q1`).ref, sourceChurchHistory.questions[0].ref);
  assert.equal(migrated.progress[section12].cards[`${section12}.q19`].box, 2);
});

test('HTTP loads split decks with fetch and file URLs use the embedded fallback', async () => {
  async function boot(protocol, fetch, fallbackText, initialRaw = null) {
    let stored = initialRaw;
    const registrations = [];
    const elements = {
      app: { innerHTML: '', querySelectorAll: () => [] },
      modal: { innerHTML: '' },
      toast: { textContent: '', className: '' },
      'starter-fallback': { textContent: JSON.stringify(fallbackText) }
    };
    const document = {
      getElementById: id => elements[id],
      addEventListener: () => {},
      documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
    };
    const registration = { waiting: null, installing: null, addEventListener: () => {} };
    const serviceWorker = { controller: null, register: file => { registrations.push(file); return Promise.resolve(registration); }, addEventListener: () => {} };
    const window = { DeckParser: parser, StudyLogic, StudyStorage, navigator: { serviceWorker }, location: { protocol }, fetch, scrollTo: () => {} };
    const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
    vm.runInNewContext(testAppSource, {
      window,
      document,
      localStorage: { getItem: () => null, setItem: (_, value) => { stored = value; } }
    });
    await window.testAppReady;
    return { state: JSON.parse(stored), registrations };
  }

  const fetched = [];
  const httpResult = await boot('http:', url => {
    fetched.push(url);
    if (url === 'decks/manifest.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(deckFiles) });
    return Promise.resolve({ ok: true, text: () => Promise.resolve(fs.readFileSync(path.join(root, url), 'utf8')) });
  }, '');
  const httpState = httpResult.state;
  assert.deepEqual(httpResult.registrations, ['service-worker.js']);
  assert.deepEqual(fetched, ['decks/manifest.json', ...deckFiles.map(file => `decks/${file}`)]);
  const expectedDeckCount = parsed.decks.length;
  const expectedCardCount = parsed.decks.reduce((count, deck) => count + deck.questions.length, 0);
  assert.equal(httpState.decks.length, expectedDeckCount);
  assert.equal(httpState.decks.reduce((count, deck) => count + deck.cards.length, 0), expectedCardCount);

  let fileFetches = 0;
  const fileResult = await boot('file:', () => { fileFetches++; throw new Error('file mode must not fetch'); }, starter);
  const fileState = fileResult.state;
  assert.equal(fileFetches, 0);
  assert.deepEqual(fileResult.registrations, []);
  assert.equal(fileState.decks.length, expectedDeckCount);
  assert.equal(fileState.decks.reduce((count, deck) => count + deck.cards.length, 0), expectedCardCount);
});

test('saved starter decks refresh from source while custom cards and matching progress survive', async () => {
  const source = parsed.decks[0];
  const deckId = 'd-' + source.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const first = source.questions[0];
  const second = source.questions[1];
  const existing = {
    id: deckId,
    title: source.title,
    cards: [
      { id: `${deckId}.${first.id}`, question: first.question, options: first.options, answer: first.answer },
      { id: `${deckId}.${second.id}`, question: 'Old changed question', options: ['Old A', 'Old B', 'Old C', 'Old D'], answer: 'A' },
      { id: `${deckId}.custom`, question: 'My custom card', options: ['A', 'B', 'C', 'D'], answer: 'A' }
    ]
  };
  const raw = JSON.stringify({
    decks: [existing],
    progress: { [deckId]: { best: { pct: 80 }, cards: { [`${deckId}.${first.id}`]: { box: 2 }, [`${deckId}.${second.id}`]: { box: 3 } } } },
    settings: { theme: 'auto', shuffle: false },
    seeded: true,
    dataVersion: 7
  });
  const result = await (async () => {
    let stored = raw;
    const elements = {
      app: { innerHTML: '', querySelectorAll: () => [] },
      modal: { innerHTML: '' },
      toast: { textContent: '', className: '' },
      'starter-fallback': { textContent: JSON.stringify(starter) }
    };
    const document = { getElementById: id => elements[id], addEventListener: () => {}, documentElement: { removeAttribute: () => {}, setAttribute: () => {} } };
    const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
    const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
    vm.runInNewContext(testAppSource, { window, document, localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
    await window.testAppReady;
    return JSON.parse(stored);
  })();
  const updated = result.decks.find(deck => deck.id === deckId);
  assert.equal(updated.cards.find(card => card.id === `${deckId}.${first.id}`).question, first.question);
  assert.equal(updated.cards.find(card => card.id === `${deckId}.${second.id}`).question, second.question);
  assert.equal(updated.cards.find(card => card.id === `${deckId}.custom`).question, 'My custom card');
  assert.deepEqual(result.progress[deckId].cards[`${deckId}.${first.id}`], { box: 2 });
  assert.equal(result.progress[deckId].cards[`${deckId}.${second.id}`], undefined);
});

test('quiz and exam keyboard answers store stats and defer exam feedback until review', async () => {
  const deckId = 'd-study-test';
  const card = {
    id: `${deckId}.q1`,
    question: 'Which option is correct?',
    options: ['First answer', 'Second answer', 'Third answer', 'Fourth answer'],
    answer: 'A',
    explanation: 'The lesson supports the first answer.',
    ref: 'Lesson 4, slide 2'
  };
  let stored = JSON.stringify({
    decks: [{ id: deckId, title: 'Study test', cards: [card] }],
    progress: { [deckId]: { best: null, cards: {} } },
    settings: { theme: 'auto', shuffle: false },
    seeded: true,
    dataVersion: 3
  });
  const listeners = {};
  let fakeNow = 100000;
  let timerCallback = null;
  let timerCleared = false;
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [], querySelector: () => ({ focus: () => {} }) },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'exam-clock': { textContent: '', setAttribute: () => {} },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: (name, handler) => { listeners[name] = handler; },
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
  const testAppSource = appSource.replace(
    '  boot();',
    '  window.studyTestApi = { setSession: function (session) { V = session; }, pick: pick, begin: begin, finishExam: finishExam, flash: views.flash, quiz: views.quiz, flush: function () { return saveQueue; } };\n  window.testAppReady = boot();'
  );
  vm.runInNewContext(testAppSource, {
    window,
    document,
    Date: { now: () => fakeNow },
    setInterval: callback => { timerCallback = callback; return 1; },
    clearInterval: () => { timerCleared = true; },
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }
  });
  await window.testAppReady;

  const item = { deckId, card, optionOrder: [0, 1, 2, 3] };
  window.studyTestApi.setSession({ name: 'flash', cards: [item], i: 0, flipped: false, opts: {}, ids: [deckId] });
  const flashFront = window.studyTestApi.flash();
  assert.match(flashFront, /<button class="flip"[^>]*aria-pressed="false"/);
  assert.match(flashFront, /class="face front" aria-hidden="false"/);
  assert.match(flashFront, /class="face back" aria-hidden="true"/);
  const flipTarget = { tagName: 'BUTTON', closest: selector => selector === '.flip' ? {} : null };
  listeners.keydown({ key: ' ', target: flipTarget, preventDefault: () => {} });
  assert.match(window.studyTestApi.flash(), /aria-pressed="true"/);
  listeners.keydown({ key: 'Enter', target: flipTarget, preventDefault: () => {} });
  assert.match(window.studyTestApi.flash(), /aria-pressed="false"/);
  window.studyTestApi.setSession({ name: 'flash', cards: [item], i: 0, flipped: true, opts: {}, ids: [deckId] });
  const flashBack = window.studyTestApi.flash();
  assert.match(flashBack, /class="face front" aria-hidden="true"/);
  assert.match(flashBack, /class="face back" aria-hidden="false"/);
  assert.match(flashBack, /<strong>Explanation:<\/strong> The lesson supports the first answer/);
  assert.match(flashBack, /<strong>Reference:<\/strong> Lesson 4, slide 2/);
  const plainItem = { deckId, card: { ...card, explanation: '', ref: '' }, optionOrder: [0, 1, 2, 3] };
  window.studyTestApi.setSession({ name: 'flash', cards: [plainItem], i: 0, flipped: true, opts: {}, ids: [deckId] });
  assert.doesNotMatch(window.studyTestApi.flash(), /card-note|Lesson 4, slide 2|The lesson supports the first answer/);
  window.studyTestApi.setSession({ name: 'flash', cards: [item, item], i: 0, flipped: false, opts: {}, ids: [deckId] });
  const touchTarget = { closest: selector => selector === '.flip' ? {} : null };
  listeners.touchstart({ target: touchTarget, touches: [{ clientX: 120, clientY: 100 }] });
  listeners.touchend({ changedTouches: [{ clientX: 30, clientY: 104 }], preventDefault: () => {} });
  assert.match(elements.app.innerHTML, /2 \/ 2/);

  window.studyTestApi.setSession({ name: 'quiz', cards: [item], i: 0, picked: null, score: 0, answers: [], opts: { saveBest: false }, ids: [deckId] });
  window.studyTestApi.pick(1);
  await window.studyTestApi.flush();
  const quizFeedback = window.studyTestApi.quiz();
  assert.match(quizFeedback, /class="feedback-answer-letter"[^>]*>A<\/span>/);
  assert.match(quizFeedback, /Correct option A/);
  assert.match(quizFeedback, /<strong>Explanation:<\/strong> The lesson supports the first answer/);
  assert.match(quizFeedback, /<strong>Reference:<\/strong> Lesson 4, slide 2/);
  let progress = JSON.parse(stored).progress[deckId].cards[card.id];
  assert.deepEqual({ box: progress.box, attempts: progress.attempts, misses: progress.misses }, { box: 1, attempts: 1, misses: 1 });
  assert.ok(Number.isFinite(progress.lastSeen));
  assert.equal(JSON.parse(stored).backupReminder.cardsStudied, 1);

  window.studyTestApi.setSession({ name: 'exam', cards: [item], i: 0, picked: null, score: 0, answers: [], opts: { duration: 60000 }, ids: [deckId], remaining: 60000 });
  listeners.keydown({ key: '2', target: { tagName: 'DIV', closest: () => null }, preventDefault: () => {} });
  const examMarkup = window.studyTestApi.quiz();
  assert.match(examMarkup, /role="timer"/);
  assert.match(examMarkup, /class="opt selected"/);
  assert.match(examMarkup, /aria-pressed="true"/);
  assert.doesNotMatch(examMarkup, /class="opt (?:right|wrong)"/);
  assert.doesNotMatch(examMarkup, /Correct\.|Not quite|Correct answer|The lesson supports/);
  window.studyTestApi.finishExam(false);
  await window.studyTestApi.flush();
  assert.match(elements.app.innerHTML, /Answer review/);
  assert.match(elements.app.innerHTML, /Incorrect/);
  assert.match(elements.app.innerHTML, /class="answer-label">Correct answer<\/span><span class="answer-copy"><b>A<\/b> First answer/);
  assert.match(elements.app.innerHTML, /<strong>Explanation:<\/strong> The lesson supports the first answer\./);
  assert.match(elements.app.innerHTML, /<strong>Reference:<\/strong> Lesson 4, slide 2/);
  progress = JSON.parse(stored).progress[deckId].cards[card.id];
  assert.deepEqual({ attempts: progress.attempts, misses: progress.misses }, { attempts: 2, misses: 2 });
  assert.equal(JSON.parse(stored).backupReminder.cardsStudied, 2);

  timerCleared = false;
  window.studyTestApi.begin('exam', [item], { duration: 2000 }, [deckId]);
  assert.match(elements.app.innerHTML, /0:02/);
  fakeNow += 2001;
  timerCallback();
  await window.studyTestApi.flush();
  assert.match(elements.app.innerHTML, /Time expired/);
  assert.equal(timerCleared, true);
  progress = JSON.parse(stored).progress[deckId].cards[card.id];
  assert.deepEqual({ box: progress.box, attempts: progress.attempts, misses: progress.misses }, { box: 1, attempts: 3, misses: 3 });
  assert.equal(JSON.parse(stored).backupReminder.cardsStudied, 3);
});

test('home shows the backup reminder and dismissing it resets stored thresholds', async () => {
  const now = Date.now();
  const deckId = 'd-reminder-test';
  let stored = JSON.stringify({
    decks: [{ id: deckId, title: 'Reminder test', cards: [{ id: `${deckId}.q1`, question: 'Question?', options: ['A', 'B', 'C', 'D'], answer: 'A' }] }],
    progress: {},
    settings: { theme: 'auto', shuffle: false },
    seeded: true,
    dataVersion: 4,
    backupReminder: { anchorAt: now - 15 * 24 * 60 * 60 * 1000, cardsStudied: 12 }
  });
  const listeners = {};
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [] },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: (name, handler) => { listeners[name] = handler; },
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
  const testAppSource = appSource.replace(
    '  boot();',
    '  window.reminderTestApi = { flush: function () { return saveQueue; } };\n  window.testAppReady = boot();'
  );
  vm.runInNewContext(testAppSource, {
    window,
    document,
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } }
  });
  await window.testAppReady;
  assert.match(elements.app.innerHTML, /Back up now\?/);
  listeners.click({ target: { closest: () => ({ dataset: { act: 'backup-dismiss' } }) } });
  await window.reminderTestApi.flush();
  assert.doesNotMatch(elements.app.innerHTML, /Back up now\?/);
  const reminder = JSON.parse(stored).backupReminder;
  assert.equal(reminder.cardsStudied, 0);
  assert.ok(reminder.anchorAt >= now);
});

test('storage failures appear as an accessible alert in the app', async () => {
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [] },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: () => {},
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
  const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
  vm.runInNewContext(testAppSource, { window, document });
  await window.testAppReady;
  assert.match(elements.app.innerHTML, /role="alert"/);
  assert.match(elements.app.innerHTML, /could not be saved/i);
});

test('a waiting service worker shows an update prompt and receives SKIP_WAITING', async () => {
  const listeners = {};
  const messages = [];
  const waitingWorker = { postMessage: message => messages.push(message) };
  const registration = { waiting: waitingWorker, installing: null, addEventListener: () => {} };
  const serviceWorker = { controller: {}, register: () => Promise.resolve(registration), addEventListener: () => {} };
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [] },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: (name, handler) => { listeners[name] = handler; },
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, navigator: { serviceWorker }, location: { protocol: 'https:', reload: () => {} }, scrollTo: () => {} };
  const testAppSource = appSource.replace('  boot();', '  window.testAppReady = boot();');
  vm.runInNewContext(testAppSource, {
    window,
    document,
    localStorage: { getItem: () => null, setItem: () => {} }
  });
  await window.testAppReady;
  await new Promise(resolve => setImmediate(resolve));
  assert.match(elements.app.innerHTML, /A new version is ready/);
  listeners.click({ target: { closest: () => ({ dataset: { act: 'update-app' } }) } });
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: 'SKIP_WAITING' }]);
});

test('legacy and current JSON backups preserve optional metadata', async () => {
  const exposedAppSource = appSource.replace(
    '  boot();',
    '  window.validateBackupForTest = validateBackup;\n  window.testAppReady = boot();'
  );
  assert.notEqual(exposedAppSource, appSource, 'Backup validator test hook can be installed.');
  const elements = {
    app: { innerHTML: '', querySelectorAll: () => [] },
    modal: { innerHTML: '' },
    toast: { textContent: '', className: '' },
    'starter-fallback': { textContent: JSON.stringify(starter) }
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: () => {},
    documentElement: { removeAttribute: () => {}, setAttribute: () => {} }
  };
  const window = { DeckParser: parser, StudyLogic, StudyStorage, location: { protocol: 'file:' }, scrollTo: () => {} };
  vm.runInNewContext(exposedAppSource, {
    window,
    document,
    localStorage: { getItem: () => null, setItem: () => {} }
  });
  await window.testAppReady;

  const deck = {
    id: 'legacy',
    title: 'Legacy deck',
    cards: [
      { id: 'legacy.q1', question: 'Old card?', options: ['A', 'B', 'C', 'D'], answer: 'A' },
      { id: 'legacy.q2', question: 'New card?', options: ['A', 'B', 'C', 'D'], answer: 'B', explanation: 'Because the lesson says so.', ref: 'Lesson 1, slide 2' }
    ]
  };
  const backup = JSON.stringify({
    format: 'cci-discipleship-quiz-backup',
    version: 1,
    data: { decks: [deck], progress: {}, settings: {} }
  });
  const restored = window.validateBackupForTest(backup);
  assert.equal(restored.decks[0].cards[0].explanation, '');
  assert.equal(restored.decks[0].cards[0].ref, '');
  assert.equal(restored.decks[0].cards[1].explanation, 'Because the lesson says so.');
  assert.equal(restored.decks[0].cards[1].ref, 'Lesson 1, slide 2');
});
