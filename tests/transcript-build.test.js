'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const { compileLessonTranscripts, writeLessonTranscripts } = require('../scripts/lesson-transcripts.js');
const { parseWebVtt, parseSrt } = require('../js/transcripts.js');

test('every mapped transcript compiles for server delivery without adding unmapped variants', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-transcripts.json'), 'utf8'));
  const passages = compileLessonTranscripts(root);
  assert.equal(Object.keys(passages).length, manifest.transcripts.length);
  for (const item of manifest.transcripts) {
    assert.ok(parseWebVtt(passages[item.file.replace(/\.srt$/i, '.vtt')]).length > 0);
  }
});

test('Predestination II compiles the confirmed predestinated wording with all original timings', () => {
  const root = path.join(__dirname, '..');
  const file = 'PREDESTINATION-II-Celebration-Church-International-LMS-mp4-a3c50da1-fa0b.srt';
  const source = parseSrt(fs.readFileSync(path.join(root, 'transcript', file), 'utf8'));
  const passages = compileLessonTranscripts(root);
  const output = parseWebVtt(passages[file.replace(/\.srt$/, '.vtt')]);
  const payload = cues => cues.map(({ start, end, text }) => ({ start, end, text }));
  assert.equal(output.length, 310);
  assert.deepEqual(payload(output), payload(source));
  assert.match(output[2].text, /has predestinated some unto salvation/);
  for (const variant of ['657ce7bb-69c2', 'd07b009e-8526']) {
    assert.equal(Object.hasOwn(passages, `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-${variant}.vtt`), false);
  }
});

test('a confirmed source must be reviewed again if its bytes change', t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cci-transcript-selection-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(os.tmpdir()));
    assert.match(path.basename(temporaryRoot), /^cci-transcript-selection-/);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });
  for (const directory of ['content', 'transcript']) fs.mkdirSync(path.join(temporaryRoot, directory));
  const source = '1\n00:00:00,000 --> 00:00:01,000\nOriginal wording.\n';
  const item = { videoId: 'lesson', file: 'lesson.srt', selection: {
    basis: 'user-confirmed', sourceSha256: crypto.createHash('sha256').update(source).digest('hex')
  } };
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-videos.json'), JSON.stringify({ videos: [{ id: 'lesson' }] }));
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-transcripts.json'), JSON.stringify({ schemaVersion: 1, transcripts: [item] }));
  const filename = path.join(temporaryRoot, 'transcript/lesson.srt');
  fs.writeFileSync(filename, source);
  assert.ok(compileLessonTranscripts(temporaryRoot)['lesson.vtt']);
  fs.writeFileSync(filename, source.replace(/\n/g, '\r\n'));
  assert.ok(compileLessonTranscripts(temporaryRoot)['lesson.vtt'], 'Checkout line-ending conversion must not invalidate the confirmed wording');
  fs.writeFileSync(filename, source.replace('Original', 'Edited'));
  assert.throws(() => compileLessonTranscripts(temporaryRoot), /Confirmed transcript source changed; review the selection again/);
});

test('metadata-only selections reject altered speech or timing in any duplicate candidate', t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cci-transcript-equivalence-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(temporaryRoot)), path.resolve(os.tmpdir()));
    assert.match(path.basename(temporaryRoot), /^cci-transcript-equivalence-/);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });
  for (const directory of ['content', 'transcript']) fs.mkdirSync(path.join(temporaryRoot, directory));
  const source = 'Meeting created at: export A1\n00:00:00,000 --> 00:00:01,000\nA lesson cue.\n';
  const item = { videoId: 'lesson', file: 'selected.srt', selection: {
    basis: 'metadata-only-duplicates', sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), equivalentFiles: ['duplicate.srt']
  } };
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-videos.json'), JSON.stringify({ videos: [{ id: 'lesson' }] }));
  fs.writeFileSync(path.join(temporaryRoot, 'content/lesson-transcripts.json'), JSON.stringify({ schemaVersion: 1, transcripts: [item] }));
  fs.writeFileSync(path.join(temporaryRoot, 'transcript/selected.srt'), source);
  const duplicatePath = path.join(temporaryRoot, 'transcript/duplicate.srt');
  const duplicate = source.replace('export A', 'export B').replace(/\n/g, '\r\n');
  fs.writeFileSync(duplicatePath, duplicate);
  assert.deepEqual(Object.keys(compileLessonTranscripts(temporaryRoot)), ['selected.vtt']);
  for (const altered of [
    duplicate.replace('A lesson cue.', 'Changed spoken words.'),
    duplicate.replace('00:00:01,000', '00:00:02,000'),
    duplicate.replace('A lesson cue.', 'A lesson cue.\r\nMeeting created at: actual spoken words')
  ]) {
    fs.writeFileSync(duplicatePath, altered);
    assert.throws(() => compileLessonTranscripts(temporaryRoot), /differ beyond export metadata/);
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
