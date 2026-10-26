(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SermonLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DECK_FILE_RE = /^[a-z0-9][a-z0-9._-]*\.txt$/;
  var STATUSES = ['draft', 'published'];
  var SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  var SKIP_SECONDS = 15;

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isAudioUrl(url) {
    if (typeof url !== 'string' || !url || /\s/.test(url)) return false;
    if (/^https:\/\//i.test(url)) return true;
    // Bundled sample or self-hosted file next to the app. Never http:, never a path that leaves the app.
    return /^content\/sermons\/audio\/[A-Za-z0-9._-]+$/.test(url);
  }

  function isRemoteUrl(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
  }

  /** Returns a list of human-readable problems; an empty list means the entry is valid. */
  function validateSermon(entry) {
    var errors = [];
    if (!isPlainObject(entry)) return ['Sermon entry must be an object'];
    var label = typeof entry.id === 'string' && entry.id ? entry.id : '(no id)';
    function bad(message) { errors.push(label + ': ' + message); }
    if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) bad('id must be lowercase letters, numbers and hyphens');
    ['title', 'speaker', 'scripture'].forEach(function (field) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) bad(field + ' is required');
    });
    if (typeof entry.date !== 'string' || !DATE_RE.test(entry.date) || isNaN(Date.parse(entry.date + 'T00:00:00Z'))) bad('date must be YYYY-MM-DD');
    if (!Array.isArray(entry.body) || !entry.body.length || entry.body.some(function (p) { return typeof p !== 'string' || !p.trim(); })) bad('body must be a list of non-empty paragraphs');
    if (!Number.isFinite(entry.readMinutes) || entry.readMinutes < 1) bad('readMinutes must be a number of at least 1');
    if (STATUSES.indexOf(entry.status) < 0) bad('status must be "draft" or "published"');
    if (entry.series !== undefined && typeof entry.series !== 'string') bad('series must be text');
    if (entry.deckFile !== undefined && (typeof entry.deckFile !== 'string' || !DECK_FILE_RE.test(entry.deckFile))) bad('deckFile must be a plain .txt file name');
    if (entry.audio !== undefined) {
      var audio = entry.audio;
      if (!isPlainObject(audio)) bad('audio must be an object');
      else {
        if (!isAudioUrl(audio.url)) bad('audio.url must be an https:// link (or a file under content/sermons/audio/)');
        if (!Number.isFinite(audio.durationSec) || audio.durationSec <= 0) bad('audio.durationSec must be a positive number');
        if (audio.sizeBytes !== undefined && (!Number.isFinite(audio.sizeBytes) || audio.sizeBytes <= 0)) bad('audio.sizeBytes must be a positive number');
      }
    }
    return errors;
  }

  /** Newest first. Drafts only when showDrafts is true. Invalid entries are skipped, never thrown. */
  function visibleSermons(list, showDrafts) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (entry) {
      if (validateSermon(entry).length) return false;
      return showDrafts || entry.status === 'published';
    }).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.id < b.id ? -1 : 1;
    });
  }

  function sermonDeckId(sermonId) { return 'd-sermon-' + sermonId; }

  /** Builds study decks (same shape as saved decks) for sermons from parsed deck text. Kept in memory, never saved. */
  function buildSermonDeck(sermon, parsedDeck) {
    if (!sermon || !parsedDeck || !Array.isArray(parsedDeck.questions) || !parsedDeck.questions.length) return null;
    var id = sermonDeckId(sermon.id);
    return {
      id: id,
      title: sermon.title,
      kind: 'sermon',
      sermonId: sermon.id,
      cards: parsedDeck.questions.map(function (q) {
        return { id: id + '.' + q.id, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || '', ref: q.ref || '', bible: q.bible || '' };
      })
    };
  }

  function defaultSermonState() { return { positions: {}, played: {}, speed: 1 }; }

  function normalizeSermonState(raw) {
    var out = defaultSermonState();
    if (!isPlainObject(raw)) return out;
    if (isPlainObject(raw.positions)) {
      Object.keys(raw.positions).forEach(function (id) {
        var value = raw.positions[id];
        if (ID_RE.test(id) && Number.isFinite(value) && value > 0) out.positions[id] = Math.round(value);
      });
    }
    if (isPlainObject(raw.played)) {
      Object.keys(raw.played).forEach(function (id) { if (ID_RE.test(id) && raw.played[id]) out.played[id] = true; });
    }
    if (SPEEDS.indexOf(raw.speed) >= 0) out.speed = raw.speed;
    return out;
  }

  /** Remember where to resume. Clears the position near the end so a finished sermon restarts. */
  function resumePosition(position, duration) {
    if (!Number.isFinite(position) || position < 5) return 0;
    if (Number.isFinite(duration) && duration > 0 && position > duration - 10) return 0;
    return Math.floor(position);
  }

  function clampSeek(target, duration) {
    if (!Number.isFinite(target) || target < 0) return 0;
    if (Number.isFinite(duration) && duration > 0 && target > duration) return duration;
    return target;
  }

  function nextSpeed(current) {
    var i = SPEEDS.indexOf(current);
    return SPEEDS[(i + 1) % SPEEDS.length];
  }

  function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    var mm = (h ? ('0' + m).slice(-2) : String(m)), ss = ('0' + s).slice(-2);
    return (h ? h + ':' : '') + mm + ':' + ss;
  }

  function formatMinutes(seconds) {
    return Math.max(1, Math.round(seconds / 60)) + ' min';
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1) + ' MB';
  }

  return {
    SPEEDS: SPEEDS,
    SKIP_SECONDS: SKIP_SECONDS,
    validateSermon: validateSermon,
    visibleSermons: visibleSermons,
    isAudioUrl: isAudioUrl,
    isRemoteUrl: isRemoteUrl,
    sermonDeckId: sermonDeckId,
    buildSermonDeck: buildSermonDeck,
    defaultSermonState: defaultSermonState,
    normalizeSermonState: normalizeSermonState,
    resumePosition: resumePosition,
    clampSeek: clampSeek,
    nextSpeed: nextSpeed,
    formatClock: formatClock,
    formatMinutes: formatMinutes,
    formatSize: formatSize
  };
});
