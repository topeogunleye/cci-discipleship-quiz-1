'use strict';

// Checks content/sermons.json and each sermon's deck before you publish a new sermon.
// Usage: npm run validate:sermons

const fs = require('node:fs');
const path = require('node:path');
const SermonLogic = require('../js/sermons.js');
const parser = require('../js/parser.js');

const root = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];
let list;
try {
  list = JSON.parse(fs.readFileSync(path.join(root, 'content', 'sermons.json'), 'utf8'));
} catch (error) {
  console.error('Could not read content/sermons.json: ' + error.message);
  process.exit(1);
}
if (!Array.isArray(list)) { console.error('content/sermons.json must be a list of sermons.'); process.exit(1); }

const seen = new Set();
for (const entry of list) {
  const id = entry && entry.id ? entry.id : '(no id)';
  SermonLogic.validateSermon(entry).forEach(message => errors.push(message));
  if (seen.has(id)) errors.push(id + ': duplicate id');
  seen.add(id);
  if (!entry || typeof entry !== 'object') continue;
  if (entry.deckFile) {
    const file = path.join(root, 'content', 'sermons', entry.deckFile);
    if (!fs.existsSync(file)) errors.push(id + ': deck file content/sermons/' + entry.deckFile + ' does not exist');
    else {
      const parsed = parser.parseDecks(fs.readFileSync(file, 'utf8'));
      if (parsed.decks.length !== 1) errors.push(id + ': ' + entry.deckFile + ' must contain exactly one DECK line');
      (parsed.errors || []).forEach(problem => errors.push(id + ': ' + entry.deckFile + ' line ' + problem.line + ': ' + problem.message));
      if (parsed.decks[0] && parsed.decks[0].questions.length < 5) warnings.push(id + ': deck has only ' + parsed.decks[0].questions.length + ' questions (5 or more is recommended)');
    }
  } else {
    warnings.push(id + ': no deckFile, so members cannot quiz or flashcard this sermon');
  }
  if (!entry.audio) warnings.push(id + ': no audio, so this sermon is read-only');
  else {
    if (!SermonLogic.isRemoteUrl(entry.audio.url) && !fs.existsSync(path.join(root, entry.audio.url))) errors.push(id + ': audio file ' + entry.audio.url + ' does not exist');
    if (!entry.audio.sizeBytes) warnings.push(id + ': audio.sizeBytes is missing, so the app cannot show the download size');
  }
  if (entry.status === 'draft') warnings.push(id + ': status is "draft" (hidden from members unless "Show Draft" is on)');
}

console.log(list.length + ' sermon' + (list.length === 1 ? '' : 's') + ' checked.');
warnings.forEach(message => console.log('warning: ' + message));
errors.forEach(message => console.error('error: ' + message));
process.exit(errors.length ? 1 : 0);
