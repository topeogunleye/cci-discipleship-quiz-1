const assert = require('node:assert/strict');
const test = require('node:test');
const Sermons = require('../js/sermons.js');
const SermonsUI = require('../js/sermons-ui.js');

test('Sermons state is separate and normalized without touching unrelated study records', () => {
  const normalized = Sermons.normalizeState({
    progress: { sermon1: { coaching: { startedAt: 10 }, modes: { read: true }, quizzesCompleted: -1, bestScore: 130 } },
    downloads: { sermon1: { audio: true, bytes: '12' } },
    reminders: { days: [1, 1, 8, '3'], time: '19:30', regularEnabled: true }
  });
  assert.equal(normalized.progress.sermon1.coaching.completedAt, null);
  assert.equal(normalized.progress.sermon1.coaching.startedAt, 10);
  assert.equal(normalized.progress.sermon1.modes.read, true);
  assert.equal(normalized.progress.sermon1.modes.quiz, false);
  assert.equal(normalized.progress.sermon1.quizzesCompleted, 0);
  assert.equal(normalized.progress.sermon1.bestScore, null);
  assert.equal(normalized.downloads.sermon1.bytes, 12);
  assert.deepEqual(normalized.reminders.days, [1]);
  assert.equal(normalized.reminders.time, '19:30');
});

test('an unscored started sermon stays unscored through normalization', () => {
  let state = Sermons.startMode(Sermons.createState(), 'sermon-1', 'read', 100);
  state = Sermons.normalizeState(state);
  assert.equal(state.progress['sermon-1'].bestScore, null);
  assert.equal(Sermons.summary(state, [{ id: 'sermon-1', status: 'published' }]).averageScore, null);
});

test('malformed non-finite progress and download values normalize safely', () => {
  const state = Sermons.normalizeState({
    progress: { 'sermon-1': { quizzesCompleted: Infinity, bestScore: null } },
    downloads: { 'sermon-1': { audio: true, audioBytes: Infinity, coachingAudio: true, coachingBytes: -3, bytes: Infinity } },
    audio: { currentTime: Infinity }
  });
  assert.equal(state.progress['sermon-1'].quizzesCompleted, 0);
  assert.equal(state.progress['sermon-1'].bestScore, null);
  assert.equal(state.downloads['sermon-1'].bytes, 0);
  assert.equal(state.audio.currentTime, 0);
});

test('opening coaching does not complete it; only the explicit continue operation does', () => {
  let state = Sermons.createState();
  state = Sermons.startCoaching(state, 'sermon-1', 100);
  assert.equal(state.progress['sermon-1'].coaching.completedAt, null);
  assert.equal(state.progress['sermon-1'].unfinished, true);
  state = Sermons.completeCoaching(state, 'sermon-1', 200);
  assert.equal(state.progress['sermon-1'].coaching.completedAt, 200);
  assert.equal(state.progress['sermon-1'].coaching.startedAt, 100);
  assert.equal(state.progress['sermon-1'].unfinished, false);
});

test('Sermons quiz results and mode activity remain in sermon state and summary ignores drafts', () => {
  let state = Sermons.createState();
  state = Sermons.completeCoaching(state, 'published-1', 100);
  state = Sermons.recordMode(state, 'published-1', 'read', 110);
  state = Sermons.recordQuiz(state, 'published-1', 80, 120);
  state = Sermons.recordQuiz(state, 'published-1', 60, 130);
  const result = Sermons.summary(state, [
    { id: 'published-1', status: 'published' },
    { id: 'draft-1', status: 'draft' }
  ]);
  assert.deepEqual(result, { sermonsStudied: 1, coachingCompleted: 1, quizzesCompleted: 2, unfinished: 0, averageScore: 80 });
  assert.equal(state.progress['published-1'].bestScore, 80);
  assert.equal(state.progress['published-1'].modes.read, true);
  assert.equal(state.progress['draft-1'], undefined);
});

test('starting a sermon mode marks it unfinished and explicit completion clears it for resume reminders', () => {
  let state = Sermons.createState();
  state = Sermons.completeCoaching(state, 'sermon-1', 100);
  state = Sermons.startMode(state, 'sermon-1', 'read', 110);
  assert.equal(state.progress['sermon-1'].unfinished, true);
  assert.equal(state.progress['sermon-1'].lastMode, 'read');
  state = Sermons.recordMode(state, 'sermon-1', 'read', 120);
  assert.equal(state.progress['sermon-1'].unfinished, false);
  assert.equal(state.progress['sermon-1'].lastMode, 'read');
});

test('Sermons UI shows no invented catalogue entries and maps letter answers to quiz options', () => {
  const blank = SermonsUI.render('sermons-library', {
    sermons: [], state: Sermons.createState(), settings: { showDraftSermons: false }, summary: {}, view: {}, online: true
  });
  assert.match(blank, /No published sermons yet/);
  assert.doesNotMatch(blank, /Sample sermon|John Smith/);
  const orderedHome = SermonsUI.render('sermons-home', {
    sermons: [
      { id: 'old', status: 'published', title: 'Older sermon', date: '2025-01-01' },
      { id: 'new', status: 'published', title: 'Newer sermon', date: '2026-01-01' }
    ], state: Sermons.createState(), settings: { showDraftSermons: false },
    summary: { sermonsStudied: 0, coachingCompleted: 0, quizzesCompleted: 0 }, view: {}, online: true
  });
  assert.ok(orderedHome.indexOf('Newer sermon') < orderedHome.indexOf('Older sermon'));
  const sermon = { id: 'review-1', status: 'published', title: 'Test sermon', speaker: 'Test speaker', date: '2026-01-01', scripture: 'John 1', quiz: [{ question: 'Which answer is correct?', options: ['Wrong', 'Correct', 'Another', 'Last'], answer: 'B', explanation: 'The second choice follows the text.' }] };
  const html = SermonsUI.render('sermons-quiz', {
    sermons: [sermon], state: Sermons.createState(), settings: { showDraftSermons: false }, summary: {}, online: true,
    view: { id: sermon.id, quiz: { index: 0, answers: [{ choice: 0, correct: false, feedback: 'Review the reference.' }] } }
  });
  assert.match(html, /sermon-answer is-correct/);
  assert.match(html, /Correct answer/);
  assert.match(html, /Review the reference/);
  const player = SermonsUI.render('sermons-player', {
    sermons: [{ id: 'audio-1', status: 'published', title: 'Audio sermon', audioUrl: '/media/audio.mp3' }],
    state: Sermons.createState(), settings: { showDraftSermons: false }, summary: {}, view: { id: 'audio-1' },
    downloadsProgress: {}, audioDownloadsSupported: false
  });
  assert.match(player, /Offline audio download unavailable in this browser/);
  assert.match(player, /aria-label="Listen to Audio sermon"/);
  assert.doesNotMatch(player, /data-act="sermon-download"/);
  const coaching = SermonsUI.render('sermons-coaching', {
    sermons: [{ id: 'audio-1', status: 'published', title: 'Audio sermon', coachingAudioUrl: '/media/coaching.mp3' }],
    state: Sermons.createState(), settings: { showDraftSermons: false }, summary: {}, view: { id: 'audio-1' }, audioDownloadsSupported: true
  });
  assert.match(coaching, /aria-label="Coaching narration for Audio sermon"/);
  const hiddenDraftDownloads = SermonsUI.render('sermons-downloads', {
    sermons: [{ id: 'draft-audio', status: 'draft', title: 'Draft audio', audioUrl: '/media/draft.mp3' }],
    state: { ...Sermons.createState(), downloads: { 'draft-audio': { audio: true, coachingAudio: false, audioBytes: 16, coachingBytes: 0, bytes: 16 } } },
    settings: { showDraftSermons: false }, summary: {}, view: {}, downloadsProgress: {}, audioDownloadsSupported: true, online: true
  });
  assert.match(hiddenDraftDownloads, /Draft audio/);
  assert.match(hiddenDraftDownloads, /Draft placeholder/);
  assert.match(hiddenDraftDownloads, /data-act="sermon-remove-download" data-kind="audio"/);
});

test('reminders respect enabled flags, chosen days/time, unfinished state and once-per-day dismissal', () => {
  const dueTime = new Date(2026, 9, 26, 19, 30); // Monday
  const prefs = { regularEnabled: true, unfinishedEnabled: true, days: [1], time: '19:00', lastShown: {} };
  assert.deepEqual(Sermons.dueReminders(prefs, new Date(2026, 9, 26, 18, 59), true), []);
  assert.deepEqual(Sermons.dueReminders(prefs, dueTime, true).sort(), ['regular', 'unfinished']);
  let state = Sermons.markReminderShown({ reminders: prefs }, 'regular', '2026-10-26');
  assert.deepEqual(Sermons.dueReminders(state.reminders, dueTime, false), []);
  assert.deepEqual(Sermons.dueReminders(state.reminders, dueTime, true), ['unfinished']);
  assert.equal(Sermons.localDateKey(dueTime), '2026-10-26');
});

test('audio downloads reject cross-origin or missing resources and remove only explicit cached URLs', async () => {
  await assert.rejects(() => Sermons.downloadAudio('', {}), /unavailable/i);
  const previousLocation = global.location;
  const previousCaches = global.caches;
  global.location = { href: 'https://example.test/app/' };
  await assert.rejects(() => Sermons.downloadAudio('https://other.test/audio.mp3', {}), /same-origin/i);
  global.location = previousLocation;
  global.caches = previousCaches;
});

test('explicit audio download stores bytes in the dedicated cache and removal deletes only the same-origin URL', async () => {
  const previous = { location: global.location, caches: global.caches, fetch: global.fetch };
  const entries = new Map(), progress = [], url = 'https://example.test/media/sermon.mp3';
  let requestOptions;
  global.location = { href: 'https://example.test/app/', origin: 'https://example.test' };
  global.caches = {
    open: async name => {
      assert.equal(name, Sermons.CACHE_NAME);
      return {
        put: async (key, response) => { const body = await response.clone().arrayBuffer(); entries.set(key, new Response(body, { headers: response.headers })); },
        match: async key => entries.get(key)?.clone() || null,
        delete: async key => entries.delete(key)
      };
    }
  };
  global.fetch = async (requestedUrl, options) => {
    requestOptions = options;
    assert.equal(requestedUrl, url);
    return new Response(new Uint8Array([10, 20, 30, 40]), { headers: { 'content-type': 'audio/mpeg', 'content-length': '4' } });
  };
  try {
    const result = await Sermons.downloadAudio(url, { onProgress: value => progress.push(value) });
    assert.equal(result.bytes, 4);
    assert.equal(requestOptions.credentials, 'same-origin');
    assert.equal(requestOptions.headers['X-Sermon-Download'], '1');
    assert.equal(progress.at(-1).percent, 100);
    const cached = await (await global.caches.open(Sermons.CACHE_NAME)).match(url);
    assert.equal(cached.headers.get('accept-ranges'), 'bytes');
    await assert.rejects(() => Sermons.removeAudio('https://outside.test/audio.mp3'), /same-origin/i);
    assert.equal(await Sermons.removeAudio(url), true);
    assert.equal(entries.size, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
});

test('canceling a streamed audio download rejects without publishing a partial cache entry', async () => {
  const previous = { location: global.location, caches: global.caches, fetch: global.fetch };
  const entries = new Map(), url = 'https://example.test/media/cancel-me.mp3';
  global.location = { href: 'https://example.test/app/', origin: 'https://example.test' };
  global.caches = { open: async () => ({ put: async (key, response) => { const body = await response.arrayBuffer(); entries.set(key, body); } }) };
  global.fetch = async (_, options) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      options.signal.addEventListener('abort', () => controller.error(new DOMException('Canceled', 'AbortError')), { once: true });
    }
  }), { headers: { 'content-type': 'audio/mpeg', 'content-length': '10' } });
  try {
    const controller = new AbortController();
    let requestedCancel = false;
    await assert.rejects(
      () => Sermons.downloadAudio(url, { controller, onProgress: () => { if (!requestedCancel) { requestedCancel = true; controller.abort(); } } }),
      error => error && error.name === 'AbortError'
    );
    assert.equal(entries.has(url), false);
  } finally {
    global.location = previous.location; global.caches = previous.caches; global.fetch = previous.fetch;
  }
});
