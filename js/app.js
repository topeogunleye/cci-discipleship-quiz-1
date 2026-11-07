(function () {
  'use strict';
  var P = window.DeckParser, StudyLogic = window.StudyLogic, Storage = window.StudyStorage, MobileStudy = window.MobileStudy, ProgressSync = window.CCIProgressSync, Account = window.CCIAccount, TranscriptTools = window.CCITranscripts, LET = P.LETTERS, KEY = 'flashdecks.v1', DATA_VERSION = 14;
  var app = document.getElementById('app'), modal = document.getElementById('modal'), toastEl = document.getElementById('toast');
  function defaultStudyState() { return { decks: [], progress: {}, settings: { theme: 'auto', shuffle: false, showStreak: true, showDraftDevotionals: false }, onboarding: { completed: false, goal: 'habit', dailyMinutes: 10, startingTopic: 'soteriology', preferredTime: 'anytime', committed: false }, streak: { lastStreakDate: null }, devotions: { read: {}, saved: {}, carouselHiddenOn: null }, completedToday: {}, cloudSyncDeviceId: null, seeded: false, dataVersion: 0, pausedSession: null }; }
  var S = defaultStudyState();
  var STARTER_DECKS = [], DEVOTIONALS = [], LESSON_VIDEOS = [];
  var activeBiblePreview = null, biblePreviewCloseTimer = null, biblePreviewSequence = 0, biblePreviewRequestSequence = 0, biblePreviewRequest = null, biblePreviewCache = null, suppressBiblePreviewFocus = null;
  var storageOk = true, storageMessage = '', storageBackend = 'loading', preserveStorage = false, saveQueue = Promise.resolve(), activeStorageOwnerId = null, requestedStorageOwnerId = null, guestProgressForImport = null, account = Account ? Account.create() : null, accountStatus = { configured: false, user: null, videoReady: false, videoSessionVersion: 0 }, accountBootReady = false, accountMessage = '', accountEmailDraft = '', accountBusy = false, accountSwitchQueue = Promise.resolve(), cloudSyncQueue = Promise.resolve(), cloudSyncTimer = null, lessonTranscriptCache = Object.create(null), lessonTranscriptRequests = Object.create(null), lastVideoSessionVersion = 0, V = { name: 'home' }, SEL = new Set(), pendingAsk = null, returnFocus = null, homeFilter = '', examTimer = null, waitingWorker = null, updateAvailable = false, updateDeferred = false, updateApplying = false, reloadForUpdate = false, rocketMenuOpen = false, IMP = { decks: [], errors: [], warnings: [], text: '', parsed: false, backup: null };
  var quizFeedbackDrag = null, quizFeedbackIgnoreClick = false;
  var browserLocalStorage = null, browserIndexedDB = null, animateRouteChange = false;
  var lessonTranscriptGeneration = 0;
  try { browserLocalStorage = window.localStorage; } catch (e) {}
  if (!browserLocalStorage) { try { if (typeof localStorage !== 'undefined') browserLocalStorage = localStorage; } catch (e) {} }
  try { browserIndexedDB = window.indexedDB; } catch (e) {}
  var storageAdapter = Storage.createStorage({ indexedDB: browserIndexedDB, localStorage: browserLocalStorage, legacyKey: KEY });

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var linkify = function (s) { return esc(s).replace(/https?:\/\/[^\s)]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; }); };
  var renderBible = function (value) {
    function renderCitation(citation) {
      var reference = citation.replace(/\s+(?:\(https?:\/\/[^)]+\)|<https?:\/\/[^>]+>)\s*$/, '').trim();
      if (!reference) return '';
      var path = encodeURIComponent(reference).replace(/%20/g, '+');
      var url = 'https://www.esv.org/verses/' + path + '/';
      var previewId = 'bible-reference-preview-' + (++biblePreviewSequence);
      var titleId = previewId + '-title';
      var messageId = previewId + '-message';
      return '<span class="bible-reference-wrap">' +
        '<a class="bible-reference-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-bible-reference-link="true" aria-haspopup="dialog" aria-controls="' + previewId + '" aria-describedby="' + messageId + '" aria-expanded="false">' + esc(reference) + '</a>' +
        '<span class="bible-reference-preview" id="' + previewId + '" role="dialog" aria-labelledby="' + titleId + '">' +
          '<span class="bible-preview-heading"><strong id="' + titleId + '">' + esc(reference) + '</strong><span class="bible-preview-version">ESV</span><button class="bible-preview-close" type="button" data-bible-preview-close aria-label="Close Bible passage preview">×</button></span>' +
          '<span class="bible-preview-text" hidden></span>' +
          '<span class="bible-preview-fallback" id="' + messageId + '">Verse text isn’t available in this preview. Open the ESV passage to read it.</span>' +
          '<a class="btn sm primary bible-preview-open" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open passage on ESV.org</a>' +
        '</span>' +
      '</span>';
    }
    return String(value).split(/\s+\|\s+/).map(function (segment) {
      var labeled = /^(Confirmed in lesson and deck|Also cited in lesson segment|Added from online research):\s*(.*)$/.exec(segment);
      var label = labeled ? labeled[1] + ': ' : '', citations = (labeled ? labeled[2] : segment).split(/;\s*/);
      return esc(label) + citations.map(renderCitation).join('; ');
    }).join(' | ');
  };
  var bibleNote = function (c) { return c && c.bible ? '<p class="card-note card-ref card-bible"><strong>Bible References:</strong> ' + renderBible(c.bible) + '</p>' : ''; };
  function positionBiblePreview(link, preview) {
    if (!link || !preview) return;
    var anchor = link.getBoundingClientRect(), margin = 12, gap = 8;
    var visual = window.visualViewport;
    var leftEdge = visual ? visual.offsetLeft : 0;
    var topEdge = visual ? visual.offsetTop : 0;
    var viewportWidth = visual ? visual.width : document.documentElement.clientWidth;
    var viewportHeight = visual ? visual.height : window.innerHeight;
    var rightEdge = leftEdge + viewportWidth, bottomEdge = topEdge + viewportHeight;
    var maxWidth = Math.max(200, viewportWidth - margin * 2);
    preview.style.width = Math.min(340, maxWidth) + 'px';
    preview.style.maxHeight = Math.max(120, viewportHeight - margin * 2) + 'px';
    preview.style.overflowY = 'auto';
    preview.style.left = (leftEdge + margin) + 'px';
    preview.style.top = (topEdge + margin) + 'px';
    var panel = preview.getBoundingClientRect();
    var minLeft = leftEdge + margin, maxLeft = Math.max(minLeft, rightEdge - panel.width - margin);
    var minTop = topEdge + margin, maxTop = Math.max(minTop, bottomEdge - panel.height - margin);
    var leftOfAnchor = Math.max(minLeft, Math.min(anchor.left, maxLeft));
    var centeredTop = Math.max(minTop, Math.min(anchor.top + (anchor.height - panel.height) / 2, maxTop));
    var candidates = [
      { left: leftOfAnchor, top: anchor.bottom + gap },
      { left: leftOfAnchor, top: anchor.top - panel.height - gap },
      { left: anchor.right + gap, top: centeredTop },
      { left: anchor.left - panel.width - gap, top: centeredTop }
    ];
    var controls = Array.prototype.slice.call(document.querySelectorAll('.btn-continue, .study-navigation, .flash-rating')).filter(function (control) {
      if (preview.contains(control) || control.disabled) return false;
      var rect = control.getBoundingClientRect(), style = window.getComputedStyle(control);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    var best = null, bestOverlap = Infinity;
    candidates.forEach(function (candidate) {
      var left = Math.max(minLeft, Math.min(candidate.left, maxLeft));
      var top = Math.max(minTop, Math.min(candidate.top, maxTop));
      var overlap = 0;
      controls.forEach(function (control) {
        var rect = control.getBoundingClientRect();
        var width = Math.max(0, Math.min(left + panel.width, rect.right) - Math.max(left, rect.left));
        var height = Math.max(0, Math.min(top + panel.height, rect.bottom) - Math.max(top, rect.top));
        overlap += width * height;
      });
      if (overlap < bestOverlap) { best = { left: left, top: top }; bestOverlap = overlap; }
    });
    preview.style.left = (best ? best.left : leftOfAnchor) + 'px';
    preview.style.top = (best ? best.top : centeredTop) + 'px';
  }
  function updateBiblePreviewText(preview, text, fallbackMessage) {
    if (!preview) return;
    var passage = preview.querySelector('.bible-preview-text'), fallback = preview.querySelector('.bible-preview-fallback');
    if (text) {
      passage.textContent = text;
      passage.hidden = false;
      fallback.hidden = true;
    } else {
      passage.textContent = '';
      passage.hidden = true;
      fallback.textContent = fallbackMessage || 'Verse text isn’t available in this preview. Open the ESV passage to read it.';
      fallback.hidden = false;
    }
  }
  function loadBiblePreviewText(link, preview) {
    var reference = link.textContent.trim();
    if (!reference || !activeBiblePreview || activeBiblePreview.link !== link) return;
    if (biblePreviewCache && biblePreviewCache.reference === reference) {
      updateBiblePreviewText(preview, biblePreviewCache.text);
      return;
    }
    if (biblePreviewRequest && biblePreviewRequest.preview === preview) return;
    if (biblePreviewRequest) {
      biblePreviewRequest.controller.abort();
      biblePreviewRequest = null;
    }
    updateBiblePreviewText(preview, '', 'Loading ESV passage…');
    var controller = new AbortController();
    var request = { id: ++biblePreviewRequestSequence, controller: controller, link: link, preview: preview };
    biblePreviewRequest = request;
    var timeout = window.setTimeout(function () { controller.abort(); }, 8000);
    var apiBase = account ? account.apiBase : (window.CCI_API_BASE || (Account && Account.DEFAULT_API_BASE) || '');
    fetch(apiBase + '/api/esv-passage?q=' + encodeURIComponent(reference), {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw new Error('Passage service unavailable');
      return response.json();
    }).then(function (result) {
      if (biblePreviewRequest !== request || !activeBiblePreview || activeBiblePreview.link !== link) return;
      var text = result && typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) throw new Error('Passage text unavailable');
      biblePreviewCache = { reference: reference, text: text };
      updateBiblePreviewText(preview, text);
      positionBiblePreview(link, preview);
    }).catch(function () {
      if (controller.signal.aborted || biblePreviewRequest !== request) return;
      updateBiblePreviewText(preview, '', 'Verse text isn’t available in this preview. Open the ESV passage to read it.');
      positionBiblePreview(link, preview);
    }).finally(function () {
      window.clearTimeout(timeout);
      if (biblePreviewRequest === request) biblePreviewRequest = null;
    });
  }
  function closeBiblePreview(restoreFocus) {
    if (biblePreviewCloseTimer) { window.clearTimeout(biblePreviewCloseTimer); biblePreviewCloseTimer = null; }
    if (!activeBiblePreview) return false;
    var current = activeBiblePreview;
    if (biblePreviewRequest && biblePreviewRequest.preview === current.preview) {
      biblePreviewRequest.controller.abort();
      biblePreviewRequest = null;
    }
    current.wrapper.classList.remove('is-open', 'is-pinned');
    current.preview.classList.remove('is-open');
    current.link.setAttribute('aria-expanded', 'false');
    if (current.originalParent && current.link.isConnected && current.wrapper.contains(current.link)) {
      if (current.originalNextSibling && current.originalNextSibling.parentNode === current.originalParent) current.originalParent.insertBefore(current.preview, current.originalNextSibling);
      else current.originalParent.appendChild(current.preview);
    } else if (current.preview.parentNode) {
      current.preview.parentNode.removeChild(current.preview);
    }
    activeBiblePreview = null;
    if (restoreFocus && current.link.isConnected) {
      suppressBiblePreviewFocus = current.link;
      current.link.focus();
      window.setTimeout(function () { if (suppressBiblePreviewFocus === current.link) suppressBiblePreviewFocus = null; }, 0);
    }
    return true;
  }
  function isWithinActiveBiblePreview(target) {
    return !!(activeBiblePreview && target && (activeBiblePreview.wrapper.contains(target) || activeBiblePreview.preview.contains(target)));
  }
  function repositionActiveBiblePreview() {
    if (!activeBiblePreview) return;
    if (!activeBiblePreview.link.isConnected) { closeBiblePreview(false); return; }
    var rect = activeBiblePreview.link.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { closeBiblePreview(false); return; }
    positionBiblePreview(activeBiblePreview.link, activeBiblePreview.preview);
  }
  function openBiblePreview(link, pinned) {
    var wrapper = link && link.closest('.bible-reference-wrap'), previewId = link && link.getAttribute('aria-controls');
    var preview = previewId && document.getElementById(previewId);
    if (!wrapper || !preview) return;
    if (biblePreviewCloseTimer) { window.clearTimeout(biblePreviewCloseTimer); biblePreviewCloseTimer = null; }
    if (activeBiblePreview && activeBiblePreview.link !== link) closeBiblePreview(false);
    if (activeBiblePreview && activeBiblePreview.link === link) {
      if (pinned) { activeBiblePreview.pinned = true; wrapper.classList.add('is-pinned'); }
    } else {
      activeBiblePreview = {
        link: link,
        wrapper: wrapper,
        preview: preview,
        originalParent: preview.parentNode,
        originalNextSibling: preview.nextSibling,
        pinned: !!pinned
      };
      document.body.appendChild(preview);
    }
    wrapper.classList.add('is-open');
    preview.classList.add('is-open');
    if (pinned) wrapper.classList.add('is-pinned');
    link.setAttribute('aria-expanded', 'true');
    positionBiblePreview(link, preview);
    loadBiblePreviewText(link, preview);
  }
  function scheduleBiblePreviewClose() {
    if (!activeBiblePreview || activeBiblePreview.pinned) return;
    if (biblePreviewCloseTimer) window.clearTimeout(biblePreviewCloseTimer);
    biblePreviewCloseTimer = window.setTimeout(function () {
      biblePreviewCloseTimer = null;
      if (!activeBiblePreview || activeBiblePreview.pinned) return;
      if (isWithinActiveBiblePreview(document.activeElement)) return;
      closeBiblePreview(false);
    }, 180);
  }
  function isTouchLayout() {
    return !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }
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
  function dueReviewItems(items, now) {
    var scheduled = items.filter(function (item) {
      var record = item && item.record;
      return record === 'known' || record === 'unknown' || (record && typeof record === 'object' && !Array.isArray(record));
    });
    return StudyLogic.dueItems(scheduled, now);
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
  function loadStarterFallbackScript() {
    return new Promise(function (resolve) {
      if (typeof window !== 'undefined' && window.CCI_STARTER_DECKS) return resolve(window.CCI_STARTER_DECKS);
      if (typeof document === 'undefined' || !document.createElement || !document.head) return resolve('');
      var s = document.createElement('script');
      s.src = 'decks/starter-decks.js';
      s.onload = function () { resolve((typeof window !== 'undefined' && window.CCI_STARTER_DECKS) || ''); };
      s.onerror = function () { resolve(''); };
      document.head.appendChild(s);
    });
  }
  function loadStarterText() {
    var fallback = inlineStarterText() || (typeof window !== 'undefined' && window.CCI_STARTER_DECKS) || '';
    if (!window.location || window.location.protocol === 'file:' || typeof window.fetch !== 'function') return fallback ? Promise.resolve(fallback) : loadStarterFallbackScript();

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
    }).then(function (texts) { return texts.join('\n\n'); }).catch(function () { return fallback ? fallback : loadStarterFallbackScript(); });
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

  function inlineLessonVideosData() {
    var el = document.getElementById('lesson-videos-fallback');
    if (!el) return { schemaVersion: 1, videos: [] };
    try { return JSON.parse(el.textContent || '{"schemaVersion":1,"videos":[]}'); } catch (e) { return { schemaVersion: 1, videos: [] }; }
  }
  function inlineLessonTranscriptsData() {
    var el = document.getElementById('lesson-transcripts-fallback');
    if (!el) return { schemaVersion: 1, transcripts: [] };
    try { return JSON.parse(el.textContent || '{"schemaVersion":1,"transcripts":[]}'); } catch (e) { return { schemaVersion: 1, transcripts: [] }; }
  }
  function normalizeLessonVideos(data, transcriptData) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.videos)) return [];
    var transcriptFiles = Object.create(null);
    if (transcriptData && transcriptData.schemaVersion === 1 && Array.isArray(transcriptData.transcripts)) {
      transcriptData.transcripts.forEach(function (item) {
        if (item && /^[a-zA-Z0-9._-]{1,120}$/.test(item.videoId || '') && typeof item.file === 'string' && /^[a-zA-Z0-9._-]{1,240}\.srt$/i.test(item.file)) {
          transcriptFiles[item.videoId] = item.file.replace(/\.srt$/i, '.vtt');
        }
      });
    }
    function mediaUrl(value) {
      if (typeof value !== 'string' || !value.trim()) return '';
      try {
        var parsed = new URL(value.trim(), window.location && window.location.href || 'http://localhost/');
        if (parsed.protocol !== 'https:' && !(window.location && parsed.origin === window.location.origin && parsed.protocol === 'http:')) return '';
        return value.trim();
      } catch (e) { return ''; }
    }
    return data.videos.filter(function (item) {
      return item && /^[a-zA-Z0-9._-]{1,120}$/.test(item.id || '') && /^d-[a-z0-9-]{1,120}$/.test(item.deckId || '') && typeof item.title === 'string';
    }).map(function (item) {
      var objectKey = typeof item.objectKey === 'string' && item.objectKey.length <= 1024 && !item.objectKey.startsWith('/') && item.objectKey.split('/').every(function (part) { return part && part !== '.' && part !== '..'; }) && /\.mp4$/i.test(item.objectKey) ? item.objectKey : '';
      var apiBase = account ? account.apiBase : (window.CCI_API_BASE || (Account && Account.DEFAULT_API_BASE) || '');
      var mappedTranscript = transcriptFiles[item.id] ? apiBase + '/transcript/' + encodeURIComponent(transcriptFiles[item.id]) : '';
      var captionsUrl = mediaUrl(item.captionsUrl) || mappedTranscript;
      return {
        id: item.id,
        deckId: item.deckId,
        title: item.title.trim(),
        videoUrl: objectKey ? apiBase + '/api/videos?key=' + encodeURIComponent(objectKey) : '',
        objectKey: objectKey,
        posterUrl: mediaUrl(item.posterUrl),
        captionsUrl: captionsUrl,
        transcriptUrl: mediaUrl(item.transcriptUrl) || captionsUrl,
        captionsLanguage: typeof item.captionsLanguage === 'string' && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(item.captionsLanguage) ? item.captionsLanguage : (transcriptData && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(transcriptData.language || '') ? transcriptData.language : 'en'),
        captionsLabel: typeof item.captionsLabel === 'string' && item.captionsLabel.trim() ? item.captionsLabel.trim() : 'English'
      };
    }).filter(function (item) { return !!item.objectKey && !!item.videoUrl; });
  }
  function loadLessonVideos() {
    var fallback = inlineLessonVideosData(), transcriptFallback = inlineLessonTranscriptsData();
    if (!window.location || window.location.protocol === 'file:' || typeof window.fetch !== 'function') return Promise.resolve(normalizeLessonVideos(fallback, transcriptFallback));
    var videosRequest = window.fetch('content/lesson-videos.json').then(function (response) {
      if (!response.ok) throw new Error('Could not load lesson videos');
      return response.json();
    }).catch(function () { return fallback; });
    var transcriptsRequest = window.fetch('content/lesson-transcripts.json').then(function (response) {
      if (!response.ok) throw new Error('Could not load lesson transcripts');
      return response.json();
    }).catch(function () { return transcriptFallback; });
    return Promise.all([videosRequest, transcriptsRequest]).then(function (results) {
      var data = results[0], transcripts = results[1], normalized = normalizeLessonVideos(data, transcripts);
      return normalized.length || (data && Array.isArray(data.videos) && data.videos.length === 0) ? normalized : normalizeLessonVideos(fallback, transcriptFallback);
    }).catch(function () { return normalizeLessonVideos(fallback, transcriptFallback); });
  }
  function lessonVideosForDeck(deckId) {
    return LESSON_VIDEOS.filter(function (item) {
      return item.deckId === deckId || (deckId && item.deckId && (item.deckId.indexOf(deckId) === 0 || deckId.indexOf(item.deckId) === 0));
    });
  }
  function cardMatchesVideo(card, video) {
    if (!card || !video || !card.ref) return false;
    var normTitle = String(video.title).toLowerCase().replace(/[^a-z0-9]/g, '');
    var normId = String(video.id).replace(/^section-\d+-/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

    var refPrefix = card.ref.split(/[—–\[\(\-]/)[0].trim();
    var normRefPrefix = refPrefix.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (normRefPrefix && (normRefPrefix === normTitle || normRefPrefix === normId)) return true;

    var titleParts = video.title.trim().split(/\s+/);
    var lastWord = titleParts[titleParts.length - 1].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (/^[IVXLCDM]+$/.test(lastWord)) {
      var baseTitle = titleParts.slice(0, -1).join(' ').replace(/[^a-zA-Z0-9]/g, '');
      var romanRegex = new RegExp('\\b' + baseTitle.split('').join('[^a-zA-Z0-9]*') + '[^a-zA-Z0-9]+' + lastWord + '\\b', 'i');
      if (romanRegex.test(card.ref)) return true;
    }

    if (/^\d+$/.test(lastWord)) {
      var baseTitleNum = titleParts.slice(0, -1).join(' ').replace(/[^a-zA-Z0-9]/g, '');
      var numRegex = new RegExp('\\b' + baseTitleNum.split('').join('[^a-zA-Z0-9]*') + '[^a-zA-Z0-9]+' + lastWord + '\\b', 'i');
      if (numRegex.test(card.ref)) return true;
    }

    var cleanTitle = video.title.replace(/[^a-zA-Z0-9]/g, '');
    var boundaryRegex = new RegExp('\\b' + cleanTitle.split('').join('[^a-zA-Z0-9]*') + '\\b', 'i');
    return boundaryRegex.test(card.ref);
  }
  function cardsForVideo(deckItem, video) {
    if (!deckItem || !video || !Array.isArray(deckItem.cards)) return [];
    return deckItem.cards.filter(function (card) { return cardMatchesVideo(card, video); });
  }
  function nativeTicketUrl(value, ticket) {
    if (!value || !ticket || !account || !account.apiBase) return '';
    try {
      var url = new URL(value, account.apiBase + '/');
      var api = new URL(account.apiBase);
      if (url.origin !== api.origin || (url.pathname !== '/api/videos' && !/^\/transcript\/[A-Za-z0-9._-]+\.vtt$/i.test(url.pathname))) return '';
      url.searchParams.set('ticket', ticket);
      return url.toString();
    } catch (e) { return ''; }
  }
  function refreshNativeVideoTicket(force) {
    if (!account || !window.CciNative || !window.CciNative.isNative || V.name !== 'lesson-video' || !accountStatus.user || !accountStatus.videoReady || typeof account.preparePlaybackTicket !== 'function') return;
    var video = lessonVideosForDeck(V.id)[Number.isInteger(V.videoIndex) ? V.videoIndex : 0];
    if (!video) return;
    account.preparePlaybackTicket(video.id, !!force).then(function (ticket) {
      if (!ticket || V.name !== 'lesson-video' || V.id !== video.deckId || lessonVideosForDeck(V.id)[V.videoIndex] !== video) return;
      var player = document.getElementById('lesson-video-player');
      if (!player) { render(true); return; }
      var videoUrl = nativeTicketUrl(video.videoUrl, ticket);
      var captionsUrl = nativeTicketUrl(video.captionsUrl, ticket);
      if (!videoUrl) return;
      var source = player.querySelector('source');
      if (!source || source.src === videoUrl) return;
      var currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
      var wasPlaying = !player.paused && !player.ended;
      var restored = false;
      var restorePlayback = function () {
        if (restored) return;
        restored = true;
        try { player.currentTime = Math.min(currentTime, Number.isFinite(player.duration) ? player.duration : currentTime); } catch (e) {}
        if (wasPlaying) {
          var playbackAttempt = player.play();
          if (playbackAttempt && playbackAttempt.catch) playbackAttempt.catch(function () {});
        }
      };
      source.src = videoUrl;
      var track = player.querySelector('track');
      if (track && captionsUrl) track.src = captionsUrl;
      var transcript = app.querySelector('.lesson-transcript');
      if (transcript && captionsUrl) {
        transcript.dataset.transcriptUrl = captionsUrl;
        transcript.dataset.loaded = 'false';
        var cues = transcript.querySelector('.lesson-transcript-cues');
        if (cues) { cues.replaceChildren(); cues.hidden = true; }
        var status = transcript.querySelector('.lesson-transcript-status');
        if (status) status.textContent = 'Open to load transcript segments.';
      }
      player.addEventListener('loadedmetadata', restorePlayback, { once: true });
      player.load();
      if (player.readyState >= 1) restorePlayback();
    }).catch(function () {});
  }
  function loadLessonTranscript(url) {
    if (lessonTranscriptCache[url]) return Promise.resolve(lessonTranscriptCache[url]);
    if (lessonTranscriptRequests[url]) return lessonTranscriptRequests[url];
    if (!TranscriptTools || typeof TranscriptTools.parseWebVtt !== 'function') return Promise.reject(new Error('Transcript support is unavailable.'));
    var generation = lessonTranscriptGeneration;
    lessonTranscriptRequests[url] = window.fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Transcript could not be loaded.');
      return response.text();
    }).then(function (text) {
      if (generation !== lessonTranscriptGeneration) throw new Error('The account changed. Reopen the transcript after signing in.');
      var cues = TranscriptTools.parseWebVtt(text);
      lessonTranscriptCache[url] = cues;
      delete lessonTranscriptRequests[url];
      return cues;
    }).catch(function (error) {
      if (generation === lessonTranscriptGeneration) delete lessonTranscriptRequests[url];
      throw error;
    });
    return lessonTranscriptRequests[url];
  }
  function clearLessonTranscriptCache() {
    lessonTranscriptGeneration++;
    lessonTranscriptCache = Object.create(null);
    lessonTranscriptRequests = Object.create(null);
  }
  function updateLessonTranscript(details, cues, query) {
    var list = details.querySelector('.lesson-transcript-cues'), status = details.querySelector('.lesson-transcript-status');
    if (!list || !status) return;
    var normalizedQuery = String(query || '').trim().toLowerCase();
    var visible = cues.filter(function (cue) { return !normalizedQuery || cue.text.toLowerCase().indexOf(normalizedQuery) >= 0; });
    list.innerHTML = visible.map(function (cue) {
      var time = cue.startText.slice(0, 8);
      return '<li><button type="button" class="lesson-transcript-cue" data-act="lesson-transcript-seek" data-time="' + (cue.start / 1000) + '" aria-label="Jump to ' + esc(time) + ': ' + esc(cue.text.replace(/\s+/g, ' ')) + '"><time>' + esc(time) + '</time><span>' + esc(cue.text.replace(/\s+/g, ' ')) + '</span></button></li>';
    }).join('');
    list.hidden = visible.length === 0;
    status.textContent = visible.length
      ? (normalizedQuery ? 'Showing ' + visible.length + ' matching transcript ' + (visible.length === 1 ? 'segment.' : 'segments.') : 'Showing all ' + visible.length + ' transcript segments.')
      : 'No transcript segments match that search.';
  }

  function returnToLessonVideo() {
    var frame = document.querySelector('.lesson-video-frame');
    var title = document.getElementById('lesson-video-title');
    var target = frame || title;
    if (!target) return;
    var nextTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 12);
    window.scrollTo(window.scrollX, nextTop);
    if (title) title.focus({ preventScroll: true });
  }

  /* ---------- storage ---------- */
  function loadSavedState(raw) {
    S = defaultStudyState();
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
      delete S.settings.showDraftSermons;
      delete S.settings.experience;
      var hasPriorData = !!o.seeded || (Array.isArray(o.decks) && o.decks.length > 0);
      S.onboarding = MobileStudy.normalizeOnboarding(o.onboarding, hasPriorData);
      S.streak = MobileStudy.normalizeStreak(o.streak);
      S.devotions = (o.devotions && typeof o.devotions === 'object' && !Array.isArray(o.devotions)) ? {
        read: (o.devotions.read && typeof o.devotions.read === 'object' && !Array.isArray(o.devotions.read)) ? o.devotions.read : {},
        saved: (o.devotions.saved && typeof o.devotions.saved === 'object' && !Array.isArray(o.devotions.saved)) ? o.devotions.saved : {},
        carouselHiddenOn: typeof o.devotions.carouselHiddenOn === 'string' ? o.devotions.carouselHiddenOn : null
      } : { read: {}, saved: {}, carouselHiddenOn: null };
      S.completedToday = (o.completedToday && typeof o.completedToday === 'object' && !Array.isArray(o.completedToday)) ? o.completedToday : {};
      S.cloudSyncDeviceId = typeof o.cloudSyncDeviceId === 'string' && /^[a-zA-Z0-9._-]{16,120}$/.test(o.cloudSyncDeviceId) ? o.cloudSyncDeviceId : null;
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
    return storageAdapter.load(activeStorageOwnerId).then(function (result) {
      storageOk = result.ok;
      storageBackend = result.backend;
      storageMessage = result.notice || '';
      loadSavedState(result.raw);
    }).catch(function () {
      storageOk = false; storageBackend = 'unavailable';
      storageMessage = 'Study data could not be loaded. Export a backup before continuing.';
    });
  }
  function save(skipCloudSchedule) {
    if (preserveStorage) return Promise.resolve({ ok: false, backend: storageBackend, notice: storageMessage });
    var raw = JSON.stringify(S), owner = activeStorageOwnerId;
    saveQueue = saveQueue.catch(function () {}).then(function () { return storageAdapter.save(raw, owner); }).then(function (result) {
      applyStorageResult(result);
      if (!skipCloudSchedule && owner && accountStatus.user && accountStatus.user.id === owner && !preserveStorage) scheduleCloudProgressSync();
      return result;
    }).catch(function () {
      var result = { ok: false, backend: 'unavailable', notice: 'Study data could not be saved. Export a backup before closing this page.' };
      applyStorageResult(result);
      return result;
    });
    return saveQueue;
  }
  function progressSnapshot(state) {
    state = state || S;
    var currentDeckIds = new Set((state.decks || []).map(function (item) { return item.id; }));
    var starterIds = STARTER_DECKS.map(function (item) { return 'd-' + slug(item.title); }).filter(function (id) { return currentDeckIds.has(id); });
    return ProgressSync ? ProgressSync.extract(state, starterIds) : null;
  }
  var lastCloudSyncTime = 0;
  var MIN_STUDY_SYNC_INTERVAL_MS = 15000;
  var IDLE_SYNC_DELAY_MS = 1500;
  function isInteractiveStudyActive() {
    return V && (V.name === 'quiz' || V.name === 'flash' || (V.name === 'lesson-video' && !!V.videoStudy));
  }
  function scheduleCloudProgressSync(immediate) {
    if (!account || !accountStatus.user || !navigator.onLine || preserveStorage) return;
    if (immediate) {
      if (cloudSyncTimer) { window.clearTimeout(cloudSyncTimer); cloudSyncTimer = null; }
      syncCloudProgress();
      return;
    }
    if (cloudSyncTimer) window.clearTimeout(cloudSyncTimer);
    var delay = IDLE_SYNC_DELAY_MS;
    if (isInteractiveStudyActive()) {
      var elapsed = Date.now() - lastCloudSyncTime;
      delay = Math.max(IDLE_SYNC_DELAY_MS, MIN_STUDY_SYNC_INTERVAL_MS - elapsed);
    }
    cloudSyncTimer = window.setTimeout(function () { cloudSyncTimer = null; syncCloudProgress(); }, delay);
  }
  function syncCloudProgress(importSnapshot) {
    if (!account || !accountStatus.user || !ProgressSync) return Promise.resolve(false);
    if (!navigator.onLine) { accountMessage = 'You are offline. Progress is saved on this device and will sync when you reconnect.'; if (V.name === 'settings') render(true); return Promise.resolve(false); }
    if (cloudSyncTimer) { window.clearTimeout(cloudSyncTimer); cloudSyncTimer = null; }
    var owner = accountStatus.user.id, current = null;
    lastCloudSyncTime = Date.now();
    accountMessage = 'Syncing study progress…';
    if (V.name === 'settings') render(true);
    cloudSyncQueue = cloudSyncQueue.catch(function () {}).then(function () {
      if (!accountStatus.user || accountStatus.user.id !== owner) return false;
      current = progressSnapshot();
      return account.syncProgress(current, ProgressSync, importSnapshot || null, S.cloudSyncDeviceId);
    }).then(function (result) {
      if (!result || !accountStatus.user || accountStatus.user.id !== owner) return false;
      var currentDeckIds = new Set(S.decks.map(function (item) { return item.id; }));
      var starterIds = STARTER_DECKS.map(function (item) { return 'd-' + slug(item.title); }).filter(function (id) { return currentDeckIds.has(id); });
      var latest = progressSnapshot(), changedDuringSync = JSON.stringify(latest) !== JSON.stringify(current);
      var mergedSnapshot = changedDuringSync ? ProgressSync.merge(current, latest, result.snapshot) : result.snapshot;
      S = ProgressSync.apply(S, mergedSnapshot, starterIds);
      S.cloudSyncDeviceId = result.deviceId || S.cloudSyncDeviceId || null;
      accountMessage = result.checkpointSaved === false
        ? 'Progress synced, but this device could not save its sync checkpoint. Local progress is preserved; reconnect to storage before syncing again.'
        : 'Progress synced. Your study data is also saved on this device.';
      if (importSnapshot) guestProgressForImport = null;
      save(true);
      // Background sync must not replace the playing video or its caption/transcript state.
      if (V.name !== 'lesson-video' || !accountStatus.videoReady || !document.getElementById('lesson-video-player')) render(true);
      if (changedDuringSync) scheduleCloudProgressSync();
      return true;
    }).catch(function (error) {
      accountMessage = navigator.onLine ? (error && error.message || 'Progress could not sync. Your local progress is safe; try again.') : 'You are offline. Progress is saved on this device and will sync when you reconnect.';
      if (V.name === 'settings') render(true);
      return false;
    });
    return cloudSyncQueue;
  }
  function switchStorageOwner(owner) {
    owner = typeof owner === 'string' && owner ? owner : null;
    if (owner === requestedStorageOwnerId) return accountSwitchQueue;
    clearLessonTranscriptCache();
    requestedStorageOwnerId = owner;
    accountSwitchQueue = accountSwitchQueue.catch(function () {}).then(function () {
      if (owner === activeStorageOwnerId) return;
      return saveQueue.catch(function () {}).then(function () {
        if (!activeStorageOwnerId && owner) {
          var guest = progressSnapshot();
          guestProgressForImport = ProgressSync && ProgressSync.hasProgress(guest) ? guest : null;
        }
        activeStorageOwnerId = owner;
        preserveStorage = false;
        loadSavedState(null);
        return storageAdapter.load(owner).then(function (result) {
          storageOk = result.ok; storageBackend = result.backend; storageMessage = result.notice || '';
          loadSavedState(result.raw);
          seed();
          var reconcile = S.seeded && S.dataVersion >= DATA_VERSION - 3;
          if (reconcile && syncStarterDecks()) save();
          return applyDataMigrations().then(function () {
            if (S.pausedSession) {
              var restoredSession = MobileStudy.restore(S.pausedSession, S.decks);
              S.pausedSession = restoredSession ? MobileStudy.snapshot(restoredSession) : null;
            }
            applyTheme();
          });
        });
      });
    }).then(function () {
      if (owner && accountStatus.user && accountStatus.user.id === owner) {
        save();
        syncCloudProgress();
      } else if (!owner) {
        guestProgressForImport = null;
        save();
      }
      render(true);
    }).catch(function (error) {
      accountMessage = 'This device’s saved study data could not be opened. It has been left untouched.';
      if (typeof console !== 'undefined' && console.error) console.error('Account storage switch failed:', error);
      render(true);
    });
    return accountSwitchQueue;
  }
  function initializeAccount() {
    if (!account) return Promise.resolve(accountStatus);
    return account.init(function (status) {
      var hadVideoAccess = !!(accountStatus.user && accountStatus.videoReady);
      var priorUserId = accountStatus.user && accountStatus.user.id;
      var sessionRefreshed = Number(status.videoSessionVersion) > lastVideoSessionVersion;
      lastVideoSessionVersion = Number(status.videoSessionVersion) || 0;
      accountStatus = status;
      if (!accountBootReady) return;
      // Remove protected media on account changes, but keep an existing player mounted for same-user renewal outcomes.
      var preserveActivePlayer = V.name === 'lesson-video' && priorUserId && status.user && priorUserId === status.user.id && !!document.getElementById('lesson-video-player');
      if (V.name === 'lesson-video' && hadVideoAccess !== !!(status.user && status.videoReady) && !preserveActivePlayer) render(true);
      var nextOwner = status.user && status.user.id || null;
      if (nextOwner !== requestedStorageOwnerId) switchStorageOwner(nextOwner);
      else if (nextOwner && nextOwner === activeStorageOwnerId && status.videoReady && !cloudSyncTimer) scheduleCloudProgressSync();
      else if (V.name === 'settings') render(true);
      if (sessionRefreshed) refreshNativeVideoTicket(true);
    }).catch(function () {});
  }
  var pendingVideoReturnKey = 'cci-pending-video-return';
  function readPendingVideoReturn() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(pendingVideoReturnKey) || 'null');
      if (saved && typeof saved.deckId === 'string' && saved.deckId) return {
        deckId: saved.deckId,
        videoIndex: Number.isInteger(saved.videoIndex) && saved.videoIndex >= 0 ? saved.videoIndex : 0,
        videoId: typeof saved.videoId === 'string' ? saved.videoId : ''
      };
    } catch (e) {}
    return null;
  }
  function savePendingVideoReturn(deckId, videoIndex, videoId) {
    try {
      if (deckId) window.sessionStorage.setItem(pendingVideoReturnKey, JSON.stringify({
        deckId: String(deckId),
        videoIndex: Number.isInteger(videoIndex) && videoIndex >= 0 ? videoIndex : 0,
        videoId: typeof videoId === 'string' ? videoId : ''
      }));
      else window.sessionStorage.removeItem(pendingVideoReturnKey);
    } catch (e) {}
  }
  function returnToPendingVideo(pending) {
    if (!pending || typeof pending.deckId !== 'string' || !pending.deckId) return false;
    var videos = lessonVideosForDeck(pending.deckId);
    var videoIndex = pending.videoId ? videos.findIndex(function (item) { return item.id === pending.videoId; }) : -1;
    if (videoIndex < 0) videoIndex = Number.isInteger(pending.videoIndex) && pending.videoIndex >= 0 ? pending.videoIndex : 0;
    savePendingVideoReturn(null);
    go({ name: 'lesson-video', id: pending.deckId, videoIndex: videoIndex });
    return true;
  }
  function accountAction(action, form) {
    if (!account) { accountMessage = 'Account support is not available in this app build.'; render(true); return; }
    if (action === 'account-retry') {
      if (accountBusy) return;
      accountBusy = true;
      accountMessage = '';
      render(true);
      account.retry().then(function (status) {
        accountStatus = status;
        accountBusy = false;
        render(true);
      }).catch(function () {
        accountBusy = false;
        accountMessage = 'Account services could not be reached. Check your connection and try again.';
        render(true);
      });
      return;
    }
    if (action === 'account-signup' || action === 'account-signin') {
      if (accountBusy) return;
      var emailInput = form && form.elements.email || document.getElementById('account-email');
      var passwordInput = form && form.elements.password || document.getElementById('account-password');
      var email = emailInput ? emailInput.value.trim() : '', password = passwordInput ? passwordInput.value : '';
      if (!email.trim() || !password) { accountMessage = 'Enter your email and password to continue.'; render(true); return; }
      if (action === 'account-signup' && password.length < 8) {
        if (passwordInput) { passwordInput.setAttribute('aria-invalid', 'true'); passwordInput.focus(); }
        accountMessage = 'Use at least 8 characters for a new password.';
        var shortPasswordStatus = document.getElementById('account-message');
        if (shortPasswordStatus) shortPasswordStatus.textContent = accountMessage;
        return;
      }
      if (passwordInput) passwordInput.removeAttribute('aria-invalid');
      accountEmailDraft = email;
      accountBusy = true;
      accountMessage = action === 'account-signup' ? 'Creating your account…' : 'Signing in…';
      var statusNode = document.getElementById('account-message');
      if (statusNode) statusNode.textContent = accountMessage;
      if (form) {
        form.setAttribute('aria-busy', 'true');
        Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) { input.disabled = true; });
        Array.prototype.forEach.call(form.querySelectorAll('button[type="submit"]'), function (button) {
          if (button.value === action) {
            button.setAttribute('aria-disabled', 'true');
            button.textContent = action === 'account-signup' ? 'Creating account…' : 'Signing in…';
          } else button.disabled = true;
        });
      }
      function finishAccountRequest(message, failed, result) {
        accountBusy = false;
        accountMessage = message;
        var pendingReturn = V.name === 'settings' && V.returnToVideoId
          ? { deckId: V.returnToVideoId, videoIndex: Number.isInteger(V.returnVideoIndex) ? V.returnVideoIndex : 0, videoId: V.returnVideoAssetId || '' }
          : readPendingVideoReturn();
        if (!failed && result && !result.confirmationRequired && pendingReturn) {
          accountEmailDraft = '';
          accountMessage = '';
          if (returnToPendingVideo(pendingReturn)) return;
        }
        render(true);
        if (failed) {
          var retryPassword = document.getElementById('account-password');
          if (retryPassword) retryPassword.focus();
        }
      }
      (action === 'account-signup' ? account.signUp(email, password) : account.signIn(email, password)).then(function (result) {
        if (result.error) finishAccountRequest(result.error, true, result);
        else if (result.confirmationRequired) finishAccountRequest('Check your email for a confirmation link, then return here to sign in.', false, result);
        else finishAccountRequest(result.videoReady ? 'Signed in. Your lesson videos are ready.' : (result.videoAccessError || 'Signed in. Video access is being prepared; local study and progress sync are available.'), false, result);
      }).catch(function () { finishAccountRequest('The account request failed. Check your connection and try again.', true); });
      return;
    }
    if (action === 'account-sync') { syncCloudProgress(); return; }
    if (action === 'account-import') {
      if (!guestProgressForImport || !accountStatus.user) return;
      ask('Merge this device’s study progress into your account? Existing account progress and this device’s progress will be combined. Nothing on this device will be erased.', 'Import and merge', function () {
        var source = guestProgressForImport;
        syncCloudProgress(source).then(function (ok) {
          if (ok) toast('This device’s progress was merged into your account.');
        });
      });
      return;
    }
    if (action === 'account-video-session') {
      accountBusy = true; render(true);
      account.syncVideoSession(accountStatus.session, true).then(function (ready) {
        accountBusy = false; accountStatus = account.status();
        if (ready && V.name === 'settings' && returnToPendingVideo(readPendingVideoReturn())) return;
        accountMessage = ready ? 'Video access is ready.' : (accountStatus.videoAccessError || 'Video access could not be prepared. Try again.'); render(true);
      });
      return;
    }
    if (action === 'account-signout') {
      accountBusy = true; render(true);
      account.signOut().then(function (result) {
        accountBusy = false; accountMessage = result.error || 'Signed out. Guest progress remains on this device.'; render(true);
      }).catch(function () { accountBusy = false; accountMessage = 'Sign out could not be completed. Try again.'; render(true); });
    }
  }
  function accountSettingsSection() {
    var user = accountStatus && accountStatus.user, configured = !!(accountStatus && accountStatus.configured);
    var connectionState = accountStatus && accountStatus.initializationState;
    var connectionMessage = connectionState === 'loading' || accountBusy ? 'Connecting to account services…' : (accountStatus && accountStatus.initializationError || 'Account services are not configured yet. Guest study remains available on this device.');
    var message = accountMessage || (configured ? (user ? 'CCI lesson progress syncs when you are online. Custom decks remain local.' : 'Create an account or sign in to sync CCI lesson progress and watch lesson videos.') : connectionMessage);
    var controls;
    if (!configured) controls = (!accountBusy && connectionState === 'unconfigured' ? '<p class="meta">Account sign-in is not configured for this app deployment. You can keep studying as a guest.</p>' : '') +
      (account && !accountBusy && connectionState !== 'loading' ? '<button type="button" class="btn sm" data-act="account-retry">Retry account connection</button>' : '');
    else if (user) {
      controls = '<p><strong>Signed in as</strong> ' + esc(user.email || 'CCI Study learner') + '</p>' +
        (!accountStatus.videoReady ? '<p class="meta">' + esc(accountStatus.videoAccessError || 'Lesson-video access is not ready on this device yet.') + '</p><button type="button" class="btn sm" data-act="account-video-session"' + (accountBusy ? ' disabled' : '') + '>Prepare video access</button>' : '<p class="meta">Private lesson videos are available to your account.</p>') +
        (guestProgressForImport ? '<div class="note"><strong>CCI lesson progress from this device is available.</strong><p>Import explicitly to merge it with your account. Your guest copy will remain on this device.</p><button type="button" class="btn sm primary" data-act="account-import"' + (accountBusy ? ' disabled' : '') + '>Import this device’s progress</button></div>' : '') +
        '<div class="row"><button type="button" class="btn sm" data-act="account-sync"' + (accountBusy ? ' disabled' : '') + '>Sync now</button><button type="button" class="btn sm ghost" data-act="account-signout"' + (accountBusy ? ' disabled' : '') + '>Sign out</button></div>';
    } else {
      controls = '<form class="account-auth-form" data-account-form aria-describedby="account-guidance account-message">' +
        '<label class="field"><span>Email address</span><input id="account-email" name="email" type="email" autocomplete="username" inputmode="email" required maxlength="254" value="' + esc(accountEmailDraft) + '"></label>' +
        '<label class="field"><span>Password</span><input id="account-password" name="password" type="password" autocomplete="current-password" required maxlength="128" aria-describedby="account-guidance account-message"></label>' +
        '<p class="account-guidance" id="account-guidance">Use at least 8 characters for a new account’s password. Sign in to watch videos, or keep studying as a guest.</p>' +
        '<div class="account-auth-actions"><button type="submit" class="btn primary" name="account-action" value="account-signin">Sign in</button><button type="submit" class="btn" name="account-action" value="account-signup">Create account</button></div>' +
      '</form>';
    }
    return '<div class="settings-group account-settings-group"><h2 class="settings-group-title">Account &amp; Sync</h2>' +
      '<p class="meta">A free account syncs CCI lesson progress across devices. Custom decks remain local, and you can keep studying without an account.</p>' + controls +
      '<p class="account-message meta" id="account-message" role="status" aria-live="polite">' + esc(message) + '</p></div>';
  }
  function isStudySession(name) { return name === 'flash' || name === 'quiz' || name === 'exam'; }
  function saveActiveSession() {
    if (V.videoStudy) {
      S.pausedSession = MobileStudy.snapshot(V.videoStudy);
      return save();
    }
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
      var previous = Object.create(null), next = [], deckChanged = false, reviewSetChanged = false;
      saved.cards.forEach(function (card) { previous[card.id] = card; });
      if (/predestination.*trinity/i.test(source.title)) {
        var formerWorkersId = id + '.q71', currentWorkersId = id + '.q72';
        var formerWorkers = previous[formerWorkersId];
        var currentWorkers = source.questions.filter(function (question) { return question.id === 'q72'; })[0];
        if (formerWorkers && !previous[currentWorkersId] && currentWorkers &&
            /workers hired at the eleventh hour/i.test(formerWorkers.question) &&
            /workers hired at the eleventh hour/i.test(currentWorkers.question)) {
          var topicProgress = S.progress[id];
          if (topicProgress && topicProgress.cards && topicProgress.cards[formerWorkersId] !== undefined) {
            topicProgress.cards[currentWorkersId] = topicProgress.cards[formerWorkersId];
            delete topicProgress.cards[formerWorkersId];
          }
          previous[currentWorkersId] = Object.assign({}, formerWorkers, { id: currentWorkersId, question: currentWorkers.question });
          delete previous[formerWorkersId];
        }
      }
      source.questions.forEach(function (question) {
        var cardId = id + '.' + question.id, existing = previous[cardId];
        if (!existing || existing.question !== question.question) deckChanged = true;
        if (existing && existing.question !== question.question) {
          reviewSetChanged = true;
          if (S.progress[id] && S.progress[id].cards) delete S.progress[id].cards[cardId];
        }
        next.push({ id: cardId, question: question.question, options: question.options.slice(), answer: question.answer, explanation: question.explanation || '', ref: question.ref || '', bible: question.bible || '' });
        delete previous[cardId];
      });
      saved.cards.forEach(function (card) {
        if (previous[card.id] && !/^q\d+$/.test(card.id.slice((id + '.').length))) next.push(card);
      });
      Object.keys(previous).forEach(function (cardId) {
        if (cardId.indexOf(id + '.q') === 0) {
          deckChanged = true;
          reviewSetChanged = true;
          if (S.progress[id] && S.progress[id].cards) delete S.progress[id].cards[cardId];
        }
      });
      if (reviewSetChanged && S.progress[id]) S.progress[id].best = null;
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
    } },
    { version: 12, run: function () {
      function titleKey(title) {
        var topic = MobileStudy.parseChapterTitle(title).topic;
        return String(topic || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      }
      STARTER_DECKS.forEach(function (source) {
        if (!source.questions.length) return;
        var key = titleKey(source.title), canonicalId = 'd-' + slug(source.title), canonical = deck(canonicalId);
        if (!canonical) {
          addParsed(source, true);
          canonical = deck(canonicalId);
        }
        if (!canonical) return;

        var cardByQuestion = Object.create(null);
        canonical.cards.forEach(function (card) {
          cardByQuestion[String(card.question || '').toLowerCase().replace(/\s+/g, ' ').trim()] = card.id;
        });
        S.decks.slice().forEach(function (duplicate) {
          if (duplicate.id === canonicalId || titleKey(duplicate.title) !== key) return;
          var duplicateProgress = S.progress[duplicate.id], canonicalProgress = prog(canonicalId);
          if (duplicateProgress && duplicateProgress.cards) {
            duplicate.cards.forEach(function (card) {
              var targetId = cardByQuestion[String(card.question || '').toLowerCase().replace(/\s+/g, ' ').trim()];
              var record = duplicateProgress.cards[card.id];
              if (targetId && record && !canonicalProgress.cards[targetId]) canonicalProgress.cards[targetId] = record;
            });
            var duplicatePct = duplicateProgress.best && Number(duplicateProgress.best.pct);
            var canonicalPct = canonicalProgress.best && Number(canonicalProgress.best.pct);
            if (Number.isFinite(duplicatePct) && (!Number.isFinite(canonicalPct) || duplicatePct > canonicalPct)) {
              canonicalProgress.best = duplicateProgress.best;
            }
          }
          S.decks = S.decks.filter(function (item) { return item.id !== duplicate.id; });
          delete S.progress[duplicate.id];
        });
      });
    } },
    { version: 14, run: function () {
      syncStarterDecks();
      var starterIds = Object.create(null), ordered = [];
      STARTER_DECKS.forEach(function (source) {
        if (!source.questions.length) return;
        var id = 'd-' + slug(source.title), saved = deck(id);
        if (!saved) return;
        starterIds[id] = true;
        ordered.push(saved);
      });
      S.decks.forEach(function (saved) {
        if (!starterIds[saved.id]) ordered.push(saved);
      });
      S.decks = ordered;
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
  function openModal(html, options) {
    options = options || {};
    closeBiblePreview(false);
    if (!options.preserveReturnFocus) returnFocus = document.activeElement;
    modal.innerHTML = html;
    var rocketEl = document.querySelector('.rocket-container');
    if (rocketEl) rocketEl.style.display = 'none';
    var first = options.focusSelector ? modal.querySelector(options.focusSelector) : null;
    if (!first || first.disabled) first = modal.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
  }
  function openLessonDetailSheet(lessonId, focusAction) {
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
    var lessonDecks = STARTER_DECKS.map(function (source) { return deck('d-' + slug(source.title)); }).filter(Boolean);
    var lessonIndex = lessonDecks.findIndex(function (lessonDeck) { return lessonDeck.id === detailDeck.id; });
    var lessonNavigation = '';
    if (lessonIndex >= 0 && lessonDecks.length > 1) {
      var previousLesson = lessonIndex > 0 ? lessonDecks[lessonIndex - 1] : null;
      var nextLesson = lessonIndex < lessonDecks.length - 1 ? lessonDecks[lessonIndex + 1] : null;
      lessonNavigation = '<div class="lesson-detail-navigation" role="group" aria-label="Navigate lessons">' +
        (previousLesson
          ? '<button type="button" class="btn lesson-detail-previous" data-act="lesson-detail-prev" data-id="' + previousLesson.id + '" aria-label="Previous lesson: ' + esc(MobileStudy.parseChapterTitle(previousLesson.title).topic) + '">← Previous</button>'
          : '<button type="button" class="btn lesson-detail-previous" disabled aria-label="No previous lesson">← Previous</button>') +
        '<span class="lesson-detail-position">Lesson ' + (lessonIndex + 1) + ' of ' + lessonDecks.length + '</span>' +
        (nextLesson
          ? '<button type="button" class="btn lesson-detail-next" data-act="lesson-detail-next" data-id="' + nextLesson.id + '" aria-label="Next lesson: ' + esc(MobileStudy.parseChapterTitle(nextLesson.title).topic) + '">Next →</button>'
          : '<button type="button" class="btn lesson-detail-next" disabled aria-label="No next lesson">Next →</button>') +
        '</div>';
    }
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
      lessonNavigation +
      '<div class="lesson-detail-actions">' +
        '<button type="button" class="btn primary lesson-detail-study" data-act="lesson-detail-study" data-id="' + detailDeck.id + '">Study this lesson</button>' +
        '<button type="button" class="btn lesson-detail-close" data-act="close">Close</button>' +
      '</div>' +
    '</section>', focusAction ? { preserveReturnFocus: true, focusSelector: '[data-act="' + focusAction + '"]' } : null);
  }
  function ask(msg, label, fn) { pendingAsk = fn; openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title" class="dialog-title">Please confirm</h2><p>' + esc(msg) + '</p><div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn danger" data-act="askok">' + esc(label) + '</button></div></div>'); }
  function closeModal() {
    closeBiblePreview(false);
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
    delete settings.showDraftSermons;
    delete settings.experience;
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
    var updateNotice = updateAvailable && !updateDeferred
      ? '<div class="note update-prompt" role="status" aria-live="polite" aria-atomic="true">' +
          '<div class="update-prompt-copy"><strong>CCI Study update ready</strong><span>' + (updateApplying ? 'Saving your study progress before updating…' : 'Install the latest app and lesson files. Your saved progress stays on this device.') + '</span></div>' +
          (!updateApplying ? '<div class="update-prompt-actions"><button type="button" class="btn sm primary" data-act="update-app">Update now</button><button type="button" class="btn sm ghost" data-act="defer-update">Remind me later</button></div>' : '') +
        '</div>'
      : '';
    return storageNotice + updateNotice;
  }
  function offerUpdate(worker) {
    if (!worker) return;
    if (worker !== waitingWorker) { updateDeferred = false; updateApplying = false; }
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

  var DISCIPLESHIP_TABS = ['home', 'journey', 'chapter', 'practice', 'progress', 'settings'];
  var MAIN_TABS = DISCIPLESHIP_TABS;

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
    var activeTab = currentTab;
    return '<nav class="bottom-tab-bar" aria-label="Main Navigation">' +
      tabs.map(function (tab) {
        var isActive = tab.id === activeTab;
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
    var dueItems = dueReviewItems(all, now);
    var dueCount = dueItems.length;
    var unmasteredCount = Math.max(totalCards - totalKnown, 0);
    var dailyMinutes = (S.onboarding && S.onboarding.dailyMinutes) || 10;
    var dailyFocusCount = Math.min(dueCount || unmasteredCount, dailyMinutes);
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
      var heroTitle = dueCount > 0 ? 'Start Today’s Focus' : (unmasteredCount > 0 ? 'Begin Your Journey' : 'All Cards Mastered!');
      var heroDesc = dueCount > 0
        ? dueCount + ' ' + (dueCount === 1 ? 'card is' : 'cards are') + ' scheduled for review today. Start with your ' + dailyFocusCount + '-card focus.'
        : (unmasteredCount > 0
          ? 'Choose ' + dailyFocusCount + ' cards from your ' + totalCards.toLocaleString() + '-card study library.'
          : 'Outstanding! You have mastered all 12 lesson decks. Challenge yourself with a comprehensive exam.');
      var heroAction = (totalKnown >= totalCards && totalCards > 0) ? 'exam' : 'daily-study';
      var heroBtnText = heroAction === 'exam' ? 'Take Comprehensive Exam' : (dueCount > 0 ? 'Review Today’s Focus' : 'Study ' + dailyFocusCount + ' Cards');
      heroCard = '<section class="hero-card hero-today" aria-label="Today’s focus">' +
        '<div class="hero-card-header">' +
          '<span class="hero-chip">TODAY’S FOCUS</span>' +
          (dueCount > 0 ? '<span class="hero-meta">' + dueCount + ' scheduled</span>' : '<span class="hero-meta">' + dailyFocusCount + ' cards</span>') +
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
      dueItems: dueItems,
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
    var desktopHeroTitle = S.pausedSession
      ? 'Continue · ' + Math.min((S.pausedSession.i || 0) + 1, (S.pausedSession.cards || []).length) + ' of ' + S.pausedSession.cards.length + ' cards'
      : (dueCount ? 'Your next step: ' + plural(dailyFocusCount, 'card') : (unmasteredCount > 0 ? 'Start your ' + dailyFocusCount + '-card daily focus' : 'You’ve mastered every card'));
    var desktopHeroDescription = S.pausedSession
      ? 'Your study session is ready when you are.'
      : (dueCount
        ? plural(dueCount, 'card') + ' scheduled for review today. Start with your ' + dailyFocusCount + '-card focus.'
        : (unmasteredCount > 0
          ? 'Choose ' + dailyFocusCount + ' cards from your ' + totalCards.toLocaleString() + '-card study library.'
          : 'Nothing is scheduled for review today. Your study library is complete.'));
    var desktopHeroAction = S.pausedSession ? 'resume-study' : dailyAction;
    var desktopHeroButtonText = S.pausedSession ? 'Resume Study' : (dailyAction === 'exam' ? 'Take Comprehensive Exam' : (dueCount ? 'Review Today’s Focus' : 'Study ' + dailyFocusCount + ' Cards'));
    var desktopHero = '<section class="desktop-today-card" aria-label="Today’s study">' +
      '<div class="desktop-today-copy">' +
        '<p class="desktop-today-eyebrow">Today’s study</p>' +
        '<h2>' + esc(desktopHeroTitle) + '</h2>' +
        '<p>' + esc(desktopHeroDescription) + '</p>' +
        '<div class="desktop-today-actions"><button type="button" class="desktop-today-action" data-act="' + desktopHeroAction + '">' + desktopHeroButtonText + '</button>' +
        (S.pausedSession ? '<button type="button" class="desktop-today-action-secondary" data-act="discard-study">End session</button>' : '') + '</div>' +
      '</div>' +
      '<svg class="desktop-today-landscape" viewBox="0 0 440 170" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">' +
        '<circle cx="335" cy="48" r="30" fill="#FFE6A8"/>' +
        '<path d="M0 116c65-42 119-57 175-31 63 30 106 42 164 17 38-16 70-39 101-61v129H0Z" fill="rgba(255,255,255,.22)"/>' +
        '<path d="M0 135c73-38 127-43 188-19 53 21 102 36 159 11 32-14 62-34 93-58v102H0Z" fill="rgba(20,15,75,.25)"/>' +
      '</svg>' +
    '</section>';

    var desktopStats = '<section class="desktop-home-stats" aria-label="Study statistics">' +
      '<div class="desktop-stat-card"><strong>' + masterPct + '%</strong><span>Mastered</span></div>' +
      '<div class="desktop-stat-card"><strong>' + dueCount + '</strong><span>Scheduled review</span></div>' +
      '<div class="desktop-stat-card"><strong>' + totalCards.toLocaleString() + '</strong><span>In library</span></div>' +
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
        : (s.state === 'in-progress' ? '<span class="step-badge in-progress">In progress</span>' : (s.state === 'empty' ? '<span class="step-badge empty">No weak spots yet</span>' : '<span class="step-badge unlocked">Unlocked</span>'));
      var stepActions = s.state === 'empty' && s.id === 'weak'
        ? '<p class="timeline-empty-guidance">No questions have been missed in this chapter yet. Study flashcards or take the chapter quiz; missed answers will appear here for review.</p>' +
          '<div class="timeline-step-empty-actions">' +
            '<button class="btn sm primary" data-act="setup" data-mode="flash" data-id="' + d.id + '">Study flashcards</button>' +
            '<button class="btn sm" data-act="setup" data-mode="quiz" data-id="' + d.id + '">Take chapter quiz</button>' +
          '</div>'
        : '<button class="btn sm' + (s.state === 'complete' ? '' : ' primary') + '" data-act="' + s.action + '" data-mode="' + s.mode + '" data-id="' + d.id + '">Start ' + esc(s.title) + '</button>';

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
          '<div class="timeline-step-act' + (s.state === 'empty' && s.id === 'weak' ? ' timeline-step-act-empty' : '') + '">' + stepActions + '</div>' +
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
    '<section class="chapter-video-entry" aria-labelledby="chapter-video-title">' +
      '<div class="chapter-video-copy"><span class="eyebrow">VIDEO LESSON</span><h2 id="chapter-video-title">Watch this chapter</h2><p>' + (lessonVideosForDeck(d.id).length ? plural(lessonVideosForDeck(d.id).length, 'recording') + ' available. Watch, then reinforce the lesson with flashcards or a quiz.' : 'No recording is linked yet. You can still study with flashcards or take the chapter quiz.') + '</p></div>' +
      '<button type="button" class="btn primary" data-act="open-lesson-video" data-id="' + esc(d.id) + '">Open video lesson</button>' +
    '</section>' +
    '<section class="chapter-timeline-section" aria-label="Study Steps">' +
      '<div class="timeline-intro">' +
        '<h2>Study Timeline</h2>' +
        '<p class="meta">Step through each mode or jump straight to any challenge anytime.</p>' +
      '</div>' +
      '<div class="chapter-timeline">' + timelineHtml + '</div>' +
    '</section>';
  };

  views['lesson-video'] = function () {
    var d = deck(V.id);
    if (!d) return '<div class="lesson-video-page"><p class="lesson-video-alert" role="status">This lesson is unavailable.</p><button type="button" class="btn" data-act="nav-tab" data-tab="journey">Back to Journey</button></div>';
    var parsed = MobileStudy.parseChapterTitle(d.title), section = parsed.sectionNum || 1;
    var videos = lessonVideosForDeck(d.id), index = Math.max(0, Math.min(Number.isInteger(V.videoIndex) ? V.videoIndex : 0, videos.length - 1));
    var video = videos[index] || null, title = video ? video.title : parsed.topic + ' video lesson';
    var videoNavigation = videos.length > 1
      ? '<nav class="lesson-video-navigation" aria-label="Lesson video navigation">' +
        '<button type="button" class="btn lesson-video-nav-button" data-act="lesson-video-select" data-index="' + Math.max(0, index - 1) + '"' + (index === 0 ? ' disabled' : '') + ' aria-label="Previous video' + (index > 0 ? ': ' + esc(videos[index - 1].title) : '') + '" title="' + (index > 0 ? 'Previous: ' + esc(videos[index - 1].title) : 'First video') + '">‹ <span>Previous</span></button>' +
        '<span class="lesson-video-position" aria-live="polite">Video ' + (index + 1) + ' of ' + videos.length + '</span>' +
        '<button type="button" class="btn lesson-video-nav-button" data-act="lesson-video-select" data-index="' + Math.min(videos.length - 1, index + 1) + '"' + (index === videos.length - 1 ? ' disabled' : '') + ' aria-label="Next video' + (index < videos.length - 1 ? ': ' + esc(videos[index + 1].title) : '') + '" title="' + (index < videos.length - 1 ? 'Next: ' + esc(videos[index + 1].title) : 'Last video') + '"><span>Next</span> ›</button>' +
      '</nav>'
      : '';
    var canWatchVideo = !!(accountStatus.user && accountStatus.videoReady);
    var isNative = typeof window !== 'undefined' && window.CciNative && window.CciNative.isNative;
    var tokenParam = canWatchVideo && isNative && account && typeof account.playbackTicket === 'function' ? account.playbackTicket(video && video.id) : '';
    var ticketError = isNative && account && typeof account.playbackTicketError === 'function' ? account.playbackTicketError(video && video.id) : '';
    if (canWatchVideo && isNative && video && !tokenParam && !ticketError && account && typeof account.preparePlaybackTicket === 'function') {
      account.preparePlaybackTicket(video.id).then(function () {
        if (V.name === 'lesson-video' && V.id === d.id && lessonVideosForDeck(V.id)[V.videoIndex] && lessonVideosForDeck(V.id)[V.videoIndex].id === video.id) render(true);
      });
    }
    var videoSourceUrl = video ? video.videoUrl : '';
    var captionsSourceUrl = video ? video.captionsUrl : '';
    var transcriptSourceUrl = video ? video.transcriptUrl : '';
    if (tokenParam && isNative) {
      videoSourceUrl = nativeTicketUrl(videoSourceUrl, tokenParam);
      captionsSourceUrl = nativeTicketUrl(captionsSourceUrl, tokenParam);
      transcriptSourceUrl = nativeTicketUrl(transcriptSourceUrl, tokenParam);
    }
    var canStartPlayback = canWatchVideo && (!isNative || !!tokenParam);
    var player = video
      ? (canStartPlayback
          ? '<video class="lesson-video-player" id="lesson-video-player" controls playsinline preload="metadata" crossorigin="use-credentials"' + (video.posterUrl ? ' poster="' + esc(video.posterUrl) + '"' : '') + ' aria-label="Video lesson: ' + esc(title) + '"><source src="' + esc(videoSourceUrl) + '" type="video/mp4">' + (captionsSourceUrl ? '<track kind="captions" src="' + esc(captionsSourceUrl) + '" srclang="' + esc(video.captionsLanguage) + '" label="' + esc(video.captionsLabel) + '" default>' : '') + '<span>Your browser does not support video playback.</span></video>'
          : '<div class="lesson-video-unavailable lesson-video-auth-required" role="status"><strong>' + (canWatchVideo ? (ticketError ? 'Secure video access needs attention' : 'Preparing secure video access') : (accountStatus.user ? 'Preparing secure video access' : 'Sign in to watch this lesson')) + '</strong><p>' + (ticketError ? esc(ticketError) : (accountStatus.user ? 'Your lesson files stay private. ' + (isNative ? 'A short-lived ticket for this lesson is being prepared.' : 'Video access is being prepared for your account.') : 'Create a free account or sign in to watch. You can continue studying locally without an account.')) + '</p>' + (canWatchVideo && isNative ? '<button type="button" class="btn primary" data-act="video-ticket-retry" data-video-id="' + esc(video.id) + '"' + (ticketError ? '' : ' disabled') + '>' + (ticketError ? 'Retry secure access' : 'Preparing…') + '</button>' : '<button type="button" class="btn primary" data-act="nav-tab" data-tab="settings" data-return-video="' + esc(d.id) + '" data-return-video-index="' + index + '" data-return-video-asset-id="' + esc(video.id) + '">' + (accountStatus.user ? 'Account settings' : 'Sign in or create account') + '</button>') + '</div>')
      : '<div class="lesson-video-unavailable" role="status"><strong>Lesson video not available yet</strong><p>The ' + esc(parsed.topic) + ' video has not been added yet. Use Flashcards or Take quiz below.</p></div>';
    var transcriptPanel = video && transcriptSourceUrl
      ? (canWatchVideo
          ? '<details class="lesson-transcript" data-video-id="' + esc(video.id) + '" data-transcript-url="' + esc(transcriptSourceUrl) + '"><summary>Search transcript</summary><div class="lesson-transcript-body"><label for="lesson-transcript-search">Find a word or phrase</label><input id="lesson-transcript-search" type="search" autocomplete="off" aria-controls="lesson-transcript-cues"><p class="lesson-transcript-status" role="status" aria-live="polite">Open to load transcript segments.</p><ol class="lesson-transcript-cues" id="lesson-transcript-cues" hidden></ol></div></details>'
          : '<p class="lesson-transcript-note">English captions and a searchable transcript are available after you sign in to watch.</p>')
      : (video && canStartPlayback ? '<p class="lesson-transcript-note">Captions and a searchable transcript are not available for this recording yet.</p>' : '');
    var videoNav = videos.length > 1
      ? '<nav class="lesson-video-segments" aria-label="Videos in this chapter">' + videos.map(function (item, itemIndex) { return '<button type="button" class="lesson-video-segment' + (itemIndex === index ? ' is-active' : '') + '" data-act="lesson-video-select" data-index="' + itemIndex + '" aria-current="' + (itemIndex === index ? 'true' : 'false') + '">' + (itemIndex + 1) + '. ' + esc(item.title) + '</button>'; }).join('') + '</nav>'
      : '<div class="lesson-video-progress" aria-label="Chapter ' + section + ' of ' + S.decks.length + '"><span>Chapter ' + section + ' of ' + S.decks.length + '</span><progress value="' + section + '" max="' + S.decks.length + '">Chapter ' + section + ' of ' + S.decks.length + '</progress></div>';
    return '<main class="lesson-video-page" aria-labelledby="lesson-video-title">' +
      '<header class="lesson-video-topbar"><button type="button" class="btn sm ghost" data-act="lesson-video-back" data-id="' + esc(d.id) + '">‹ Back to lesson</button><div class="lesson-video-top-title"><span>CCI · DISCIPLESHIP</span><strong>' + esc(parsed.topic) + '</strong></div><span class="lesson-video-section-count">' + section + ' / ' + S.decks.length + '</span></header>' +
      '<section class="lesson-video-frame' + (video && canStartPlayback ? '' : ' is-unavailable') + '" aria-label="Lesson video player">' + player + '</section>' +
      '<section class="lesson-video-summary"><div><span class="eyebrow">CHAPTER ' + section + (video && videos.length > 1 ? ' · VIDEO ' + (index + 1) + ' OF ' + videos.length : '') + '</span><h1 id="lesson-video-title" tabindex="-1">' + esc(title) + '</h1><p>' + (canStartPlayback ? 'Watch this lesson video, then reinforce Chapter ' + section + ' (' + esc(parsed.topic) + ') with study activities covering all ' + d.cards.length + ' questions across the chapter’s ' + videos.length + ' recordings.' : 'Study Chapter ' + section + ' (' + esc(parsed.topic) + ') locally with flashcards or a quiz covering all ' + d.cards.length + ' questions.' + (accountStatus.user ? ' Secure video access is being prepared.' : ' Sign in to watch its lesson videos.')) + '</p></div>' + (video && canStartPlayback ? '<button type="button" class="btn primary lesson-video-continue" data-act="lesson-video-play">' + (V.videoTime > 0 ? 'Resume lesson' : 'Play lesson') + '</button>' : '') + '</section>' +
      videoNavigation +
      (function () {
        var videoCards = video ? cardsForVideo(d, video) : [];
        var isLastVideo = !videos.length || index >= videos.length - 1;
        var videoStudyButtons = videoCards.length
          ? '<button type="button" class="btn primary" data-act="setup" data-mode="flash" data-id="' + esc(d.id) + '" data-video-id="' + esc(video.id) + '" aria-label="Study Video Flashcards, ' + videoCards.length + ' cards">Video Flashcards (' + videoCards.length + ')</button>' +
            '<button type="button" class="btn primary" data-act="setup" data-mode="quiz" data-id="' + esc(d.id) + '" data-video-id="' + esc(video.id) + '" aria-label="Take Video Quiz, ' + videoCards.length + ' questions">Video Quiz (' + videoCards.length + ')</button>'
          : (isLastVideo ? '' : '<p class="note" style="margin:var(--space-xs) 0;">Video practice questions in preparation · Chapter quiz available on the final lesson</p>');
        var chapterStudyButtons = isLastVideo
          ? '<button type="button" class="btn' + (videoCards.length ? ' ghost sm' : '') + '" data-act="setup" data-mode="flash" data-id="' + esc(d.id) + '" aria-label="Study Chapter ' + section + ' (' + esc(parsed.topic) + ') Flashcards, ' + d.cards.length + ' cards">Chapter Flashcards (' + d.cards.length + ')</button>' +
            '<button type="button" class="btn' + (videoCards.length ? ' ghost sm' : '') + '" data-act="setup" data-mode="quiz" data-id="' + esc(d.id) + '" aria-label="Take Chapter ' + section + ' (' + esc(parsed.topic) + ') Quiz, ' + d.cards.length + ' questions">Chapter Quiz (' + d.cards.length + ')</button>'
          : '';
        return '<div class="lesson-video-study-actions" role="group" aria-label="Study Chapter ' + section + ' (' + esc(parsed.topic) + ')">' + videoStudyButtons + chapterStudyButtons + '</div>';
      })() +
      transcriptPanel +
      videoNav +
    '</main>';
  };


  views.practice = function () {
    var mode = V.practiceMode || 'quiz';
    var multi = V.practiceMulti !== false;
    var all = allCardItems();
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
    var startDisabled = !selectedCount && mode !== 'challenge';
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
    var dueCount = dueReviewItems(allCardItems(), now).length;
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
      '<div class="stat stat-due"><b>' + dueCount + '</b><span>Scheduled review</span></div>' +
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
    accountSettingsSection() +
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
      '<p class="meta">Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible. <a href="https://www.esv.org/" target="_blank" rel="noopener noreferrer">ESV.org</a></p>' +
    '</div>';
  };
  function bar() {
    if (!SEL.size) return '';
    var n = 0; SEL.forEach(function (id) { var d = deck(id); if (d) n += d.cards.length; });
    return '<div class="barin"><span>' + plural(SEL.size, 'deck') + ' · ' + plural(n, 'card') + '</span><div class="row"><button class="btn sm" data-act="setup" data-mode="flash" data-id="*">Flashcards</button><button class="btn primary sm" data-act="setup" data-mode="quiz" data-id="*">Quiz</button></div></div>';
  }

  views.flash = function (session) {
    var s = session || V;
    var it = s.cards[s.i], c = it.card, ai = LET.indexOf(c.answer), d = deck(it.deckId);
    var title = s.opts && s.opts.daily ? 'Today’s Study' : (d ? d.title : 'Flashcards');
    var parsed = MobileStudy.parseChapterTitle(title);
    var displayTitle = parsed.topic || title;
    var notes = (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') + (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') + bibleNote(c);
    var isLast = s.i === s.cards.length - 1;
    var cardFace = s.flipped
      ? '<div class="flip on flash-card-back" data-flip-surface="true">' +
          '<div class="inner"><div class="face back" aria-hidden="false">' +
            '<span class="card-face-top"><span class="tag">Answer · ' + c.answer + '</span><span class="face-index">' + (s.i + 1) + ' / ' + s.cards.length + '</span></span>' +
            '<span class="a">' + esc(c.options[ai]) + '</span>' +
            notes +
            '<span class="qs">' + esc(c.question) + '</span>' +
            '<button class="flip-cue flip-cue-button" data-act="flip" type="button" aria-label="Show question"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap or Space to see question</button>' +
          '</div></div>' +
        '</div>'
      : '<button class="flip" data-act="flip" type="button" aria-pressed="false" aria-label="Reveal answer">' +
          '<span class="inner"><span class="face front" aria-hidden="false">' +
            '<span class="card-face-top"><span class="tag">' + esc(d ? (MobileStudy.parseChapterTitle(d.title).topic || d.title) : '') + '</span><span class="face-index">' + (s.i + 1) + ' / ' + s.cards.length + '</span></span>' +
            '<span class="q">' + esc(c.question) + '</span>' +
            '<span class="flip-cue"><span class="flip-cue-icon" aria-hidden="true">↻</span>Tap or Space to flip</span>' +
          '</span></span>' +
        '</button>';

    return '<section class="study-shell flash-session coaching-study-flow" aria-label="Flashcard study session">' +
      sessionHead(displayTitle, (s.i + 1) + ' / ' + s.cards.length) +
      progressBar(s.i + 1, s.cards.length) +
      '<div class="coaching-question-container">' + cardFace + '</div>' +
      (s.flipped ? '<div class="flash-rating row grow" role="group" aria-label="Mark your confidence">' +
        '<button class="btn btn-confidence" data-act="mark" data-v="unknown">Still learning</button>' +
        '<button class="btn primary btn-confidence" data-act="mark" data-v="known">I know it</button>' +
      '</div>' : '') +
      '<div class="study-bottom-bar"><div class="row grow nav study-navigation">' +
        '<button class="btn ghost btn-prev" data-act="prev"' + (s.i ? '' : ' disabled') + '>Previous</button>' +
        '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'Finish session' : (s.flipped ? 'Next card' : 'Skip card')) + '</button>' +
      '</div></div>' +
      '<p class="study-shortcuts">Use ← / → to move between cards</p>' +
    '</section>';
  };

  views.quiz = function (session) {
    var s = session || V;
    var isExam = s.name === 'exam', it = s.cards[s.i], c = it.card, picked = s.picked, done = picked !== null;
    var d = deck(it.deckId);
    var order = it.optionOrder || [0, 1, 2, 3];
    var isLast = s.i === s.cards.length - 1;
    var parsed = d ? MobileStudy.parseChapterTitle(d.title) : { topic: isExam ? 'Timed Exam' : 'Quiz' };
    var sessionTitle = isExam ? 'Timed Exam' : parsed.topic;

    var hasSeenTooltip = false;
    try { hasSeenTooltip = !!window.localStorage.getItem('cci_seen_answer_tooltip'); } catch (e) {}
    var showTooltip = !hasSeenTooltip && !done && s.i === 0;

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
        var feedbackContent = function () {
          return '<div class="feedback-panel ' + (ok ? 'is-correct' : 'is-incorrect') + '">' +
              '<div class="feedback-header">' +
                '<span class="feedback-mark-icon" aria-hidden="true">' + (ok ? '✓' : '✗') + '</span>' +
                '<p class="fb ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Correct.' : 'Not quite.') + '</p>' +
              '</div>' +
              (!ok ? '<p class="feedback-answer"><span class="feedback-answer-letter" aria-label="Correct option ' + LET[answerAt] + '">' + LET[answerAt] + '</span><span>' + esc(c.options[order[answerAt]]) + '</span></p>' : '') +
              (c.explanation ? '<p class="card-note"><strong>Explanation:</strong> ' + esc(c.explanation) + '</p>' : '') +
              (c.ref ? '<p class="card-note card-ref"><strong>Reference:</strong> ' + esc(c.ref) + '</p>' : '') +
              bibleNote(c) +
            '</div>';
        };
        fbSheet = '<div class="coaching-bottom-sheet quiz-feedback-sheet ' + (ok ? 'sheet-correct' : 'sheet-incorrect') + '">' +
          '<button type="button" class="quiz-feedback-resize-control" data-act="quiz-feedback-toggle" aria-label="Collapse answer feedback panel" aria-expanded="true" aria-controls="quiz-feedback-content" title="Drag to resize; press to collapse or expand">' +
            '<span class="sheet-drag-handle" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="sheet-content quiz-feedback-content" id="quiz-feedback-content" role="status" aria-live="polite">' + feedbackContent() + '</div>' +
          '<div class="quiz-feedback-actions">' +
            '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'See results' : 'Next question') + '</button>' +
          '</div>' +
        '</div>';
        desktopFeedback = '<aside class="quiz-explanation-card ' + (ok ? 'sheet-correct' : 'sheet-incorrect') + '">' +
          '<div class="quiz-explanation-content" role="status" aria-live="polite">' + feedbackContent() + '</div>' +
          '<button class="btn primary full btn-continue" data-act="next">' + (isLast ? 'See results' : 'Continue') + '</button>' +
        '</aside>';
      }
    }

    var title = isExam ? 'Exam' : 'Quiz';
    var status = isExam
      ? '<span id="exam-clock" role="timer" aria-label="Time remaining ' + formatClock(s.remaining) + '">' + formatClock(s.remaining) + '</span>'
      : '<span class="score-inline" aria-label="Question ' + (s.i + 1) + ' of ' + s.cards.length + '">' + (s.i + 1) + '<span aria-hidden="true"> / </span><span class="sr-only">of</span>' + s.cards.length + '</span>';

    return '<section class="study-shell ' + (isExam ? 'exam-session' : 'quiz-session') + ' coaching-study-flow" aria-label="' + (isExam ? 'Timed exam' : 'Quiz') + '">' +
      sessionHead(sessionTitle, status, isExam) +
      progressBar(s.i + (done ? 1 : 0), s.cards.length) +
      '<div class="quiz-question-layout' + (desktopFeedback ? ' has-feedback' : '') + '">' +
        '<article class="question-panel coaching-question-panel">' +
          '<div class="question-meta-row">' +
            '<span class="count">Question ' + (s.i + 1) + ' of ' + s.cards.length + '</span>' +
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

  views.results = function (session) {
    var R = session || V;
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
        '<ellipse class="completion-mobile-sun" cx="720" cy="120" rx="236" ry="64" fill="#FFE9A7"/>' +
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
          (R.returnToVideo ? '<button class="btn ' + (V.videoStudy ? 'primary ' : '') + 'full video-study-return-btn" data-act="results-return-video">Return to video</button>' : '') +
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
        (R.returnToVideo ? '<button class="btn ' + (V.videoStudy ? 'primary ' : '') + 'full video-study-return-btn" data-act="results-return-video">Return to video</button>' : '') +
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
    var mobileActionButtons = '<div class="devotional-mobile-actions">' +
      '<button class="devotional-rail-action" data-act="devotion-share" data-id="' + dev.id + '">' + shareIcon + '<span>Share</span></button>' +
      '<button class="devotional-rail-action' + (isSaved ? ' active' : '') + '" data-act="devotion-toggle-save" data-id="' + dev.id + '">' + bookmarkIcon + '<span>' + (isSaved ? 'Saved' : 'Save') + '</span></button>' +
    '</div>';

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
      mobileActionButtons +
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
              : '<button class="btn primary full btn-continue" data-act="devotion-mark-read" data-id="' + dev.id + '">Mark as read</button>') +
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
      '<button class="study-close-btn" data-act="' + (V.returnToVideo ? 'study-return-video' : 'pause-session') + '" aria-label="' + (V.returnToVideo ? 'Return to video' : 'Close study session') + '" title="' + (V.returnToVideo ? 'Return to video' : 'Close study session') + '">' +
        (V.returnToVideo
          ? '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>'
          : '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>') +
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
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-quiz">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Quiz</strong></span>' +
        '</button>' +
        '<button class="rocket-pill-btn" role="menuitem" data-act="rocket-flash">' +
          '<span class="pill-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="14" rx="2"/><path d="M6 3h12a2 2 0 0 1 2 2v12"/></svg>' +
          '</span>' +
          '<span class="rocket-pill-text"><strong>Flashcards</strong></span>' +
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
    closeBiblePreview(false);
    if (!views[V.name] && V.name !== 'exam') V = { name: 'home' };
    var isMainTab = MAIN_TABS.indexOf(V.name) >= 0;
    var hasDesktopSidebar = isMainTab || V.name === 'devotional';
    var view = (V.name === 'exam' ? views.quiz : views[V.name]);
    if (typeof view !== 'function') view = views.home;
    var tabBarHtml = isMainTab ? renderTabBar(V.name) : '';
    var showRocket = (V.name === 'home' || V.name === 'journey');
    var rocketHtml = showRocket ? renderRocketFab() : '';
    app.innerHTML = banner() +
      '<div class="desktop-shell' + (hasDesktopSidebar ? '' : ' desktop-shell-full') + (V.name === 'home' ? ' desktop-shell-home' : '') + (animateRouteChange ? ' app-screen-enter' : '') + '">' +
        (hasDesktopSidebar ? renderDesktopSidebar(V.name === 'devotional' ? 'home' : V.name) : '') +
        '<main class="desktop-main">' + view() + tabBarHtml + rocketHtml + '</main>' +
      '</div>';
    animateRouteChange = false;
    var renderedVideo = document.getElementById('lesson-video-player');
    if (renderedVideo) {
      var videoAction = app.querySelector('.lesson-video-continue');
      var syncVideoAction = function () {
        if (!videoAction) return;
        var label = renderedVideo.ended ? 'Replay lesson' : (renderedVideo.paused ? (renderedVideo.currentTime > 0 ? 'Resume lesson' : 'Play lesson') : 'Pause lesson');
        var accessibleLabel = label + ': ' + (renderedVideo.getAttribute('aria-label') || 'video');
        if (videoAction.textContent !== label) videoAction.textContent = label;
        if (videoAction.getAttribute('aria-label') !== accessibleLabel) videoAction.setAttribute('aria-label', accessibleLabel);
      };
      ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(function (eventName) { renderedVideo.addEventListener(eventName, syncVideoAction); });
      var seekTime = Number(V.videoTime);
      if (Number.isFinite(seekTime) && seekTime > 0) {
        var seekVideo = function () { try { renderedVideo.currentTime = Math.min(seekTime, Number.isFinite(renderedVideo.duration) ? renderedVideo.duration : seekTime); } catch (e) {} };
        if (renderedVideo.readyState >= 1) seekVideo();
        else renderedVideo.addEventListener('loadedmetadata', seekVideo, { once: true });
      }
      syncVideoAction();
    }
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
    animateRouteChange = !!prev && (prev.name !== v.name || prev.id !== v.id);
    if (prev && (prev.name === 'quiz' || prev.name === 'flash' || prev.name === 'exam') && v.name !== prev.name) scheduleCloudProgressSync(true);
    V = v;
    try {
      if (window.history && window.history.pushState) {
        var stateObj = { name: V.name, id: V.id || null };
        if (V.returnToVideoId) stateObj.returnToVideoId = V.returnToVideoId;
        if (Number.isInteger(V.returnVideoIndex)) stateObj.returnVideoIndex = V.returnVideoIndex;
        if (typeof V.returnVideoAssetId === 'string' && V.returnVideoAssetId) stateObj.returnVideoAssetId = V.returnVideoAssetId;
        if (replace) {
          window.history.replaceState(stateObj, '', window.location.href);
        } else if (!prev || prev.name !== V.name || prev.id !== V.id) {
          stateObj.videoIndex = Number.isInteger(V.videoIndex) ? V.videoIndex : 0;
          if (Number.isFinite(V.videoTime) && V.videoTime >= 0) stateObj.videoTime = V.videoTime;
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
        V = { name: e.state.name, id: e.state.id, videoIndex: Number.isInteger(e.state.videoIndex) ? e.state.videoIndex : 0, videoTime: Number.isFinite(e.state.videoTime) && e.state.videoTime >= 0 ? e.state.videoTime : 0, returnToVideoId: e.state.returnToVideoId || '', returnVideoIndex: Number.isInteger(e.state.returnVideoIndex) ? e.state.returnVideoIndex : 0, returnVideoAssetId: e.state.returnVideoAssetId || '' };
        render();
      }
    });
  }

  /* ---------- sessions ---------- */
  function setup(mode, id, videoId) {
    var ids = id === '*' ? (SEL.size ? Array.from(SEL) : S.decks.map(function (d) { return d.id; })) : [id];
    if (!ids.length) ids = S.decks.map(function (d) { return d.id; });
    var returnToVideo = null;
    if (V.name === 'lesson-video') {
      var currentVideo = document.getElementById('lesson-video-player');
      var videoTime = currentVideo && Number.isFinite(currentVideo.currentTime) ? Math.max(0, currentVideo.currentTime) : 0;
      returnToVideo = {
        deckId: V.id,
        videoIndex: Number.isInteger(V.videoIndex) ? V.videoIndex : 0,
        currentTime: videoTime
      };
      if (currentVideo && !currentVideo.paused) currentVideo.pause();
    }
    var targetVideo = null, videoCards = [];
    if (videoId && returnToVideo && returnToVideo.deckId === id) {
      var matchedVideos = lessonVideosForDeck(id);
      targetVideo = matchedVideos.filter(function (v) { return v.id === videoId; })[0] || null;
      if (targetVideo) {
        var d = deck(id);
        videoCards = d ? cardsForVideo(d, targetVideo) : [];
      }
    }
    V.setup = {
      mode: mode,
      ids: ids,
      videoId: targetVideo ? targetVideo.id : null,
      cards: videoCards.length ? videoCards.map(function (c) { return { deckId: id, card: c }; }) : null,
      returnToVideo: returnToVideo
    };
    var q = mode === 'quiz';
    var scopeNote = '';
    var resumeBtn = '';
    if (returnToVideo && ids.length === 1) {
      var targetDeck = deck(ids[0]);
      if (targetDeck) {
        var targetParsed = MobileStudy.parseChapterTitle(targetDeck.title);
        var targetVideos = lessonVideosForDeck(targetDeck.id);
        if (targetVideo && videoCards.length) {
          var targetIndex = targetVideos.findIndex(function (v) { return v.id === targetVideo.id; });
          scopeNote = '<p class="note" style="margin-top:4px;margin-bottom:var(--space-md);">' +
            'Video ' + (targetIndex >= 0 ? targetIndex + 1 : 1) + ': ' + esc(targetVideo.title) +
            ' · ' + videoCards.length + ' ' + (videoCards.length === 1 ? 'question' : 'questions') +
            ' · Chapter ' + (targetParsed.sectionNum || 1) + '</p>';
        } else {
          scopeNote = '<p class="note" style="margin-top:4px;margin-bottom:var(--space-md);">' +
            'Chapter ' + (targetParsed.sectionNum || 1) + ': ' + esc(targetParsed.topic) +
            ' · ' + targetVideos.length + ' ' + (targetVideos.length === 1 ? 'video' : 'videos') +
            ' · ' + targetDeck.cards.length + ' ' + (targetDeck.cards.length === 1 ? 'question' : 'questions') + '</p>';
        }
      }
      if (S.pausedSession && S.pausedSession.returnToVideo && S.pausedSession.returnToVideo.deckId === ids[0] && S.pausedSession.name === mode && S.pausedSession.cards && S.pausedSession.cards.length) {
        var savedCardNum = Math.min((S.pausedSession.i || 0) + 1, S.pausedSession.cards.length);
        resumeBtn = '<button type="button" class="btn primary full" data-act="resume-video-study" style="margin-bottom:var(--space-md);">Resume saved ' + (q ? 'quiz' : 'flashcards') + ' (' + savedCardNum + ' of ' + S.pausedSession.cards.length + ')</button>';
      }
    }
    var totalCards = videoCards.length || (function () {
      var count = 0;
      ids.forEach(function (deckId) {
        var d = deck(deckId);
        if (d && d.cards) count += d.cards.length;
      });
      return count;
    })();
    var questionCountOptions = (function () {
      var opts = ['<option value="0">All cards' + (totalCards ? ' (' + totalCards + ')' : '') + '</option>'];
      var counts = totalCards <= 10
        ? (totalCards >= 6 ? [5] : [])
        : [10, 20, 30, 50].filter(function (n) { return n < totalCards; });
      counts.forEach(function (n) {
        opts.push('<option value="' + n + '">' + n + '</option>');
      });
      return opts.join('');
    })();
    openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="setup-title"><h2 id="setup-title">' + (targetVideo && videoCards.length ? (q ? 'Start video quiz' : 'Start video flashcards') : (q ? 'Start quiz' : 'Start flashcards')) + '</h2>' +
      scopeNote +
      resumeBtn +
      (q ? '<label class="field"><span>Questions</span><select id="s-len">' + questionCountOptions + '</select></label>'
         : '<label class="check"><input type="checkbox" id="s-shuf"' + (S.settings.shuffle ? ' checked' : '') + '> Shuffle cards</label>') +
      '<label class="check"><input type="checkbox" id="s-unk"> Skip cards I already know</label><div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="start">' + (resumeBtn ? 'Start fresh' : 'Start') + '</button></div></div>');
  }
  function setupExam(ids, mixed, defaultCount, defaultMinutes) {
    var selectedIds = ids && ids.length ? ids.slice() : S.decks.map(function (d) { return d.id; });
    var cards = [];
    selectedIds.forEach(function (id) {
      var d = deck(id);
      if (d) d.cards.forEach(function (c) { cards.push({ deckId: id, card: c }); });
    });
    if (mixed) {
      var available = allCardItems();
      var eligible = StudyLogic.dueItems(available, Date.now()).concat(StudyLogic.weakSpots(available, 10));
      var eligibleKeys = Object.create(null);
      eligible.forEach(function (item) { eligibleKeys[JSON.stringify([item.deckId, item.card.id])] = true; });
      cards = cards.filter(function (item) { return eligibleKeys[JSON.stringify([item.deckId, item.card.id])]; });
    }
    var total = cards.length;
    if (!total) { toast('No questions are available for this exam.'); return; }
    var countChoices = [10, 20, 30, 60].filter(function (count) { return count <= total; });
    var selectedCount = countChoices.indexOf(defaultCount) >= 0
      ? defaultCount
      : (countChoices.indexOf(20) >= 0 ? 20 : (countChoices[0] || 0));
    var countOptions = countChoices.map(function (count) {
      return '<option value="' + count + '"' + (selectedCount === count ? ' selected' : '') + '>' + count + '</option>';
    }).join('');
    if (countChoices.indexOf(total) < 0) {
      countOptions += '<option value="0"' + (!selectedCount ? ' selected' : '') + '>All ' + total + '</option>';
    }
    var baseMinutes = Number.isFinite(defaultMinutes) && defaultMinutes > 0 ? defaultMinutes : 30;
    var baseCount = selectedCount || total;
    var scopeText;
    if (mixed) {
      scopeText = 'Questions will come from due and weak cards.';
    } else if (selectedIds.length === 1) {
      var selectedDeck = deck(selectedIds[0]);
      scopeText = 'Questions will come from ' + (selectedDeck ? MobileStudy.parseChapterTitle(selectedDeck.title).topic : 'the selected lesson') + '.';
    } else if (selectedIds.length === S.decks.length) {
      scopeText = 'Questions are mixed across all lessons.';
    } else {
      scopeText = 'Questions are mixed across the selected lessons.';
    }
    V.setup = { mode: 'exam', ids: selectedIds, mixed: !!mixed, cards: cards };
    openModal('<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="exam-setup-title"><h2 id="exam-setup-title">Start exam</h2>' +
      '<label class="field"><span>Question count</span><select id="exam-count">' + countOptions + '</select></label>' +
      '<label class="field"><span>Time limit (minutes)</span><input id="exam-minutes" type="number" min="1" max="180" value="' + baseMinutes + '"></label>' +
      '<p class="note">' + esc(scopeText) + ' ' + total + ' questions available. Answers and explanations appear after submission.</p>' +
      '<div class="row end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="start">Start exam</button></div></div>');
    var countSelect = document.getElementById('exam-count');
    var minutesInput = document.getElementById('exam-minutes');
    var autoTime = true;
    if (minutesInput) minutesInput.addEventListener('input', function () { autoTime = false; });
    if (countSelect && minutesInput) countSelect.addEventListener('change', function () {
      if (!autoTime) return;
      var questionCount = +countSelect.value || total;
      minutesInput.value = Math.max(1, Math.min(180, Math.ceil(baseMinutes * questionCount / baseCount)));
    });
  }
  function start() {
    var s = V.setup, cards = s.cards ? s.cards.slice() : [];
    if (!s.cards) s.ids.forEach(function (id) { var d = deck(id); if (d) d.cards.forEach(function (c) { cards.push({ deckId: id, card: c }); }); });
    var exam = s.mode === 'exam';
    var o = exam
      ? { unk: false, limit: +document.getElementById('exam-count').value, shuf: true, duration: Math.max(1, Math.min(180, +document.getElementById('exam-minutes').value || 30)) * 60 * 1000, saveBest: false }
      : { unk: document.getElementById('s-unk').checked, limit: s.mode === 'quiz' ? +document.getElementById('s-len').value : 0, shuf: s.mode === 'quiz' ? true : document.getElementById('s-shuf').checked };
    if (s.mode === 'flash') { S.settings.shuffle = o.shuf; save(); }
    var selectedCount = cards.length;
    if (o.unk) cards = cards.filter(function (x) { return !isMastered(x.deckId, x.card.id); });
    if (exam) cards = StudyLogic.examQuestions(cards, o.limit);
    if (!cards.length) { toast(selectedCount ? 'All selected cards are already marked known.' : 'There are no cards in this selection yet.'); return; }
    if (s.returnToVideo) {
      var studyVideo = document.getElementById('lesson-video-player');
      s.returnToVideo.currentTime = studyVideo && Number.isFinite(studyVideo.currentTime) ? Math.max(0, studyVideo.currentTime) : 0;
      if (studyVideo && !studyVideo.paused) studyVideo.pause();
      startVideoStudyModal(s.mode, exam ? cards : (o.shuf ? shuffle(cards) : cards), o, s.ids, s.returnToVideo);
      return;
    }
    closeModal(); begin(s.mode, exam ? cards : (o.shuf ? shuffle(cards) : cards), o, s.ids, s.returnToVideo);
  }
  function startDue() {
    var cards = dueReviewItems(allCardItems(), Date.now());
    if (!cards.length) { toast('No cards are scheduled for review today.'); return; }
    begin('flash', shuffle(cards), { unk: false, limit: 0, shuf: true }, deckIdsFor(cards));
  }
  function startDailyStudy() {
    var all = allCardItems(), due = dueReviewItems(all, Date.now());
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
    var due = dueReviewItems(all, Date.now());
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

  function startVideoStudyModal(mode, cards, o, ids, returnToVideo, restoredState) {
    if (!restoredState && (mode === 'quiz' || mode === 'exam')) {
      cards = cards.map(function (it) { return { deckId: it.deckId, card: it.card, optionOrder: shuffle([0, 1, 2, 3]) }; });
      if (mode === 'quiz' && o && o.limit && o.limit < cards.length) cards = cards.slice(0, o.limit);
    } else if (!restoredState && o && o.shuf) {
      cards = shuffle(cards);
    }
    V.videoStudy = restoredState ? restoredState : {
      name: mode,
      cards: cards,
      i: 0,
      flipped: false,
      picked: null,
      score: 0,
      answers: [],
      marks: {},
      opts: o || {},
      ids: ids,
      startedAt: Date.now(),
      returnToVideo: returnToVideo || null,
      results: null
    };
    S.pausedSession = MobileStudy.snapshot(V.videoStudy);
    save();
    renderVideoStudyModal();
  }

  function renderVideoStudyModal() {
    if (!V.videoStudy) return;
    var s = V.videoStudy;
    var d = deck(s.returnToVideo ? s.returnToVideo.deckId : (s.ids && s.ids[0]));
    var parsed = d ? MobileStudy.parseChapterTitle(d.title) : { sectionNum: 1, topic: 'Lesson Study' };
    var section = parsed.sectionNum || 1;
    var modeName = s.name === 'flash' ? 'Flashcards' : 'Quiz';
    var headerTitle = 'Chapter ' + section + ' ' + modeName;
    var counter = s.results ? 'Complete' : ((s.i + 1) + ' / ' + s.cards.length);

    var bodyHtml = '';
    if (s.results) {
      bodyHtml = views.results(s.results);
    } else if (s.name === 'flash') {
      bodyHtml = views.flash(s);
    } else {
      bodyHtml = views.quiz(s);
    }

    var modalHtml = '<div class="scrim video-study-scrim" data-act="close-video-study"></div>' +
      '<section class="sheet video-study-modal" role="dialog" aria-modal="true" aria-labelledby="video-study-modal-title">' +
        '<header class="video-study-header">' +
          '<button type="button" class="btn sm ghost video-study-close-btn" data-act="close-video-study" aria-label="Close and return to video">' +
            '<span aria-hidden="true">✕</span> <span>Close & Return</span>' +
          '</button>' +
          '<div class="video-study-header-title">' +
            '<h2 id="video-study-modal-title">' + esc(headerTitle) + '</h2>' +
          '</div>' +
          '<span class="video-study-header-counter" aria-live="polite">' + esc(counter) + '</span>' +
        '</header>' +
        '<div class="video-study-body">' + bodyHtml + '</div>' +
      '</section>';

    openModal(modalHtml, { preserveReturnFocus: true });

    if (!s.results) {
      if (s.name === 'flash') {
        var f = modal.querySelector('.flip');
        if (f) f.focus({ preventScroll: true });
      } else if (s.name === 'quiz') {
        var q = modal.querySelector('.qtext');
        if (q) q.focus({ preventScroll: true });
      }
    } else {
      var retBtn = modal.querySelector('.video-study-return-btn');
      if (retBtn) retBtn.focus({ preventScroll: true });
    }
  }

  function stepVideoStudy(dir) {
    if (!V.videoStudy) return;
    var s = V.videoStudy;
    var n = s.i + dir;
    if (n >= s.cards.length) {
      finishVideoStudy();
      return;
    }
    if (n < 0) return;
    s.i = n;
    s.flipped = false;
    s.picked = null;
    S.pausedSession = MobileStudy.snapshot(s);
    save();
    renderVideoStudyModal();
  }

  function pickVideoStudy(k) {
    if (!V.videoStudy || V.videoStudy.picked !== null) return;
    var s = V.videoStudy;
    try { window.localStorage.setItem('cci_seen_answer_tooltip', 'true'); } catch (e) {}
    var it = s.cards[s.i], selected = LET[(it.optionOrder || [0, 1, 2, 3])[k]], ok = selected === it.card.answer;
    triggerHaptic(ok ? 'correct' : 'wrong');
    s.picked = k;
    s.answers.push({ item: it, ok: ok, selected: selected });
    if (ok) s.score++;
    var p = prog(it.deckId);
    p.cards[it.card.id] = StudyLogic.review(p.cards[it.card.id], ok, Date.now());
    trackStudied(1);
    S.pausedSession = MobileStudy.snapshot(s);
    save();
    renderVideoStudyModal();
  }

  function finishVideoStudy() {
    if (!V.videoStudy) return;
    var s = V.videoStudy;
    var isFirst = checkAndRecordFirstSessionToday();
    S.pausedSession = null;
    save();

    if (s.name === 'flash') {
      var learn = s.cards.filter(function (x) { return s.marks[x.card.id] === 'unknown'; });
      var known = s.cards.filter(function (x) { return s.marks[x.card.id] === 'known'; }).length;
      s.results = {
        name: 'results',
        kind: 'flash',
        known: known,
        learning: learn,
        skipped: s.cards.length - known - learn.length,
        all: s.cards,
        opts: s.opts,
        ids: s.ids,
        isFirstSessionToday: isFirst,
        returnToVideo: s.returnToVideo || null
      };
    } else {
      var per = {}, missed = [];
      s.answers.forEach(function (a) {
        var p = per[a.item.deckId] || (per[a.item.deckId] = { s: 0, t: 0 });
        p.t++;
        if (a.ok) p.s++;
        else missed.push(a.item);
      });
      var newBest = false;
      Object.keys(per).forEach(function (id) {
        var d = deck(id), p = per[id];
        if (!d || s.opts.saveBest === false || p.t < Math.min(10, d.cards.length)) return;
        var pct = Math.round(100 * p.s / p.t), pr = prog(id);
        if (!pr.best || pct > pr.best.pct) {
          pr.best = { pct: pct, score: p.s, total: p.t, date: Date.now() };
          newBest = true;
        }
      });
      s.results = {
        name: 'results',
        kind: 'quiz',
        score: s.score,
        total: s.answers.length,
        missed: missed,
        newBest: newBest,
        all: s.cards,
        opts: s.opts,
        ids: s.ids,
        isFirstSessionToday: isFirst,
        returnToVideo: s.returnToVideo || null
      };
    }
    renderVideoStudyModal();
  }

  function closeVideoStudyModal() {
    if (!V.videoStudy) {
      closeModal();
      return;
    }
    if (!V.videoStudy.results) {
      S.pausedSession = MobileStudy.snapshot(V.videoStudy);
      save();
      scheduleCloudProgressSync(true);
      toast('Study paused. Your progress is saved.');
    }
    V.videoStudy = null;
    closeModal();
    var currentVideo = document.getElementById('lesson-video-player');
    var videoAction = app.querySelector('.lesson-video-continue');
    if (currentVideo && videoAction) {
      var label = currentVideo.ended ? 'Replay lesson' : (currentVideo.paused ? (currentVideo.currentTime > 0 ? 'Resume lesson' : 'Play lesson') : 'Pause lesson');
      videoAction.textContent = label;
      videoAction.setAttribute('aria-label', label + ': ' + (currentVideo.getAttribute('aria-label') || 'video'));
      videoAction.focus();
    }
  }

  function begin(mode, cards, o, ids, returnToVideo) {
    if (mode === 'quiz' || mode === 'exam') {
      cards = cards.map(function (it) { return { deckId: it.deckId, card: it.card, optionOrder: shuffle([0, 1, 2, 3]) }; });
      if (mode === 'quiz' && o.limit && o.limit < cards.length) cards = cards.slice(0, o.limit);
    }
    var session = { name: mode, cards: cards, i: 0, flipped: false, picked: null, score: 0, answers: [], marks: {}, opts: o, ids: ids, startedAt: Date.now(), returnToVideo: returnToVideo || null };
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
    go({ name: 'results', kind: 'flash', known: known, learning: learn, skipped: V.cards.length - known - learn.length, all: V.cards, opts: V.opts, ids: V.ids, isFirstSessionToday: isFirst, returnToVideo: V.returnToVideo || null });
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
    go({ name: 'results', kind: 'quiz', score: V.score, total: V.answers.length, missed: missed, newBest: newBest, all: V.cards, opts: V.opts, ids: V.ids, isFirstSessionToday: isFirst, returnToVideo: V.returnToVideo || null });
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
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType === 'touch') return;
    var target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    var wrapper = target.closest('.bible-reference-wrap');
    if (activeBiblePreview && (wrapper === activeBiblePreview.wrapper || activeBiblePreview.preview.contains(target)) && biblePreviewCloseTimer) {
      window.clearTimeout(biblePreviewCloseTimer); biblePreviewCloseTimer = null;
    }
    var link = target.closest('.bible-reference-link');
    if (link) openBiblePreview(link, false);
  });
  document.addEventListener('pointerout', function (e) {
    var target = e.target && e.target.closest ? e.target : null;
    if (!target || !activeBiblePreview) return;
    var wrapper = target.closest('.bible-reference-wrap');
    if ((wrapper !== activeBiblePreview.wrapper && !activeBiblePreview.preview.contains(target)) || isWithinActiveBiblePreview(e.relatedTarget)) return;
    scheduleBiblePreviewClose();
  });
  document.addEventListener('focusin', function (e) {
    var target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    if (target === suppressBiblePreviewFocus) { suppressBiblePreviewFocus = null; return; }
    var wrapper = target.closest('.bible-reference-wrap');
    if (activeBiblePreview && (wrapper === activeBiblePreview.wrapper || activeBiblePreview.preview.contains(target)) && biblePreviewCloseTimer) {
      window.clearTimeout(biblePreviewCloseTimer); biblePreviewCloseTimer = null;
    }
    var link = target.closest('.bible-reference-link');
    if (link) openBiblePreview(link, false);
  });
  document.addEventListener('focusout', function (e) {
    var target = e.target && e.target.closest ? e.target : null;
    if (!target || !activeBiblePreview) return;
    var wrapper = target.closest('.bible-reference-wrap');
    if ((wrapper !== activeBiblePreview.wrapper && !activeBiblePreview.preview.contains(target)) || isWithinActiveBiblePreview(e.relatedTarget)) return;
    scheduleBiblePreviewClose();
  });
  document.addEventListener('pointerdown', function (e) {
    if (activeBiblePreview && !isWithinActiveBiblePreview(e.target)) closeBiblePreview(false);
  });
  function setQuizFeedbackExpanded(control, expanded) {
    if (!control) return;
    var sheet = control.closest('.quiz-feedback-sheet');
    if (!sheet) return;
    sheet.classList.toggle('is-compact', !expanded);
    control.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    control.setAttribute('aria-label', expanded ? 'Collapse answer feedback panel' : 'Expand answer feedback panel');
    control.title = expanded ? 'Drag down to reduce; press to collapse' : 'Drag up to expand; press to expand';
  }

  document.addEventListener('pointerdown', function (e) {
    var control = e.target.closest('.quiz-feedback-resize-control');
    if (!control || e.button !== 0 || window.matchMedia('(min-width: 901px)').matches) return;
    quizFeedbackDrag = { control: control, pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, moved: false };
    control.focus({ preventScroll: true });
    try { control.setPointerCapture(e.pointerId); } catch (error) {}
    e.preventDefault();
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (!quizFeedbackDrag || e.pointerId !== quizFeedbackDrag.pointerId) return;
    quizFeedbackDrag.lastY = e.clientY;
    if (Math.abs(e.clientY - quizFeedbackDrag.startY) > 8) quizFeedbackDrag.moved = true;
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!quizFeedbackDrag || e.pointerId !== quizFeedbackDrag.pointerId) return;
    var drag = quizFeedbackDrag;
    quizFeedbackDrag = null;
    var delta = drag.lastY - drag.startY;
    if (drag.moved && Math.abs(delta) >= 28) {
      setQuizFeedbackExpanded(drag.control, delta < 0);
      quizFeedbackIgnoreClick = true;
      window.setTimeout(function () { quizFeedbackIgnoreClick = false; }, 0);
    }
  }, true);
  document.addEventListener('pointercancel', function (e) {
    if (quizFeedbackDrag && e.pointerId === quizFeedbackDrag.pointerId) quizFeedbackDrag = null;
  }, true);

  document.addEventListener('click', function (e) {
    var target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    if (target.closest('[data-bible-preview-close]')) {
      e.preventDefault(); closeBiblePreview(true); return;
    }
    var link = target.closest('.bible-reference-link');
    if (!link || !isTouchLayout() || e.detail === 0) return;
    e.preventDefault();
    if (activeBiblePreview && activeBiblePreview.link === link && activeBiblePreview.pinned) closeBiblePreview(false);
    else openBiblePreview(link, true);
  });
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', repositionActiveBiblePreview);
    window.addEventListener('scroll', repositionActiveBiblePreview, true);
  }

  document.addEventListener('click', function (e) {
    var flipSurface = e.target.closest('[data-flip-surface]');
    if (flipSurface && !e.target.closest('a, button, input, select, textarea, [contenteditable="true"]')) {
      if (V.videoStudy) {
        V.videoStudy.flipped = false;
        S.pausedSession = MobileStudy.snapshot(V.videoStudy);
        save();
        renderVideoStudyModal();
      } else {
        V.flipped = false;
        saveActiveSession();
        render(true);
      }
      return;
    }
    var t = e.target.closest('[data-act]'); if (!t) return;
    if (quizFeedbackIgnoreClick && t.matches('.quiz-feedback-resize-control')) { quizFeedbackIgnoreClick = false; e.preventDefault(); return; }
    var a = t.dataset.act, d;
    switch (a) {
      case 'quiz-feedback-toggle':
        setQuizFeedbackExpanded(t, t.getAttribute('aria-expanded') !== 'true');
        break;
      case 'home': closeModal(); go({ name: 'home' }); break;
      case 'open-chapter': go({ name: 'chapter', id: t.dataset.id }); break;
      case 'lesson-detail-open': openLessonDetailSheet(t.dataset.id); break;
      case 'lesson-detail-prev':
      case 'lesson-detail-next': openLessonDetailSheet(t.dataset.id, a); break;
      case 'lesson-detail-study':
        closeModal();
        go({ name: 'chapter', id: t.dataset.id });
        break;
      case 'open-lesson-video':
        go({ name: 'lesson-video', id: t.dataset.id, videoIndex: 0 });
        break;
      case 'lesson-video-back':
        go({ name: 'chapter', id: t.dataset.id || V.id });
        break;
      case 'lesson-video-select':
        if (lessonVideosForDeck(V.id)[+t.dataset.index] && +t.dataset.index !== V.videoIndex) {
          var currentLessonPlayer = document.getElementById('lesson-video-player');
          if (currentLessonPlayer) currentLessonPlayer.pause();
          V.videoIndex = +t.dataset.index;
          V.videoTime = 0;
          render(true);
          returnToLessonVideo();
        }
        break;
      case 'lesson-video-play':
        var lessonVideoElement = document.getElementById('lesson-video-player');
        if (lessonVideoElement) {
          var playbackAttempt = !lessonVideoElement.paused && !lessonVideoElement.ended
            ? (lessonVideoElement.pause(), null)
            : lessonVideoElement.play();
          if (playbackAttempt && playbackAttempt.catch) playbackAttempt.catch(function () { toast('Video playback could not start. Check the video source and try again.'); });
        }
        break;
      case 'video-ticket-retry':
        if (account && typeof account.preparePlaybackTicket === 'function' && V.name === 'lesson-video' && lessonVideosForDeck(V.id)[V.videoIndex] && lessonVideosForDeck(V.id)[V.videoIndex].id === t.dataset.videoId) {
          t.disabled = true;
          account.preparePlaybackTicket(t.dataset.videoId, true).then(function () {
            accountStatus = account.status();
            if (V.name === 'lesson-video' && lessonVideosForDeck(V.id)[V.videoIndex] && lessonVideosForDeck(V.id)[V.videoIndex].id === t.dataset.videoId) render(true);
          });
        }
        break;
      case 'study-return-video':
        if (isStudySession(V.name) && V.returnToVideo) {
          var returnContext = V.returnToVideo;
          if (V.name === 'exam') stopExamTimer();
          S.pausedSession = MobileStudy.snapshot(V);
          save();
          go({ name: 'lesson-video', id: returnContext.deckId, videoIndex: returnContext.videoIndex, videoTime: returnContext.currentTime });
        }
        break;
      case 'lesson-transcript-seek':
        var transcriptVideo = document.getElementById('lesson-video-player'), seekTime = Number(t.dataset.time);
        if (transcriptVideo && Number.isFinite(seekTime) && seekTime >= 0) transcriptVideo.currentTime = seekTime;
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
        if (ceDeck) setupExam([ceDeck.id], false, 20, 15);
        break;

      case 'nav-tab':
        closeModal();
        if (t.dataset.tab) {
          var nextRoute = { name: t.dataset.tab };
          if (nextRoute.name === 'settings' && t.dataset.returnVideo) {
            nextRoute.returnToVideoId = t.dataset.returnVideo;
            nextRoute.returnVideoIndex = Number(t.dataset.returnVideoIndex) || 0;
            nextRoute.returnVideoAssetId = t.dataset.returnVideoAssetId || '';
            savePendingVideoReturn(nextRoute.returnToVideoId, nextRoute.returnVideoIndex, nextRoute.returnVideoAssetId);
          } else if (nextRoute.name !== 'settings' || V.name !== 'settings') {
            savePendingVideoReturn(null);
          }
          go(nextRoute);
        }
        break;
      case 'account-signout':
      case 'account-retry':
      case 'account-sync':
      case 'account-import':
      case 'account-video-session': accountAction(a); break;
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
        if (V.videoStudy) {
          closeVideoStudyModal();
          break;
        }
        if (V.isFirstSessionToday && S.settings.showStreak !== false) {
          go({ name: 'streak', returnTo: 'home' });
        } else {
          go({ name: 'home' });
        }
        break;
      case 'close-video-study':
        closeVideoStudyModal();
        break;
      case 'resume-video-study':
        var restored = MobileStudy.restore(S.pausedSession, S.decks);
        if (restored) {
          var studyVid = document.getElementById('lesson-video-player');
          if (studyVid && !studyVid.paused) studyVid.pause();
          startVideoStudyModal(restored.name, restored.cards, restored.opts, restored.ids, restored.returnToVideo, restored);
        } else {
          S.pausedSession = null;
          save();
          toast('Saved session could not be restored.');
        }
        break;
      case 'results-return-video':
        if (V.videoStudy) {
          closeVideoStudyModal();
        } else if (V.returnToVideo) {
          go({ name: 'lesson-video', id: V.returnToVideo.deckId, videoIndex: V.returnToVideo.videoIndex, videoTime: V.returnToVideo.currentTime });
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
      case 'setup': setup(t.dataset.mode, t.dataset.id, t.dataset.videoId); break;
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
        if (practiceMode === 'exam') {
          if (V.practiceMixed) setupExam(null, true);
          else if (practiceIds.length) setupExam(practiceIds, false);
          else toast('Choose one or more lessons to cover.');
        }
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
      case 'update-app':
        if (waitingWorker && !updateApplying) {
          var updateTarget = waitingWorker;
          updateDeferred = false;
          updateApplying = true;
          render(true);
          save().then(function (result) {
            if (!result || !result.ok) {
              updateApplying = false;
              reloadForUpdate = false;
              render(true);
              toast('The update is paused because your study data could not be saved. Export a backup before trying again.');
              return;
            }
            try {
              reloadForUpdate = true;
              updateTarget.postMessage({ type: 'SKIP_WAITING' });
            } catch (error) {
              updateApplying = false;
              reloadForUpdate = false;
              render(true);
              toast('The update could not start. Your saved study data is safe.');
            }
          });
        }
        break;
      case 'defer-update': updateDeferred = true; render(true); break;
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
      case 'flip':
        if (V.videoStudy) {
          V.videoStudy.flipped = !V.videoStudy.flipped;
          S.pausedSession = MobileStudy.snapshot(V.videoStudy);
          save();
          renderVideoStudyModal();
        } else {
          V.flipped = !V.flipped;
          saveActiveSession();
          render(true);
        }
        break;
      case 'mark':
        if (V.videoStudy) {
          mark(V.videoStudy.cards[V.videoStudy.i], t.dataset.v);
          V.videoStudy.marks[V.videoStudy.cards[V.videoStudy.i].card.id] = t.dataset.v;
          stepVideoStudy(1);
        } else {
          mark(V.cards[V.i], t.dataset.v);
          V.marks[V.cards[V.i].card.id] = t.dataset.v;
          step(1);
        }
        break;
      case 'next':
        if (V.videoStudy) stepVideoStudy(1);
        else step(1);
        break;
      case 'prev':
        if (V.videoStudy) stepVideoStudy(-1);
        else step(-1);
        break;
      case 'pick':
        if (V.videoStudy) pickVideoStudy(+t.dataset.i);
        else pick(+t.dataset.i);
        break;
      case 'review':
        if (V.videoStudy && V.videoStudy.results) {
          var missed = V.videoStudy.results.kind === 'quiz' ? V.videoStudy.results.missed : V.videoStudy.results.learning;
          startVideoStudyModal('flash', shuffle(missed), {}, V.videoStudy.results.ids, V.videoStudy.results.returnToVideo);
        } else {
          begin('flash', shuffle(V.kind === 'quiz' ? V.missed : V.learning), {}, V.ids, V.returnToVideo);
        }
        break;
      case 'again':
        if (V.videoStudy && V.videoStudy.results) {
          var allCards = V.videoStudy.results.all;
          var nextMode = V.videoStudy.results.kind === 'quiz' ? 'quiz' : 'flash';
          startVideoStudyModal(nextMode, nextMode === 'quiz' ? shuffle(allCards) : allCards, V.videoStudy.results.opts, V.videoStudy.results.ids, V.videoStudy.results.returnToVideo);
        } else {
          var all = V.all;
          begin(V.kind === 'quiz' ? 'quiz' : 'flash', V.kind === 'quiz' ? shuffle(all) : all, V.opts, V.ids, V.returnToVideo);
        }
        break;
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
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target && e.target.matches && e.target.matches('[data-account-form]') ? e.target : null;
    if (!form) return;
    var submitter = e.submitter, action = submitter && submitter.value;
    if (action !== 'account-signin' && action !== 'account-signup') return;
    accountAction(action, form);
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'account-password') {
      e.target.removeAttribute('aria-invalid');
    } else if (e.target.id === 'lesson-transcript-search') {
      var transcriptDetails = e.target.closest('.lesson-transcript');
      var transcriptCues = transcriptDetails && lessonTranscriptCache[transcriptDetails.dataset.transcriptUrl];
      if (transcriptDetails && transcriptCues) updateLessonTranscript(transcriptDetails, transcriptCues, e.target.value);
    } else if (e.target.id === 'filter') {
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
  document.addEventListener('toggle', function (e) {
    var details = e.target && e.target.matches && e.target.matches('.lesson-transcript') ? e.target : null;
    if (!details || !details.open || details.dataset.loading === 'true' || details.dataset.loaded === 'true') return;
    details.dataset.loading = 'true';
    var status = details.querySelector('.lesson-transcript-status');
    if (status) status.textContent = 'Loading searchable transcript…';
    loadLessonTranscript(details.dataset.transcriptUrl).then(function (cues) {
      details.dataset.loading = 'false';
      details.dataset.loaded = 'true';
      updateLessonTranscript(details, cues, '');
    }).catch(function () {
      details.dataset.loading = 'false';
      if (status) status.textContent = 'The transcript could not be loaded. Close and reopen this section to try again.';
    });
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeBiblePreview) {
      e.preventDefault(); closeBiblePreview(isWithinActiveBiblePreview(document.activeElement)); return;
    }
    var feedbackResizeControl = e.target && e.target.closest ? e.target.closest('.quiz-feedback-resize-control') : null;
    if (feedbackResizeControl && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setQuizFeedbackExpanded(feedbackResizeControl, e.key === 'ArrowUp');
      return;
    }
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
    if (modal.innerHTML && e.key === 'Escape') {
      e.preventDefault();
      if (V.videoStudy) return closeVideoStudyModal();
      return closeModal();
    }
    if (modal.innerHTML && e.key === 'Tab') {
      var focusable = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length) {
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (V.videoStudy && !V.videoStudy.results) {
      if (V.videoStudy.name === 'flash') {
        if (e.key === 'ArrowRight') stepVideoStudy(1);
        else if (e.key === 'ArrowLeft') stepVideoStudy(-1);
        else if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button.flip[data-act="flip"], button.flip-cue-button')) {
          e.preventDefault();
          V.videoStudy.flipped = !V.videoStudy.flipped;
          S.pausedSession = MobileStudy.snapshot(V.videoStudy);
          save();
          renderVideoStudyModal();
        }
      } else if (V.videoStudy.name === 'quiz') {
        var k = 'abcd'.indexOf(e.key.toLowerCase());
        if (k < 0) k = '1234'.indexOf(e.key);
        if (k >= 0 && V.videoStudy.picked === null) pickVideoStudy(k);
        else if ((e.key === 'Enter' || e.key === 'ArrowRight') && V.videoStudy.picked !== null) stepVideoStudy(1);
      }
      return;
    }
    if (modal.innerHTML) return;
    if (V.name === 'flash') {
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
      else if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button.flip[data-act="flip"], button.flip-cue-button')) { e.preventDefault(); V.flipped = !V.flipped; render(true); }
    } else if (V.name === 'quiz' || V.name === 'exam') {
      var k = 'abcd'.indexOf(e.key.toLowerCase()); if (k < 0) k = '1234'.indexOf(e.key);
      if (k >= 0 && V.picked === null) pick(k); else if ((e.key === 'Enter' || e.key === 'ArrowRight') && V.picked !== null) step(1);
    }
  });
  var tx = 0, ty = 0;
  document.addEventListener('touchstart', function (e) { if (e.target.closest('.flip') && !e.target.closest('a, button')) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tx = 0; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!tx || (V.name !== 'flash' && (!V.videoStudy || V.videoStudy.name !== 'flash'))) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = 0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      e.preventDefault();
      if (V.videoStudy) stepVideoStudy(dx < 0 ? 1 : -1);
      else step(dx < 0 ? 1 : -1);
    }
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

  async function removeRetiredLocalData() {
    function warn(message) {
      if (window.console && typeof window.console.warn === 'function') window.console.warn(message);
    }
    try {
      var result = await storageAdapter.removeRetiredSermonData();
      if (!result.ok) warn('Some retired local data could not be cleaned; cleanup will retry next launch.');
    } catch (error) {
      warn('Some retired local data could not be cleaned; cleanup will retry next launch.');
    }
    try {
      if (window.caches) await Promise.all(['cci-sermon-downloads-v1', 'cci-sermon-audio-v1'].map(function (name) { return window.caches.delete(name); }));
    } catch (error) {
      warn('Retired browser downloads could not be cleaned; cleanup will retry next launch.');
    }
    try {
      if (window.CciNative && window.CciNative.removeRetiredDownloads) await window.CciNative.removeRetiredDownloads();
    } catch (error) {
      warn('Retired native downloads could not be cleaned; cleanup will retry next launch.');
    }
  }

  function boot() {
    return Promise.all([removeRetiredLocalData().then(load), loadStarterText(), loadDevotionals(), loadLessonVideos(), initializeAccount()]).then(function (results) {
      var text = results[1];
      DEVOTIONALS = results[2] || [];
      LESSON_VIDEOS = results[3] || [];
      STARTER_DECKS = P.parseDecks(text).decks;
      var owner = accountStatus.user && accountStatus.user.id || null;
      function prepareLoadedState() {
        var wasFirstRun = !S.seeded && (!S.onboarding || !S.onboarding.completed);
        var reconcileStarters = S.seeded && S.dataVersion >= DATA_VERSION - 3;
        seed();
        if (reconcileStarters && syncStarterDecks()) save();
        return applyDataMigrations().then(function () {
          if (S.pausedSession) {
            var restoredSession = MobileStudy.restore(S.pausedSession, S.decks);
            S.pausedSession = restoredSession ? MobileStudy.snapshot(restoredSession) : null;
          }
          applyTheme();
          return wasFirstRun;
        });
      }
      var isFirstRun = false;
      return prepareLoadedState().then(function (firstRun) {
        isFirstRun = firstRun;
        if (!owner) return;
        guestProgressForImport = progressSnapshot();
        if (!ProgressSync.hasProgress(guestProgressForImport)) guestProgressForImport = null;
        return saveQueue.catch(function () {}).then(function () { return storageAdapter.load(owner); }).then(function (result) {
          preserveStorage = false;
          activeStorageOwnerId = owner;
          requestedStorageOwnerId = owner;
          storageOk = result.ok; storageBackend = result.backend; storageMessage = result.notice || '';
          loadSavedState(result.raw);
          return prepareLoadedState().then(function (accountFirstRun) { isFirstRun = accountFirstRun; });
        });
      }).then(function () {
        accountBootReady = true;
        if (!activeStorageOwnerId) { requestedStorageOwnerId = null; }
        if (isFirstRun) {
          V = { name: 'onboarding', step: 0, answers: MobileStudy.defaultOnboarding(false) };
        }
        render();
        registerServiceWorker();
        registerNativeNavigation();
      });
    });
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', function () {
      if (accountStatus.user) syncCloudProgress();
    });
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && cloudSyncTimer) syncCloudProgress();
    });
    window.addEventListener('pagehide', function () {
      if (cloudSyncTimer) syncCloudProgress();
    });
  }
  boot();
})();
