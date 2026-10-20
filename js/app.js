(function () {
  'use strict';
  var P = window.DeckParser, StudyLogic = window.StudyLogic, Storage = window.StudyStorage, MobileStudy = window.MobileStudy, LET = P.LETTERS, KEY = 'flashdecks.v1', DATA_VERSION = 8;
  var app = document.getElementById('app'), modal = document.getElementById('modal'), toastEl = document.getElementById('toast');
  var S = { decks: [], progress: {}, settings: { theme: 'auto', shuffle: false, showStreak: true }, seeded: false, dataVersion: 0, pausedSession: null };
  var STARTER_DECKS = [];
  var storageOk = true, storageMessage = '', storageBackend = 'loading', preserveStorage = false, saveQueue = Promise.resolve(), V = { name: 'home' }, SEL = new Set(), pendingAsk = null, returnFocus = null, homeFilter = '', examTimer = null, waitingWorker = null, updateAvailable = false, reloadForUpdate = false, IMP = { decks: [], errors: [], warnings: [], text: '', parsed: false, backup: null };
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
      S.settings = Object.assign({ theme: 'auto', shuffle: false, showStreak: true }, o.settings && typeof o.settings === 'object' ? o.settings : {});
      if (['auto', 'light', 'dark'].indexOf(S.settings.theme) < 0) S.settings.theme = 'auto';
      S.settings.shuffle = !!S.settings.shuffle;
      S.settings.showStreak = S.settings.showStreak !== false;
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
    var first = modal.querySelector('button, input, select, textarea');
    if (first) first.focus();
  }
  function ask(msg, label, fn) { pendingAsk = fn; openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title" class="dialog-title">Please confirm</h2><p>' + esc(msg) + '</p><div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn danger" data-act="askok">' + esc(label) + '</button></div></div>'); }
  function closeModal() { modal.innerHTML = ''; pendingAsk = null; if (returnFocus && document.contains(returnFocus)) returnFocus.focus(); returnFocus = null; }
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
    var payload = { format: 'cci-discipleship-quiz-backup', version: 1, exportedAt: new Date().toISOString(), data: { decks: S.decks, progress: S.progress, settings: S.settings, seeded: S.seeded, dataVersion: S.dataVersion, backupReminder: S.backupReminder } };
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
    var settings = Object.assign({ theme: 'auto', shuffle: false }, raw.data.settings && typeof raw.data.settings === 'object' ? raw.data.settings : {});
    if (['auto', 'light', 'dark'].indexOf(settings.theme) < 0) settings.theme = 'auto'; settings.shuffle = !!settings.shuffle;
    return { decks: decks, progress: progress, settings: settings, seeded: !!raw.data.seeded, dataVersion: dataVersion, backupReminder: StudyLogic.normalizeBackupReminder(raw.data.backupReminder) };
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
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>';
      case 'practice':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="9" x2="12" y2="9.01"/><line x1="12" y1="15" x2="12" y2="15.01"/></svg>';
      case 'progress':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
      case 'settings':
        return '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
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

    // Your Plan for Today: short cards with icon, one-line title, minute estimate and state
    var planCards = MobileStudy.selectPlanCards({
      dueItems: StudyLogic.dueItems(all, now),
      weakItems: StudyLogic.weakSpots(all, 10),
      allItems: all,
      isMastered: function (it) { return isMastered(it.deckId, it.card.id); },
      decks: S.decks,
      completedToday: S.completedToday || {}
    });

    var planSection = '<section class="plan-section" aria-labelledby="plan-section-title">' +
      '<div class="section-head">' +
        '<h2 id="plan-section-title" class="section-title">Your Plan for Today</h2>' +
        '<span class="section-sub">Personalized coaching</span>' +
      '</div>' +
      '<div class="plan-card-list">' +
        planCards.map(function (c) {
          return '<button class="plan-card state-' + c.state + '" data-act="' + c.action + '"' + (c.mode ? ' data-mode="' + c.mode + '"' : '') + (c.deckId ? ' data-id="' + c.deckId + '"' : '') + ' aria-label="' + esc(c.oneLine) + '">' +
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

    return topBar + backupReminder + heroCard + (S.decks.length ? planSection + milestoneCard : '');
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
      var hidden = homeFilter && d.title.toLowerCase().indexOf(homeFilter.toLowerCase()) < 0;

      var bestBadge = p.best ? '<span class="chapter-best-badge">Best ' + p.best.pct + '%</span>' : '';

      return '<article class="chapter-card ' + gradClass + '" data-deck-name="' + esc(d.title.toLowerCase()) + '"' + (hidden ? ' hidden' : '') + '>' +
        '<div class="chapter-card-top">' +
          '<div class="chapter-badges">' +
            '<span class="chapter-sec-pill">' + esc(parsed.sectionLabel) + '</span>' +
            bestBadge +
          '</div>' +
          '<div class="chapter-card-actions">' +
            '<button class="chapter-icon-btn chapter-info-btn" data-act="chapter-info" data-id="' + d.id + '" aria-label="Deck info for ' + esc(d.title) + '" title="View deck details">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
            '</button>' +
            '<button class="chapter-icon-btn" data-act="chapter-menu" data-id="' + d.id + '" aria-label="Options for ' + esc(d.title) + '">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<button class="chapter-card-main-hit" data-act="open-chapter" data-id="' + d.id + '" aria-label="Open chapter ' + esc(parsed.topic) + '">' +
          '<h2 class="chapter-title">' + esc(parsed.topic) + '</h2>' +
          '<p class="chapter-sub">CCI Discipleship Experience</p>' +
          '<div class="chapter-card-bottom">' +
            '<div class="chapter-progress-info">' +
              '<span class="chapter-count">' + mastered + ' / ' + total + ' mastered</span>' +
              '<span class="chapter-pct">' + pct + '%</span>' +
            '</div>' +
            '<div class="deck-progress chapter-progress-bar" role="progressbar" aria-label="' + esc(d.title) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
        '</button>' +
        chapterSvgIllustration(secNum) +
      '</article>';
    }).join('');

    var empty = '<div class="empty"><h2>Welcome to CCI Study Decks</h2><p>Begin your discipleship journey. Add a deck from a text file or paste its content to start studying.</p><button class="btn primary sm" data-act="import" style="margin-top:14px">Add your first deck</button></div>';

    return '<header class="view-header">' +
      '<div class="row spread">' +
        '<div><h1>Journey</h1><p class="view-sub">12 Discipleship Chapters · ' + plural(S.decks.length, 'chapter') + ' · ' + plural(totalCards, 'card') + '</p></div>' +
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
        '<span class="chapter-sec-pill">' + esc(parsed.sectionLabel) + '</span>' +
        '<h1 class="chapter-view-title">' + esc(parsed.topic) + '</h1>' +
        '<p class="chapter-view-sub">' + plural(total, 'question') + ' · ' + mastered + ' mastered (' + pct + '%)</p>' +
        '<div class="deck-progress chapter-progress-bar" role="progressbar" aria-label="' + esc(d.title) + ' mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
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
    var now = Date.now();
    var all = allCardItems();
    var dueCount = StudyLogic.dueItems(all, now).length;
    var weakCount = StudyLogic.weakSpots(all, 10).length;
    return '<header class="view-header">' +
      '<h1>Practice</h1>' +
      '<p class="view-sub">Master your questions through focused study modes</p>' +
    '</header>' +
    '<div class="practice-grid">' +
      '<button class="practice-card" data-act="daily-study">' +
        '<div class="practice-icon">' + planIconSvg('review') + '</div>' +
        '<div class="practice-body">' +
          '<div class="practice-title">Today’s Focus Study</div>' +
          '<div class="practice-desc">Focused 10-card daily review prioritized by spaced repetition.</div>' +
        '</div>' +
        '<span class="practice-arrow" aria-hidden="true">→</span>' +
      '</button>' +
      '<button class="practice-card" data-act="due">' +
        '<div class="practice-icon">' + planIconSvg('review') + '</div>' +
        '<div class="practice-body">' +
          '<div class="practice-title">Due Cards Review ' + (dueCount ? '<span class="badge">' + dueCount + '</span>' : '') + '</div>' +
          '<div class="practice-desc">' + (dueCount ? plural(dueCount, 'card') + ' scheduled for review today.' : 'All caught up! No cards currently due.') + '</div>' +
        '</div>' +
        '<span class="practice-arrow" aria-hidden="true">→</span>' +
      '</button>' +
      '<button class="practice-card" data-act="weak">' +
        '<div class="practice-icon">' + planIconSvg('target') + '</div>' +
        '<div class="practice-body">' +
          '<div class="practice-title">Weak Spots</div>' +
          '<div class="practice-desc">' + (weakCount ? 'Practice questions you have missed most frequently.' : 'Build stats by studying cards to surface weak spots.') + '</div>' +
        '</div>' +
        '<span class="practice-arrow" aria-hidden="true">→</span>' +
      '</button>' +
      '<button class="practice-card" data-act="exam">' +
        '<div class="practice-icon">' + planIconSvg('trophy') + '</div>' +
        '<div class="practice-body">' +
          '<div class="practice-title">Comprehensive Timed Exam</div>' +
          '<div class="practice-desc">Timed exam across all 12 decks with complete answer review upon submission.</div>' +
        '</div>' +
        '<span class="practice-arrow" aria-hidden="true">→</span>' +
      '</button>' +
    '</div>';
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
      return '<li class="progress-deck-item">' +
        '<div class="progress-deck-head">' +
          '<strong>' + esc(d.title) + '</strong>' +
          '<span class="meta">' + pct + '% · ' + bestText + '</span>' +
        '</div>' +
        '<div class="deck-progress" role="progressbar" aria-label="' + esc(d.title) + '" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
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
        '<div><strong>Daily Streak Counter</strong><p class="meta">Show flame counter in top bar</p></div>' +
        '<button class="btn sm' + (showStreak ? ' primary' : '') + '" data-act="toggle-streak">' + (showStreak ? 'Enabled' : 'Off') + '</button>' +
      '</div>' +
      '<div class="settings-row">' +
        '<div><strong>Shuffle Flashcards</strong><p class="meta">Randomize card order on start</p></div>' +
        '<button class="btn sm' + (S.settings.shuffle ? ' primary' : '') + '" data-act="toggle-shuffle">' + (S.settings.shuffle ? 'Enabled' : 'Off') + '</button>' +
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
    var title = V.opts && V.opts.daily ? 'Today’s Study' : 'Flashcards';
    var notes = (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') + (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') + bibleNote(c);
    return '<section class="study-shell flash-session" aria-label="Flashcard study session">' + sessionHead(title, (V.i + 1) + ' / ' + V.cards.length) + progressBar(V.i + 1, V.cards.length) +
      '<button class="flip' + (V.flipped ? ' on' : '') + '" data-act="flip" type="button" aria-pressed="' + V.flipped + '" aria-label="' + (V.flipped ? 'Show question' : 'Reveal answer') + '"><span class="inner">' +
      '<span class="face front" aria-hidden="' + V.flipped + '"><span class="card-face-top"><span class="tag">' + esc(d ? d.title : '') + '</span><span class="face-index">' + (V.i + 1) + ' / ' + V.cards.length + '</span></span><span class="q">' + esc(c.question) + '</span><span class="flip-cue"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap, click, Space, or Enter to reveal</span></span>' +
      '<span class="face back" aria-hidden="' + !V.flipped + '"><span class="card-face-top"><span class="tag">Answer · ' + c.answer + '</span><span class="face-index">' + (V.i + 1) + ' / ' + V.cards.length + '</span></span><span class="a">' + esc(c.options[ai]) + '</span>' + notes + '<span class="qs">' + esc(c.question) + '</span><span class="flip-cue"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap, click, Space, or Enter to see question</span></span></span></button>' +
      (V.flipped ? '<div class="flash-rating row grow" role="group" aria-label="Mark your confidence"><button class="btn" data-act="mark" data-v="unknown">Still learning</button><button class="btn primary" data-act="mark" data-v="known">I know it</button></div>' : '') +
      '<div class="row grow nav study-navigation"><button class="btn" data-act="prev"' + (V.i ? '' : ' disabled') + '>Previous</button><button class="btn" data-act="next">' + (V.i === V.cards.length - 1 ? 'Finish session' : (V.flipped ? 'Next card' : 'Skip card')) + '</button></div><p class="study-shortcuts">Use ← / → to move between cards</p></section>';
  };

  views.quiz = function () {
    var isExam = V.name === 'exam', it = V.cards[V.i], c = it.card, picked = V.picked, done = picked !== null;
    var order = it.optionOrder || [0, 1, 2, 3];
    var opts = order.map(function (source, k) {
      var cls = 'opt'; if (done && isExam && k === picked) cls += ' selected'; else if (done && !isExam) { if (LET[source] === c.answer) cls += ' right'; else if (k === picked) cls += ' wrong'; }
      return '<button class="' + cls + '" data-act="pick" data-i="' + k + '" aria-label="' + LET[k] + '. ' + esc(c.options[source]) + '" aria-pressed="' + (done && k === picked) + '"' + (done ? ' disabled' : '') + '><b aria-hidden="true">' + LET[k] + '</b><span>' + esc(c.options[source]) + '</span></button>';
    }).join('');
    var fb = '';
    if (done) {
      var answerAt = order.indexOf(LET.indexOf(c.answer));
      if (isExam) fb = '<div class="exam-progress-note" role="status">Answer saved for review after submission.</div><button class="btn primary full" data-act="next">' + (V.i === V.cards.length - 1 ? 'Submit exam' : 'Next question') + '</button>';
      else {
        var ok = picked === answerAt;
        fb = '<div class="feedback-panel ' + (ok ? 'is-correct' : 'is-incorrect') + '" role="status" aria-live="polite"><p class="fb ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Correct.' : 'Not quite.') + '</p>' + (!ok ? '<p class="feedback-answer"><span class="feedback-answer-letter" aria-label="Correct option ' + LET[answerAt] + '">' + LET[answerAt] + '</span><span>' + esc(c.options[order[answerAt]]) + '</span></p>' : '') + (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') + (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') + bibleNote(c) + '</div><button class="btn primary full" data-act="next">' + (V.i === V.cards.length - 1 ? 'See results' : 'Next question') + '</button>';
      }
    }
    var title = isExam ? 'Exam' : 'Quiz';
    var status = isExam ? '<span id="exam-clock" role="timer" aria-label="Time remaining ' + formatClock(V.remaining) + '">' + formatClock(V.remaining) + '</span>' : '<span class="score-inline">' + V.score + '<span aria-hidden="true"> / </span><span class="sr-only">out of</span>' + V.answers.length + '</span>';
    return '<section class="study-shell ' + (isExam ? 'exam-session' : 'quiz-session') + '" aria-label="' + (isExam ? 'Timed exam' : 'Quiz') + '">' + sessionHead(title, status, isExam) + progressBar(V.i + (done ? 1 : 0), V.cards.length) +
      '<article class="question-panel"><p class="count">Question ' + (V.i + 1) + ' of ' + V.cards.length + '</p><h2 class="qtext" id="question-prompt" tabindex="-1">' + esc(c.question) + '</h2><div class="opts" role="group" aria-labelledby="question-prompt">' + opts + '</div>' + (fb ? '<div class="study-feedback">' + fb + '</div>' : '') + '</article><p class="study-shortcuts">Choose A–D or 1–4' + (done ? '' : ' · Enter a selection to continue') + '</p></section>';
  };

  views.results = function () {
    var R = V, h;
    if (R.kind === 'exam') {
      var examPct = R.total ? Math.round(100 * R.score / R.total) : 0;
      var examRows = R.review.map(function (entry, index) {
        var card = entry.item.card;
        var selected = entry.selected ? '<p class="answer-review-line selected-answer"><span class="answer-label">Your answer</span><span class="answer-copy"><b>' + entry.selected + '</b> ' + esc(card.options[LET.indexOf(entry.selected)]) + '</span></p>' : '<p class="answer-review-line unanswered"><span class="answer-label">Your answer</span><span class="answer-copy">Unanswered</span></p>';
        var status = entry.ok ? 'Correct' : (entry.selected ? 'Incorrect' : 'Not answered');
        return '<li class="exam-review-item ' + (entry.ok ? 'review-correct' : 'review-missed') + '"><div class="review-item-head"><h3>Question ' + (index + 1) + ': ' + esc(card.question) + '</h3><span class="review-status ' + (entry.ok ? 'is-correct' : 'is-incorrect') + '">' + status + '</span></div>' + selected + '<p class="answer-review-line correct-answer"><span class="answer-label">Correct answer</span><span class="answer-copy"><b>' + card.answer + '</b> ' + esc(card.options[LET.indexOf(card.answer)]) + '</span></p>' + (card.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(card.explanation) + '</p>' : '') + (card.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(card.ref) + '</p>' : '') + bibleNote(card) + '</li>';
      }).join('');
      return '<section class="study-shell results-shell exam-results" aria-label="Exam results"><header class="top results-header"><h1>Exam results</h1><button class="btn sm ghost" data-act="home">Back to decks</button></header><div class="result-hero exam-score"><span class="result-mark" aria-hidden="true">' + examPct + '%</span><div class="result-score"><span class="num">' + R.score + ' <span aria-hidden="true">/</span> ' + R.total + '</span><span class="meta">' + examPct + '% correct · ' + R.answered + ' answered' + (R.expired ? ' · Time expired' : '') + '</span></div></div><section class="exam-review" aria-labelledby="exam-review-title"><div class="review-heading"><div><p class="eyebrow">Learn from the attempt</p><h2 id="exam-review-title">Answer review</h2></div><span class="meta">' + plural(R.review.length, 'question') + '</span></div><ol>' + examRows + '</ol></section><button class="btn full ghost result-home" data-act="home">Return to decks</button></section>';
    }
    if (R.kind === 'quiz') {
      var pct = Math.round(100 * R.score / R.total);
      h = '<div class="result-hero"><span class="result-mark" aria-hidden="true">' + pct + '%</span><div class="result-score"><span class="num">' + R.score + ' <span aria-hidden="true">/</span> ' + R.total + '</span><span class="meta">' + pct + '% correct</span>' + (R.newBest ? '<span class="new-best">New best</span>' : '') + '</div></div>';
    } else h = '<div class="result-hero flash-result"><span class="result-mark" aria-hidden="true">' + R.known + '</span><div class="result-score"><span class="num">' + R.known + ' known</span><span class="meta">' + R.learning.length + ' still learning · ' + R.skipped + ' not marked</span></div></div>';
    var miss = R.kind === 'quiz' ? R.missed : R.learning;
    return '<section class="study-shell results-shell" aria-label="' + (R.kind === 'quiz' ? 'Quiz results' : 'Flashcard session results') + '"><header class="top results-header"><h1>' + (R.kind === 'quiz' ? 'Quiz results' : 'Session complete') + '</h1><button class="btn sm ghost" data-act="home">Back to decks</button></header>' + h +
      '<div class="result-actions">' + (miss.length ? '<button class="btn primary full" data-act="review">Review ' + plural(miss.length, R.kind === 'quiz' ? 'missed card' : 'card') + '</button>' : '<p class="note result-note">' + (R.kind === 'quiz' ? 'No missed cards. Nice work.' : 'Nothing left marked as still learning.') + '</p>') +
      '<button class="btn full" data-act="again">' + (R.kind === 'quiz' ? 'Retake quiz' : 'Study again') + '</button><button class="btn full ghost" data-act="home">Return to decks</button></div></section>';
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
        ok.map(function (d) { return '<p class="prow"><span>' + esc(d.title) + '</span><b>' + d.questions.length + '</b></p>'; }).join('') +
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
  function sessionHead(t, right, isExam) { return '<header class="top study-header"><button class="btn sm ghost study-exit" data-act="pause-session" aria-label="Pause and save study session">Pause</button><div class="study-heading"><span class="eyebrow">CCI · DISCIPLESHIP</span><h1>' + esc(t) + '</h1></div><div class="session-status' + (isExam ? ' is-timer' : '') + '">' + right + '</div></header>'; }
  function progressBar(n, t) { var pct = t ? Math.max(0, Math.min(100, Math.round(100 * n / t))) : 0; return '<div class="pbar study-progress" role="progressbar" aria-label="Study session progress" aria-valuemin="0" aria-valuemax="' + t + '" aria-valuenow="' + n + '" aria-valuetext="' + n + ' of ' + t + '"><i style="width:' + pct + '%"></i></div>'; }
  function formatClock(milliseconds) { var seconds = Math.max(0, Math.ceil(milliseconds / 1000)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }

  /* ---------- render ---------- */
  function render(keep) {
    var isMainTab = MAIN_TABS.indexOf(V.name) >= 0;
    var view = V.name === 'exam' ? views.quiz : views[V.name];
    if (typeof view !== 'function') view = views.home;
    var tabBarHtml = isMainTab ? renderTabBar(V.name) : '';
    app.innerHTML = banner() + view() + tabBarHtml;
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
        V = { name: e.state.name, id: e.state.id };
        render();
      }
    });
  }

  /* ---------- sessions ---------- */
  function setup(mode, id) {
    var ids = id === '*' ? Array.from(SEL) : [id];
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
    var cards = MobileStudy.selectDailyItems(due, all, function (item) { return isMastered(item.deckId, item.card.id); }, 10);
    if (!cards.length) { toast('All cards are mastered. Try a quiz or exam to review them.'); return; }
    begin('flash', shuffle(cards), { unk: false, limit: cards.length, shuf: true, daily: true }, deckIdsFor(cards));
  }
  function startWeakSpots() {
    var cards = StudyLogic.weakSpots(allCardItems(), 10);
    if (!cards.length) { toast('Answer some questions first to build weak-spot stats.'); return; }
    begin('quiz', shuffle(cards), { unk: false, limit: 0, shuf: true, saveBest: false }, deckIdsFor(cards));
  }
  function begin(mode, cards, o, ids) {
    if (mode === 'quiz' || mode === 'exam') {
      cards = cards.map(function (it) { return { deckId: it.deckId, card: it.card, optionOrder: shuffle([0, 1, 2, 3]) }; });
      if (mode === 'quiz' && o.limit && o.limit < cards.length) cards = cards.slice(0, o.limit);
    }
    var session = { name: mode, cards: cards, i: 0, flipped: false, picked: null, score: 0, answers: [], marks: {}, opts: o, ids: ids };
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

  function finishFlash() {
    var learn = V.cards.filter(function (x) { return V.marks[x.card.id] === 'unknown'; }), known = V.cards.filter(function (x) { return V.marks[x.card.id] === 'known'; }).length;
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'flash', known: known, learning: learn, skipped: V.cards.length - known - learn.length, all: V.cards, opts: V.opts, ids: V.ids });
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
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'quiz', score: V.score, total: V.answers.length, missed: missed, newBest: newBest, all: V.cards, opts: V.opts, ids: V.ids });
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
    S.pausedSession = null; save();
    go({ name: 'results', kind: 'exam', score: V.score, total: V.cards.length, answered: V.answers.length, expired: !!expired, review: review });
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
      case 'chapter-info':
        var infoDeck = deck(t.dataset.id);
        if (infoDeck) {
          var infoProg = prog(infoDeck.id);
          var infoMastered = infoDeck.cards.filter(function (c) { return isMastered(infoDeck.id, c.id); }).length;
          var infoDue = infoDeck.cards.filter(function (c) { return StudyLogic.isDueToday(infoProg.cards[c.id], Date.now()); }).length;
          var infoWeak = infoDeck.cards.filter(function (c) { var r = infoProg.cards[c.id]; return r && typeof r === 'object' && r.attempts > 0 && r.misses > 0; }).length;
          var infoParsed = MobileStudy.parseChapterTitle(infoDeck.title);
          openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-info-title">' +
            '<h2 id="chapter-info-title">' + esc(infoDeck.title) + '</h2>' +
            '<p class="meta">' + infoParsed.sectionLabel + ' · ' + plural(infoDeck.cards.length, 'question') + '</p>' +
            '<div class="statline" style="margin: 16px 0">' +
              '<div class="stat"><b>' + infoMastered + ' / ' + infoDeck.cards.length + '</b><span>Mastered</span></div>' +
              '<div class="stat"><b>' + (infoProg.best ? infoProg.best.pct + '%' : '—') + '</b><span>Best Quiz</span></div>' +
              '<div class="stat"><b>' + infoDue + '</b><span>Due</span></div>' +
              '<div class="stat"><b>' + infoWeak + '</b><span>Weak</span></div>' +
            '</div>' +
            '<div class="row end"><button class="btn primary" data-act="close">Done</button></div>' +
          '</div>');
        }
        break;
      case 'chapter-menu':
        var menuDeck = deck(t.dataset.id);
        if (menuDeck) {
          openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="chapter-menu-title">' +
            '<h2 id="chapter-menu-title">' + esc(menuDeck.title) + '</h2>' +
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
      case 'streak-info':
        var curStreak = MobileStudy.calculateStreak(getStudyTimestamps(), Date.now());
        toast(curStreak > 0 ? (curStreak + ' day streak! Keep studying daily to maintain momentum.') : 'Study cards today to start your streak!');
        break;
      case 'close': closeModal(); break;
      case 'askok': var fn = pendingAsk; closeModal(); if (fn) fn(); break;
      case 'theme': S.settings.theme = { auto: 'light', light: 'dark', dark: 'auto' }[S.settings.theme]; applyTheme(); save(); render(true); break;
      case 'setup': if (t.dataset.id === '*' && !SEL.size) return; setup(t.dataset.mode, t.dataset.id); break;
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
      case 'ddel': d = deck(V.id); ask('Delete "' + d.title + '" and its progress? Export it first if you want to keep a copy.', 'Delete deck', function () { S.decks = S.decks.filter(function (x) { return x.id !== d.id; }); delete S.progress[d.id]; SEL.delete(d.id); save(); go({ name: 'home' }); }); break;
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
    var it = V.cards[V.i], selected = LET[(it.optionOrder || [0, 1, 2, 3])[k]], ok = selected === it.card.answer;
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
      app.querySelectorAll('.deck[data-deck-name]').forEach(function (r) { r.hidden = !!q && r.dataset.deckName.indexOf(q) < 0; if (!r.hidden) visible++; });
      var count = document.getElementById('deck-result-count'), none = document.getElementById('search-empty');
      if (count) count.textContent = visible + ' ' + (visible === 1 ? 'deck' : 'decks');
      if (none) none.classList.toggle('on', visible === 0);
    }
  });
  document.addEventListener('keydown', function (e) {
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
      if (isStudySession(V.name)) { pauseStudySession(); return; }
      if (V.name !== 'home') { go({ name: 'home' }); return; }
      window.CciNative.exitApp().catch(function () {});
    }).catch(function () {});
    window.CciNative.onAppStateChange(function (state) {
      if (!state.isActive && isStudySession(V.name)) pauseStudySession();
    }).catch(function () {});
  }

  function boot() {
    return Promise.all([load(), loadStarterText()]).then(function (results) {
      var text = results[1];
      STARTER_DECKS = P.parseDecks(text).decks;
      var reconcileStarters = S.seeded && S.dataVersion >= DATA_VERSION;
      seed();
      if (reconcileStarters && syncStarterDecks()) save();
      return applyDataMigrations().then(function () {
        if (S.pausedSession) {
          var restoredSession = MobileStudy.restore(S.pausedSession, S.decks);
          S.pausedSession = restoredSession ? MobileStudy.snapshot(restoredSession) : null;
        }
        applyTheme();
        render();
        registerServiceWorker();
        registerNativeNavigation();
      });
    });
  }
  boot();
})();
