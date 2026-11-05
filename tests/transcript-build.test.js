'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { compileLessonTranscripts, writeLessonTranscripts } = require('../scripts/lesson-transcripts.js');
const { parseWebVtt } = require('../js/transcripts.js');

test('every mapped transcript compiles for server delivery without adding unmapped variants', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-transcripts.json'), 'utf8'));
  const passages = compileLessonTranscripts(root);
  assert.equal(Object.keys(passages).length, manifest.transcripts.length);
  for (const item of manifest.transcripts) {
    assert.ok(parseWebVtt(passages[item.file.replace(/\.srt$/i, '.vtt')]).length > 0);
  }
});

test('build writes transcript payloads only to server code and removes old public WebVTT assets', t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cci-transcript-build-'));
  t.after(() => {
    const resolved = path.resolve(temporaryRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^cci-transcript-build-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const directory of ['content', 'transcript', 'dist/transcript']) fs.mkdirSync(path.join(temporaryRoot, directory), { recursive: true });
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-videos.json'), JSON.stringify({ videos: [{ id: 'lesson' }] }));
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-transcripts.json'), JSON.stringify({ schemaVersion: 1, transcripts: [{ videoId: 'lesson', file: 'lesson.srt' }] }));
  const source = '1\n00:00:00,000 --> 00:00:01,000\nPrivate lesson text.\n\n\\n\n';
  fs.writeFileSync(path.join(temporaryRoot, 'transcript/lesson.srt'), source);
  fs.writeFileSync(path.join(temporaryRoot, 'dist/transcript/old.vtt'), 'old public content');
  fs.writeFileSync(path.join(temporaryRoot, 'dist/transcript/unrelated.txt'), 'preserve');

  const compiled = writeLessonTranscripts(temporaryRoot);
  const generated = require(path.join(temporaryRoot, 'functions/_generated/lesson-transcripts.cjs'));
  assert.equal(generated['lesson.vtt'], compiled['lesson.vtt']);
  assert.match(generated['lesson.vtt'], /Private lesson text/);
  assert.equal(fs.existsSync(path.join(temporaryRoot, 'dist/transcript/old.vtt')), false);
  assert.equal(fs.existsSync(path.join(temporaryRoot, 'dist/transcript/lesson.vtt')), false);
  assert.equal(fs.readFileSync(path.join(temporaryRoot, 'dist/transcript/unrelated.txt'), 'utf8'), 'preserve');
  assert.equal(fs.readFileSync(path.join(temporaryRoot, 'transcript/lesson.srt'), 'utf8'), source);
});
