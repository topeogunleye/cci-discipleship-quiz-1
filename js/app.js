(function () {
  'use strict';
  var P = window.DeckParser, StudyLogic = window.StudyLogic, Storage = window.StudyStorage, MobileStudy = window.MobileStudy, LET = P.LETTERS, KEY = 'flashdecks.v1', DATA_VERSION = 10;
  var app = document.getElementById('app'), modal = document.getElementById('modal'), toastEl = document.getElementById('toast');
  var S = { decks: [], progress: {}, settings: { theme: 'auto', shuffle: false, showStreak: true, showDraftDevotionals: false }, onboarding: { completed: false, goal: 'habit', dailyMinutes: 10, startingTopic: 'soteriology', preferredTime: 'anytime', committed: false }, streak: { lastStreakDate: null }, devotions: { read: {}, saved: {}, carouselHiddenOn: null }, completedToday: {}, seeded: false, dataVersion: 0, pausedSession: null };
  var STARTER_DECKS = [], DEVOTIONALS = [];
  var storageOk = true, storageMessage = '', storageBackend = 'loading', preserveStorage = false, saveQueue = Promise.resolve(), V = { name: 'home' }, SEL = new Set(), pendingAsk = null, returnFocus = null, homeFilter = '', examTimer = null, waitingWorker = null, updateAvailable = false, reloadForUpdate = false, rocketMenuOpen = false, IMP = { decks: [], errors: [], warnings: [], text: '', parsed: false, backup: null };
  var browserLocalStorage = null, browserIndexedDB = null;
  try { browserLocalStorage = window.localStorage; } catch (e) {}
  if (!browserLocalStorage) { try { if (typeof localStorage !== 'undefined') browserLocalStorage = localStorage; } catch (e) {} }
  try { browserIndexedDB = window.indexedDB; } catch (e) {}
  var storageAdapter = Storage.createStorage({ indexedDB: browserIndexedDB, localStorage: browserLocalStorage, legacyKey: KEY });

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var linkify = function (s) { return esc(s).replace(/https?:\/\/[^\s)]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; }); };
  var bibleNote = function (c) { return c && c.bible ? '<p class="card-note card-ref card-bible"><strong>Bible References:</strong> ' + linkify(c.bible) + '</p>' : ''; };
  var uid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  var slug = function (t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'deck'; };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var deck = function (id) { return S.decks.filter(function (d) { return d.id === id; })[0]; };
  var prog = function (id) {
    var p = S.progress[id];
    if (!p || typeof p !== 'object' || Array.isArray(p) || !p.cards || typeof p.cards !== 'object' || Array.isArray(p.cards)) p = S.progress[id] = { best: null, cards: {} };
    return p;
  };
  var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
  function allCardItems() {
    var items = [];
    S.decks.forEach(function (d) {
      var p = prog(d.id);
      d.cards.forEach(function (card) { items.push({ deckId: d.id, card: card, record: p.cards[card.id] }); });
    });
    return items;
  }
  function deckIdsFor(items) {
    return Array.from(new Set(items.map(function (item) { return item.deckId; })));
  }
  function isMastered(deckId, cardId) {
    return StudyLogic.normalizeRecord(prog(deckId).cards[cardId]).box >= 2;
  }
  function trackStudied(count) {
    S.backupReminder = StudyLogic.recordStudied(S.backupReminder, count || 1, Date.now());
  }

  function inlineStarterText() {
    var el = document.getElementById('starter-fallback');
    if (!el) return '';
    try {
      var text = JSON.parse(el.textContent || '""');
      return typeof text === 'string' ? text : '';
    } catch (e) { return ''; }
  }
  function loadStarterText() {
    var fallback = inlineStarterText();
    if (!window.location || window.location.protocol === 'file:' || typeof window.fetch !== 'function') return Promise.resolve(fallback);
    return window.fetch('decks/manifest.json').then(function (response) {
      if (!response.ok) throw new Error('Could not load deck manifest');
      return response.json();
    }).then(function (files) {
      if (!Array.isArray(files) || !files.length) throw new Error('Deck manifest is empty');
      return Promise.all(files.map(function (file) {
        if (typeof file !== 'string' || file.indexOf('/') >= 0 || file.indexOf('..') >= 0) throw new Error('Invalid deck file name');
        return window.fetch('decks/' + file).then(function (response) {
          if (!response.ok) throw new Error('Could not load ' + file);
          return response.text();
        });
      }));
    }).then(function (texts) { return texts.join('\n\n'); }).catch(function () { return fallback; });
  }

  function inlineDevotionalsData() {
    var el = document.getElementById('devotionals-fallback');
    if (!el) return [];
    try {
      var data = JSON.parse(el.textContent || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }
  function loadDevotionals() {
    var el = document.getElementById('devotionals-fallback');
    if (!el) return Promise.resolve([]);
    var fallback = inlineDevotionalsData();
    if (!window.location || window.location.protocol === 'file:' || typeof window.fetch !== 'function') return Promise.resolve(fallback);
    return window.fetch('content/devotionals.json').then(function (response) {
      if (!response.ok) throw new Error('Could not load devotionals');
      return response.json();
    }).then(function (data) {
      return Array.isArray(data) && data.length ? data : fallback;
    }).catch(function () { return fallback; });
  }

  /* ---------- storage ---------- */
  function loadSavedState(raw) {
    try {
      if (raw === null || raw === undefined) return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Invalid saved data');
      S.decks = (Array.isArray(o.decks) ? o.decks : []).filter(function (d) {
        return d && typeof d.id === 'string' && /^[a-zA-Z0-9._-]{1,120}$/.test(d.id) && typeof d.title === 'string' && Array.isArray(d.cards);
      }).map(function (d) {
        return { id: d.id, title: d.title, cards: d.cards.filter(function (c) {
          return c && typeof c.id === 'string' && /^[a-zA-Z0-9._-]{1,180}$/.test(c.id) && typeof c.question === 'string' && Array.isArray(c.options) && c.options.length === 4 && c.options.every(function (x) { return typeof x === 'string'; }) && LET.indexOf(c.answer) >= 0;
        }).map(function (c) { return { id: c.id, question: c.question, options: c.options.slice(), answer: c.answer, explanation: typeof c.explanation === 'string' ? c.explanation : '', ref: typeof c.ref === 'string' ? c.ref : '', bible: typeof c.bible === 'string' ? c.bible : '' }; }) };
      });
      var savedProgress = o.progress && typeof o.progress === 'object' && !Array.isArray(o.progress) ? o.progress : {};
      S.progress = {};
      S.decks.forEach(function (d) {
        var old = savedProgress[d.id]; if (!old || typeof old !== 'object' || Array.isArray(old)) return;
        var cards = {}, oldCards = old.cards && typeof old.cards === 'object' && !Array.isArray(old.cards) ? old.cards : {};
        d.cards.forEach(function (c) {
          var value = oldCards[c.id];
          if (value === 'known' || value === 'unknown' || (value && typeof value === 'object' && !Array.isArray(value))) cards[c.id] = value;
        });
        var best = old.best && Number.isFinite(+old.best.pct) && +old.best.pct >= 0 && +old.best.pct <= 100 ? old.best : null;
        S.progress[d.id] = { best: best, cards: cards };
      });
      S.settings = Object.assign({ theme: 'auto', shuffle: false, showStreak: true, showDraftDevotionals: false }, o.settings && typeof o.settings === 'object' ? o.settings : {});
      if (['auto', 'light', 'dark'].indexOf(S.settings.theme) < 0) S.settings.theme = 'auto';
      S.settings.shuffle = !!S.settings.shuffle;
      S.settings.showStreak = S.settings.showStreak !== false;
      S.settings.showDraftDevotionals = !!S.settings.showDraftDevotionals;
      var hasPriorData = !!o.seeded || (Array.isArray(o.decks) && o.decks.length > 0);
      S.onboarding = MobileStudy.normalizeOnboarding(o.onboarding, hasPriorData);
      S.streak = MobileStudy.normalizeStreak(o.streak);
      S.devotions = (o.devotions && typeof o.devotions === 'object' && !Array.isArray(o.devotions)) ? {
        read: (o.devotions.read && typeof o.devotions.read === 'object' && !Array.isArray(o.devotions.read)) ? o.devotions.read : {},
        saved: (o.devotions.saved && typeof o.devotions.saved === 'object' && !Array.isArray(o.devotions.saved)) ? o.devotions.saved : {},
        carouselHiddenOn: typeof o.devotions.carouselHiddenOn === 'string' ? o.devotions.carouselHiddenOn : null
      } : { read: {}, saved: {}, carouselHiddenOn: null };
      S.completedToday = (o.completedToday && typeof o.completedToday === 'object' && !Array.isArray(o.completedToday)) ? o.completedToday : {};
      S.seeded = !!o.seeded;
      S.dataVersion = Number.isInteger(o.dataVersion) && o.dataVersion >= 0 ? o.dataVersion : 0;
      S.backupReminder = o.backupReminder;
      S.pausedSession = o.pausedSession && typeof o.pausedSession === 'object' && !Array.isArray(o.pausedSession) ? o.pausedSession : null;
    } catch (e) { preserveStorage = true; storageOk = false; storageMessage = 'Saved study data could not be read. To protect it, this app will not overwrite browser storage automatically. Export what you can before deciding whether to clear site data.'; }
  }
  function applyStorageResult(result) {
    var changed = storageOk !== result.ok || storageBackend !== result.backend || storageMessage !== (result.notice || '');
    storageOk = result.ok;
    storageBackend = result.backend;
    storageMessage = result.notice || '';
    if (changed && app.innerHTML) render(true);
  }
  function load() {
    return storageAdapter.load().then(function (result) {
      storageOk = result.ok;
      storageBackend = result.backend;
      storageMessage = result.notice || '';
      loadSavedState(result.raw);
    }).catch(function () {
      storageOk = false; storageBackend = 'unavailable';
      storageMessage = 'Study data could not be loaded. Export a backup before continuing.';
    });
  }
  function save() {
    if (preserveStorage) return Promise.resolve({ ok: false, backend: storageBackend, notice: storageMessage });
    var raw = JSON.stringify(S);
    saveQueue = saveQueue.catch(function () {}).then(function () { return storageAdapter.save(raw); }).then(function (result) {
      applyStorageResult(result);
      return result;
    }).catch(function () {
      var result = { ok: false, backend: 'unavailable', notice: 'Study data could not be saved. Export a backup before closing this page.' };
      applyStorageResult(result);
      return result;
    });
    return saveQueue;
  }
  function isStudySession(name) { return name === 'flash' || name === 'quiz' || name === 'exam'; }
  function saveActiveSession() {
    if (!isStudySession(V.name)) return Promise.resolve();
    S.pausedSession = MobileStudy.snapshot(V);
    return save();
  }
  function pauseStudySession() {
    if (!isStudySession(V.name)) return;
    if (V.name === 'exam' && V.deadline) V.remaining = Math.max(0, V.deadline - Date.now());
    stopExamTimer();
    S.pausedSession = MobileStudy.snapshot(V);
    save();
    go({ name: 'home' });
    toast('Study paused. Your progress is saved.');
  }
  function resumeStudySession() {
    var session = MobileStudy.restore(S.pausedSession, S.decks);
    if (!session) { S.pausedSession = null; save(); render(true); toast('That saved session is no longer available.'); return; }
    go(session);
    if (session.name === 'exam') startExamTimer();
    saveActiveSession();
  }
  function discardPausedSession() {
    S.pausedSession = null;
    save();
    render(true);
  }
  function addParsed(pd, stable) {
    var id = stable ? 'd-' + slug(pd.title) : 'd' + uid(), n = 2, base = id;
    while (deck(id)) id = base + '-' + n++;
    S.decks.push({ id: id, title: pd.title, cards: pd.questions.map(function (q) { return { id: id + '.' + q.id, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || '', ref: q.ref || '', bible: q.bible || '' }; }) });
  }
  function seed() {
    if (S.seeded) return;
    STARTER_DECKS.forEach(function (d) { if (d.questions.length) addParsed(d, true); });
    S.seeded = true; save();
  }

  function syncStarterDecks() {
    var changed = false;
    STARTER_DECKS.forEach(function (source) {
      if (!source.questions.length) return;
      var id = 'd-' + slug(source.title), saved = deck(id);
      if (!saved) { addParsed(source, true); changed = true; return; }
      var previous = Object.create(null), next = [], deckChanged = false;
      saved.cards.forEach(function (card) { previous[card.id] = card; });
      source.questions.forEach(function (question) {
        var cardId = id + '.' + question.id, existing = previous[cardId];
        if (!existing || existing.question !== question.question) deckChanged = true;
        if (existing && existing.question !== question.question && S.progress[id] && S.progress[id].cards) delete S.progress[id].cards[cardId];
        next.push({ id: cardId, question: question.question, options: question.options.slice(), answer: question.answer, explanation: question.explanation || '', ref: question.ref || '', bible: question.bible || '' });
        delete previous[cardId];
      });
      saved.cards.forEach(function (card) {
        if (previous[card.id] && !/^q\d+$/.test(card.id.slice((id + '.').length))) next.push(card);
      });
      Object.keys(previous).forEach(function (cardId) {
        if (cardId.indexOf(id + '.q') === 0) {
          deckChanged = true;
          if (S.progress[id] && S.progress[id].cards) delete S.progress[id].cards[cardId];
        }
      });
      if (deckChanged && S.progress[id]) S.progress[id].best = null;
      if (deckChanged) changed = true;
      if (JSON.stringify(saved.cards) !== JSON.stringify(next)) changed = true;
      saved.cards = next;
    });
    return changed;
  }

  function starterDeck(deckId) {
    return STARTER_DECKS.filter(function (d) { return 'd-' + slug(d.title) === deckId; })[0];
  }
  function addMigratedCard(deckId, questionId, at) {
    var d = deck(deckId), source = starterDeck(deckId);
    if (!d || !source) return;
    var q = source.questions.filter(function (item) { return item.id === questionId; })[0];
    if (!q || d.cards.some(function (card) { return card.question === q.question; })) return;
    var id = d.id + '.' + q.id;
    if (d.cards.some(function (card) { return card.id === id; })) id += '-migration';
    d.cards.splice(Math.min(at, d.cards.length), 0, { id: id, question: q.question, options: q.options.slice(), answer: q.answer, explanation: q.explanation || '', ref: q.ref || '', bible: q.bible || '' });
  }
  function removeMigratedDuplicate(deckId, questionId, questionText) {
    var d = deck(deckId); if (!d) return;
    var cardId = d.id + '.' + questionId;
    var index = d.cards.findIndex(function (card) { return card.id === cardId && card.question === questionText; });
    if (index < 0) return;
    d.cards.splice(index, 1);
    var p = S.progress[d.id];
    if (p && p.cards) delete p.cards[cardId];
    var prefix = d.id + '.q', removedNumber = parseInt(questionId.slice(1), 10);
    d.cards.forEach(function (card) {
      if (card.id.indexOf(prefix) !== 0) return;
      var oldNumber = /^\d+$/.test(card.id.slice(prefix.length)) ? +card.id.slice(prefix.length) : 0;
      if (oldNumber <= removedNumber) return;
      var oldId = card.id, newId = prefix + (oldNumber - 1);
      card.id = newId;
      if (p && p.cards && p.cards[oldId] !== undefined) {
        if (p.cards[newId] === undefined) p.cards[newId] = p.cards[oldId];
        delete p.cards[oldId];
      }
    });
  }
  var DATA_MIGRATIONS = [
    { version: 1, run: function () {
      addMigratedCard('d-discipleship-experience-section-1-soteriology', 'q27', 26);
      addMigratedCard('d-discipleship-experience-section-7-bible-experience-i', 'q9', 8);
    } },
    { version: 2, run: function () {
      removeMigratedDuplicate('d-discipleship-experience-section-6-prayer', 'q25', 'Why does the lesson warn against making "God, help me" the entirety of one\'s prayer life?');
      removeMigratedDuplicate('d-discipleship-experience-section-8-bible-experience-ii', 'q29', 'What is the danger of reading Scripture without a Christ-centered lens?');
    } },
    { version: 3, run: function () {
      var now = Date.now();
      S.decks.forEach(function (d) {
        var p = S.progress[d.id]; if (!p || !p.cards) return;
        d.cards.forEach(function (card) {
          var value = p.cards[card.id];
          if (value === 'known' || value === 'unknown') p.cards[card.id] = StudyLogic.migrateLegacyMark(value, now);
          else if (value && typeof value === 'object' && !Array.isArray(value)) p.cards[card.id] = StudyLogic.normalizeRecord(value, now);
        });
      });
    } },
    { version: 4, run: function () {
      S.backupReminder = StudyLogic.normalizeBackupReminder(S.backupReminder, Date.now());
    } },
    { version: 5, run: function () {
      S.decks.forEach(function (d) {
        var source = starterDeck(d.id); if (!source) return;
        d.cards.forEach(function (card) {
          var sourceCard = source.questions.filter(function (q) { return card.id === d.id + '.' + q.id || card.question === q.question; })[0];
          if (!sourceCard) return;
          if (!card.explanation && sourceCard.explanation) card.explanation = sourceCard.explanation;
          if (!card.ref && sourceCard.ref) card.ref = sourceCard.ref;
        });
      });
    } },
    { version: 6, run: function () {
      var id = 'd-discipleship-experience-section-12-church-history';
      for (var number = 20; number <= 30; number++) addMigratedCard(id, 'q' + number, number - 1);
    } },
    { version: 7, run: function () {
      S.decks.forEach(function (d) {
        var source = starterDeck(d.id); if (!source) return;
        d.cards.forEach(function (card) {
          var sourceCard = source.questions.filter(function (q) { return card.id === d.id + '.' + q.id || card.question === q.question; })[0];
          if (!sourceCard) return;
          if (sourceCard.explanation && card.explanation !== sourceCard.explanation) card.explanation = sourceCard.explanation;
          if (sourceCard.ref && card.ref !== sourceCard.ref) card.ref = sourceCard.ref;
        });
      });
    } },
    { version: 8, run: function () {
      S.decks.forEach(function (d) {
        var source = starterDeck(d.id); if (!source) return;
        d.cards.forEach(function (card) {
          var sourceCard = source.questions.filter(function (q) { return card.id === d.id + '.' + q.id || card.question === q.question; })[0];
          if (!sourceCard) return;
          if (sourceCard.bible && card.bible !== sourceCard.bible) card.bible = sourceCard.bible;
        });
      });
    } },
    { version: 9, run: function () {
      var hasActivity = (S.decks && S.decks.length > 0) || Object.keys(S.progress || {}).length > 0;
      S.onboarding = MobileStudy.normalizeOnboarding(S.onboarding, hasActivity);
      S.streak = MobileStudy.normalizeStreak(S.streak);
    } },
    { version: 10, run: function () {
      if (!S.devotions || typeof S.devotions !== 'object' || Array.isArray(S.devotions)) {
        S.devotions = { read: {}, saved: {}, carouselHiddenOn: null };
      } else {
        if (!S.devotions.read || typeof S.devotions.read !== 'object') S.devotions.read = {};
        if (!S.devotions.saved || typeof S.devotions.saved !== 'object') S.devotions.saved = {};
        if (typeof S.devotions.carouselHiddenOn !== 'string') S.devotions.carouselHiddenOn = null;
      }
      if (!S.completedToday || typeof S.completedToday !== 'object') S.completedToday = {};
      if (S.settings.showDraftDevotionals === undefined) S.settings.showDraftDevotionals = false;
    } }
  ];
  function applyDataMigrations() {
    if (!S.seeded) { S.dataVersion = DATA_VERSION; return Promise.resolve(); }
    if (S.dataVersion > DATA_VERSION) return Promise.resolve();
    DATA_MIGRATIONS.forEach(function (migration) {
      if (S.dataVersion >= migration.version) return;
      migration.run();
      S.dataVersion = migration.version;
    });
    S.dataVersion = DATA_VERSION;
    return save();
  }

  /* ---------- helpers ---------- */
  function applyTheme() { var t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }
  var toastT; function toast(m) { toastEl.textContent = m; toastEl.className = 'show'; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.className = ''; }, 3200); }
  function openModal(html) {
    returnFocus = document.activeElement;
    modal.innerHTML = html;
    var rocketEl = document.querySelector('.rocket-container');
    if (rocketEl) rocketEl.style.display = 'none';
    var first = modal.querySelector('button, input, select, textarea');
    if (first) first.focus();
  }
  function openLessonDetailSheet(lessonId) {
    var detailDeck = deck(lessonId);
    if (!detailDeck) return;
    var detailProgress = prog(detailDeck.id);
    var detailMastered = detailDeck.cards.filter(function (card) { return isMastered(detailDeck.id, card.id); }).length;
    var detailWeak = detailDeck.cards.filter(function (card) {
      var record = detailProgress.cards[card.id];
      return record && typeof record === 'object' && record.attempts > 0 && record.misses > 0;
    }).length;
    var parsedDetail = MobileStudy.parseChapterTitle(detailDeck.title);
    var sectionNumber = parsedDetail.sectionNum || 1;
    var progressPct = detailDeck.cards.length ? Math.round(100 * detailMastered / detailDeck.cards.length) : 0;
    var gradient = 'deck-grad-' + (((sectionNumber - 1) % 12) + 1);
    openModal('<div class="scrim" data-act="close"></div><section class="sheet lesson-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="lesson-detail-title">' +
      '<span class="lesson-detail-handle" aria-hidden="true"></span>' +
      '<div class="lesson-detail-hero ' + gradient + '">' +
        '<h2 id="lesson-detail-title">' + esc(parsedDetail.topic) + '</h2>' +
        '<p>Lesson ' + sectionNumber + ' · Section ' + sectionNumber + '</p>' +
        '<div class="lesson-detail-progress" role="progressbar" aria-label="' + esc(parsedDetail.topic) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progressPct + '"><i style="width:' + progressPct + '%"></i></div>' +
      '</div>' +
      '<div class="lesson-detail-stats" aria-label="Lesson statistics">' +
        '<div><b>' + detailDeck.cards.length + '</b><span>Cards</span></div>' +
        '<div><b>' + detailMastered + '</b><span>Mastered</span></div>' +
        '<div><b>' + detailWeak + '</b><span>Weak spots</span></div>' +
      '</div>' +
      '<div class="lesson-detail-actions">' +
        '<button type="button" class="btn primary lesson-detail-study" data-act="lesson-detail-study" data-id="' + detailDeck.id + '">Study this lesson</button>' +
        '<button type="button" class="btn lesson-detail-close" data-act="close">Close</button>' +
      '</div>' +
    '</section>');
  }
  function ask(msg, label, fn) { pendingAsk = fn; openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title" class="dialog-title">Please confirm</h2><p>' + esc(msg) + '</p><div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn danger" data-act="askok">' + esc(label) + '</button></div></div>'); }
  function closeModal() {
    modal.innerHTML = ''; pendingAsk = null;
    var rocketEl = document.querySelector('.rocket-container');
    if (rocketEl) rocketEl.style.display = '';
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus(); returnFocus = null;
  }
  function download(filename, text) {
    var viaBlob = function () {
      try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
      catch (e) { toast('Download is not available here.'); }
    };
    if (window.CciNative && window.CciNative.isNative) {
      window.CciNative.shareFile(filename, text).then(function (shared) {
        if (!shared) viaBlob();
      }).catch(function () { toast('Could not prepare the file to share.'); });
      return;
    }
    if (window.claude && window.claude.use) {
      window.claude.use('downloads').then(function (dl) {
        if (!dl) return viaBlob();
        dl.save({ filename: filename, data: text }).then(function () { toast('Saved ' + filename); }, function (e) { if (e && e.code !== 'declined') toast('Could not save the file (' + (e.code || 'error') + ').'); });
      }, viaBlob);
    } else viaBlob();
  }
  function exportDeck(d) { download(slug(d.title) + '.txt', P.serializeDeck(d)); }
  function exportBackup() {
    var payload = { format: 'cci-discipleship-quiz-backup', version: 1, exportedAt: new Date().toISOString(), data: { decks: S.decks, progress: S.progress, settings: S.settings, seeded: S.seeded, dataVersion: S.dataVersion, backupReminder: S.backupReminder, onboarding: S.onboarding, streak: S.streak, devotions: S.devotions } };
    download('cci-study-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2));
  }
  function resetBackupReminder() {
    S.backupReminder = StudyLogic.resetBackupReminder(Date.now());
    save();
  }
  function validateBackup(text) {
    var raw = JSON.parse(text);
    if (!raw || raw.format !== 'cci-discipleship-quiz-backup' || raw.version !== 1 || !raw.data || !Array.isArray(raw.data.decks)) throw new Error('This is not a supported CCI Study Decks backup.');
    var dataVersion = Number.isInteger(raw.data.dataVersion) && raw.data.dataVersion >= 0 ? raw.data.dataVersion : 0;
    if (dataVersion > DATA_VERSION) throw new Error('This backup was created with a newer deck-data version.');
    var ids = new Set(), decks = raw.data.decks.map(function (d) {
      if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(d.id) || typeof d.title !== 'string' || !d.title.trim() || !Array.isArray(d.cards)) throw new Error('A deck in this backup is malformed.');
      if (ids.has(d.id)) throw new Error('This backup contains duplicate deck IDs.'); ids.add(d.id);
      var cardIds = new Set();
      var cards = d.cards.map(function (c) {
        if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9._-]{1,180}$/.test(c.id) || typeof c.question !== 'string' || !c.question.trim() || !Array.isArray(c.options) || c.options.length !== 4 || !c.options.every(function (x) { return typeof x === 'string' && x.trim(); }) || LET.indexOf(c.answer) < 0) throw new Error('A question in "' + d.title + '" is malformed.');
        if (cardIds.has(c.id)) throw new Error('A deck in this backup contains duplicate question IDs.'); cardIds.add(c.id);
        return { id: c.id, question: c.question, options: c.options.slice(), answer: c.answer, explanation: typeof c.explanation === 'string' ? c.explanation : '', ref: typeof c.ref === 'string' ? c.ref : '', bible: typeof c.bible === 'string' ? c.bible : '' };
      });
      return { id: d.id, title: d.title, cards: cards };
    });
    var oldProgress = raw.data.progress && typeof raw.data.progress === 'object' && !Array.isArray(raw.data.progress) ? raw.data.progress : {}, progress = {};
    decks.forEach(function (d) {
      var old = oldProgress[d.id]; if (!old || typeof old !== 'object' || Array.isArray(old)) return;
      var oldCards = old.cards && typeof old.cards === 'object' && !Array.isArray(old.cards) ? old.cards : {}, cards = {};
      d.cards.forEach(function (c) {
        var value = oldCards[c.id];
        if (value === 'known' || value === 'unknown' || (value && typeof value === 'object' && !Array.isArray(value))) cards[c.id] = value;
      });
      var pct = old.best && Number(old.best.pct);
      progress[d.id] = { cards: cards, best: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? { pct: pct } : null };
    });
    var settings = Object.assign({ theme: 'auto', shuffle: false, showDraftDevotionals: false }, raw.data.settings && typeof raw.data.settings === 'object' ? raw.data.settings : {});
    if (['auto', 'light', 'dark'].indexOf(settings.theme) < 0) settings.theme = 'auto'; settings.shuffle = !!settings.shuffle;
    settings.showDraftDevotionals = !!settings.showDraftDevotionals;
    var devotions = (raw.data.devotions && typeof raw.data.devotions === 'object' && !Array.isArray(raw.data.devotions)) ? {
      read: (raw.data.devotions.read && typeof raw.data.devotions.read === 'object') ? raw.data.devotions.read : {},
      saved: (raw.data.devotions.saved && typeof raw.data.devotions.saved === 'object') ? raw.data.devotions.saved : {},
      carouselHiddenOn: typeof raw.data.devotions.carouselHiddenOn === 'string' ? raw.data.devotions.carouselHiddenOn : null
    } : { read: {}, saved: {}, carouselHiddenOn: null };
    return { decks: decks, progress: progress, settings: settings, seeded: !!raw.data.seeded, dataVersion: dataVersion, backupReminder: StudyLogic.normalizeBackupReminder(raw.data.backupReminder), onboarding: MobileStudy.normalizeOnboarding(raw.data.onboarding, true), streak: MobileStudy.normalizeStreak(raw.data.streak), devotions: devotions };
  }

  /* ---------- views ---------- */
  var views = {};
  function banner() {
    var storageNotice = storageMessage ? '<div class="note warn" role="alert">' + esc(storageMessage) + '</div>' : (storageOk ? '' : '<div class="note warn" role="alert">Study data could not be saved. Export a backup before closing this page.</div>');
    var updateNotice = updateAvailable ? '<div class="note update-prompt" role="status" aria-live="polite"><span>A new version is ready.</span><button class="btn sm primary" data-act="update-app">Update now</button></div>' : '';
    return storageNotice + updateNotice;
  }
  function offerUpdate(worker) {
    if (!worker) return;
    waitingWorker = worker;
    updateAvailable = true;
    if (app.innerHTML) render(true);
  }
  function registerServiceWorker() {
    if (window.CciNative && window.CciNative.isNative) return;
    var protocol = window.location && window.location.protocol;
    var serviceWorker = window.navigator && window.navigator.serviceWorker;
    if ((protocol !== 'http:' && protocol !== 'https:') || !serviceWorker) return;
    serviceWorker.register('service-worker.js').then(function (registration) {
      if (registration.waiting && serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', function () {
        var installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', function () {
          if (installing.state === 'installed' && serviceWorker.controller) offerUpdate(registration.waiting || installing);
        });
      });
      serviceWorker.addEventListener('controllerchange', function () {
        if (reloadForUpdate) window.location.reload();
      });
    }).catch(function () {});
  }

  function formatDeckHeading(title) {
    var m = /^(?:Discipleship Experience\s*)?\(Section\s*(\d+)\)\s*(.+)$/i.exec(title);
    if (m) {
      return '<span class="deck-sec-badge">Section ' + m[1] + '</span><span class="deck-topic">' + esc(m[2].trim()) + '</span>';
    }
    return '<span class="deck-topic">' + esc(title) + '</span>';
  }

  var MAIN_TABS = ['home', 'journey', 'chapter', 'practice', 'progress', 'settings'];

  function getStudyTimestamps() {
    var timestamps = [];
    S.decks.forEach(function (d) {
      var p = prog(d.id);
      Object.keys(p.cards).forEach(function (cardId) {
        var r = p.cards[cardId];
        if (r && typeof r === 'object' && r.lastSeen) timestamps.push(r.lastSeen);
      });
    });
    return timestamps;
  }

  function tabIconSvg(icon) {
    switch (icon) {
      case 'home':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>';
      case 'journey':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h14l-3 4 3 4H5"/></svg>';
      case 'practice':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4.5 13h6L9 22l10.5-13H13z"/></svg>';
      case 'progress':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
      case 'settings':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/><circle cx="12" cy="12" r="3"/></svg>';
      default:
        return '';
    }
  }

  function planIconSvg(icon) {
    switch (icon) {
      case 'review':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
      case 'target':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
      case 'spark':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>';
      case 'trophy':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M4 3h16v8a8 8 0 0 1-16 0V3zM12 17v4M8 21h8"/></svg>';
      default:
        return '';
    }
  }

  function renderTabBar(currentTab) {
    var tabs = [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'journey', label: 'Journey', icon: 'journey' },
      { id: 'practice', label: 'Practice', icon: 'practice' },
      { id: 'progress', label: 'Progress', icon: 'progress' },
      { id: 'settings', label: 'Settings', icon: 'settings' }
    ];
    return '<nav class="bottom-tab-bar" aria-label="Main Navigation">' +
      tabs.map(function (tab) {
        var isActive = tab.id === currentTab;
        return '<button class="tab-btn' + (isActive ? ' active' : '') + '" data-act="nav-tab" data-tab="' + tab.id + '" aria-selected="' + (isActive ? 'true' : 'false') + '" aria-label="' + tab.label + ' tab">' +
          tabIconSvg(tab.icon) +
          '<span class="tab-label">' + tab.label + '</span>' +
        '</button>';
      }).join('') +
    '</nav>';
  }

  function renderDesktopSidebar(currentTab) {
    var tabs = [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'journey', label: 'Journey', icon: 'journey' },
      { id: 'practice', label: 'Practice', icon: 'practice' },
      { id: 'progress', label: 'Progress', icon: 'progress' },
      { id: 'settings', label: 'Settings', icon: 'settings' }
    ];
    var activeTab = currentTab === 'chapter' ? 'journey' : currentTab;
    return '<aside class="desktop-sidebar">' +
      '<div class="desktop-logo">' +
        '<span class="desktop-logo-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><rect x="2" y="2" width="36" height="36" rx="13" fill="#4B35C5"/><circle cx="27" cy="13" r="4" fill="#FFE6A8"/><path d="M3 27c6-7 11-11 17-8 5 3 9 8 17 1v18H3V27Z" fill="#7A3FD0"/></svg></span>' +
        '<span class="desktop-logo-name">Study</span>' +
      '</div>' +
      '<nav class="desktop-nav" aria-label="Main navigation">' +
        tabs.map(function (tab) {
          var isActive = tab.id === activeTab;
          return '<button class="desktop-nav-item' + (isActive ? ' active' : '') + '" type="button" data-act="nav-tab" data-tab="' + tab.id + '"' +
            (isActive ? ' aria-current="page"' : '') + '>' +
            tabIconSvg(tab.icon) +
            '<span>' + tab.label + '</span>' +
          '</button>';
        }).join('') +
      '</nav>' +
    '</aside>';
  }

  views.home = function () {
    var totalCards = S.decks.reduce(function (n, d) { return n + d.cards.length; }, 0);
    var totalKnown = S.decks.reduce(function (n, d) { return n + d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length; }, 0);
    var now = Date.now();
    var all = allCardItems();
    var dueCount = StudyLogic.dueItems(all, now).length;
    var masterPct = totalCards ? Math.round(100 * totalKnown / totalCards) : 0;
    var streak = MobileStudy.calculateStreak(getStudyTimestamps(), now);
    var showStreak = S.settings.showStreak !== false;

    var backupReminder = StudyLogic.backupReminderDue(S.backupReminder, now)
      ? '<aside class="note backup-reminder" role="status" aria-labelledby="backup-reminder-title"><div><b id="backup-reminder-title">Back up now?</b><p>Keep a copy of your decks and study progress safe.</p></div><div class="row"><button class="btn sm primary" data-act="backup">Back up now</button><button class="btn sm ghost" data-act="backup-dismiss">Dismiss</button></div></aside>'
      : '';

    // Top bar: title, streak flame counter, settings icon
    var topBar = '<header class="home-top-bar">' +
      '<div class="home-brand">' +
        '<h1 class="home-title">CCI Discipleship</h1>' +
      '</div>' +
      '<div class="home-top-actions">' +
        (showStreak ? '<button class="streak-flame-btn" data-act="streak-info" aria-label="Streak: ' + streak + ' days"><span class="flame-icon" aria-hidden="true">🔥</span><span class="streak-count">' + streak + '</span></button>' : '') +
        '<button class="top-icon-btn" data-act="nav-tab" data-tab="settings" aria-label="Settings">' +
          tabIconSvg('settings') +
        '</button>' +
      '</div>' +
    '</header>';

    // Hero Card: Continue (resumes saved session if there is one) or Today Focus
    var heroCard = '';
    if (S.pausedSession) {
      var pausedLabel = S.pausedSession.name === 'exam' ? 'exam' : (S.pausedSession.name === 'quiz' ? 'quiz' : 'flashcard session');
      var pausedCardNum = Math.min((S.pausedSession.i || 0) + 1, (S.pausedSession.cards || []).length);
      heroCard = '<section class="hero-card hero-continue" aria-label="Continue saved study">' +
        '<div class="hero-card-header">' +
          '<span class="hero-chip">CONTINUE</span>' +
          '<span class="hero-meta">Card ' + pausedCardNum + ' of ' + S.pausedSession.cards.length + '</span>' +
        '</div>' +
        '<h2 class="hero-card-title">Pick up where you left off</h2>' +
        '<p class="hero-card-desc">Your ' + pausedLabel + ' is waiting right where you stopped.</p>' +
        '<div class="hero-card-actions">' +
          '<button class="btn primary full" data-act="resume-study">Resume Study</button>' +
          '<button class="btn sm ghost" data-act="discard-study">End session</button>' +
        '</div>' +
      '</section>';
    } else if (S.decks.length) {
      var heroTitle = dueCount > 0 ? 'Start Today’s Focus' : (totalKnown < totalCards ? 'Continue Your Journey' : 'All Cards Mastered!');
      var heroDesc = dueCount > 0
        ? dueCount + ' ' + (dueCount === 1 ? 'card is' : 'cards are') + ' ready for review today (~5 min).'
        : (totalKnown < totalCards
          ? 'Build your discipleship foundation with a quick 10-card session.'
          : 'Outstanding! You have mastered all 12 lesson decks. Challenge yourself with a comprehensive exam.');
      var heroBtnText = dueCount > 0 ? 'Start Today’s Review' : (totalKnown < totalCards ? 'Start 10-Card Session' : 'Take Comprehensive Exam');
      var heroAction = (totalKnown >= totalCards && totalCards > 0) ? 'exam' : 'daily-study';
      heroCard = '<section class="hero-card hero-today" aria-label="Today’s focus">' +
        '<div class="hero-card-header">' +
          '<span class="hero-chip">TODAY’S FOCUS</span>' +
          (dueCount > 0 ? '<span class="hero-meta">' + dueCount + ' due</span>' : '<span class="hero-meta">~5 min</span>') +
        '</div>' +
        '<h2 class="hero-card-title">' + heroTitle + '</h2>' +
        '<p class="hero-card-desc">' + heroDesc + '</p>' +
        '<div class="hero-card-actions">' +
          '<button class="btn primary full" data-act="' + heroAction + '">' + heroBtnText + '</button>' +
        '</div>' +
      '</section>';
    } else {
      heroCard = '<div class="empty"><h2>Welcome to CCI Study Decks</h2><p>Begin your discipleship journey. Add a deck from a text file or paste its content to start studying.</p><button class="btn primary sm" data-act="import" style="margin-top:14px">Add your first deck</button></div>';
    }

    // Daily Devotionals swipeable row (between hero and plan)
    var activeDevotionals = MobileStudy.filterDevotionals(DEVOTIONALS, S.settings.showDraftDevotionals);
    var todayDevotion = MobileStudy.getTodayDevotional(activeDevotionals, now);
    var isDevotionHiddenToday = !!(S.devotions && S.devotions.carouselHiddenOn === todayString(now));

    var devotionSection = '';
    if (activeDevotionals.length > 0 && !isDevotionHiddenToday) {
      var todayIdx = todayDevotion ? activeDevotionals.indexOf(todayDevotion) : 0;
      var orderedDevotionals = todayIdx > 0
        ? activeDevotionals.slice(todayIdx).concat(activeDevotionals.slice(0, todayIdx))
        : activeDevotionals;

      devotionSection = '<section class="devotion-feed-section" aria-label="Daily Devotionals">' +
        '<div class="section-head">' +
          '<div>' +
            '<h2 class="section-title">Daily Devotionals</h2>' +
            '<span class="section-sub">Spiritual food rooted in Scripture</span>' +
          '</div>' +
          '<button class="devotion-dismiss-btn" data-act="dismiss-devotions" aria-label="Hide devotionals until tomorrow" title="Hide until tomorrow">✕</button>' +
        '</div>' +
        '<div class="devotion-carousel" role="region" aria-label="Devotional articles carousel">' +
          orderedDevotionals.map(function (dev, i) {
            var isToday = dev.id === (todayDevotion && todayDevotion.id);
            var isRead = !!(S.devotions && S.devotions.read && S.devotions.read[dev.id]);
            var gradClass = dev.gradient || 'deck-grad-1';
            return '<article class="devotion-card ' + gradClass + '" role="group" aria-label="' + (i + 1) + ' of ' + orderedDevotionals.length + ': ' + esc(dev.title) + '">' +
              '<div class="devotion-card-top">' +
                '<span class="devotion-badge' + (isToday ? ' is-today' : '') + '">' + (isToday ? "Today's Devotion" : esc(dev.scripture)) + '</span>' +
                (isRead ? '<span class="devotion-read-badge" aria-label="Read">✓ Read</span>' : '<span class="devotion-time">' + dev.readMinutes + ' min</span>') +
              '</div>' +
              '<button class="devotion-card-hit" data-act="open-devotional" data-id="' + dev.id + '" aria-label="Read ' + esc(dev.title) + '">' +
                '<h3 class="devotion-card-title">' + esc(dev.title) + '</h3>' +
                '<p class="devotion-card-sub">' + esc(dev.subtitle) + '</p>' +
              '</button>' +
              '<div class="devotion-card-footer">' +
                '<span class="devotion-scripture-pill">' + esc(dev.scripture) + '</span>' +
                '<button class="devotion-card-action-btn" data-act="open-devotional" data-id="' + dev.id + '">Read →</button>' +
              '</div>' +
            '</article>';
          }).join('') +
        '</div>' +
      '</section>';
    }

    // Your Plan for Today: short cards with icon, one-line title, minute estimate and state
    var planCards = MobileStudy.selectPlanCards({
      dueItems: StudyLogic.dueItems(all, now),
      weakItems: StudyLogic.weakSpots(all, 10),
      allItems: all,
      isMastered: function (it) { return isMastered(it.deckId, it.card.id); },
      decks: S.decks,
      completedToday: S.completedToday || {},
      dailyMinutes: (S.onboarding && S.onboarding.dailyMinutes) || 10,
      startingTopic: (S.onboarding && S.onboarding.startingTopic) || 'soteriology',
      todayDevotion: todayDevotion,
      isDevotionRead: function (devId) { return !!(S.devotions && S.devotions.read && S.devotions.read[devId]); }
    });

    var planSection = '<section class="plan-section" aria-labelledby="plan-section-title">' +
      '<div class="section-head">' +
        '<h2 id="plan-section-title" class="section-title">Your Plan for Today</h2>' +
        '<span class="section-sub">Personalized coaching</span>' +
      '</div>' +
      '<div class="plan-card-list">' +
        planCards.map(function (c) {
          return '<button class="plan-card state-' + c.state + '" data-act="' + c.action + '"' + (c.mode ? ' data-mode="' + c.mode + '"' : '') + (c.deckId ? ' data-id="' + c.deckId + '"' : '') + (c.devotionalId ? ' data-id="' + c.devotionalId + '"' : '') + ' aria-label="' + esc(c.oneLine) + '">' +
            '<div class="plan-card-icon" aria-hidden="true">' + planIconSvg(c.icon) + '</div>' +
            '<div class="plan-card-body">' +
              '<div class="plan-card-title">' + esc(c.title) + '</div>' +
              '<div class="plan-card-meta">' + (c.minuteEstimate ? c.minuteEstimate + ' min estimate' : (c.state === 'done' ? 'Completed today' : 'Ready')) + '</div>' +
            '</div>' +
            '<div class="plan-card-badge ' + c.state + '">' + (c.state === 'done' ? 'Done ✓' : 'Ready') + '</div>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</section>';

    var desktopTopBar = '<header class="desktop-home-header">' +
      '<h1>Study</h1>' +
      '<button class="start-practising-btn" type="button" data-act="toggle-rocket" aria-haspopup="menu" aria-expanded="' + (rocketMenuOpen ? 'true' : 'false') + '">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 13h6l-1 8 11-12h-7l-1-6Z"/></svg><span>Start practising</span>' +
      '</button>' +
    '</header>';

    var backupAgeDays = S.backupReminder && S.backupReminder.anchorAt
      ? Math.floor((now - S.backupReminder.anchorAt) / (24 * 60 * 60 * 1000))
      : 0;
    var desktopBackupCopy = backupAgeDays >= 14
      ? 'Last backup was ' + backupAgeDays + ' days ago.'
      : 'You have studied ' + ((S.backupReminder && S.backupReminder.cardsStudied) || 50) + ' cards since your last backup.';
    var desktopBackupReminder = StudyLogic.backupReminderDue(S.backupReminder, now)
      ? '<aside class="desktop-backup-reminder" role="status" aria-labelledby="desktop-backup-reminder-title">' +
          '<p id="desktop-backup-reminder-title">' + esc(desktopBackupCopy) + '</p>' +
          '<button class="desktop-backup-action" type="button" data-act="backup">Back up now</button>' +
          '<button class="desktop-backup-dismiss" type="button" data-act="backup-dismiss" aria-label="Dismiss backup reminder">×</button>' +
        '</aside>'
      : '';

    var dailyAction = totalCards > 0 && totalKnown >= totalCards ? 'exam' : 'daily-study';
    var dailyMinutes = (S.onboarding && S.onboarding.dailyMinutes) || 10;
    var dailyFocusCount = Math.min(dueCount || Math.max(totalCards - totalKnown, 0), dailyMinutes);
    var desktopHeroTitle = S.pausedSession
      ? 'Continue · ' + Math.min((S.pausedSession.i || 0) + 1, (S.pausedSession.cards || []).length) + ' of ' + S.pausedSession.cards.length + ' cards'
      : (dueCount ? 'Your next step: ' + plural(dailyFocusCount, 'card') : (totalKnown < totalCards ? 'A little progress goes a long way' : 'You’ve mastered every card'));
    var desktopHeroDescription = S.pausedSession
      ? 'Your study session is ready when you are.'
      : (dueCount ? plural(dueCount, 'card') + ' are ready for review. Start with your daily focus.' : 'Keep your rhythm going with a focused review.');
    var desktopHeroAction = S.pausedSession ? 'resume-study' : dailyAction;
    var desktopHero = '<section class="desktop-today-card" aria-label="Today’s study">' +
      '<div class="desktop-today-copy">' +
        '<p class="desktop-today-eyebrow">Today’s study</p>' +
        '<h2>' + esc(desktopHeroTitle) + '</h2>' +
        '<p>' + esc(desktopHeroDescription) + '</p>' +
        '<button type="button" class="desktop-today-action" data-act="' + desktopHeroAction + '">Continue</button>' +
      '</div>' +
      '<svg class="desktop-today-landscape" viewBox="0 0 440 170" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">' +
        '<circle cx="335" cy="48" r="30" fill="#FFE6A8"/>' +
        '<path d="M0 116c65-42 119-57 175-31 63 30 106 42 164 17 38-16 70-39 101-61v129H0Z" fill="rgba(255,255,255,.22)"/>' +
        '<path d="M0 135c73-38 127-43 188-19 53 21 102 36 159 11 32-14 62-34 93-58v102H0Z" fill="rgba(20,15,75,.25)"/>' +
      '</svg>' +
    '</section>';

    var desktopStats = '<section class="desktop-home-stats" aria-label="Study statistics">' +
      '<div class="desktop-stat-card"><strong>' + masterPct + '%</strong><span>Mastered</span></div>' +
      '<div class="desktop-stat-card"><strong>' + dueCount + '</strong><span>Due today</span></div>' +
      '<div class="desktop-stat-card"><strong>' + totalCards.toLocaleString() + '</strong><span>Cards</span></div>' +
    '</section>';

    var desktopLessons = '<section class="desktop-lessons" aria-labelledby="desktop-lessons-title">' +
      '<div class="desktop-section-heading"><h2 id="desktop-lessons-title">Lessons</h2><span>' + plural(S.decks.length, 'chapter') + '</span></div>' +
      '<div class="desktop-lesson-grid">' +
        S.decks.map(function (d, index) {
          var parsed = MobileStudy.parseChapterTitle(d.title);
          var sectionNum = parsed.sectionNum || (index + 1);
          var mastered = d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length;
          var total = d.cards.length;
          var pct = total ? Math.round(100 * mastered / total) : 0;
          var gradient = 'deck-grad-' + (((sectionNum - 1) % 12) + 1);
          return '<button type="button" class="desktop-lesson-card ' + gradient + '" data-act="lesson-detail-open" data-id="' + d.id + '" aria-label="View details for ' + esc(parsed.topic) + '">' +
            '<span class="desktop-lesson-card-top"><strong>' + esc(parsed.topic) + '</strong><span class="desktop-lesson-section">' + sectionNum + '/12</span></span>' +
            '<span class="desktop-lesson-card-bottom"><span>' + plural(total, 'card') + '</span><strong>' + pct + '%</strong></span>' +
            '<span class="desktop-lesson-progress" role="progressbar" aria-label="' + esc(parsed.topic) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</section>';

    var desktopPlanCards = [];
    var devotionalTask = planCards.filter(function (c) { return c.type === 'devotion'; })[0];
    var reviewTask = planCards.filter(function (c) { return c.type === 'review'; })[0];
    var nextTask = planCards.filter(function (c) { return c.type === 'lesson' || c.type === 'exam'; })[0];
    if (devotionalTask) desktopPlanCards.push(devotionalTask);
    if (reviewTask) desktopPlanCards.push(reviewTask);
    if (nextTask) desktopPlanCards.push(nextTask);
    if (desktopPlanCards.length < 3) {
      planCards.forEach(function (c) {
        if (desktopPlanCards.length < 3 && desktopPlanCards.indexOf(c) < 0) desktopPlanCards.push(c);
      });
    }

    var desktopPlan = '<section class="desktop-plan-section" aria-labelledby="desktop-plan-title">' +
      '<h2 id="desktop-plan-title">Your plan for today</h2>' +
      '<div class="desktop-plan-list">' +
        desktopPlanCards.slice(0, 3).map(function (c, index) {
          return '<button type="button" class="desktop-plan-row" data-act="' + c.action + '"' + (c.mode ? ' data-mode="' + c.mode + '"' : '') + (c.deckId ? ' data-id="' + c.deckId + '"' : '') + (c.devotionalId ? ' data-id="' + c.devotionalId + '"' : '') + ' aria-label="' + esc(c.oneLine) + '">' +
            '<span class="desktop-plan-icon desktop-plan-icon-' + index + '" aria-hidden="true">' + planIconSvg(c.icon) + '</span>' +
            '<span class="desktop-plan-copy"><strong>' + esc(c.title) + '</strong><small>' + (c.minuteEstimate ? c.minuteEstimate + ' min' : (c.state === 'done' ? 'Completed today' : 'Ready')) + '</small></span>' +
            '<span class="desktop-plan-count">' + (index + 1) + '/3</span>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</section>';

    var desktopDevotionFeature = todayDevotion && !isDevotionHiddenToday
      ? '<article class="desktop-featured-devotion">' +
          '<p>Today’s devotion · ' + todayDevotion.readMinutes + ' min</p>' +
          '<h2>' + esc(todayDevotion.title) + '</h2>' +
          '<p class="desktop-featured-scripture">' + esc(todayDevotion.scripture) + '</p>' +
          '<button type="button" data-act="open-devotional" data-id="' + todayDevotion.id + '">Read now</button>' +
        '</article>'
      : '';

    var desktopDevotionList = activeDevotionals.length && !isDevotionHiddenToday
      ? '<section class="desktop-devotion-list" aria-labelledby="desktop-devotions-title">' +
          '<h2 id="desktop-devotions-title">Daily devotionals</h2>' +
          '<div class="desktop-devotion-rows">' +
            orderedDevotionals.slice(0, 3).map(function (dev) {
              var isRead = !!(S.devotions && S.devotions.read && S.devotions.read[dev.id]);
              return '<article class="desktop-devotion-row ' + (dev.gradient || 'deck-grad-1') + '">' +
                '<span><small>' + dev.readMinutes + ' min</small><strong>' + esc(dev.title) + '</strong></span>' +
                '<button type="button" data-act="open-devotional" data-id="' + dev.id + '" aria-label="' + (isRead ? 'Read again: ' : 'Read: ') + esc(dev.title) + '">' + (isRead ? 'Read again' : 'Read') + '</button>' +
              '</article>';
            }).join('') +
          '</div>' +
        '</section>'
      : '';

    var desktopHome = '<div class="desktop-home-content">' +
      desktopTopBar +
      desktopBackupReminder +
      '<div class="desktop-home-columns">' +
        '<div class="desktop-home-primary">' + desktopHero + desktopStats + desktopLessons + '</div>' +
        '<aside class="desktop-home-rail" aria-label="Your daily study">' +
          desktopDevotionFeature + desktopPlan + desktopDevotionList +
        '</aside>' +
      '</div>' +
    '</div>';

    var mobileStudyHeader = '<header class="mobile-study-header"><h1>Study</h1>' +
      '<button class="top-icon-btn" data-act="nav-tab" data-tab="settings" aria-label="Settings">' +
        tabIconSvg('settings') +
      '</button>' +
    '</header>';

    var milestoneCard = S.decks.length ? '<section class="home-milestone-card">' +
      '<div class="milestone-content">' +
        '<div class="milestone-title">Progress Overview</div>' +
        '<div class="milestone-stats">' +
          '<span>' + S.decks.length + ' Lessons</span> · ' +
          '<span>' + totalCards + ' Cards</span> · ' +
          '<span>' + masterPct + '% Mastered</span>' +
        '</div>' +
      '</div>' +
      '<button class="btn sm ghost" data-act="nav-tab" data-tab="progress">View Details →</button>' +
    '</section>' : '';

    return '<div class="home-view">' +
      '<div class="mobile-home-content">' + mobileStudyHeader + backupReminder + desktopHero + desktopStats + desktopLessons + devotionSection + '</div>' +
      desktopHome +
    '</div>';
  };

  
  function chapterSvgIllustration(seed) {
    var s = (seed || 1) % 4;
    if (s === 1) {
      // Sunrise & rolling hills
      return '<svg viewBox="0 0 120 70" class="chapter-ill" aria-hidden="true"><circle cx="60" cy="24" r="16" fill="rgba(255,255,255,0.2)"/><path d="M-10 70 Q30 35 70 70 Z" fill="rgba(255,255,255,0.15)"/><path d="M40 70 Q85 30 130 70 Z" fill="rgba(255,255,255,0.25)"/></svg>';
    } else if (s === 2) {
      // Mountain peaks
      return '<svg viewBox="0 0 120 70" class="chapter-ill" aria-hidden="true"><polygon points="20,70 55,25 90,70" fill="rgba(255,255,255,0.18)"/><polygon points="60,70 85,35 110,70" fill="rgba(255,255,255,0.12)"/><polygon points="-5,70 25,40 55,70" fill="rgba(255,255,255,0.12)"/></svg>';
    } else if (s === 3) {
      // Pathway
      return '<svg viewBox="0 0 120 70" class="chapter-ill" aria-hidden="true"><circle cx="95" cy="20" r="10" fill="rgba(255,255,255,0.2)"/><path d="M10 70 Q45 50 60 25 Q75 50 110 70 Z" fill="rgba(255,255,255,0.18)"/><path d="M48 70 Q55 45 60 25 Q65 45 72 70 Z" fill="rgba(255,255,255,0.22)"/></svg>';
    } else {
      // Serene horizon & waves/hills
      return '<svg viewBox="0 0 120 70" class="chapter-ill" aria-hidden="true"><circle cx="25" cy="22" r="12" fill="rgba(255,255,255,0.15)"/><path d="M0 55 Q35 40 70 55 T140 55 L140 70 L0 70 Z" fill="rgba(255,255,255,0.18)"/><path d="M0 62 Q35 50 70 62 T140 62 L140 70 L0 70 Z" fill="rgba(255,255,255,0.22)"/></svg>';
    }
  }

  function getStepIconSvg(icon) {
    switch (icon) {
      case 'practice-challenge':
        return '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h12l-3.5 4 3.5 4H6"/></svg>';
      case 'practice-exam':
        return '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>';
      case 'practice-quiz':
        return '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1"/><line x1="9" y1="6" x2="20" y2="6"/><circle cx="5" cy="12" r="1"/><line x1="9" y1="12" x2="20" y2="12"/><circle cx="5" cy="18" r="1"/><line x1="9" y1="18" x2="20" y2="18"/></svg>';
      case 'practice-flash':
        return '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
      case 'flash':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>';
      case 'quiz':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      case 'target':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
      case 'trophy':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M4 3h16v8a8 8 0 0 1-16 0V3zM12 17v4M8 21h8"/></svg>';
      default:
        return '';
    }
  }

  views.journey = function () {
    var totalCards = S.decks.reduce(function (n, d) { return n + d.cards.length; }, 0);
    var now = Date.now();
    var rows = S.decks.map(function (d, index) {
      var p = prog(d.id);
      var mastered = d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length;
      var total = d.cards.length;
      var pct = total ? Math.round(100 * mastered / total) : 0;
      var parsed = MobileStudy.parseChapterTitle(d.title);
      var secNum = parsed.sectionNum || (index + 1);
      var gradClass = 'deck-grad-' + (((secNum - 1) % 12) + 1);
      var hidden = homeFilter && (
        parsed.topic.toLowerCase().indexOf(homeFilter.toLowerCase()) < 0 &&
        d.title.toLowerCase().indexOf(homeFilter.toLowerCase()) < 0 &&
        ('section ' + secNum).indexOf(homeFilter.toLowerCase()) < 0
      );

      var bestBadge = p.best ? '<span class="chapter-best-badge">Best ' + p.best.pct + '%</span>' : '';

      return '<article class="chapter-card ' + gradClass + '" data-deck-name="' + esc(parsed.topic.toLowerCase()) + '" data-id="' + d.id + '"' + (hidden ? ' hidden' : '') + '>' +
        '<div class="chapter-card-top">' +
          '<div class="chapter-badges">' +
            '<span class="chapter-sec-pill">' + secNum + '/12</span>' +
            bestBadge +
          '</div>' +
          '<span class="chapter-pct-desktop">' + pct + '%</span>' +
          '<div class="chapter-card-actions">' +
            '<button class="chapter-icon-btn chapter-info-btn" data-act="chapter-info" data-id="' + d.id + '" aria-label="Deck info for ' + esc(parsed.topic) + '" title="View deck details">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '</button>' +
            '<button class="chapter-icon-btn" data-act="chapter-menu" data-id="' + d.id + '" aria-label="Options for ' + esc(parsed.topic) + '">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<button class="chapter-card-main-hit" data-act="open-chapter" data-id="' + d.id + '" aria-label="Open chapter ' + esc(parsed.topic) + '">' +
          '<h2 class="chapter-title">' + esc(parsed.topic) + '</h2>' +
          '<p class="chapter-sub"><span class="chapter-sub-mobile">CCI Discipleship Experience</span><span class="chapter-sub-desktop">Section ' + secNum + '</span></p>' +
          '<div class="chapter-card-bottom">' +
            '<div class="chapter-progress-info">' +
              '<span class="chapter-count">' + mastered + ' / ' + total + ' mastered</span>' +
              '<span class="chapter-pct">' + pct + '%</span>' +
            '</div>' +
            '<div class="deck-progress chapter-progress-bar" role="progressbar" aria-label="' + esc(parsed.topic) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
        '</button>' +
        chapterSvgIllustration(secNum) +
      '</article>';
    }).join('');

    var empty = '<div class="empty"><h2>Welcome to CCI Study Decks</h2><p>Begin your discipleship journey. Add a deck from a text file or paste its content to start studying.</p><button class="btn primary sm" data-act="import" style="margin-top:14px">Add your first deck</button></div>';

    return '<header class="view-header">' +
      '<div class="row spread">' +
        '<div><h1>Journey</h1><p class="view-sub journey-subtitle-mobile">12 Discipleship Chapters · ' + plural(S.decks.length, 'chapter') + ' · ' + plural(totalCards, 'card') + '</p><p class="view-sub journey-subtitle-desktop">Pick any chapter. Nothing is ever locked.</p></div>' +
        '<button class="btn sm" data-act="import">Add deck</button>' +
      '</div>' +
    '</header>' +
    (S.decks.length ? '<div class="decks-section-bar">' +
      '<div class="home-tools">' +
        '<label class="sr-only" for="deck-search">Search chapters</label>' +
        '<input id="deck-search" type="search" placeholder="Search chapters by section or topic…" value="' + esc(homeFilter) + '" autocomplete="off">' +
        '<span class="meta" id="deck-result-count">' + S.decks.length + ' ' + (S.decks.length === 1 ? 'chapter' : 'chapters') + '</span>' +
      '</div>' +
      '<p class="search-empty" id="search-empty">No chapters match that search. Try searching by section or topic.</p>' +
    '</div>' : '') +
    (rows ? '<div class="chapter-grid">' + rows + '</div>' : empty);
  };

  views.chapter = function () {
    var d = deck(V.id);
    if (!d) return '<div class="empty"><h2>Chapter not found</h2><button class="btn primary sm" data-act="nav-tab" data-tab="journey">Back to Journey</button></div>';
    var p = prog(d.id);
    var mastered = d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length;
    var total = d.cards.length;
    var pct = total ? Math.round(100 * mastered / total) : 0;
    var parsed = MobileStudy.parseChapterTitle(d.title);
    var secNum = parsed.sectionNum || 1;
    var gradClass = 'deck-grad-' + (((secNum - 1) % 12) + 1);

    var steps = MobileStudy.getChapterSteps(d, p, {
      isMastered: function (c) { return isMastered(d.id, c.id); }
    });

    var timelineHtml = steps.map(function (s, idx) {
      var stateClass = 'step-' + s.state;
      var stateBadge = s.state === 'complete'
        ? '<span class="step-badge complete">Complete ✓</span>'
        : (s.state === 'in-progress' ? '<span class="step-badge in-progress">In progress</span>' : '<span class="step-badge unlocked">Unlocked</span>');

      return '<div class="timeline-step ' + stateClass + '">' +
        '<div class="timeline-node" aria-hidden="true">' +
          '<div class="node-circle">' + (s.state === 'complete' ? '✓' : (idx + 1)) + '</div>' +
          (idx < steps.length - 1 ? '<div class="node-line"></div>' : '') +
        '</div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-card-head">' +
            '<div class="timeline-step-icon">' + getStepIconSvg(s.icon) + '</div>' +
            '<div class="timeline-step-info">' +
              '<h3 class="timeline-step-title">' + esc(s.title) + '</h3>' +
              '<p class="timeline-step-meta">' + esc(s.meta) + '</p>' +
            '</div>' +
            stateBadge +
          '</div>' +
          '<p class="timeline-step-desc">' + esc(s.desc) + '</p>' +
          '<div class="timeline-step-act">' +
            '<button class="btn sm' + (s.state === 'complete' ? '' : ' primary') + '" data-act="' + s.action + '" data-mode="' + s.mode + '" data-id="' + d.id + '">Start ' + esc(s.title) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<header class="chapter-view-header ' + gradClass + '">' +
      '<div class="chapter-view-top">' +
        '<button class="btn sm ghost" data-act="nav-tab" data-tab="journey">‹ Journey</button>' +
        '<div class="row">' +
          '<button class="chapter-icon-btn chapter-info-btn" data-act="chapter-info" data-id="' + d.id + '" aria-label="Chapter info" title="Chapter details">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
          '</button>' +
          '<button class="chapter-icon-btn" data-act="chapter-menu" data-id="' + d.id + '" aria-label="Chapter menu">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="chapter-view-hero">' +
        '<span class="chapter-sec-pill">' + secNum + '/12</span>' +
        '<h1 class="chapter-view-title">' + esc(parsed.topic) + '</h1>' +
        '<p class="chapter-view-sub">' + plural(total, 'question') + ' · ' + mastered + ' mastered (' + pct + '%)</p>' +
        '<div class="deck-progress chapter-progress-bar" role="progressbar" aria-label="' + esc(parsed.topic) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '</div>' +
      chapterSvgIllustration(secNum) +
    '</header>' +
    '<section class="chapter-timeline-section" aria-label="Study Steps">' +
      '<div class="timeline-intro">' +
        '<h2>Study Timeline</h2>' +
        '<p class="meta">Step through each mode or jump straight to any challenge anytime.</p>' +
      '</div>' +
      '<div class="chapter-timeline">' + timelineHtml + '</div>' +
    '</section>';
  };


  views.practice = function () {
    var mode = V.practiceMode || 'quiz';
    var multi = V.practiceMulti !== false;
    var all = allCardItems();
    var dueCount = StudyLogic.dueItems(all, Date.now()).length;
    var weakCount = StudyLogic.weakSpots(all, 10).length;
    var totalCards = all.length;
    var allSelected = S.decks.length > 0 && S.decks.every(function (d) { return SEL.has(d.id); });
    var selectedCount = SEL.size + (V.practiceMixed ? 1 : 0);
    var modeTiles = [
      { id: 'challenge', title: 'Start a Challenge', description: 'About 5 minutes', icon: 'practice-challenge' },
      { id: 'exam', title: 'Start Exam', description: 'Full run', icon: 'practice-exam' },
      { id: 'quiz', title: 'Quiz', description: 'Multiple choice', icon: 'practice-quiz' },
      { id: 'flash', title: 'Flashcards', description: 'Flip and recall', icon: 'practice-flash' }
    ].map(function (item) {
      var selected = mode === item.id;
      return '<button type="button" class="practice-mode-tile' + (selected ? ' is-selected' : '') + '" data-act="practice-mode" data-mode="' + item.id + '" aria-pressed="' + selected + '">' +
        '<span class="practice-mode-icon" aria-hidden="true">' + getStepIconSvg(item.icon) + '</span>' +
        '<span class="practice-mode-copy"><strong>' + item.title + '</strong><small>' + item.description + '</small></span>' +
      '</button>';
    }).join('');
    var deckTiles = S.decks.map(function (d, index) {
      var parsed = MobileStudy.parseChapterTitle(d.title);
      var section = parsed.sectionNum || index + 1;
      var displayTopic = section === 11 && parsed.topic === "Believers' Authority/Charisma" ? 'Authority & Charisma' : parsed.topic;
      var mastered = d.cards.filter(function (card) { return isMastered(d.id, card.id); }).length;
      var pct = d.cards.length ? Math.round(100 * mastered / d.cards.length) : 0;
      var selected = SEL.has(d.id);
      return '<button type="button" class="practice-cover-tile deck-grad-' + (((section - 1) % 12) + 1) + (selected ? ' is-selected' : '') + '" data-act="practice-cover" data-id="' + esc(d.id) + '" aria-pressed="' + selected + '" aria-label="Lesson ' + section + ', ' + esc(displayTopic) + ', ' + d.cards.length + ' cards, ' + pct + ' percent mastered">' +
        '<span class="practice-cover-title">Lesson ' + section + ' · ' + esc(displayTopic) + '</span>' +
        '<span class="practice-cover-stats">' + d.cards.length + ' cards · ' + pct + '%</span>' +
        (selected ? '<span class="practice-cover-check" aria-hidden="true">✓</span>' : '') +
      '</button>';
    }).join('');
    var startText = mode === 'challenge' ? 'Start challenge' : mode === 'exam' ? 'Start exam' : V.practiceMixed ? (mode === 'flash' ? 'Start mixed flashcards' : 'Start mixed review') : 'Start ' + (mode === 'flash' ? 'flashcards' : 'quiz') + (selectedCount ? ' · ' + selectedCount + ' ' + (selectedCount === 1 ? 'set' : 'sets') : '');
    var startDisabled = !selectedCount && mode !== 'challenge' && mode !== 'exam';
    return '<section class="practice-selection-view" aria-labelledby="practice-title">' +
      '<header class="view-header practice-view-header">' +
        '<h1 id="practice-title">Practice</h1>' +
        '<p class="view-sub">Pick how you want to practice, then choose what to cover.</p>' +
      '</header>' +
      '<div class="practice-mode-grid" role="group" aria-label="Choose a practice mode">' + modeTiles + '</div>' +
      '<section class="practice-cover-section" aria-labelledby="practice-cover-title">' +
        '<div class="practice-cover-heading">' +
          '<h2 id="practice-cover-title">What to cover</h2>' +
          '<button type="button" class="practice-multi-toggle' + (multi ? ' is-on' : '') + '" data-act="practice-multi" aria-pressed="' + multi + '"><span>Select several</span><i aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="practice-cover-grid" role="group" aria-label="Lessons to cover">' +
          '<button type="button" class="practice-cover-tile cover-all' + (allSelected ? ' is-selected' : '') + '" data-act="practice-cover" data-id="__all__" aria-pressed="' + allSelected + '">' +
            '<span class="practice-cover-title">All lessons</span><span class="practice-cover-stats">' + totalCards + ' cards</span>' + (allSelected ? '<span class="practice-cover-check" aria-hidden="true">✓</span>' : '') +
          '</button>' +
          '<button type="button" class="practice-cover-tile cover-mixed' + (V.practiceMixed ? ' is-selected' : '') + '" data-act="practice-cover" data-id="__mixed__" aria-pressed="' + !!V.practiceMixed + '">' +
            '<span class="practice-cover-title">Mixed review</span><span class="practice-cover-stats">Due + weak spots</span>' + (V.practiceMixed ? '<span class="practice-cover-check" aria-hidden="true">✓</span>' : '') +
          '</button>' + deckTiles +
        '</div>' +
      '</section>' +
      '<div class="practice-start-bar" aria-live="polite">' +
        '<span>' + (selectedCount ? selectedCount + ' ' + (selectedCount === 1 ? 'selection' : 'selections') + ' ready' : 'Choose what to cover') + '</span>' +
        '<button type="button" class="btn primary practice-start-button" data-act="practice-start" data-mode="' + mode + '"' + (startDisabled ? ' disabled aria-disabled="true"' : '') + '>' + startText + '</button>' +
      '</div>' +
    '</section>';
  };

  views.progress = function () {
    var totalCards = S.decks.reduce(function (n, d) { return n + d.cards.length; }, 0);
    var totalKnown = S.decks.reduce(function (n, d) { return n + d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length; }, 0);
    var now = Date.now();
    var dueCount = StudyLogic.dueItems(allCardItems(), now).length;
    var masterPct = totalCards ? Math.round(100 * totalKnown / totalCards) : 0;
    var streak = MobileStudy.calculateStreak(getStudyTimestamps(), now);
    var backupReminder = StudyLogic.backupReminderDue(S.backupReminder, now)
      ? '<aside class="note backup-reminder" role="status" aria-labelledby="backup-reminder-title-p"><div><b id="backup-reminder-title-p">Back up now?</b><p>Keep a copy of your decks and study progress safe.</p></div><div class="row"><button class="btn sm primary" data-act="backup">Back up now</button><button class="btn sm ghost" data-act="backup-dismiss">Dismiss</button></div></aside>'
      : '';

    var deckRows = S.decks.map(function (d) {
      var p = prog(d.id);
      var mastered = d.cards.filter(function (c) { return isMastered(d.id, c.id); }).length;
      var pct = d.cards.length ? Math.round(100 * mastered / d.cards.length) : 0;
      var bestText = p.best ? 'Best ' + p.best.pct + '%' : 'Not taken';
      var parsed = MobileStudy.parseChapterTitle(d.title);
      return '<li class="progress-deck-item">' +
        '<div class="progress-deck-head">' +
          '<strong>' + esc(parsed.topic) + '</strong>' +
          '<span class="meta">' + pct + '% · ' + bestText + '</span>' +
        '</div>' +
        '<div class="deck-progress" role="progressbar" aria-label="' + esc(parsed.topic) + '" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '</li>';
    }).join('');

    return '<header class="view-header">' +
      '<h1>Progress &amp; Stats</h1>' +
      '<p class="view-sub">Track your discipleship knowledge and retention</p>' +
    '</header>' +
    backupReminder +
    '<div class="statline">' +
      '<div class="stat"><b>' + S.decks.length + '</b><span>Lessons</span></div>' +
      '<div class="stat"><b>' + totalCards + '</b><span>Cards</span></div>' +
      '<div class="stat"><b>' + masterPct + '%</b><span>Mastered</span></div>' +
      '<div class="stat stat-due"><b>' + dueCount + '</b><span>Due Today</span></div>' +
    '</div>' +
    (streak > 0 ? '<div class="streak-card"><span class="flame-icon">🔥</span><div><b>' + streak + ' Day Study Streak</b><p>Keep studying daily to maintain momentum.</p></div></div>' : '') +
    '<div class="progress-decks-card">' +
      '<h2 class="decks-heading">Chapter Mastery</h2>' +
      '<ul class="progress-deck-list">' + deckRows + '</ul>' +
    '</div>';
  };

  views.settings = function () {
    var theme = S.settings.theme;
    var showStreak = S.settings.showStreak !== false;
    return '<header class="view-header">' +
      '<h1>Settings</h1>' +
      '<p class="view-sub">Preferences, backups, and app information</p>' +
    '</header>' +
    '<div class="settings-group">' +
      '<h2 class="settings-group-title">Appearance</h2>' +
      '<div class="settings-row">' +
        '<div><strong>Theme</strong><p class="meta">Select light, dark, or follow system</p></div>' +
        '<div class="theme-pill-group" role="group" aria-label="Theme selection">' +
          '<button class="theme-pill' + (theme === 'auto' ? ' active' : '') + '" data-act="set-theme" data-theme="auto">Auto</button>' +
          '<button class="theme-pill' + (theme === 'light' ? ' active' : '') + '" data-act="set-theme" data-theme="light">Light</button>' +
          '<button class="theme-pill' + (theme === 'dark' ? ' active' : '') + '" data-act="set-theme" data-theme="dark">Dark</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="settings-group">' +
      '<h2 class="settings-group-title">Study Preferences</h2>' +
      '<div class="settings-row">' +
        '<div><strong>Personal Study Plan</strong><p class="meta">' + (S.onboarding ? S.onboarding.dailyMinutes + ' min/day · ' + esc(S.onboarding.goal) : 'Customize pace &amp; goals') + '</p></div>' +
        '<button class="btn sm" data-act="retake-onboarding">Update Plan</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div><strong>Daily Streak Counter</strong><p class="meta">Show flame counter in top bar</p></div>' +
        '<button class="btn sm' + (showStreak ? ' primary' : '') + '" data-act="toggle-streak">' + (showStreak ? 'Enabled' : 'Off') + '</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div><strong>Shuffle Flashcards</strong><p class="meta">Randomize card order on start</p></div>' +
        '<button class="btn sm' + (S.settings.shuffle ? ' primary' : '') + '" data-act="toggle-shuffle">' + (S.settings.shuffle ? 'Enabled' : 'Off') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-group">' +
      '<h2 class="settings-group-title">Content</h2>' +
      '<div class="settings-row">' +
        '<div><strong>Show Draft Devotionals</strong><p class="meta">Preview devotional articles before leader review</p></div>' +
        '<button class="btn sm' + (S.settings.showDraftDevotionals ? ' primary' : '') + '" data-act="toggle-draft-devotionals">' + (S.settings.showDraftDevotionals ? 'Enabled' : 'Off') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-group">' +
      '<h2 class="settings-group-title">Data &amp; Backup</h2>' +
      '<div class="settings-row">' +
        '<div><strong>Export JSON Backup</strong><p class="meta">Save all decks, history, and settings</p></div>' +
        '<button class="btn sm" data-act="backup">Back up now</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div><strong>Restore Backup</strong><p class="meta">Import a previously saved .json backup file</p></div>' +
        '<button class="btn sm" data-act="import">Restore</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div><strong>Export All as Text</strong><p class="meta">Download .txt format of all decks</p></div>' +
        '<button class="btn sm" data-act="exportall">Export .txt</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-group">' +
      '<h2 class="settings-group-title">About</h2>' +
      '<p class="meta">CCI Discipleship Quiz &amp; Study App · Offline PWA</p>' +
      '<p class="meta">Storage engine: ' + esc(storageBackend) + '</p>' +
    '</div>';
  };
  function bar() {
    if (!SEL.size) return '';
    var n = 0; SEL.forEach(function (id) { var d = deck(id); if (d) n += d.cards.length; });
    return '<div class="barin"><span>' + plural(SEL.size, 'deck') + ' · ' + plural(n, 'card') + '</span><div class="row"><button class="btn sm" data-act="setup" data-mode="flash" data-id="*">Flashcards</button><button class="btn primary sm" data-act="setup" data-mode="quiz" data-id="*">Quiz</button></div></div>';
  }

  views.flash = function () {
    var it = V.cards[V.i], c = it.card, ai = LET.indexOf(c.answer), d = deck(it.deckId);
    var title = V.opts && V.opts.daily ? 'Today’s Study' : (d ? d.title : 'Flashcards');
    var parsed = MobileStudy.parseChapterTitle(title);
    var displayTitle = parsed.topic || title;
    var notes = (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') + (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') + bibleNote(c);
    var isLast = V.i === V.cards.length - 1;

    return '<section class="study-shell flash-session coaching-study-flow" aria-label="Flashcard study session">' +
      sessionHead(displayTitle, (V.i + 1) + ' / ' + V.cards.length) +
      progressBar(V.i + 1, V.cards.length) +
      '<div class="coaching-question-container">' +
        '<button class="flip' + (V.flipped ? ' on' : '') + '" data-act="flip" type="button" aria-pressed="' + V.flipped + '" aria-label="' + (V.flipped ? 'Show question' : 'Reveal answer') + '">' +
          '<span class="inner">' +
            '<span class="face front" aria-hidden="' + V.flipped + '">' +
              '<span class="card-face-top">' +
                '<span class="tag">' + esc(d ? (MobileStudy.parseChapterTitle(d.title).topic || d.title) : '') + '</span>' +
                '<span class="face-index">' + (V.i + 1) + ' / ' + V.cards.length + '</span>' +
              '</span>' +
              '<span class="q">' + esc(c.question) + '</span>' +
              '<span class="flip-cue"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap or Space to flip</span>' +
            '</span>' +
            '<span class="face back" aria-hidden="' + !V.flipped + '">' +
              '<span class="card-face-top">' +
                '<span class="tag">Answer · ' + c.answer + '</span>' +
                '<span class="face-index">' + (V.i + 1) + ' / ' + V.cards.length + '</span>' +
              '</span>' +
              '<span class="a">' + esc(c.options[ai]) + '</span>' +
              notes +
              '<span class="qs">' + esc(c.question) + '</span>' +
              '<span class="flip-cue"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap or Space to see question</span>' +
            '</span>' +
          '</span>' +
        '</button>' +
      '</div>' +
      (V.flipped ? '<div class="flash-rating row grow" role="group" aria-label="Mark your confidence">' +
        '<button class="btn btn-confidence" data-act="mark" data-v="unknown">Still learning</button>' +
        '<button class="btn primary btn-confidence" data-act="mark" data-v="known">I know it</button>' +
      '</div>' : '') +
      '<div class="study-bottom-bar">' +
        '<div class="row grow nav study-navigation">' +
          '<button class="btn ghost btn-prev" data-act="prev"' + (V.i ? '' : ' disabled') + '>Previous</button>' +
          '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'Finish session' : (V.flipped ? 'Next card' : 'Skip card')) + '</button>' +
        '</div>' +
      '</div>' +
      '<p class="study-shortcuts">Use ← / → to move between cards</p>' +
    '</section>';
  };

  views.quiz = function () {
    var isExam = V.name === 'exam', it = V.cards[V.i], c = it.card, picked = V.picked, done = picked !== null;
    var d = deck(it.deckId);
    var order = it.optionOrder || [0, 1, 2, 3];
    var isLast = V.i === V.cards.length - 1;
    var parsed = d ? MobileStudy.parseChapterTitle(d.title) : { topic: isExam ? 'Timed Exam' : 'Quiz' };
    var sessionTitle = isExam ? 'Timed Exam' : parsed.topic;

    var hasSeenTooltip = false;
    try { hasSeenTooltip = !!window.localStorage.getItem('cci_seen_answer_tooltip'); } catch (e) {}
    var showTooltip = !hasSeenTooltip && !done && V.i === 0;

    var opts = order.map(function (source, k) {
      var cls = 'opt';
      if (done && isExam && k === picked) cls += ' selected';
      else if (done && !isExam) {
        if (LET[source] === c.answer) cls += ' right';
        else if (k === picked) cls += ' wrong';
      }
      return '<button class="' + cls + '" data-act="pick" data-i="' + k + '" aria-label="' + LET[k] + '. ' + esc(c.options[source]) + '" aria-pressed="' + (done && k === picked) + '"' + (done ? ' disabled' : '') + '>' +
        '<span class="opt-badge" aria-hidden="true">' + LET[k] + '</span>' +
        '<span class="opt-text">' + esc(c.options[source]) + '</span>' +
        (done && !isExam && (cls.indexOf(' right') >= 0 || cls.indexOf(' wrong') >= 0) ? '<span class="opt-result-icon" aria-hidden="true">' + (cls.indexOf(' right') >= 0 ? '✓' : '✕') + '</span>' : '') +
      '</button>';
    }).join('');

    var fbSheet = '';
    var desktopFeedback = '';
    if (done) {
      var answerAt = order.indexOf(LET.indexOf(c.answer));
      if (isExam) {
        fbSheet = '<div class="coaching-bottom-sheet exam-sheet" role="status">' +
          '<div class="sheet-drag-handle" aria-hidden="true"></div>' +
          '<p class="exam-progress-note">Answer recorded for review after submission.</p>' +
          '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'Submit exam' : 'Next question') + '</button>' +
        '</div>';
      } else {
        var ok = picked === answerAt;
        var feedbackContent =
            '<div class="feedback-panel ' + (ok ? 'is-correct' : 'is-incorrect') + '">' +
              '<div class="feedback-header">' +
                '<span class="feedback-mark-icon" aria-hidden="true">' + (ok ? '✓' : '✗') + '</span>' +
                '<p class="fb ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Correct.' : 'Not quite.') + '</p>' +
              '</div>' +
              (!ok ? '<p class="feedback-answer"><span class="feedback-answer-letter" aria-label="Correct option ' + LET[answerAt] + '">' + LET[answerAt] + '</span><span>' + esc(c.options[order[answerAt]]) + '</span></p>' : '') +
              (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') +
              (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') +
              bibleNote(c) +
            '</div>';
        fbSheet = '<div class="coaching-bottom-sheet ' + (ok ? 'sheet-correct' : 'sheet-incorrect') + '" role="status" aria-live="polite">' +
          '<div class="sheet-drag-handle" aria-hidden="true"></div>' +
          '<div class="sheet-content">' +
            feedbackContent +
            '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'See results' : 'Next question') + '</button>' +
          '</div>' +
        '</div>';
        desktopFeedback = '<aside class="quiz-explanation-card ' + (ok ? 'sheet-correct' : 'sheet-incorrect') + '" role="status" aria-live="polite">' +
          '<div class="quiz-explanation-content">' + feedbackContent + '</div>' +
          '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'See results' : 'Continue') + '</button>' +
        '</aside>';
      }
    }

    var title = isExam ? 'Exam' : 'Quiz';
    var status = isExam
      ? '<span id="exam-clock" role="timer" aria-label="Time remaining ' + formatClock(V.remaining) + '">' + formatClock(V.remaining) + '</span>'
      : '<span class="score-inline" aria-label="Question ' + (V.i + 1) + ' of ' + V.cards.length + '">' + (V.i + 1) + '<span aria-hidden="true"> / </span><span class="sr-only">of</span>' + V.cards.length + '</span>';

    return '<section class="study-shell ' + (isExam ? 'exam-session' : 'quiz-session') + ' coaching-study-flow" aria-label="' + (isExam ? 'Timed exam' : 'Quiz') + '">' +
      sessionHead(sessionTitle, status, isExam) +
      progressBar(V.i + (done ? 1 : 0), V.cards.length) +
      '<div class="quiz-question-layout' + (desktopFeedback ? ' has-feedback' : '') + '">' +
        '<article class="question-panel coaching-question-panel">' +
          '<div class="question-meta-row">' +
            '<span class="count">Question ' + (V.i + 1) + ' of ' + V.cards.length + '</span>' +
            (showTooltip ? '<div class="coaching-first-tooltip" role="tooltip"><span class="tooltip-dot" aria-hidden="true"></span>Tap an answer to check it</div>' : '') +
          '</div>' +
          '<h2 class="qtext coaching-question-text" id="question-prompt" tabindex="-1">' + esc(c.question) + '</h2>' +
          '<div class="opts coaching-opts-group" role="group" aria-labelledby="question-prompt">' + opts + '</div>' +
          (done ? fbSheet : '') +
        '</article>' +
        desktopFeedback +
      '</div>' +
      '<p class="study-shortcuts">Choose A–D or 1–4' + (done ? '' : ' · Enter a selection to continue') + '</p>' +
    '</section>';
  };

  views.results = function () {
    var R = V;
    var durationMs = (R.finishedAt || Date.now()) - (R.startedAt || (Date.now() - 60000));
    var minutes = Math.max(1, Math.round(durationMs / 60000));
    var cardsMastered = 0;
    (R.all || R.cards || []).forEach(function (it) {
      if (isMastered(it.deckId, it.card.id)) cardsMastered++;
    });

    var feedback = MobileStudy.formatCompletionFeedback({
      kind: R.kind,
      score: R.score,
      total: R.total,
      minutes: minutes,
      cardsMastered: cardsMastered
    });
    var completionArt = '<div class="completion-landscape" aria-hidden="true">' +
      '<svg viewBox="0 0 1440 400" preserveAspectRatio="none" focusable="false">' +
        '<circle cx="720" cy="148" r="82" fill="#FFE9A7"/>' +
        '<path d="M0 216c177-66 337-48 510 7s355 65 535-6 278-91 395-41v139H0z" fill="#D83B50"/>' +
        '<path d="M0 302c198-55 374-26 562 26s372 45 548-1 250-66 330-42v115H0z" fill="#3928B9"/>' +
        '</svg>' +
      '</div>';

    if (R.kind === 'exam') {
      var examPct = feedback.pct;
      var examRows = R.review.map(function (entry, index) {
        var card = entry.item.card;
        var selected = entry.selected ? '<p class="answer-review-line selected-answer"><span class="answer-label">Your answer</span><span class="answer-copy"><b>' + entry.selected + '</b> ' + esc(card.options[LET.indexOf(entry.selected)]) + '</span></p>' : '<p class="answer-review-line unanswered"><span class="answer-label">Your answer</span><span class="answer-copy">Unanswered</span></p>';
        var status = entry.ok ? 'Correct' : (entry.selected ? 'Incorrect' : 'Not answered');
        return '<li class="exam-review-item ' + (entry.ok ? 'review-correct' : 'review-missed') + '">' +
          '<div class="review-item-head">' +
            '<h3>Question ' + (index + 1) + ': ' + esc(card.question) + '</h3>' +
            '<span class="review-status ' + (entry.ok ? 'is-correct' : 'is-incorrect') + '">' + status + '</span>' +
          '</div>' +
          selected +
          '<p class="answer-review-line correct-answer"><span class="answer-label">Correct answer</span><span class="answer-copy"><b>' + card.answer + '</b> ' + esc(card.options[LET.indexOf(card.answer)]) + '</span></p>' +
          (card.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(card.explanation) + '</p>' : '') +
          (card.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(card.ref) + '</p>' : '') +
          bibleNote(card) +
        '</li>';
      }).join('');

      return '<section class="study-shell results-shell exam-results coaching-completion-screen" aria-label="Exam results">' +
        '<header class="top results-header">' +
          '<button class="study-close-btn" data-act="home" aria-label="Return home">' +
            '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '<h1>' + esc(feedback.title) + '</h1>' +
          '<span class="meta">' + examPct + '%</span>' +
        '</header>' +
        '<div class="coaching-completion-hero">' +
          '<div class="completion-hero-card">' +
            completionArt +
            '<div class="completion-score-badge">' + examPct + '%</div>' +
            '<h2 class="completion-hero-title">' + esc(feedback.title) + '</h2>' +
            '<h2 class="completion-desktop-title">Well done!</h2>' +
            '<p class="completion-hero-message"><span class="completion-desktop-copy">Every session counts. See you tomorrow.</span><span class="completion-mobile-copy">' + esc(feedback.message) + '</span>' + (R.expired ? ' <span class="expired-tag">(Time expired)</span>' : '') + '</p>' +
            '<div class="completion-stats-row">' +
              '<div class="stat-pill"><b>' + R.score + ' / ' + R.total + '</b><span>Score</span></div>' +
              '<div class="stat-pill"><b>' + minutes + '</b><span>Minutes</span></div>' +
              '<div class="stat-pill"><b>' + cardsMastered + '</b><span>Mastered</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<section class="exam-review" aria-labelledby="exam-review-title">' +
          '<div class="review-heading">' +
            '<div><p class="eyebrow">Learn from the attempt</p><h2 id="exam-review-title">Answer review</h2></div>' +
            '<span class="meta">' + plural(R.review.length, 'question') + '</span>' +
          '</div>' +
          '<ol>' + examRows + '</ol>' +
        '</section>' +
        '<div class="completion-actions-bar">' +
          '<button class="btn primary full btn-continue" data-act="home">Continue</button>' +
        '</div>' +
      '</section>';
    }

    var miss = R.kind === 'quiz' ? R.missed : R.learning;
    return '<section class="study-shell results-shell coaching-completion-screen" aria-label="' + (R.kind === 'quiz' ? 'Quiz results' : 'Flashcard session results') + '">' +
      '<header class="top results-header">' +
        '<button class="study-close-btn" data-act="results-continue" aria-label="Return home">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<h1>' + esc(feedback.title) + '</h1>' +
        '<span class="meta">' + (R.kind === 'quiz' ? feedback.pct + '%' : R.known + ' known') + '</span>' +
      '</header>' +
      '<div class="coaching-completion-hero">' +
        '<div class="completion-hero-card">' +
          completionArt +
          '<div class="completion-score-badge">' + (R.kind === 'quiz' ? feedback.pct + '%' : '✓') + '</div>' +
          '<h2 class="completion-hero-title">' + esc(feedback.title) + '</h2>' +
          '<h2 class="completion-desktop-title">Well done!</h2>' +
          '<p class="completion-hero-message"><span class="completion-desktop-copy">Every session counts. See you tomorrow.</span><span class="completion-mobile-copy">' + esc(feedback.message) + '</span></p>' +
          '<div class="completion-stats-row">' +
            (R.kind === 'quiz' ? '<div class="stat-pill"><b>' + R.score + ' / ' + R.total + '</b><span>Score</span></div>' : '<div class="stat-pill"><b>' + R.known + '</b><span>Known</span></div>') +
            '<div class="stat-pill"><b>' + minutes + '</b><span>Minutes</span></div>' +
            '<div class="stat-pill"><b>' + cardsMastered + '</b><span>Mastered</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="result-actions completion-actions-bar">' +
        (miss.length ? '<button class="btn primary full" data-act="review">Review ' + plural(miss.length, R.kind === 'quiz' ? 'missed card' : 'card') + '</button>' : '<p class="note result-note">' + (R.kind === 'quiz' ? 'No missed cards. Outstanding work!' : 'Nothing left marked as still learning.') + '</p>') +
        '<button class="btn full" data-act="again">' + (R.kind === 'quiz' ? 'Retake quiz' : 'Study again') + '</button>' +
        '<button class="btn full ghost btn-continue" data-act="results-continue">Continue</button>' +
      '</div>' +
    '</section>';
  };

  views.devotional = function () {
    var dev = DEVOTIONALS.filter(function (d) { return d.id === V.id; })[0];
    if (!dev) return '<div class="empty"><h2>Devotional not found</h2><button class="btn primary sm" data-act="close-devotional">Back to Home</button></div>';
    var isRead = !!(S.devotions && S.devotions.read && S.devotions.read[dev.id]);
    var isSaved = !!(S.devotions && S.devotions.saved && S.devotions.saved[dev.id]);
    var expanded = !!V.expanded;
    var gradClass = dev.gradient || 'deck-grad-1';
    var bodyParagraphs = dev.body || [];
    var visibleParagraphs = expanded ? bodyParagraphs : bodyParagraphs.slice(0, 1);
    var moreDevotionals = MobileStudy.filterDevotionals(DEVOTIONALS, S.settings.showDraftDevotionals)
      .filter(function (item) { return item.id !== dev.id; })
      .slice(0, 3);

    var shareIcon = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
    var bookmarkIcon = isSaved
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

    return '<article class="devotional-view-shell" aria-labelledby="devotional-title">' +
      '<header class="devotional-header ' + gradClass + '">' +
        '<div class="devotional-nav-row">' +
          '<button class="devotional-back-btn" data-act="close-devotional" aria-label="Go back to Home"><span class="devotional-back-mobile">‹ Home</span><span class="devotional-back-desktop" aria-hidden="true">←</span></button>' +
        '</div>' +
        '<svg class="devotional-banner-art" viewBox="0 0 1200 250" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
          '<circle cx="900" cy="76" r="46" fill="#F5D17B"/>' +
          '<path d="M0 158c160-42 300-36 458 8 166 47 314 51 450-8s206-75 292-42v134H0z" fill="#4A2AB9"/>' +
          '<path d="M0 198c174-48 304-26 463 14 186 47 341 42 493-7 111-36 178-43 244-22v67H0z" fill="#302078"/>' +
        '</svg>' +
      '</header>' +
      '<div class="devotional-reader-layout">' +
        '<div class="devotional-content-body">' +
          '<header class="devotional-reader-heading">' +
            '<h1 id="devotional-title" class="devotional-title">' + esc(dev.title) + '</h1>' +
            '<p class="devotional-sub">' + esc(dev.subtitle) + '</p>' +
            '<span class="devotional-reader-meta">' + esc(dev.scripture) + ' · ' + dev.readMinutes + ' min read</span>' +
          '</header>' +
          '<section class="devotional-reading-card" aria-label="Devotional reading">' +
            (dev.scriptureText ? '<blockquote class="devotional-scripture-quote" id="devotional-scripture"><a class="devotional-scripture-link" href="#devotional-scripture-text">' + esc(dev.scripture) + '</a><p id="devotional-scripture-text">' + esc(dev.scriptureText) + '</p></blockquote>' : '') +
            '<div class="devotional-paragraphs">' +
              visibleParagraphs.map(function (p) { return '<p class="devotional-p">' + esc(p) + '</p>'; }).join('') +
            '</div>' +
            (bodyParagraphs.length > 1 ? '<button class="devotional-more-btn" data-act="toggle-devotion-expand" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + (expanded ? 'Less ↑' : 'Read more ↓') + '</button>' : '') +
          '</section>' +
          '<div class="devotional-callout reflection-box">' +
            '<div class="callout-head"><span class="callout-icon" aria-hidden="true">💭</span><h2 class="callout-title">Reflection</h2></div>' +
            '<p class="callout-text">' + esc(dev.reflection) + '</p>' +
          '</div>' +
          '<div class="devotional-callout step-box">' +
            '<div class="callout-head"><span class="callout-icon" aria-hidden="true">👣</span><h2 class="callout-title">Today’s Step</h2></div>' +
            '<p class="callout-text">' + esc(dev.step) + '</p>' +
            (isRead
              ? '<button class="btn primary full btn-continue desktop-step-action" data-act="devotion-study-lesson" data-id="' + dev.lessonId + '">Study this lesson →</button>'
              : '<button class="btn primary full btn-continue desktop-step-action" data-act="devotion-mark-read" data-id="' + dev.id + '">Done! What’s next?</button>') +
          '</div>' +
          '<div class="devotional-footer-bar">' +
            (isRead
              ? '<button class="btn primary full btn-continue" data-act="devotion-study-lesson" data-id="' + dev.lessonId + '">Study this lesson →</button>'
              : '<button class="btn primary full btn-continue" data-act="devotion-mark-read" data-id="' + dev.id + '">Mark as read ✓</button>') +
          '</div>' +
        '</div>' +
        '<aside class="devotional-reader-rail" aria-label="Devotional actions and more">' +
          '<div class="devotional-rail-actions">' +
            '<button class="devotional-rail-action" data-act="devotion-share" data-id="' + dev.id + '">' + shareIcon + '<span>Share</span></button>' +
            '<button class="devotional-rail-action' + (isSaved ? ' active' : '') + '" data-act="devotion-toggle-save" data-id="' + dev.id + '">' + bookmarkIcon + '<span>' + (isSaved ? 'Saved' : 'Save') + '</span></button>' +
          '</div>' +
          (isRead
            ? '<button class="btn primary full devotional-mark-read" data-act="devotion-study-lesson" data-id="' + dev.lessonId + '">Study this lesson</button>'
            : '<button class="btn primary full devotional-mark-read" data-act="devotion-mark-read" data-id="' + dev.id + '">Mark as read</button>') +
          '<section class="devotional-more-card" aria-labelledby="more-devotionals-title">' +
            '<h2 id="more-devotionals-title">More devotionals</h2>' +
            (moreDevotionals.length
              ? '<div class="devotional-more-list">' + moreDevotionals.map(function (item) {
                  return '<button class="devotional-more-item ' + esc(item.gradient || 'deck-grad-1') + '" data-act="open-devotional" data-id="' + esc(item.id) + '">' +
                    '<span>' + esc(item.title) + '</span><span class="devotional-more-readtime">' + esc(item.readMinutes) + ' min</span>' +
                  '</button>';
                }).join('') + '</div>'
              : '<p class="devotional-more-empty">More stories will be available here.</p>') +
            '<button class="devotional-view-all" data-act="nav-tab" data-tab="home">View all devotionals</button>' +
          '</section>' +
      '</aside>' +
      '</div>' +
    '</article>';
  };

  views.picker = function () {
    var mode = V.mode === 'quiz' ? 'quiz' : 'flash';
    var isQuiz = mode === 'quiz';
    var modeTitle = isQuiz ? 'Quiz' : 'Flashcards';
    var multi = V.pickerMulti === true;
    var mixed = V.pickerMixed === true;
    var formattedDecks = MobileStudy.formatPickerDecks(S.decks, function (deckId, cardId) {
      return isMastered(deckId, cardId);
    });

    var totalCards = formattedDecks.reduce(function (sum, d) { return sum + d.totalCards; }, 0);
    var totalMastered = formattedDecks.reduce(function (sum, d) { return sum + d.masteredCount; }, 0);
    var overallPct = totalCards ? Math.round(100 * totalMastered / totalCards) : 0;

    var tilesHtml = formattedDecks.map(function (d) {
      var selected = SEL.has(d.id);
      return '<button class="picker-tile picker-selectable ' + d.gradientClass + (selected ? ' is-selected' : '') + '" data-act="picker-cover" data-id="' + d.id + '" aria-pressed="' + selected + '" aria-label="Lesson ' + d.sectionNum + ', ' + esc(d.topic) + ', ' + d.totalCards + ' cards, ' + d.pct + '% mastered">' +
        '<div class="picker-tile-top">' +
          '<span class="picker-tile-badge">' + d.sectionNum + '/12</span>' +
        '</div>' +
        '<h3 class="picker-tile-title">Lesson ' + d.sectionNum + ' · ' + esc(d.topic) + '</h3>' +
        '<div class="picker-tile-bottom">' +
          '<span class="picker-tile-count">' + d.totalCards + ' cards</span>' +
          '<span class="picker-tile-pct">' + d.pct + '%</span>' +
        '</div>' +
        '<div class="picker-tile-bar" aria-hidden="true"><i style="width:' + d.pct + '%"></i></div>' +
      '</button>';
    }).join('');

    var allSelected = S.decks.length > 0 && S.decks.every(function (d) { return SEL.has(d.id); });
    var allTile = '<button class="picker-tile picker-tile-all hero-gradient-sunrise picker-selectable' + (allSelected ? ' is-selected' : '') + '" data-act="picker-cover" data-id="__all__" aria-pressed="' + allSelected + '" aria-label="All Lessons, ' + totalCards + ' cards, ' + overallPct + '% mastered">' +
      '<div class="picker-tile-top">' +
        '<span class="picker-tile-badge">All 12</span>' +
      '</div>' +
      '<h3 class="picker-tile-title">All Lessons</h3>' +
      '<div class="picker-tile-bottom">' +
        '<span class="picker-tile-count">' + totalCards + ' cards</span>' +
        '<span class="picker-tile-pct">' + overallPct + '%</span>' +
      '</div>' +
      '<div class="picker-tile-bar" aria-hidden="true"><i style="width:' + overallPct + '%"></i></div>' +
    '</button>';

    return '<div class="picker-view-shell" role="region" aria-label="' + esc(modeTitle) + '">' +
      '<header class="picker-header">' +
        '<button class="picker-close-btn" data-act="close-picker" aria-label="Close lesson picker">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="picker-title-wrap">' +
          '<h1>' + esc(modeTitle) + '</h1>' +
        '</div>' +
      '</header>' +
      '<div class="picker-body">' +
        '<div class="picker-grid">' +
          allTile +
          '<button class="picker-tile picker-tile-mixed picker-selectable' + (mixed ? ' is-selected' : '') + '" data-act="picker-cover" data-id="__mixed__" aria-pressed="' + mixed + '"><span class="picker-tile-top"><span class="picker-tile-badge">REVIEW</span></span><h3 class="picker-tile-title">Mixed review</h3><div class="picker-tile-bottom"><span class="picker-tile-count">Due + weak spots</span></div></button>' +
          tilesHtml +
        '</div>' +
      '</div>' +
      '<footer class="picker-selection-footer' + (multi ? ' is-visible' : '') + '">' +
        '<div class="picker-footer-controls"><button type="button" class="picker-multi-toggle' + (multi ? ' is-on' : '') + '" data-act="picker-multi" aria-pressed="' + multi + '"><span>Select several</span><i aria-hidden="true"></i></button></div>' +
        (multi ? '<button type="button" class="btn primary picker-start-button" data-act="picker-start" data-mode="' + mode + '"' + (SEL.size || mixed ? '' : ' disabled aria-disabled="true"') + '>' + (mixed ? 'Start mixed review' : 'Start' + (SEL.size ? ' · ' + SEL.size + ' ' + (SEL.size === 1 ? 'lesson' : 'lessons') : '')) + '</button>' : '') +
      '</footer>' +
    '</div>';
  };

  function shareDevotional(dev) {
    var text = dev.title + ' — ' + dev.subtitle + '\n\n"' + (dev.scriptureText || dev.scripture) + '"\n\nRead more in the CCI Discipleship App.';
    if (window.CciNative && window.CciNative.isNative) {
      window.CciNative.shareFile(slug(dev.title) + '.txt', text).catch(function () { toast('Could not share.'); });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: dev.title, text: text }).catch(function () {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied article summary to clipboard.'); }).catch(function () { toast('Sharing not available.'); });
      return;
    }
    toast('Sharing not available on this device.');
  }

  views.streak = function () {
    var now = Date.now();
    var streak = MobileStudy.calculateStreak(getStudyTimestamps(), now);
    if (streak < 1) streak = 1;

    var title = streak === 1 ? "You're showing up!" : (streak + ' Days in a Row!');
    var subtitle = streak === 1
      ? "Day 1 of your study habit. Small, faithful steps build enduring spiritual depth."
      : (streak + ' consecutive days of study. Steady growth in faith and understanding.');

    var dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    var todayDay = 0;
    if (typeof Date === 'function') {
      try {
        var today = new Date(now);
        todayDay = (today.getDay() + 6) % 7;
      } catch (e) {}
    } else {
      var daysSinceEpoch = Math.floor(now / 86400000);
      todayDay = (daysSinceEpoch + 3) % 7;
    }
    var weekDots = dayNames.map(function (dName, idx) {
      var isCurrent = idx === todayDay;
      var isPast = idx < todayDay;
      var isStudied = isCurrent || (isPast && (todayDay - idx < streak));
      var cls = 'streak-day-dot';
      if (isCurrent) cls += ' current';
      if (isStudied) cls += ' done';
      return '<div class="' + cls + '"><span class="streak-day-name">' + dName + '</span><span class="streak-day-mark">' + (isStudied ? '✓' : '·') + '</span></div>';
    }).join('');

    return '<div class="streak-screen-container" role="main" aria-labelledby="streak-title">' +
      '<div class="streak-hero-card">' +
        '<div class="streak-flame-hero" aria-hidden="true">' +
          '<div class="streak-flame-circle"><span class="flame-emoji">🔥</span></div>' +
        '</div>' +
        '<div class="streak-number">' + streak + '</div>' +
        '<h1 id="streak-title" class="streak-title">' + esc(title) + '</h1>' +
        '<p class="streak-subtitle">' + esc(subtitle) + '</p>' +
        '<div class="streak-week-row" aria-label="Study days this week">' + weekDots + '</div>' +
      '</div>' +
      '<div class="streak-gentle-card">' +
        '<div class="streak-gentle-title">Daily Grace</div>' +
        '<p class="streak-gentle-text">No guilt, no pressure. If life gets busy, your progress and learning will be right here waiting for you.</p>' +
      '</div>' +
      '<div class="streak-bottom-bar">' +
        '<button class="btn primary full btn-continue" data-act="close-streak">Continue</button>' +
        '<div class="streak-opt-out-hint">Streaks are optional · Toggle in Settings anytime</div>' +
      '</div>' +
    '</div>';
  };

  views.onboarding = function () {
    var step = Number.isInteger(V.step) ? V.step : 0;
    var answers = V.answers || (V.answers = Object.assign({}, MobileStudy.defaultOnboarding(false)));

    if (step === 0) {
      return '<div class="onboarding-screen splash-screen" role="main">' +
        '<div class="onboarding-hero-art" aria-hidden="true">' +
          '<div class="splash-icon-wrapper">' +
            '<svg viewBox="0 0 100 100" class="splash-svg" width="90" height="90">' +
              '<circle cx="50" cy="50" r="46" fill="url(#splash-grad)" />' +
              '<path d="M50 22v56M32 38h36" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<defs>' +
                '<linearGradient id="splash-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">' +
                  '<stop stop-color="#3B2BB0" />' +
                  '<stop offset="1" stop-color="#B5173A" />' +
                '</linearGradient>' +
              '</defs>' +
            '</svg>' +
          '</div>' +
        '</div>' +
        '<h1 class="onboarding-title">CCI Discipleship</h1>' +
        '<p class="onboarding-lead">A steady, thoughtful rhythm for spiritual growth and doctrinal mastery.</p>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Get Started</button>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip intro</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 1) {
      return '<div class="onboarding-screen welcome-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<h1 class="onboarding-title">Welcome to Your Journey</h1>' +
        '<p class="onboarding-lead">We\'ll help you build a personalized study rhythm that fits into your day without overwhelming you.</p>' +
        '<div class="onboarding-feature-list">' +
          '<div class="onboarding-feature-card">' +
            '<div class="feature-icon">⏱️</div>' +
            '<div class="feature-text"><b>Bite-Sized Sessions</b><p>5–15 minutes of structured active recall designed for busy lives.</p></div>' +
          '</div>' +
          '<div class="onboarding-feature-card">' +
            '<div class="feature-icon">🧠</div>' +
            '<div class="feature-text"><b>Smart Spaced Repetition</b><p>Systematic review reinforces core theology so it sticks.</p></div>' +
          '</div>' +
          '<div class="onboarding-feature-card">' +
            '<div class="feature-icon">📖</div>' +
            '<div class="feature-text"><b>Rooted in Scripture</b><p>All questions link directly to biblical references and study notes.</p></div>' +
          '</div>' +
        '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Personalize My Plan</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 2) {
      var goals = [
        { id: 'habit', title: 'Build a Daily Habit', desc: 'A steady, faithful rhythm of study every day', icon: '🌱' },
        { id: 'exam', title: 'Prepare for Exam', desc: 'Master all 12 modules and ace discipleship exams', icon: '🎓' },
        { id: 'theology', title: 'Deepen Core Theology', desc: 'Grasp salvation, Christology, and sound doctrine', icon: '🏛️' },
        { id: 'review', title: 'Brush Up & Review', desc: 'Target weak spots and review key doctrinal concepts', icon: '🎯' }
      ];
      var goalCards = goals.map(function (g) {
        var sel = answers.goal === g.id;
        return '<button class="onboarding-choice-card' + (sel ? ' selected' : '') + '" data-act="onboarding-pick" data-key="goal" data-val="' + g.id + '" aria-pressed="' + sel + '">' +
          '<div class="choice-icon" aria-hidden="true">' + g.icon + '</div>' +
          '<div class="choice-body">' +
            '<div class="choice-title">' + esc(g.title) + '</div>' +
            '<div class="choice-desc">' + esc(g.desc) + '</div>' +
          '</div>' +
          '<div class="choice-indicator">' + (sel ? '✓' : '') + '</div>' +
        '</button>';
      }).join('');

      return '<div class="onboarding-screen question-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<span class="onboarding-step-counter">1 of 4</span>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<div class="onboarding-progress-bar"><div class="onboarding-progress-fill" style="width:25%"></div></div>' +
        '<h1 class="onboarding-title">What is your primary study goal?</h1>' +
        '<p class="onboarding-lead">Choose the focus that matters most to you right now.</p>' +
        '<div class="onboarding-choices-list">' + goalCards + '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Continue</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 3) {
      var minutesOptions = [
        { mins: 5, title: '5 minutes / day', desc: 'Quick & focused: 5 cards per session', icon: '⚡' },
        { mins: 10, title: '10 minutes / day (Recommended)', desc: 'Balanced & steady: 10 cards per session', icon: '⭐' },
        { mins: 15, title: '15 minutes / day', desc: 'Deep dive: 15 cards per session', icon: '🌊' },
        { mins: 20, title: '20 minutes / day', desc: 'Intensive study: 20 cards per session', icon: '🔥' }
      ];
      var minCards = minutesOptions.map(function (m) {
        var sel = answers.dailyMinutes === m.mins;
        return '<button class="onboarding-choice-card' + (sel ? ' selected' : '') + '" data-act="onboarding-pick" data-key="dailyMinutes" data-val="' + m.mins + '" aria-pressed="' + sel + '">' +
          '<div class="choice-icon" aria-hidden="true">' + m.icon + '</div>' +
          '<div class="choice-body">' +
            '<div class="choice-title">' + esc(m.title) + '</div>' +
            '<div class="choice-desc">' + esc(m.desc) + '</div>' +
          '</div>' +
          '<div class="choice-indicator">' + (sel ? '✓' : '') + '</div>' +
        '</button>';
      }).join('');

      return '<div class="onboarding-screen question-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<span class="onboarding-step-counter">2 of 4</span>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<div class="onboarding-progress-bar"><div class="onboarding-progress-fill" style="width:50%"></div></div>' +
        '<h1 class="onboarding-title">How much time can you commit daily?</h1>' +
        '<p class="onboarding-lead">This sets your daily study plan length. Consistency beats intensity.</p>' +
        '<div class="onboarding-choices-list">' + minCards + '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Continue</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 4) {
      var topics = [
        { id: 'soteriology', title: 'Soteriology & Salvation', desc: 'Sections 1 & 2 · Grace, faith, and eternal redemption', icon: '✝️' },
        { id: 'christology', title: 'Christology & Trinity', desc: 'Sections 3 & 4 · Deity of Christ and the Godhead', icon: '👑' },
        { id: 'conduct', title: 'Christian Conduct & Prayer', desc: 'Sections 5 & 6 · Daily holy living and spiritual communion', icon: '🙏' },
        { id: 'bible', title: 'Bible Foundations & Church History', desc: 'Sections 7, 8 & 12 · Scripture roots and heritage', icon: '📜' }
      ];
      var topicCards = topics.map(function (t) {
        var sel = answers.startingTopic === t.id;
        return '<button class="onboarding-choice-card' + (sel ? ' selected' : '') + '" data-act="onboarding-pick" data-key="startingTopic" data-val="' + t.id + '" aria-pressed="' + sel + '">' +
          '<div class="choice-icon" aria-hidden="true">' + t.icon + '</div>' +
          '<div class="choice-body">' +
            '<div class="choice-title">' + esc(t.title) + '</div>' +
            '<div class="choice-desc">' + esc(t.desc) + '</div>' +
          '</div>' +
          '<div class="choice-indicator">' + (sel ? '✓' : '') + '</div>' +
        '</button>';
      }).join('');

      return '<div class="onboarding-screen question-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<span class="onboarding-step-counter">3 of 4</span>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<div class="onboarding-progress-bar"><div class="onboarding-progress-fill" style="width:75%"></div></div>' +
        '<h1 class="onboarding-title">Which topic would you like to start with?</h1>' +
        '<p class="onboarding-lead">You will explore all 12 modules on your journey.</p>' +
        '<div class="onboarding-choices-list">' + topicCards + '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Continue</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 5) {
      var times = [
        { id: 'morning', title: 'Morning Sunrise', desc: 'Start the day grounded in scripture', icon: '🌅' },
        { id: 'midday', title: 'Midday Break', desc: 'A quiet pause and reflection in the afternoon', icon: '☀️' },
        { id: 'evening', title: 'Evening Quiet', desc: 'Wind down and reflect before sleep', icon: '🌙' },
        { id: 'anytime', title: 'Flexible / Anytime', desc: 'Whenever a quiet window opens during the day', icon: '🧭' }
      ];
      var timeCards = times.map(function (ti) {
        var sel = answers.preferredTime === ti.id;
        return '<button class="onboarding-choice-card' + (sel ? ' selected' : '') + '" data-act="onboarding-pick" data-key="preferredTime" data-val="' + ti.id + '" aria-pressed="' + sel + '">' +
          '<div class="choice-icon" aria-hidden="true">' + ti.icon + '</div>' +
          '<div class="choice-body">' +
            '<div class="choice-title">' + esc(ti.title) + '</div>' +
            '<div class="choice-desc">' + esc(ti.desc) + '</div>' +
          '</div>' +
          '<div class="choice-indicator">' + (sel ? '✓' : '') + '</div>' +
        '</button>';
      }).join('');

      return '<div class="onboarding-screen question-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<span class="onboarding-step-counter">4 of 4</span>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<div class="onboarding-progress-bar"><div class="onboarding-progress-fill" style="width:100%"></div></div>' +
        '<h1 class="onboarding-title">When do you prefer to study?</h1>' +
        '<p class="onboarding-lead">Choose a rhythm that fits naturally into your routine.</p>' +
        '<div class="onboarding-choices-list">' + timeCards + '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">See My Plan</button>' +
        '</div>' +
      '</div>';
    }

    if (step === 6) {
      var goalLabels = { habit: 'Build a Daily Habit', exam: 'Exam Preparation', theology: 'Core Theology', review: 'Weak-Spot Review' };
      var topicLabels = { soteriology: 'Soteriology & Salvation', christology: 'Christology & Trinity', conduct: 'Conduct & Prayer', bible: 'Bible Foundations' };
      var timeLabels = { morning: 'Morning Sunrise', midday: 'Midday Break', evening: 'Evening Quiet', anytime: 'Flexible Anytime' };

      return '<div class="onboarding-screen summary-screen" role="main">' +
        '<div class="onboarding-top-nav">' +
          '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
          '<button class="btn-text-skip" data-act="onboarding-skip">Skip</button>' +
        '</div>' +
        '<div class="plan-summary-hero-card">' +
          '<div class="summary-badge">Custom Plan</div>' +
          '<h1 class="summary-hero-title">Your Study Plan</h1>' +
          '<p class="summary-hero-sub">Tailored to help you grow steadily in grace and knowledge.</p>' +
          '<div class="summary-pills-grid">' +
            '<div class="summary-pill"><span class="pill-k">🎯 Goal</span><span class="pill-v">' + esc(goalLabels[answers.goal] || 'Daily Habit') + '</span></div>' +
            '<div class="summary-pill"><span class="pill-k">⏱️ Daily Pace</span><span class="pill-v">' + answers.dailyMinutes + ' min (' + answers.dailyMinutes + ' cards)</span></div>' +
            '<div class="summary-pill"><span class="pill-k">📖 Starting Topic</span><span class="pill-v">' + esc(topicLabels[answers.startingTopic] || 'Soteriology') + '</span></div>' +
            '<div class="summary-pill"><span class="pill-k">☀️ Preferred Time</span><span class="pill-v">' + esc(timeLabels[answers.preferredTime] || 'Flexible') + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="summary-coaching-card">' +
          '<div class="summary-coaching-icon">🌱</div>' +
          '<p class="summary-coaching-text">Small, faithful daily habits bear fruit for a lifetime. Your daily review cards are ready when you are.</p>' +
        '</div>' +
        '<div class="onboarding-bottom-bar">' +
          '<button class="btn primary full btn-continue" data-act="onboarding-next">Continue</button>' +
        '</div>' +
      '</div>';
    }

    return '<div class="onboarding-screen commit-screen" role="main">' +
      '<div class="onboarding-top-nav">' +
        '<button class="btn-back-step" data-act="onboarding-back" aria-label="Go back">‹</button>' +
        '<button class="btn-text-skip" data-act="commit-finish">Skip to Home</button>' +
      '</div>' +
      '<h1 class="onboarding-title">Make a Promise to Yourself</h1>' +
      '<p class="onboarding-lead">Discipleship is an act of devotion. Take a moment to commit to showing up for your spiritual growth.</p>' +
      '<div class="commit-hold-wrapper">' +
        '<button class="commit-hold-btn" data-act="commit-hold" aria-label="Press and hold to commit to your daily study rhythm">' +
          '<div class="commit-hold-ring">' +
            '<svg viewBox="0 0 120 120" class="commit-ring-svg">' +
              '<circle cx="60" cy="60" r="52" class="ring-bg"/>' +
              '<circle cx="60" cy="60" r="52" class="ring-fill"/>' +
            '</svg>' +
            '<div class="commit-center-icon"><span class="commit-emoji">🤝</span></div>' +
          '</div>' +
          '<span class="commit-btn-label">Press &amp; Hold to Commit</span>' +
          '<span class="commit-btn-hint">(or tap once to commit)</span>' +
        '</button>' +
      '</div>' +
      '<div class="onboarding-bottom-bar">' +
        '<button class="btn primary full btn-continue" data-act="commit-finish">I Commit · Start Studying</button>' +
      '</div>' +
    '</div>';
  };

  views.edit = function () {
    var d = deck(V.id); if (!d) return '';
    var f = V.filter.toLowerCase();
    var rows = d.cards.map(function (c, i) {
      if (V.editing === i) return '<li class="erow">' + form(c, i) + '</li>';
      return '<li class="crow" data-text="' + esc((c.question + ' ' + c.options.join(' ')).toLowerCase()) + '"' + (f && (c.question + ' ' + c.options.join(' ')).toLowerCase().indexOf(f) < 0 ? ' hidden' : '') + '><span class="n">' + (i + 1) + '</span><span class="qt">' + esc(c.question) + '<small>Answer ' + c.answer + '</small></span><span class="row"><button class="btn sm" data-act="cedit" data-i="' + i + '">Edit</button><button class="btn sm ghost" data-act="cdel" data-i="' + i + '" aria-label="Delete card ' + (i + 1) + '">Delete</button></span></li>';
    }).join('');
    return '<header class="top"><button class="btn sm ghost" data-act="home">‹ Decks</button><div class="row"><button class="btn sm" data-act="export">Export .txt</button><button class="btn sm danger" data-act="ddel">Delete deck</button></div></header>' +
      '<label class="field"><span>Deck name</span><input id="dname" value="' + esc(d.title) + '" data-rename></label>' +
      '<div class="row spread"><input class="search" id="filter" placeholder="Search ' + plural(d.cards.length, 'card') + '" value="' + esc(V.filter) + '"><button class="btn primary sm" data-act="cnew">Add card</button></div>' +
      '<ul class="clist">' + (V.editing === 'new' ? '<li class="erow">' + form({ question: '', options: ['', '', '', ''], answer: '' }, 'new') + '</li>' : '') + rows + '</ul>';
  };
  function form(c, i) {
    return '<form data-form="' + i + '"><label class="field"><span>Question</span><textarea name="q" rows="3">' + esc(c.question) + '</textarea></label>' +
      c.options.map(function (o, k) { return '<div class="orow"><label class="radio"><input type="radio" name="ans" value="' + LET[k] + '"' + (c.answer === LET[k] ? ' checked' : '') + '><b>' + LET[k] + '</b></label><input name="o' + k + '" value="' + esc(o) + '" aria-label="Option ' + LET[k] + '"></div>'; }).join('') +
      '<label class="field"><span>Explanation (optional)</span><textarea name="explanation" rows="3">' + esc(c.explanation || '') + '</textarea></label>' +
      '<label class="field"><span>Reference (optional)</span><input name="ref" value="' + esc(c.ref || '') + '" placeholder="Lesson, slide, or Scripture"></label>' +
      '<label class="field"><span>Bible references (optional)</span><input name="bible" value="' + esc(c.bible || '') + '" placeholder="e.g. John 3:16; Romans 5:12"></label>' +
      '<p class="hintline">Select the radio button next to the correct answer.</p><p class="err" id="ferr"></p><div class="row end"><button class="btn" data-act="ccancel">Cancel</button><button class="btn primary" data-act="csave">Save card</button></div></form>';
  }

  views.import = function () {
    var out = '';
    if (IMP.backup) {
      var backupCards = IMP.backup.decks.reduce(function (n, d) { return n + d.cards.length; }, 0);
      out = '<section class="preview"><h2>Backup ready to restore</h2><p class="note">' + plural(IMP.backup.decks.length, 'deck') + ' · ' + plural(backupCards, 'card') + ' · Study progress and preferences included.</p><div class="note warn">Restoring replaces the decks, progress, and preferences currently saved in this browser.</div><button class="btn primary full" data-act="restore">Review and restore backup</button></section>';
    } else if (IMP.parsed) {
      var ok = IMP.decks.filter(function (d) { return d.questions.length; }), total = ok.reduce(function (n, d) { return n + d.questions.length; }, 0);
      out = '<section class="preview"><h2>' + (ok.length ? plural(ok.length, 'deck') + ', ' + plural(total, 'question') + ' found' : 'No readable questions found') + '</h2>' +
        ok.map(function (d) { return '<p class="prow"><span>' + esc(MobileStudy.parseChapterTitle(d.title).topic || d.title) + '</span><b>' + d.questions.length + '</b></p>'; }).join('') +
        (IMP.errors.length ? '<div class="note warn"><b>' + plural(IMP.errors.length, 'problem') + ' (those questions are skipped)</b><ul>' + IMP.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul></div>' : '') +
        (IMP.warnings.length ? '<div class="note"><ul>' + IMP.warnings.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul></div>' : '') +
        (ok.length ? '<button class="btn primary full" data-act="isave">Save ' + plural(ok.length, 'deck') + (IMP.errors.length ? ' without the skipped questions' : '') + '</button>' : '') + '</section>';
    }
    return '<header class="top"><button class="btn sm ghost" data-act="home">‹ Decks</button><h1>Add deck</h1></header>' +
      '<label class="drop"><input type="file" id="files" accept=".txt,.json,text/plain,application/json" multiple><span>Choose .txt deck files or one .json backup file</span></label>' +
      '<label class="field"><span>Or paste deck text</span><textarea id="paste" rows="8" placeholder="DECK: My deck&#10;&#10;Q1. Question text&#10;A. First option&#10;B. Second option&#10;C. Third option&#10;D. Fourth option&#10;ANSWER: C">' + esc(IMP.text) + '</textarea></label>' +
      '<button class="btn full" data-act="iparse">Preview pasted text</button>' + out;
  };

  function head(t, right) { return '<header class="top"><button class="btn sm ghost" data-act="home">‹ Exit</button><h1>' + t + '</h1><span class="meta">' + right + '</span></header>'; }
  
  function triggerHaptic(type) {
    try {
      if (window.navigator && typeof window.navigator.vibrate === 'function') {
        if (type === 'correct') window.navigator.vibrate([30]);
        else if (type === 'wrong') window.navigator.vibrate([40, 60, 40]);
        else window.navigator.vibrate(20);
      }
    } catch (e) {}
  }

  function sessionHead(t, right, isExam) {
    return '<header class="top study-header coaching-study-header">' +
      '<button class="study-close-btn" data-act="pause-session" aria-label="Close study session">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +
      '<div class="study-heading">' +
        '<span class="eyebrow">CCI · DISCIPLESHIP</span>' +
        '<h1>' + esc(t) + '</h1>' +
      '</div>' +
      '<div class="session-status' + (isExam ? ' is-timer' : '') + '">' + right + '</div>' +
    '</header>';
  }
  function progressBar(n, t) { var pct = t ? Math.max(0, Math.min(100, Math.round(100 * n / t))) : 0; return '<div class="pbar study-progress" role="progressbar" aria-label="Study session progress" aria-valuemin="0" aria-valuemax="' + t + '" aria-valuenow="' + n + '" aria-valuetext="' + n + ' of ' + t + '"><i style="width:' + pct + '%"></i></div>'; }
  function formatClock(milliseconds) { var seconds = Math.max(0, Math.ceil(milliseconds / 1000)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }

  function openRocketMenu() {
    rocketMenuOpen = true;
    render(true);
    var firstPill = app.querySelector('.rocket-pills button');
    if (firstPill) firstPill.focus();
  }

  function closeRocketMenu() {
    if (!rocketMenuOpen) return;
    rocketMenuOpen = false;
    render(true);
    var fab = app.querySelector('#rocket-fab-btn');
    if (fab) fab.focus();
  }

  function toggleRocketMenu() {
    if (rocketMenuOpen) closeRocketMenu();
    else openRocketMenu();
  }

  function renderRocketFab() {
    var pillsHtml = '';
    var backdropHtml = '';
    if (rocketMenuOpen) {
      backdropHtml = '<div class="rocket-backdrop" data-act="close-rocket" aria-hidden="true"></div>';
      pillsHtml = '<div class="rocket-pills" role="menu" aria-label="Study menu">' +
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-flash">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="14" rx="2"/><path d="M6 3h12a2 2 0 0 1 2 2v12"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Flashcards</strong></span>' +
        '</button>' +
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-quiz">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Quiz</strong></span>' +
        '</button>' +
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-challenge">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Start a Challenge</strong><small>About 5 minutes</small></span>' +
        '</button>' +
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-exam">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="2" x2="14" y2="2"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Start Exam</strong></span>' +
        '</button>' +
      '</div>';
    }

    var iconSvg = rocketMenuOpen
      ? '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      : '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4.5c1.45-1.47 4.5-2 4.5-2"/><path d="M15 15v5s3.03-.55 4.5-2c1.47-1.45 2-4.5 2-4.5"/></svg>';

    return backdropHtml +
      '<div class="rocket-container' + (rocketMenuOpen ? ' is-open' : '') + '">' +
        pillsHtml +
        '<button id="rocket-fab-btn" class="rocket-fab-btn' + (rocketMenuOpen ? ' is-open' : '') + '" ' +
          'data-act="toggle-rocket" ' +
          'aria-label="' + (rocketMenuOpen ? 'Close study menu' : 'Study menu') + '" ' +
          'aria-expanded="' + (rocketMenuOpen ? 'true' : 'false') + '" ' +
          'aria-haspopup="menu">' +
          iconSvg +
        '</button>' +
      '</div>';
  }

  /* ---------- render ---------- */
  function render(keep) {
    var isMainTab = MAIN_TABS.indexOf(V.name) >= 0;
    var hasDesktopSidebar = isMainTab || V.name === 'devotional';
    var view = V.name === 'exam' ? views.quiz : views[V.name];
    if (typeof view !== 'function') view = views.home;
    var tabBarHtml = isMainTab ? renderTabBar(V.name) : '';
    var showRocket = V.name === 'home' || V.name === 'journey';
    var rocketHtml = showRocket ? renderRocketFab() : '';
    app.innerHTML = banner() +
      '<div class="desktop-shell' + (hasDesktopSidebar ? '' : ' desktop-shell-full') + (V.name === 'home' ? ' desktop-shell-home' : '') + '">' +
        (hasDesktopSidebar ? renderDesktopSidebar(V.name === 'devotional' ? 'home' : V.name) : '') +
        '<main class="desktop-main">' + view() + tabBarHtml + rocketHtml + '</main>' +
      '</div>';
    if (!keep) window.scrollTo(0, 0);
    if (V.name === 'flash') {
      var f = app.querySelector('.flip');
      if (f) f.focus({ preventScroll: true });
    } else if (V.name === 'quiz' || V.name === 'exam') {
      var q = app.querySelector('.qtext');
      if (q) q.focus({ preventScroll: true });
    }
  }

  function go(v, replace) {
    if (V.name === 'exam' && v.name !== 'exam') stopExamTimer();
    rocketMenuOpen = false;
    var prev = V;
    V = v;
    try {
      if (window.history && window.history.pushState) {
        var stateObj = { name: V.name, id: V.id || null };
        if (replace) {
          window.history.replaceState(stateObj, '', window.location.href);
        } else if (!prev || prev.name !== V.name || prev.id !== V.id) {
          window.history.pushState(stateObj, '', window.location.href);
        }
      }
    } catch (e) {}
    render();
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', function (e) {
      if (e.state && e.state.name) {
        if (isStudySession(V.name)) {
          pauseStudySession();
        }
        rocketMenuOpen = false;
        V = { name: e.state.name, id: e.state.id };
        render();
      }
    });
  }

  /* ---------- sessions ---------- */
  function setup(mode, id) {
    var ids = id === '*' ? (SEL.size ? Array.from(SEL) : S.decks.map(function (d) { return d.id; })) : [id];
    if (!ids.length) ids = S.decks.map(function (d) { return d.id; });
    V.setup = { mode: mode, ids: ids };
    var q = mode === 'quiz';
    openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="setup-title"><h2 id="setup-title">' + (q ? 'Start quiz' : 'Start flashcards') + '</h2>' +
      (q ? '<label class="field"><span>Questions</span><select id="s-len"><option value="0">All cards</option><option value="10">10</option><option value="20">20</option><option value="30">30</option></select></label>'
         : '<label class="check"><input type="checkbox" id="s-shuf"' + (S.settings.shuffle ? ' checked' : '') + '> Shuffle cards</label>') +
      '<label class="check"><input type="checkbox" id="s-unk"> Skip cards I already know</label><div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="start">Start</button></div></div>');
  }
  function setupExam() {
    V.setup = { mode: 'exam', ids: S.decks.map(function (d) { return d.id; }) };
    var total = S.decks.reduce(function (count, d) { return count + d.cards.length; }, 0);
    openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="exam-setup-title"><h2 id="exam-setup-title">Start exam</h2>' +
      '<label class="field"><span>Question count</span><select id="exam-count"><option value="10">10</option><option value="20" selected>20</option><option value="30">30</option><option value="0">All ' + total + '</option></select></label>' +
      '<label class="field"><span>Time limit (minutes)</span><input id="exam-minutes" type="number" min="1" max="180" value="30"></label>' +
      '<p class="note">Questions are mixed across all decks. Answers and explanations appear after submission.</p>' +
      '<div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="start">Start exam</button></div></div>');
  }
  function start() {
    var s = V.setup, cards = [];
    s.ids.forEach(function (id) { var d = deck(id); if (d) d.cards.forEach(function (c) { cards.push({ deckId: id, card: c }); }); });
    var exam = s.mode === 'exam';
    var o = exam
      ? { unk: false, limit: +document.getElementById('exam-count').value, shuf: true, duration: Math.max(1, Math.min(180, +document.getElementById('exam-minutes').value || 30)) * 60 * 1000, saveBest: false }
      : { unk: document.getElementById('s-unk').checked, limit: s.mode === 'quiz' ? +document.getElementById('s-len').value : 0, shuf: s.mode === 'quiz' ? true : document.getElementById('s-shuf').checked };
    if (s.mode === 'flash') { S.settings.shuffle = o.shuf; save(); }
    var selectedCount = cards.length;
    if (o.unk) cards = cards.filter(function (x) { return !isMastered(x.deckId, x.card.id); });
    if (exam) cards = StudyLogic.examQuestions(cards, o.limit);
    if (!cards.length) { toast(selectedCount ? 'All selected cards are already marked known.' : 'There are no cards in this selection yet.'); return; }
    closeModal(); begin(s.mode, exam ? cards : (o.shuf ? shuffle(cards) : cards), o, s.ids);
  }
  function startDue() {
    var cards = StudyLogic.dueItems(allCardItems(), Date.now());
    if (!cards.length) { toast('No cards are due today.'); return; }
    begin('flash', shuffle(cards), { unk: false, limit: 0, shuf: true }, deckIdsFor(cards));
  }
  function startDailyStudy() {
    var all = allCardItems(), due = StudyLogic.dueItems(all, Date.now());
    var dailyLimit = (S.onboarding && S.onboarding.dailyMinutes) ? S.onboarding.dailyMinutes : 10;
    var cards = MobileStudy.selectDailyItems(due, all, function (item) { return isMastered(item.deckId, item.card.id); }, dailyLimit);
    if (!cards.length) { toast('All cards are mastered. Try a quiz or exam to review them.'); return; }
    begin('flash', shuffle(cards), { unk: false, limit: cards.length, shuf: true, daily: true }, deckIdsFor(cards));
  }
  function startWeakSpots() {
    var cards = StudyLogic.weakSpots(allCardItems(), 10);
    if (!cards.length) { toast('Answer some questions first to build weak-spot stats.'); return; }
    begin('quiz', shuffle(cards), { unk: false, limit: 0, shuf: true, saveBest: false }, deckIdsFor(cards));
  }
  function startChallenge(ids, requestedMode) {
    var all = allCardItems();
    if (ids && ids.length) all = all.filter(function (item) { return ids.indexOf(item.deckId) >= 0; });
    var due = StudyLogic.dueItems(all, Date.now());
    var weak = StudyLogic.weakSpots(all, 10);
    var cards = MobileStudy.selectChallengeItems(
      due,
      weak,
      all,
      function (item) { return isMastered(item.deckId, item.card.id); },
      10
    );
    if (!cards.length) { toast('No challenge questions available.'); return; }
    var mode = requestedMode === 'flash' ? 'flash' : 'quiz';
    begin(mode, shuffle(cards), { unk: false, limit: mode === 'quiz' ? 10 : 0, shuf: true, challenge: true, saveBest: false }, deckIdsFor(cards));
  }
  function begin(mode, cards, o, ids) {
    if (mode === 'quiz' || mode === 'exam') {
      cards = cards.map(function (it) { return { deckId: it.deckId, card: it.card, optionOrder: shuffle([0, 1, 2, 3]) }; });
      if (mode === 'quiz' && o.limit && o.limit < cards.length) cards = cards.slice(0, o.limit);
    }
    var session = { name: mode, cards: cards, i: 0, flipped: false, picked: null, score: 0, answers: [], marks: {}, opts: o, ids: ids, startedAt: Date.now() };
    if (mode === 'exam') session.remaining = o.duration;
    go(session);
    saveActiveSession();
    if (mode === 'exam') startExamTimer();
  }
  function stopExamTimer() { if (examTimer !== null) { clearInterval(examTimer); examTimer = null; } }
  function startExamTimer() {
    stopExamTimer();
    V.remaining = Number.isFinite(V.remaining) ? V.remaining : V.opts.duration;
    V.deadline = Date.now() + V.remaining;
    examTimer = setInterval(function () {
      if (V.name !== 'exam') return stopExamTimer();
      V.remaining = Math.max(0, V.deadline - Date.now());
      var clock = document.getElementById('exam-clock');
      if (clock) { clock.textContent = formatClock(V.remaining); clock.setAttribute('aria-label', 'Time remaining ' + formatClock(V.remaining)); }
      if (!V.remaining) finishExam(true);
    }, 1000);
  }
  function mark(it, value) {
    var p = prog(it.deckId);
    p.cards[it.card.id] = StudyLogic.review(p.cards[it.card.id], value === 'known', Date.now());
    trackStudied(1);
    save();
  }

  function todayString(ts) {
    var ms = Number.isFinite(ts) ? ts : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0);
    if (typeof Date === 'function') {
      try {
        var d = new Date(ms);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      } catch (e) {}
    }
    var days = Math.floor(ms / 86400000);
    var z = days + 719468;
    var era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
    var doe = z - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var y = yoe + era * 400;
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153);
    var dNum = doy - Math.floor((153 * mp + 2) / 5) + 1;
    var mNum = mp < 10 ? mp + 3 : mp - 9;
    if (mNum <= 2) y++;
    return y + '-' + String(mNum).padStart(2, '0') + '-' + String(dNum).padStart(2, '0');
  }

  function checkAndRecordFirstSessionToday() {
    var todayStr = todayString();
    if (!S.streak) S.streak = { lastStreakDate: null };
    if (S.streak.lastStreakDate === todayStr) {
      return false;
    }
    S.streak.lastStreakDate = todayStr;
    save();
    return true;
  }

  function finishFlash() {
    var learn = V.cards.filter(function (x) { return V.marks[x.card.id] === 'unknown'; }), known = V.cards.filter(function (x) { return V.marks[x.card.id] === 'known'; }).length;
    var isFirst = checkAndRecordFirstSessionToday();
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'flash', known: known, learning: learn, skipped: V.cards.length - known - learn.length, all: V.cards, opts: V.opts, ids: V.ids, isFirstSessionToday: isFirst });
  }
  function finishQuiz() {
    var per = {}, missed = [];
    V.answers.forEach(function (a) { var p = per[a.item.deckId] || (per[a.item.deckId] = { s: 0, t: 0 }); p.t++; if (a.ok) p.s++; else missed.push(a.item); });
    var newBest = false;
    Object.keys(per).forEach(function (id) {
      var d = deck(id), p = per[id]; if (!d || V.opts.saveBest === false || p.t < Math.min(10, d.cards.length)) return;
      var pct = Math.round(100 * p.s / p.t), pr = prog(id);
      if (!pr.best || pct > pr.best.pct) { pr.best = { pct: pct, score: p.s, total: p.t, date: Date.now() }; newBest = true; }
    });
    var isFirst = checkAndRecordFirstSessionToday();
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'quiz', score: V.score, total: V.answers.length, missed: missed, newBest: newBest, all: V.cards, opts: V.opts, ids: V.ids, isFirstSessionToday: isFirst });
  }
  function finishExam(expired) {
    if (V.name !== 'exam') return;
    stopExamTimer();
    var answers = {};
    V.answers.forEach(function (answer) { answers[answer.item.deckId + '|' + answer.item.card.id] = answer; });
    var review = V.cards.map(function (item) {
      var answer = answers[item.deckId + '|' + item.card.id];
      if (!answer) {
        var p = prog(item.deckId);
        p.cards[item.card.id] = StudyLogic.review(p.cards[item.card.id], false, Date.now());
        trackStudied(1);
      }
      return { item: item, selected: answer ? answer.selected : null, ok: !!(answer && answer.ok) };
    });
    var isFirst = checkAndRecordFirstSessionToday();
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'exam', score: V.score, total: V.cards.length, answered: V.answers.length, expired: !!expired, review: review, isFirstSessionToday: isFirst });
  }

  /* ---------- import ---------- */
  function readFiles(files) {
    var list = Array.from(files); IMP = { decks: [], errors: [], warnings: [], text: IMP.text, parsed: true, backup: null };
    if (list.some(function (f) { return /\.json$/i.test(f.name); })) {
      if (list.length !== 1) { IMP.errors.push({ message: 'Restore one JSON backup at a time.' }); render(true); return; }
      list[0].text().then(function (text) { try { IMP.backup = validateBackup(text); } catch (e) { IMP.errors.push({ message: e.message || 'Could not read this backup.' }); } render(true); }, function () { IMP.errors.push({ message: 'Could not read that backup file.' }); render(true); });
      return;
    }
    Promise.all(list.map(function (f) { return f.text().then(function (t) { return { name: f.name, text: t }; }); })).then(function (rs) {
      rs.forEach(function (r) { merge(P.parseDecks(r.text, { fallbackTitle: r.name.replace(/\.[^.]+$/, '') }), rs.length > 1 ? r.name + ': ' : ''); });
      render(true);
    }, function () { toast('Could not read that file.'); });
  }
  function merge(res, pre) {
    IMP.decks = IMP.decks.concat(res.decks);
    res.errors.forEach(function (e) { IMP.errors.push({ message: pre + e.message }); });
    res.warnings.forEach(function (e) { IMP.warnings.push({ message: pre + e.message }); });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act, d;
    switch (a) {
      case 'home': closeModal(); go({ name: 'home' }); break;
      case 'open-chapter': go({ name: 'chapter', id: t.dataset.id }); break;
      case 'lesson-detail-open': openLessonDetailSheet(t.dataset.id); break;
      case 'lesson-detail-study':
        closeModal();
        go({ name: 'chapter', id: t.dataset.id });
        break;
      case 'chapter-info':
        openLessonDetailSheet(t.dataset.id);
        break;
      case 'chapter-menu':
        var menuDeck = deck(t.dataset.id);
        if (menuDeck) {
          openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-menu-title">' +
            '<h2 id="chapter-menu-title">' + esc(MobileStudy.parseChapterTitle(menuDeck.title).topic) + '</h2>' +
            '<div class="chapter-menu-list">' +
              '<button class="btn full" data-act="edit" data-id="' + menuDeck.id + '">Edit Deck Questions</button>' +
              '<button class="btn full" data-act="export" data-id="' + menuDeck.id + '">Export Deck as .txt</button>' +
              '<button class="btn full danger" data-act="ddel" data-id="' + menuDeck.id + '">Delete Deck</button>' +
            '</div>' +
            '<div class="row end" style="margin-top:14px"><button class="btn ghost" data-act="close">Cancel</button></div>' +
          '</div>');
        }
        break;
      case 'chapter-weak':
        var cwDeck = deck(t.dataset.id);
        if (cwDeck) {
          var cwCards = StudyLogic.weakSpots(cwDeck.cards.map(function (c) { return { deckId: cwDeck.id, card: c, record: prog(cwDeck.id).cards[c.id] }; }), 10);
          if (!cwCards.length) {
            toast('No weak spots for this chapter yet. Practice questions first!');
            return;
          }
          begin('quiz', shuffle(cwCards), { unk: false, limit: 0, shuf: true, saveBest: false }, [cwDeck.id]);
        }
        break;
      case 'chapter-exam':
        var ceDeck = deck(t.dataset.id);
        if (ceDeck) {
          var ceCards = ceDeck.cards.map(function (c) { return { deckId: ceDeck.id, card: c }; });
          var ceCount = Math.min(20, ceCards.length);
          begin('exam', StudyLogic.examQuestions(ceCards, ceCount), { unk: false, limit: ceCount, shuf: true, duration: 15 * 60 * 1000, saveBest: false }, [ceDeck.id]);
        }
        break;

      case 'nav-tab': closeModal(); if (t.dataset.tab) go({ name: t.dataset.tab }); break;
      case 'set-theme': if (t.dataset.theme) { S.settings.theme = t.dataset.theme; applyTheme(); save(); render(true); } break;
      case 'toggle-streak': S.settings.showStreak = S.settings.showStreak === false; save(); render(true); break;
      case 'toggle-shuffle': S.settings.shuffle = !S.settings.shuffle; save(); render(true); break;
      case 'toggle-draft-devotionals':
        S.settings.showDraftDevotionals = !S.settings.showDraftDevotionals;
        save(); render(true);
        toast(S.settings.showDraftDevotionals ? 'Draft devotionals enabled' : 'Draft devotionals hidden');
        break;
      case 'dismiss-devotions':
        if (!S.devotions) S.devotions = { read: {}, saved: {}, carouselHiddenOn: null };
        S.devotions.carouselHiddenOn = todayString();
        save(); render(true);
        toast('Devotionals hidden until tomorrow.');
        break;
      case 'open-devotional':
        if (t.dataset.id) go({ name: 'devotional', id: t.dataset.id, expanded: false });
        break;
      case 'close-devotional':
        go({ name: 'home' });
        break;
      case 'toggle-devotion-expand':
        V.expanded = !V.expanded;
        render(true);
        break;
      case 'devotion-toggle-save':
        var saveId = t.dataset.id;
        if (!S.devotions) S.devotions = { read: {}, saved: {}, carouselHiddenOn: null };
        if (!S.devotions.saved) S.devotions.saved = {};
        S.devotions.saved[saveId] = !S.devotions.saved[saveId];
        save(); render(true);
        toast(S.devotions.saved[saveId] ? 'Saved to bookmarks' : 'Removed from bookmarks');
        break;
      case 'devotion-share':
        var shareId = t.dataset.id;
        var toShare = DEVOTIONALS.filter(function (x) { return x.id === shareId; })[0];
        if (toShare) shareDevotional(toShare);
        break;
      case 'devotion-mark-read':
        var readId = t.dataset.id;
        if (!S.devotions) S.devotions = { read: {}, saved: {}, carouselHiddenOn: null };
        if (!S.devotions.read) S.devotions.read = {};
        S.devotions.read[readId] = Date.now();
        if (!S.completedToday) S.completedToday = {};
        S.completedToday.devotion = true;
        triggerHaptic('correct');
        save(); render(true);
        toast('Marked as read! Great step in your spiritual rhythm.');
        break;
      case 'devotion-study-lesson':
        var lessonDeckId = t.dataset.id;
        if (lessonDeckId) go({ name: 'chapter', id: lessonDeckId });
        break;
      case 'streak-info':
        go({ name: 'streak', returnTo: 'home' });
        break;
      case 'results-continue':
        if (V.isFirstSessionToday && S.settings.showStreak !== false) {
          go({ name: 'streak', returnTo: 'home' });
        } else {
          go({ name: 'home' });
        }
        break;
      case 'close-streak':
        go({ name: V.returnTo || 'home' });
        break;
      case 'onboarding-next':
        if (V.step < 7) {
          V.step++;
          render();
        } else {
          finishOnboarding(true, true);
        }
        break;
      case 'onboarding-back':
        if (V.step > 0) {
          V.step--;
          render();
        }
        break;
      case 'onboarding-pick':
        var pickKey = t.dataset.key;
        var pickVal = t.dataset.val;
        if (pickKey === 'dailyMinutes') pickVal = parseInt(pickVal, 10);
        if (!V.answers) V.answers = Object.assign({}, MobileStudy.defaultOnboarding(false));
        V.answers[pickKey] = pickVal;
        render(true);
        break;
      case 'onboarding-skip':
        finishOnboarding(false, false);
        break;
      case 'commit-hold':
      case 'commit-finish':
        triggerHaptic('correct');
        finishOnboarding(true, true);
        break;
      case 'retake-onboarding':
        V = { name: 'onboarding', step: 2, answers: Object.assign({}, S.onboarding || MobileStudy.defaultOnboarding(true)) };
        render();
        break;
      case 'close': closeModal(); break;
      case 'askok': var fn = pendingAsk; closeModal(); if (fn) fn(); break;
      case 'theme': S.settings.theme = { auto: 'light', light: 'dark', dark: 'auto' }[S.settings.theme]; applyTheme(); save(); render(true); break;
      case 'toggle-rocket': toggleRocketMenu(); break;
      case 'close-rocket': closeRocketMenu(); break;
      case 'rocket-flash': closeRocketMenu(); SEL.clear(); go({ name: 'picker', mode: 'flash', from: V.name, pickerMulti: false, pickerMixed: false }); break;
      case 'rocket-quiz': closeRocketMenu(); SEL.clear(); go({ name: 'picker', mode: 'quiz', from: V.name, pickerMulti: false, pickerMixed: false }); break;
      case 'rocket-challenge': closeRocketMenu(); startChallenge(); break;
      case 'rocket-exam': closeRocketMenu(); setupExam(); break;
      case 'close-picker': go({ name: V.from || 'home' }); break;
      case 'setup': setup(t.dataset.mode, t.dataset.id); break;
      case 'picker-multi':
        V.pickerMulti = !V.pickerMulti;
        if (!V.pickerMulti && SEL.size > 1) SEL = new Set([Array.from(SEL).pop()]);
        render(true);
        break;
      case 'picker-cover':
        var pickerId = t.dataset.id;
        if (!V.pickerMulti) {
          if (pickerId === '__mixed__') startChallenge(null, V.mode === 'quiz' ? 'quiz' : 'flash');
          else setup(V.mode === 'quiz' ? 'quiz' : 'flash', pickerId === '__all__' ? '*' : pickerId);
        } else if (pickerId === '__mixed__') {
          V.pickerMixed = !V.pickerMixed;
          if (V.pickerMixed) SEL.clear();
          render(true);
        } else if (pickerId === '__all__') {
          V.pickerMixed = false;
          var pickerAllSelected = S.decks.length > 0 && S.decks.every(function (item) { return SEL.has(item.id); });
          SEL = pickerAllSelected ? new Set() : new Set(S.decks.map(function (item) { return item.id; }));
          render(true);
        } else {
          V.pickerMixed = false;
          if (SEL.has(pickerId)) SEL.delete(pickerId); else SEL.add(pickerId);
          render(true);
        }
        break;
      case 'picker-start':
        if (V.pickerMixed) startChallenge(null, V.mode === 'quiz' ? 'quiz' : 'flash');
        else if (!SEL.size) toast('Choose one or more lessons to cover.');
        else setup(V.mode === 'quiz' ? 'quiz' : 'flash', '*');
        break;
      case 'practice-mode':
        V.practiceMode = t.dataset.mode;
        render(true);
        break;
      case 'practice-multi':
        V.practiceMulti = V.practiceMulti === false;
        if (!V.practiceMulti && SEL.size > 1) SEL = new Set([Array.from(SEL).pop()]);
        render(true);
        break;
      case 'practice-cover':
        var coverId = t.dataset.id;
        if (coverId === '__mixed__') {
          V.practiceMixed = !V.practiceMixed;
          if (V.practiceMixed) SEL.clear();
        } else if (coverId === '__all__') {
          V.practiceMixed = false;
          var selectedEveryDeck = S.decks.length > 0 && S.decks.every(function (item) { return SEL.has(item.id); });
          SEL = selectedEveryDeck ? new Set() : new Set(S.decks.map(function (item) { return item.id; }));
        } else {
          V.practiceMixed = false;
          if (V.practiceMulti === false && !SEL.has(coverId)) SEL.clear();
          if (SEL.has(coverId)) SEL.delete(coverId); else SEL.add(coverId);
        }
        render(true);
        break;
      case 'practice-start':
        var practiceMode = t.dataset.mode || V.practiceMode || 'quiz';
        var practiceIds = Array.from(SEL);
        if (practiceMode === 'exam') setupExam();
        else if (practiceMode === 'challenge') startChallenge(practiceIds.length ? practiceIds : null);
        else if (V.practiceMixed) startChallenge(null, practiceMode);
        else if (!practiceIds.length) toast('Choose one or more lessons to cover.');
        else setup(practiceMode, '*');
        break;
      case 'due': startDue(); break;
      case 'daily-study': startDailyStudy(); break;
      case 'resume-study': resumeStudySession(); break;
      case 'pause-session': pauseStudySession(); break;
      case 'discard-study': ask('End this saved study session? Your completed card progress will remain saved.', 'End session', discardPausedSession); break;
      case 'weak': startWeakSpots(); break;
      case 'exam': setupExam(); break;
      case 'start': start(); break;
      case 'import': IMP = { decks: [], errors: [], warnings: [], text: '', parsed: false, backup: null }; go({ name: 'import' }); break;
      case 'backup': resetBackupReminder(); exportBackup(); render(true); break;
      case 'backup-dismiss': resetBackupReminder(); render(true); break;
      case 'update-app': if (waitingWorker) { reloadForUpdate = true; waitingWorker.postMessage({ type: 'SKIP_WAITING' }); } break;
      case 'iparse': var txt = document.getElementById('paste').value; IMP = { decks: [], errors: [], warnings: [], text: txt, parsed: true, backup: null }; merge(P.parseDecks(txt, { fallbackTitle: 'Pasted deck' }), ''); render(true); break;
      case 'isave':
        var n = 0; IMP.decks.forEach(function (x) { if (x.questions.length) { addParsed(x, false); n++; } }); save(); toast('Saved ' + plural(n, 'deck')); go({ name: 'home' }); break;
      case 'restore': if (IMP.backup) ask('Replace all current decks, progress, and preferences with the selected backup?', 'Restore backup', function () { S = IMP.backup; S.pausedSession = null; SEL.clear(); homeFilter = ''; preserveStorage = false; applyDataMigrations(); save(); applyTheme(); IMP = { decks: [], errors: [], warnings: [], text: '', parsed: false, backup: null }; toast('Backup restored.'); go({ name: 'home' }); }); break;
      case 'exportall': download('all-decks.txt', P.serializeDecks(S.decks)); break;
      case 'edit': go({ name: 'edit', id: t.dataset.id, editing: null, filter: '' }); break;
      case 'export': exportDeck(deck(V.id)); break;
      case 'ddel': d = deck(V.id); ask('Delete "' + (MobileStudy.parseChapterTitle(d.title).topic || d.title) + '" and its progress? Export it first if you want to keep a copy.', 'Delete deck', function () { S.decks = S.decks.filter(function (x) { return x.id !== d.id; }); delete S.progress[d.id]; SEL.delete(d.id); save(); go({ name: 'home' }); }); break;
      case 'cnew': V.editing = 'new'; render(true); break;
      case 'cedit': V.editing = +t.dataset.i; render(true); break;
      case 'ccancel': V.editing = null; render(true); break;
      case 'csave': saveCard(); break;
      case 'cdel': d = deck(V.id); var ci = +t.dataset.i; ask('Delete question ' + (ci + 1) + '?', 'Delete card', function () { var c = d.cards.splice(ci, 1)[0], p = prog(d.id); delete p.cards[c.id]; p.best = null; V.editing = null; save(); render(true); }); break;
      case 'flip': V.flipped = !V.flipped; saveActiveSession(); render(true); break;
      case 'mark': mark(V.cards[V.i], t.dataset.v); V.marks[V.cards[V.i].card.id] = t.dataset.v; step(1); break;
      case 'next': step(1); break;
      case 'prev': step(-1); break;
      case 'pick': pick(+t.dataset.i); break;
      case 'review': begin('flash', shuffle(V.kind === 'quiz' ? V.missed : V.learning), {}, V.ids); break;
      case 'again': var all = V.all; begin(V.kind === 'quiz' ? 'quiz' : 'flash', V.kind === 'quiz' ? shuffle(all) : all, V.opts, V.ids); break;
    }
  });
  function step(dir) {
    var n = V.i + dir;
    if (n >= V.cards.length) return V.name === 'flash' ? finishFlash() : (V.name === 'exam' ? finishExam(false) : finishQuiz());
    if (n < 0) return;
    V.i = n; V.flipped = false; V.picked = null; saveActiveSession(); render();
  }
  function pick(k) {
    if (V.picked !== null) return;
    try { window.localStorage.setItem('cci_seen_answer_tooltip', 'true'); } catch (e) {}
    var it = V.cards[V.i], selected = LET[(it.optionOrder || [0, 1, 2, 3])[k]], ok = selected === it.card.answer;
    triggerHaptic(ok ? 'correct' : 'wrong');
    V.picked = k; V.answers.push({ item: it, ok: ok, selected: selected }); if (ok) V.score++;
    var p = prog(it.deckId);
    p.cards[it.card.id] = StudyLogic.review(p.cards[it.card.id], ok, Date.now());
    trackStudied(1);
    S.pausedSession = MobileStudy.snapshot(V);
    save(); render(true);
  }
  function saveCard() {
    var f = app.querySelector('form'), q = f.q.value.trim(), o = [0, 1, 2, 3].map(function (k) { return f['o' + k].value.trim(); }), a = (f.querySelector('input[name=ans]:checked') || {}).value, explanation = f.explanation.value.trim(), ref = f.ref.value.trim(), bible = f.bible.value.trim();
    var err = !q ? 'Enter the question.' : o.some(function (x) { return !x; }) ? 'Fill in all four options.' : !a ? 'Select the correct answer.' : '';
    if (err) { document.getElementById('ferr').textContent = err; return; }
    var d = deck(V.id);
    if (V.editing === 'new') { d.cards.push({ id: d.id + '.n' + uid(), question: q, options: o, answer: a, explanation: explanation, ref: ref, bible: bible }); prog(d.id).best = null; }
    else {
      var c = d.cards[V.editing], changed = c.question !== q || c.answer !== a || c.options.some(function (x, k) { return x !== o[k]; });
      if (changed) { delete prog(d.id).cards[c.id]; prog(d.id).best = null; }
      c.question = q; c.options = o; c.answer = a; c.explanation = explanation; c.ref = ref; c.bible = bible;
    }
    V.editing = null; save(); render(true); toast('Card saved');
  }
  function finishOnboarding(committed, saveAnswers) {
    var ans = (saveAnswers && V.answers) ? V.answers : (S.onboarding || MobileStudy.defaultOnboarding(true));
    S.onboarding = {
      completed: true,
      goal: ans.goal || 'habit',
      dailyMinutes: ans.dailyMinutes || 10,
      startingTopic: ans.startingTopic || 'soteriology',
      preferredTime: ans.preferredTime || 'anytime',
      committed: !!committed
    };
    save();
    go({ name: 'home' });
    toast(committed ? 'Commitment made! Your study plan is active.' : 'Welcome to CCI Discipleship!');
  }

  var holdTimer = null;
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.commit-hold-btn');
      if (!btn) return;
      btn.classList.add('holding');
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        btn.classList.remove('holding');
        triggerHaptic('correct');
        finishOnboarding(true, true);
      }, 1100);
    });
    function cancelCommitHold() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
        var btn = document.querySelector('.commit-hold-btn.holding');
        if (btn) btn.classList.remove('holding');
      }
    }
    document.addEventListener('pointerup', cancelCommitHold);
    document.addEventListener('pointercancel', cancelCommitHold);
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.sel) { t.checked ? SEL.add(t.dataset.sel) : SEL.delete(t.dataset.sel); document.getElementById('bar').innerHTML = bar(); render(true); }
    else if ('selall' in t.dataset) { SEL = t.checked ? new Set(S.decks.map(function (d) { return d.id; })) : new Set(); render(true); }
    else if ('rename' in t.dataset) { var d = deck(V.id), v = t.value.trim(); if (v) { d.title = v; save(); toast('Renamed'); } else t.value = d.title; }
    else if (t.id === 'files' && t.files.length) { IMP.text = ''; readFiles(t.files); }
  });
  document.addEventListener('submit', function (e) { e.preventDefault(); });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'filter') {
      V.filter = e.target.value; var f = V.filter.toLowerCase();
      app.querySelectorAll('.crow').forEach(function (r) { r.hidden = !!f && r.dataset.text.indexOf(f) < 0; });
    } else if (e.target.id === 'deck-search') {
      homeFilter = e.target.value.trim(); var q = homeFilter.toLowerCase(), visible = 0;
      app.querySelectorAll('.chapter-card[data-deck-name], .deck[data-deck-name]').forEach(function (r) {
        var matchTopic = r.dataset.deckName && r.dataset.deckName.indexOf(q) >= 0;
        var d = deck(r.dataset.id);
        var matchTitle = d && d.title.toLowerCase().indexOf(q) >= 0;
        var matchNum = d && ('section ' + (MobileStudy.parseChapterTitle(d.title).sectionNum || '')).indexOf(q) >= 0;
        r.hidden = !!q && !matchTopic && !matchTitle && !matchNum;
        if (!r.hidden) visible++;
      });
      var count = document.getElementById('deck-result-count'), none = document.getElementById('search-empty');
      if (count) count.textContent = visible + ' ' + (visible === 1 ? 'chapter' : 'chapters');
      if (none) none.classList.toggle('on', visible === 0);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (rocketMenuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRocketMenu();
        return;
      }
      if (e.key === 'Tab') {
        var focusables = Array.from(app.querySelectorAll('.rocket-pills button, #rocket-fab-btn'));
        if (focusables.length) {
          var firstEl = focusables[0], lastEl = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
        return;
      }
    }
    if (V.name === 'picker' && !modal.innerHTML && e.key === 'Escape') {
      e.preventDefault();
      go({ name: V.from || 'home' });
      return;
    }
    if (modal.innerHTML && e.key === 'Escape') { e.preventDefault(); return closeModal(); }
    if (modal.innerHTML && e.key === 'Tab') {
      var focusable = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length) {
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || modal.innerHTML) return;
    if (V.name === 'flash') {
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
      else if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('.flip')) { e.preventDefault(); V.flipped = !V.flipped; render(true); }
    } else if (V.name === 'quiz' || V.name === 'exam') {
      var k = 'abcd'.indexOf(e.key.toLowerCase()); if (k < 0) k = '1234'.indexOf(e.key);
      if (k >= 0 && V.picked === null) pick(k); else if ((e.key === 'Enter' || e.key === 'ArrowRight') && V.picked !== null) step(1);
    }
  });
  var tx = 0, ty = 0;
  document.addEventListener('touchstart', function (e) { if (e.target.closest('.flip')) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tx = 0; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!tx || V.name !== 'flash') return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = 0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); step(dx < 0 ? 1 : -1); }
  });

  function registerNativeNavigation() {
    if (!window.CciNative || !window.CciNative.isNative) return;
    window.CciNative.onBackButton(function () {
      if (modal.innerHTML) { closeModal(); return; }
      if (rocketMenuOpen) { closeRocketMenu(); return; }
      if (V.name === 'picker') { go({ name: V.from || 'home' }); return; }
      if (isStudySession(V.name)) { pauseStudySession(); return; }
      if (V.name === 'devotional') { go({ name: 'home' }); return; }
      if (V.name !== 'home') { go({ name: 'home' }); return; }
      window.CciNative.exitApp().catch(function () {});
    }).catch(function () {});
    window.CciNative.onAppStateChange(function (state) {
      if (!state.isActive && isStudySession(V.name)) pauseStudySession();
    }).catch(function () {});
  }

  function boot() {
    return Promise.all([load(), loadStarterText(), loadDevotionals()]).then(function (results) {
      var text = results[1];
      DEVOTIONALS = results[2] || [];
      STARTER_DECKS = P.parseDecks(text).decks;
      var reconcileStarters = S.seeded && S.dataVersion >= DATA_VERSION;
      var isFirstRun = !S.seeded && (!S.onboarding || !S.onboarding.completed);
      seed();
      if (reconcileStarters && syncStarterDecks()) save();
      return applyDataMigrations().then(function () {
        if (S.pausedSession) {
          var restoredSession = MobileStudy.restore(S.pausedSession, S.decks);
          S.pausedSession = restoredSession ? MobileStudy.snapshot(restoredSession) : null;
        }
        applyTheme();
        if (isFirstRun) {
          V = { name: 'onboarding', step: 0, answers: MobileStudy.defaultOnboarding(false) };
        }
        render();
        registerServiceWorker();
        registerNativeNavigation();
      });
    });
  }
  boot();
})();
