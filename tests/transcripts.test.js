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
