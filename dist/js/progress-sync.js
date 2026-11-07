(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCIProgressSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function integer(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function timestamp(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
  function emptySnapshot() { return { schemaVersion: 2, progress: {}, completedToday: {}, streak: { lastStreakDate: null }, deviceCounters: {} }; }

  function extract(state, deckIds) {
    state = object(state);
    var result = emptySnapshot(), progress = object(state.progress);
    var currentDecks = Object.create(null);
    (Array.isArray(state.decks) ? state.decks : []).forEach(function (deck) {
      if (deck && typeof deck.id === 'string' && Array.isArray(deck.cards)) currentDecks[deck.id] = new Set(deck.cards.map(function (card) { return card && card.id; }).filter(function (id) { return typeof id === 'string'; }));
    });
    (Array.isArray(deckIds) ? deckIds : []).forEach(function (id) {
      if (typeof id !== 'string' || !progress[id]) return;
      var record = object(progress[id]), cards = object(record.cards), cleanCards = {};
      Object.keys(cards).forEach(function (cardId) {
        if (/^[a-zA-Z0-9._-]{1,180}$/.test(cardId) && (!currentDecks[id] || currentDecks[id].has(cardId))) cleanCards[cardId] = clone(cards[cardId]);
      });
      result.progress[id] = {
        cards: cleanCards,
        best: record.best && Number.isFinite(+record.best.pct) && +record.best.pct >= 0 && +record.best.pct <= 100
          ? clone(record.best) : null
      };
    });
    result.completedToday = clone(object(state.completedToday));
    var streak = object(state.streak);
    result.streak = { lastStreakDate: typeof streak.lastStreakDate === 'string' ? streak.lastStreakDate : null };
    return result;
  }

  function mergeCard(baseValue, localValue, remoteValue) {
    if (localValue !== undefined && remoteValue !== undefined && JSON.stringify(localValue) === JSON.stringify(remoteValue)) return clone(remoteValue);
    if (localValue === 'known' || localValue === 'unknown' || remoteValue === 'known' || remoteValue === 'unknown') {
      if (localValue === 'known' || remoteValue === 'known') return 'known';
      return localValue === 'unknown' || remoteValue === 'unknown' ? 'unknown' : undefined;
    }
    var base = object(baseValue), local = object(localValue), remote = object(remoteValue);
    if (!Object.keys(local).length) return clone(remoteValue);
    if (!Object.keys(remote).length) return clone(localValue);
    var localTime = timestamp(local.lastSeen), remoteTime = timestamp(remote.lastSeen);
    var winner = localTime > remoteTime ? local : remote;
    if (localTime === remoteTime && JSON.stringify(local) > JSON.stringify(remote)) winner = local;
    var attempts = integer(remote.attempts) + Math.max(0, integer(local.attempts) - integer(base.attempts));
    var misses = integer(remote.misses) + Math.max(0, integer(local.misses) - integer(base.misses));
    return Object.assign({}, clone(winner), { attempts: attempts, misses: Math.min(attempts, misses) });
  }

  function mergeDeck(baseDeck, localDeck, remoteDeck) {
    var base = object(baseDeck), local = object(localDeck), remote = object(remoteDeck);
    var baseCards = object(base.cards), localCards = object(local.cards), remoteCards = object(remote.cards), cards = {};
    var ids = new Set(Object.keys(localCards).concat(Object.keys(remoteCards)));
    ids.forEach(function (id) {
      var merged = mergeCard(baseCards[id], localCards[id], remoteCards[id]);
      if (merged !== undefined) cards[id] = merged;
    });
    var localBest = object(local.best), remoteBest = object(remote.best), best = null;
    if (Number.isFinite(+localBest.pct) && +localBest.pct >= 0 && +localBest.pct <= 100) best = clone(local.best);
    if (Number.isFinite(+remoteBest.pct) && +remoteBest.pct >= 0 && +remoteBest.pct <= 100 &&
        (!best || +remoteBest.pct > +best.pct || (+remoteBest.pct === +best.pct && timestamp(remoteBest.date) > timestamp(best.date)))) best = clone(remote.best);
    return { cards: cards, best: best };
  }

  function nonnegative(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function counterRecord(value) {
    value = object(value);
    var attempts = nonnegative(value.attempts), misses = Math.min(attempts, nonnegative(value.misses));
    return { attempts: attempts, misses: misses };
  }
  function vectorTotals(vectors, deckId, cardId) {
    var total = { attempts: 0, misses: 0 };
    Object.keys(object(vectors)).forEach(function (deviceId) {
      var count = counterRecord(object(object(object(vectors)[deviceId]).progress)[deckId] && object(object(object(object(vectors)[deviceId]).progress)[deckId].cards)[cardId]);
      total.attempts += count.attempts;
      total.misses += count.misses;
    });
    return total;
  }
  function vectorTotalsWithoutLegacy(vectors, deckId, cardId) {
    var total = { attempts: 0, misses: 0 };
    Object.keys(object(vectors)).filter(function (deviceId) { return deviceId !== 'legacy'; }).forEach(function (deviceId) {
      var count = counterRecord(object(object(object(vectors)[deviceId]).progress)[deckId] && object(object(object(object(vectors)[deviceId]).progress)[deckId].cards)[cardId]);
      total.attempts += count.attempts;
      total.misses += count.misses;
    });
    return total;
  }
  function mergeDeviceCounters(left, right) {
    var result = clone(object(left)) || {};
    Object.keys(object(right)).forEach(function (deviceId) {
      var incomingDevice = object(object(right)[deviceId]), currentDevice = object(result[deviceId]);
      var progress = object(currentDevice.progress), incomingProgress = object(incomingDevice.progress), mergedProgress = clone(progress) || {};
      Object.keys(incomingProgress).forEach(function (deckId) {
        var currentDeck = object(mergedProgress[deckId]), incomingDeck = object(incomingProgress[deckId]);
        var currentCards = object(currentDeck.cards), incomingCards = object(incomingDeck.cards), mergedCards = Object.assign({}, currentCards);
        Object.keys(incomingCards).forEach(function (cardId) {
          var current = counterRecord(currentCards[cardId]), incoming = counterRecord(incomingCards[cardId]);
          mergedCards[cardId] = { attempts: Math.max(current.attempts, incoming.attempts), misses: Math.max(current.misses, incoming.misses) };
        });
        mergedProgress[deckId] = { cards: mergedCards };
      });
      var completedToday = Object.assign({}, object(currentDevice.completedToday));
      Object.keys(object(incomingDevice.completedToday)).forEach(function (date) {
        completedToday[date] = Math.max(nonnegative(completedToday[date]), nonnegative(incomingDevice.completedToday[date]));
      });
      var record = { progress: mergedProgress, completedToday: completedToday };
      var imported = mergeImportCounters(currentDevice.guestImport, incomingDevice.guestImport);
      if (Object.keys(imported.progress).length || Object.keys(imported.completedToday).length) record.guestImport = imported;
      result[deviceId] = record;
    });
    return result;
  }
  function mergeImportCounters(leftValue, rightValue) {
    var left = object(leftValue), right = object(rightValue), result = { progress: {}, completedToday: {} };
    var decks = new Set(Object.keys(object(left.progress)).concat(Object.keys(object(right.progress))));
    decks.forEach(function (deckId) {
      var leftCards = object(object(left.progress)[deckId]).cards, rightCards = object(object(right.progress)[deckId]).cards, cards = {};
      new Set(Object.keys(object(leftCards)).concat(Object.keys(object(rightCards)))).forEach(function (cardId) {
        var a = counterRecord(object(leftCards)[cardId]), b = counterRecord(object(rightCards)[cardId]);
        cards[cardId] = { attempts: Math.max(a.attempts, b.attempts), misses: Math.max(a.misses, b.misses) };
      });
      result.progress[deckId] = { cards: cards };
    });
    Object.keys(object(left.completedToday)).concat(Object.keys(object(right.completedToday))).forEach(function (date) {
      result.completedToday[date] = Math.max(nonnegative(object(left.completedToday)[date]), nonnegative(object(right.completedToday)[date]));
    });
    return result;
  }
  function ensureLegacyCounters(snapshotValue) {
    var snapshot = clone(object(snapshotValue)) || emptySnapshot();
    var vectors = clone(object(snapshot.deviceCounters)) || {}, legacy = object(vectors.legacy);
    var legacyProgress = clone(object(legacy.progress)) || {}, legacyCompleted = Object.assign({}, object(legacy.completedToday));
    Object.keys(object(snapshot.progress)).forEach(function (deckId) {
      var deck = object(snapshot.progress[deckId]), cards = object(deck.cards);
      Object.keys(cards).forEach(function (cardId) {
        var record = object(cards[cardId]);
        var attempts = nonnegative(record.attempts), misses = Math.min(attempts, nonnegative(record.misses));
        if (!attempts) return;
        var known = vectorTotalsWithoutLegacy(vectors, deckId, cardId), oldLegacy = counterRecord(object(object(legacyProgress[deckId]).cards)[cardId]);
        var gap = { attempts: Math.max(oldLegacy.attempts, attempts - known.attempts), misses: Math.max(oldLegacy.misses, misses - known.misses) };
        if (gap.attempts || gap.misses) {
          var legacyDeck = object(legacyProgress[deckId]), legacyCards = Object.assign({}, object(legacyDeck.cards));
          legacyCards[cardId] = gap;
          legacyProgress[deckId] = { cards: legacyCards };
        }
      });
    });
    Object.keys(object(snapshot.completedToday)).forEach(function (date) {
      var known = Object.keys(vectors).filter(function (deviceId) { return deviceId !== 'legacy'; }).reduce(function (sum, deviceId) { return sum + nonnegative(object(vectors[deviceId]).completedToday && object(vectors[deviceId]).completedToday[date]); }, 0);
      legacyCompleted[date] = Math.max(nonnegative(legacyCompleted[date]), nonnegative(snapshot.completedToday[date]) - known);
    });
    if (Object.keys(legacyProgress).length || Object.keys(legacyCompleted).length) vectors.legacy = { progress: legacyProgress, completedToday: legacyCompleted };
    snapshot.deviceCounters = vectors;
    return snapshot;
  }

  function merge(baseValue, localValue, remoteValue) {
    var base = object(baseValue), local = object(localValue), remote = object(remoteValue);
    var result = emptySnapshot();
    var baseProgress = object(base.progress), localProgress = object(local.progress), remoteProgress = object(remote.progress);
    var deckIds = new Set(Object.keys(localProgress).concat(Object.keys(remoteProgress)));
    deckIds.forEach(function (id) { result.progress[id] = mergeDeck(baseProgress[id], localProgress[id], remoteProgress[id]); });
    var completed = Object.assign({}, object(remote.completedToday));
    var baseCompleted = object(base.completedToday);
    Object.keys(object(local.completedToday)).forEach(function (day) {
      var localCount = integer(local.completedToday[day]), remoteCount = integer(completed[day]);
      completed[day] = remoteCount + Math.max(0, localCount - integer(baseCompleted[day]));
    });
    result.completedToday = completed;
    var localDate = typeof object(local.streak).lastStreakDate === 'string' ? local.streak.lastStreakDate : '';
    var remoteDate = typeof object(remote.streak).lastStreakDate === 'string' ? remote.streak.lastStreakDate : '';
    result.streak.lastStreakDate = localDate > remoteDate ? localDate || null : remoteDate || null;
    result.deviceCounters = mergeDeviceCounters(object(base.deviceCounters), object(local.deviceCounters));
    result.deviceCounters = mergeDeviceCounters(result.deviceCounters, object(remote.deviceCounters));
    return result;
  }

  function mergeForDevice(baseValue, localValue, remoteValue, deviceId, additionalSnapshot) {
    if (typeof deviceId !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(deviceId)) throw new Error('A stable device ID is required for conflict-safe progress sync.');
    var base = ensureLegacyCounters(baseValue), remote = ensureLegacyCounters(remoteValue);
    var local = object(localValue);
    if (additionalSnapshot) {
      var priorImport = object(object(object(remote.deviceCounters)[deviceId]).guestImport);
      var newImportProgress = delta(priorImport, additionalSnapshot);
      local = merge(emptySnapshot(), local, newImportProgress);
    }
    var result = merge(base, local, remote);
    var vectors = mergeDeviceCounters(base.deviceCounters, remote.deviceCounters);
    var baseDevice = object(object(base.deviceCounters)[deviceId]), baseDeviceProgress = object(baseDevice.progress);
    var currentDevice = object(vectors[deviceId]), currentProgress = clone(object(currentDevice.progress)) || {};
    var deckIds = new Set(Object.keys(object(base.progress)).concat(Object.keys(object(local.progress))));
    deckIds.forEach(function (deckId) {
      var baseDeck = object(object(base.progress)[deckId]), localDeck = object(object(local.progress)[deckId]);
      var baseCards = object(baseDeck.cards), localCards = object(localDeck.cards), deviceDeck = object(currentProgress[deckId]);
      var deviceCards = Object.assign({}, object(deviceDeck.cards));
      new Set(Object.keys(baseCards).concat(Object.keys(localCards))).forEach(function (cardId) {
        var baseRecord = counterRecord(baseCards[cardId]), localRecord = counterRecord(localCards[cardId]);
        var deltaAttempts = Math.max(0, localRecord.attempts - baseRecord.attempts);
        var deltaMisses = Math.max(0, localRecord.misses - baseRecord.misses);
        var baseline = counterRecord(object(baseDeviceProgress[deckId]).cards && object(object(baseDeviceProgress[deckId]).cards)[cardId]);
        var remoteDevice = counterRecord(object(object(currentProgress[deckId]).cards)[cardId]);
        deviceCards[cardId] = {
          attempts: Math.max(remoteDevice.attempts, baseline.attempts + deltaAttempts),
          misses: Math.max(remoteDevice.misses, baseline.misses + deltaMisses)
        };
      });
      currentProgress[deckId] = { cards: deviceCards };
    });
    var baseDeviceDays = object(baseDevice.completedToday), localDays = object(local.completedToday), remoteDeviceDays = object(currentDevice.completedToday), currentDays = Object.assign({}, remoteDeviceDays);
    new Set(Object.keys(baseDeviceDays).concat(Object.keys(localDays))).forEach(function (date) {
      var aggregateBase = nonnegative(object(base.completedToday)[date]), aggregateLocal = nonnegative(localDays[date]);
      var baseline = nonnegative(baseDeviceDays[date]), current = nonnegative(remoteDeviceDays[date]);
      currentDays[date] = Math.max(current, baseline + Math.max(0, aggregateLocal - aggregateBase));
    });
    var deviceCounters = { progress: currentProgress, completedToday: currentDays };
    if (additionalSnapshot) deviceCounters.guestImport = mergeImportCounters(currentDevice.guestImport, importCheckpoint(additionalSnapshot));
    vectors[deviceId] = deviceCounters;
    result.deviceCounters = vectors;

    Object.keys(object(result.progress)).forEach(function (deckId) {
      var deck = object(result.progress[deckId]), cards = object(deck.cards);
      Object.keys(cards).forEach(function (cardId) {
        var total = vectorTotals(vectors, deckId, cardId), record = cards[cardId];
        if (!Object.keys(object(record)).length || !total.attempts) return;
        cards[cardId] = Object.assign({}, record, { attempts: total.attempts, misses: Math.min(total.attempts, total.misses) });
      });
      result.progress[deckId] = { cards: cards, best: deck.best || null };
    });
    var completed = {};
    Object.keys(vectors).forEach(function (id) {
      Object.keys(object(object(vectors)[id].completedToday)).forEach(function (date) {
        completed[date] = (completed[date] || 0) + nonnegative(object(object(vectors)[id].completedToday)[date]);
      });
    });
    Object.keys(completed).forEach(function (date) { result.completedToday[date] = completed[date]; });
    result.schemaVersion = 2;
    return result;
  }

  function apply(state, snapshotValue, deckIds) {
    state = state || {};
    var snapshot = object(snapshotValue), allowed = new Set(Array.isArray(deckIds) ? deckIds : []);
    state.progress = object(state.progress);
    Object.keys(object(snapshot.progress)).forEach(function (id) {
      if (!allowed.has(id)) return;
      var currentDeck = (Array.isArray(state.decks) ? state.decks : []).filter(function (deck) { return deck && deck.id === id; })[0];
      var validCards = currentDeck && Array.isArray(currentDeck.cards) ? new Set(currentDeck.cards.map(function (card) { return card.id; })) : null;
      var incoming = object(snapshot.progress[id]), incomingCards = object(incoming.cards), cards = Object.assign({}, object(object(state.progress[id]).cards));
      Object.keys(incomingCards).forEach(function (cardId) {
        if (/^[a-zA-Z0-9._-]{1,180}$/.test(cardId) && (!validCards || validCards.has(cardId))) cards[cardId] = clone(incomingCards[cardId]);
      });
      state.progress[id] = { cards: cards, best: incoming.best && Number.isFinite(+incoming.best.pct) && +incoming.best.pct >= 0 && +incoming.best.pct <= 100 ? clone(incoming.best) : object(state.progress[id]).best || null };
    });
    state.completedToday = Object.assign({}, object(state.completedToday), object(snapshot.completedToday));
    var currentDate = typeof object(state.streak).lastStreakDate === 'string' ? state.streak.lastStreakDate : '';
    var cloudDate = typeof object(snapshot.streak).lastStreakDate === 'string' ? snapshot.streak.lastStreakDate : '';
    state.streak = { lastStreakDate: cloudDate > currentDate ? cloudDate : currentDate || null };
    return state;
  }

  function hasProgress(value) {
    var snapshot = object(value);
    if (Object.keys(object(snapshot.completedToday)).length) return true;
    if (typeof object(snapshot.streak).lastStreakDate === 'string' && snapshot.streak.lastStreakDate) return true;
    return Object.keys(object(snapshot.progress)).some(function (deckId) {
      var deck = object(snapshot.progress[deckId]);
      if (deck.best && Number.isFinite(+deck.best.pct)) return true;
      return Object.keys(object(deck.cards)).some(function (cardId) {
        var record = deck.cards[cardId];
        return record === 'known' || record === 'unknown' || (record && typeof record === 'object' &&
          (integer(record.attempts) > 0 || integer(record.misses) > 0 || timestamp(record.lastSeen) > 0));
      });
    });
  }

  function importCheckpoint(value) {
    var snapshot = object(value), compact = emptySnapshot();
    Object.keys(object(snapshot.progress)).forEach(function (deckId) {
      var cards = object(object(snapshot.progress[deckId]).cards), counts = {};
      Object.keys(cards).forEach(function (cardId) {
        var record = object(cards[cardId]), attempts = nonnegative(record.attempts), misses = Math.min(attempts, nonnegative(record.misses));
        if (attempts || misses) counts[cardId] = { attempts: attempts, misses: misses };
      });
      if (Object.keys(counts).length) compact.progress[deckId] = { cards: counts, best: null };
    });
    compact.completedToday = clone(object(snapshot.completedToday));
    return compact;
  }

  function delta(baseValue, currentValue) {
    var base = object(baseValue), current = object(currentValue), result = emptySnapshot();
    Object.keys(object(current.progress)).forEach(function (deckId) {
      var baseDeck = object(object(base.progress)[deckId]), currentDeck = object(current.progress[deckId]);
      var baseCards = object(baseDeck.cards), currentCards = object(currentDeck.cards), cards = {};
      Object.keys(currentCards).forEach(function (cardId) {
        var local = currentCards[cardId], prior = baseCards[cardId];
        if (local && typeof local === 'object' && !Array.isArray(local)) {
          var record = clone(local), baseRecord = object(prior);
          record.attempts = Math.max(0, nonnegative(local.attempts) - nonnegative(baseRecord.attempts));
          record.misses = Math.min(record.attempts, Math.max(0, nonnegative(local.misses) - nonnegative(baseRecord.misses)));
          cards[cardId] = record;
        } else cards[cardId] = clone(local);
      });
      result.progress[deckId] = { cards: cards, best: currentDeck.best || null };
    });
    Object.keys(object(current.completedToday)).forEach(function (date) {
      result.completedToday[date] = Math.max(0, nonnegative(current.completedToday[date]) - nonnegative(object(base.completedToday)[date]));
    });
    result.streak.lastStreakDate = typeof object(current.streak).lastStreakDate === 'string' ? current.streak.lastStreakDate : null;
    return result;
  }


  var MAX_SNAPSHOT_BYTES = 5242880;
  var WARN_SNAPSHOT_BYTES = 4194304;

  function payloadSize(snapshot) {
    try {
      var serialized = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(serialized).length;
      }
      return unescape(encodeURIComponent(serialized)).length;
    } catch (e) {
      return 0;
    }
  }

  function validateSnapshotSize(snapshot) {
    var size = payloadSize(snapshot);
    if (size > MAX_SNAPSHOT_BYTES) {
      var error = new Error('Progress snapshot exceeds maximum allowed size of 5 MB (' + (size / (1024 * 1024)).toFixed(2) + ' MB).');
      error.name = 'ProgressPayloadTooLargeError';
      error.size = size;
      throw error;
    }
    return { valid: true, size: size, nearLimit: size >= WARN_SNAPSHOT_BYTES };
  }

  return { empty: emptySnapshot, extract: extract, merge: merge, mergeForDevice: mergeForDevice, importCheckpoint: importCheckpoint, delta: delta, apply: apply, hasProgress: hasProgress, validateSnapshotSize: validateSnapshotSize, payloadSize: payloadSize, MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES, WARN_SNAPSHOT_BYTES: WARN_SNAPSHOT_BYTES };
});
