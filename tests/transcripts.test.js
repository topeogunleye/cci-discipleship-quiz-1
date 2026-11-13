'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSrt, toWebVtt, parseWebVtt } = require('../js/transcripts.js');

const cue = '1\n00:00:16,960 --> 00:00:20,720\nA lesson cue.';

test('SRT export metadata and exact final literal newline marker do not become caption cues', () => {
  const exported = '\uFEFFMeeting created at: export metadata' + cue + '\n\n\\n\n';
  assert.equal(parseSrt(exported).length, 1);
  const vtt = toWebVtt(exported);
  assert.equal(vtt, 'WEBVTT\n\n00:00:16.960 --> 00:00:20.720\nA lesson cue.\n');
  assert.equal(parseWebVtt(vtt)[0].start, 16960);
});

test('malformed caption blocks still fail rather than disappearing during conversion', () => {
  assert.throws(() => parseSrt(cue + '\n\nmalformed footer'), /no valid timing/);
  assert.throws(() => parseSrt(cue + '\n\n\\n\n\n' + cue), /no valid timing/);
  assert.throws(() => parseSrt('\\n'), /empty/);
  assert.throws(() => parseSrt('1\n00:00:20,000 --> 00:00:19,000\nWrong order.'), /invalid timing/);
});

test('caption and legacy WebVTT presentation remove generic prefixes without editing raw SRT cues', () => {
  const cases = [
    ['Speaker 1: A lesson cue.', 'A lesson cue.'],
    ['\t sPeAkEr 12 :\tA lesson cue.', 'A lesson cue.'],
    ['Speaker3: A lesson cue.', 'A lesson cue.'],
    ['Speaker 1: Speaker 2: A lesson cue.', 'A lesson cue.'],
    ['Pastor Emmanuel: A lesson cue.', 'Pastor Emmanuel: A lesson cue.'],
    ['Speaker notes: Keep this wording.', 'Speaker notes: Keep this wording.'],
    ['Speaker 1 was speaking about prayer.', 'Speaker 1 was speaking about prayer.'],
    ['He asked Speaker 2: What does this mean?', 'He asked Speaker 2: What does this mean?']
  ];
  for (const [text, expected] of cases) {
    const source = cue.replace('A lesson cue.', text);
    const original = parseSrt(source)[0];
    assert.equal(original.text, text.trim(), 'Raw parsing must preserve source evidence');
    const vtt = toWebVtt(source);
    assert.equal(vtt, 'WEBVTT\n\n00:00:16.960 --> 00:00:20.720\n' + expected + '\n');
    const clean = parseWebVtt(vtt)[0];
    const legacy = parseWebVtt('WEBVTT\n\n00:00:16.960 --> 00:00:20.720\n' + text)[0];
    assert.equal(clean.text, expected);
    assert.equal(legacy.text, expected, 'Legacy responses must use the same presentation cleanup');
    assert.equal(clean.start, original.start);
    assert.equal(clean.end, original.end);
  }
});

test('multiline speaker labels are cleaned without dropping speech or real names', () => {
  const source = cue.replace('A lesson cue.', 'Speaker 1: First line.\nSpeaker 2:\nSpeaker 3: Second line.\nJohn: A real name.\nI heard Speaker 4: ask this.');
  const result = parseWebVtt(toWebVtt(source));
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'First line.\nSecond line.\nJohn: A real name.\nI heard Speaker 4: ask this.');
  assert.equal(result[0].start, 16960);
  assert.equal(result[0].end, 20720);
});

test('label-only cues fail explicitly instead of silently disappearing or producing invalid captions', () => {
  assert.throws(() => toWebVtt(cue.replace('A lesson cue.', 'Speaker 2:')), /no spoken text/);
  assert.throws(() => parseWebVtt('WEBVTT\n\n00:00:16.960 --> 00:00:20.720\nSpeaker 2:'), /no spoken text/);
});
