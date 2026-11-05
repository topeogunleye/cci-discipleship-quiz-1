'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function accountUi(service, initialStatus) {
  const elements = { app: {}, modal: {}, toast: {}, 'account-message': { textContent: '' } };
  const window = {
    DeckParser: require('../js/parser.js'),
    StudyStorage: require('../js/storage.js'),
    SermonStudy: require('../js/sermons.js'),
    CCITranscripts: require('../js/transcripts.js'),
    CCIAccount: { create: () => service },
    location: { protocol: 'capacitor:', origin: 'capacitor://localhost', href: 'capacitor://localhost/' }
  };
  const document = { getElementById: id => elements[id], addEventListener() {} };
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8').replace('  boot();', `
    render = function () {};
    accountStatus = window.initialStatus;
    window.accountUi = { act: accountAction, settings: accountSettingsSection, videos: normalizeLessonVideos, transcript: loadLessonTranscript, clearTranscript: clearLessonTranscriptCache };
  `);
  window.initialStatus = initialStatus || { configured: true };
  vm.runInNewContext(source, { window, document, URL });
  return { ui: window.accountUi, elements, window };
}

test('a short signup password is rejected without preventing an existing account from signing in', async () => {
  let signins = 0, signups = 0, focused = false;
  const { ui, elements } = accountUi({
    signUp: async () => { signups++; return {}; },
    signIn: async () => { signins++; return { error: 'Test sign-in response.' }; }
  });
  const attributes = new Map();
  const password = { value: 'short', focus() { focused = true; }, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const form = { elements: { email: { value: 'learner@example.test' }, password }, setAttribute() {}, querySelectorAll: () => [] };
  ui.act('account-signup', form);
  assert.equal(signups, 0);
  assert.equal(focused, true);
  assert.equal(attributes.get('aria-invalid'), 'true');
  assert.match(elements['account-message'].textContent, /at least 8 characters/);
  ui.act('account-signin', form);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signins, 1);
  assert.equal(attributes.has('aria-invalid'), false);
});

test('temporary account connection failures provide an explicit working retry', async () => {
  let retries = 0;
  const { ui } = accountUi({ retry: async () => { retries++; return { configured: true, initializationState: 'ready' }; } }, {
    configured: false, initializationState: 'unavailable', initializationError: 'Account services could not be reached.'
  });
  assert.match(ui.settings(), /Retry account connection/);
  assert.match(ui.settings(), /could not be reached/);
  assert.doesNotMatch(ui.settings(), /maintainer|not configured/);
  ui.act('account-retry');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retries, 1);
  assert.match(ui.settings(), /data-account-form/);
});

test('native lesson captions and transcript use the same authenticated host as the video', () => {
  const { ui } = accountUi({ apiBase: 'https://study.example' });
  const videos = ui.videos({ schemaVersion: 1, videos: [{ id: 'lesson-1', deckId: 'd-lesson', title: 'Lesson', objectKey: 'Lesson/video.mp4' }] }, {
    schemaVersion: 1, language: 'en', transcripts: [{ videoId: 'lesson-1', file: 'Lesson.srt' }]
  });
  assert.equal(videos[0].captionsUrl, 'https://study.example/transcript/Lesson.vtt');
  assert.equal(videos[0].transcriptUrl, videos[0].captionsUrl);
  assert.equal(new URL(videos[0].videoUrl).origin, new URL(videos[0].captionsUrl).origin);
});

test('an account change clears transcript memory and rejects the previous account’s pending response', async () => {
  const { ui, window } = accountUi({});
  const pending = [];
  window.fetch = () => new Promise(resolve => pending.push(resolve));
  const oldRequest = ui.transcript('https://study.example/transcript/Lesson.vtt');
  const oldResult = assert.rejects(oldRequest, /account changed/);
  ui.clearTranscript();
  const newRequest = ui.transcript('https://study.example/transcript/Lesson.vtt');
  const response = text => ({ ok: true, text: async () => 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n' + text });
  pending[0](response('Previous account request.'));
  await oldResult;
  pending[1](response('Current account request.'));
  assert.equal((await newRequest)[0].text, 'Current account request.');
  assert.equal((await ui.transcript('https://study.example/transcript/Lesson.vtt'))[0].text, 'Current account request.');
  assert.equal(pending.length, 2);
});
