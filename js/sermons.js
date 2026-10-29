(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SermonStudy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CACHE_NAME = 'cci-sermon-downloads-v1';
  var MODES = ['listen', 'read', 'quiz', 'flashcards'];
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function nonNegativeInteger(value) { var number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0; }
  function createState() {
    return { progress: Object.create(null), downloads: Object.create(null), audio: { sermonId: null, currentTime: 0, playbackRate: 1, playing: false }, reminders: { regularEnabled: false, unfinishedEnabled: false, days: [], time: '19:00', lastShown: {} } };
  }
  function normalizeState(value) {
    var source = object(value), result = createState();
    Object.keys(object(source.progress)).forEach(function (id) {
      if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id)) return;
      var old = object(source.progress[id]), modes = {};
      MODES.forEach(function (mode) { modes[mode] = !!object(old.modes)[mode]; });
      var coaching = object(old.coaching);
      var score = old.bestScore === null || old.bestScore === undefined || old.bestScore === '' ? NaN : Number(old.bestScore);
      result.progress[id] = {
        coaching: { completedAt: Number.isFinite(+coaching.completedAt) && +coaching.completedAt > 0 ? +coaching.completedAt : null, startedAt: Number.isFinite(+coaching.startedAt) && +coaching.startedAt > 0 ? +coaching.startedAt : null },
        modes: modes,
        quizzesCompleted: nonNegativeInteger(old.quizzesCompleted),
        bestScore: Number.isFinite(score) && score >= 0 && score <= 100 ? score : null,
        lastStudiedAt: Number.isFinite(+old.lastStudiedAt) && +old.lastStudiedAt > 0 ? +old.lastStudiedAt : null,
        lastMode: MODES.indexOf(old.lastMode) >= 0 ? old.lastMode : null,
        unfinished: !!old.unfinished
      };
    });
    Object.keys(object(source.downloads)).forEach(function (id) {
      if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id)) return;
      var item = object(source.downloads[id]);
      var legacyBytes = nonNegativeInteger(item.bytes);
      var audioBytes = nonNegativeInteger(item.audioBytes), coachingBytes = nonNegativeInteger(item.coachingBytes);
      if (!audioBytes && !coachingBytes && legacyBytes) { if (item.audio) audioBytes = legacyBytes; else if (item.coachingAudio) coachingBytes = legacyBytes; }
      result.downloads[id] = { audio: item.audio === true, coachingAudio: item.coachingAudio === true, audioBytes: audioBytes, coachingBytes: coachingBytes, bytes: audioBytes + coachingBytes, updatedAt: Number.isFinite(+item.updatedAt) ? +item.updatedAt : null };
    });
    var audio = object(source.audio);
    var playbackRate = Number(audio.playbackRate);
    var currentTime = Number(audio.currentTime);
    result.audio = { sermonId: typeof audio.sermonId === 'string' ? audio.sermonId : null, currentTime: Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0, playbackRate: [0.75, 1, 1.25, 1.5, 2].indexOf(playbackRate) >= 0 ? playbackRate : 1, playing: !!audio.playing };
    var reminders = object(source.reminders);
    result.reminders = {
      regularEnabled: !!reminders.regularEnabled,
      unfinishedEnabled: !!reminders.unfinishedEnabled,
      days: Array.isArray(reminders.days) ? Array.from(new Set(reminders.days.filter(function (day) { return Number.isInteger(day) && day >= 0 && day <= 6; }))).sort() : [],
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(reminders.time || '') ? reminders.time : '19:00',
      lastShown: object(reminders.lastShown)
    };
    return result;
  }
  function progressFor(state, sermonId) {
    state = normalizeState(state);
    if (!state.progress[sermonId]) state.progress[sermonId] = normalizeState({ progress: {} }).progress[sermonId] || {
      coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false
    };
    return state.progress[sermonId];
  }
  function completeCoaching(state, sermonId, now) {
    state = normalizeState(state);
    if (!sermonId) return state;
    var progress = state.progress[sermonId] || (state.progress[sermonId] = { coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false });
    progress.coaching.completedAt = Number(now) || Date.now();
    progress.coaching.startedAt = progress.coaching.startedAt || progress.coaching.completedAt;
    progress.unfinished = false;
    return state;
  }
  function startCoaching(state, sermonId, now) {
    state = normalizeState(state);
    if (!sermonId) return state;
    var progress = state.progress[sermonId] || (state.progress[sermonId] = { coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false });
    progress.coaching.startedAt = progress.coaching.startedAt || Number(now) || Date.now();
    progress.unfinished = true;
    return state;
  }
  function recordMode(state, sermonId, mode, now) {
    state = normalizeState(state);
    if (!sermonId || MODES.indexOf(mode) < 0) return state;
    var progress = state.progress[sermonId] || (state.progress[sermonId] = { coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false });
    progress.modes[mode] = true;
    progress.lastMode = mode;
    progress.lastStudiedAt = Number(now) || Date.now();
    progress.unfinished = false;
    return state;
  }
  function startMode(state, sermonId, mode, now) {
    state = normalizeState(state);
    if (!sermonId || MODES.indexOf(mode) < 0) return state;
    var progress = state.progress[sermonId] || (state.progress[sermonId] = { coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false });
    progress.modes[mode] = true; progress.lastMode = mode; progress.lastStudiedAt = Number(now) || Date.now(); progress.unfinished = true;
    return state;
  }
  function recordQuiz(state, sermonId, score, now) {
    state = normalizeState(state);
    if (!sermonId || !Number.isFinite(+score) || +score < 0 || +score > 100) return state;
    var progress = state.progress[sermonId] || (state.progress[sermonId] = { coaching: { completedAt: null, startedAt: null }, modes: { listen: false, read: false, quiz: false, flashcards: false }, quizzesCompleted: 0, bestScore: null, lastStudiedAt: null, lastMode: null, unfinished: false });
    progress.modes.quiz = true;
    progress.quizzesCompleted++;
    progress.bestScore = progress.bestScore === null ? +score : Math.max(progress.bestScore, +score);
    progress.lastStudiedAt = Number(now) || Date.now();
    progress.unfinished = false;
    return state;
  }
  function summary(state, sermons) {
    state = normalizeState(state); sermons = Array.isArray(sermons) ? sermons : [];
    var published = sermons.filter(function (item) { return item && item.status === 'published'; });
    var rows = published.map(function (item) { return state.progress[item.id]; }).filter(Boolean);
    var scores = rows.map(function (row) { return row.bestScore; }).filter(function (score) { return Number.isFinite(score); });
    return {
      sermonsStudied: rows.filter(function (row) { return !!row.lastStudiedAt; }).length,
      coachingCompleted: rows.filter(function (row) { return !!row.coaching.completedAt; }).length,
      quizzesCompleted: rows.reduce(function (sum, row) { return sum + row.quizzesCompleted; }, 0),
      unfinished: rows.filter(function (row) { return !!row.unfinished; }).length,
      averageScore: scores.length ? Math.round(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length) : null
    };
  }
  function dueReminders(preferences, now, unfinished) {
    preferences = normalizeState({ reminders: preferences }).reminders;
    now = now instanceof Date ? now : new Date(now || Date.now());
    var day = now.getDay(), minute = now.getHours() * 60 + now.getMinutes(), parts = preferences.time.split(':').map(Number), target = parts[0] * 60 + parts[1];
    if (!preferences.days.includes(day) || minute < target) return [];
    var dateKey = localDateKey(now);
    var due = [];
    if (preferences.regularEnabled && preferences.lastShown.regular !== dateKey) due.push('regular');
    if (preferences.unfinishedEnabled && unfinished && preferences.lastShown.unfinished !== dateKey) due.push('unfinished');
    return due;
  }
  function localDateKey(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function markReminderShown(state, type, dateKey) {
    state = normalizeState(state);
    if (type === 'regular' || type === 'unfinished') state.reminders.lastShown[type] = dateKey;
    return state;
  }
  async function downloadAudio(url, options) {
    options = options || {};
    if (!url) throw new Error('Audio download is unavailable.');
    var parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost/');
    if (typeof location !== 'undefined' && parsed.origin !== location.origin) throw new Error('Only same-origin audio can be downloaded for offline use.');
    if (typeof fetch !== 'function' || typeof caches === 'undefined') throw new Error('Audio download is unavailable.');
    var cache = await caches.open(CACHE_NAME), controller = options.controller;
    var response = await fetch(parsed.href, { signal: controller && controller.signal, credentials: 'same-origin', headers: { 'X-Sermon-Download': '1' } });
    if (response.status !== 200 || !response.body) throw new Error('Audio could not be downloaded.');
    var total = Number(response.headers.get('content-length')) || 0, received = 0;
    function reportProgress() {
      if (typeof options.onProgress === 'function') options.onProgress({ received: received, total: total, percent: total ? Math.min(100, Math.round(received * 100 / total)) : null });
    }
    var headers = new Headers(response.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg');
    headers.set('accept-ranges', 'bytes');
    if (typeof TransformStream === 'function' && typeof response.body.pipeThrough === 'function') {
      var monitoredBody = response.body.pipeThrough(new TransformStream({
        transform: function (chunk, streamController) { received += chunk.byteLength; streamController.enqueue(chunk); reportProgress(); }
      }));
      await cache.put(parsed.href, new Response(monitoredBody, { status: 200, headers: headers }));
    } else {
      var chunks = [], reader = response.body.getReader();
      while (true) {
        var part = await reader.read();
        if (part.done) break;
        chunks.push(part.value); received += part.value.byteLength; reportProgress();
      }
      var blob = new Blob(chunks, { type: headers.get('content-type') });
      await cache.put(parsed.href, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size), 'accept-ranges': 'bytes' } }));
    }
    return { url: parsed.href, bytes: received, cacheName: CACHE_NAME };
  }
  async function removeAudio(url) {
    if (!url || typeof caches === 'undefined') return false;
    var parsed = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost/');
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || (typeof location !== 'undefined' && parsed.origin !== location.origin)) throw new Error('Only same-origin audio can be removed from offline storage.');
    var cache = await caches.open(CACHE_NAME);
    return cache.delete(parsed.href);
  }
  return { CACHE_NAME: CACHE_NAME, MODES: MODES.slice(), createState: createState, normalizeState: normalizeState, progressFor: progressFor, startCoaching: startCoaching, completeCoaching: completeCoaching, recordMode: recordMode, startMode: startMode, recordQuiz: recordQuiz, summary: summary, dueReminders: dueReminders, localDateKey: localDateKey, markReminderShown: markReminderShown, downloadAudio: downloadAudio, removeAudio: removeAudio };
});
