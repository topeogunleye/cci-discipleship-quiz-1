(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MobileStudy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MODES = ['flash', 'quiz', 'exam'];
  var LETTERS = ['A', 'B', 'C', 'D'];

  function selectDailyItems(dueItems, allItems, isMastered, limit) {
    limit = Number.isInteger(limit) && limit > 0 ? limit : 10;
    var source = Array.isArray(dueItems) && dueItems.length
      ? dueItems
      : (Array.isArray(allItems) ? allItems.filter(function (item) { return !isMastered(item); }) : []);
    return source.slice(0, limit);
  }

  function snapshot(session) {
    if (!session || MODES.indexOf(session.name) < 0 || !Array.isArray(session.cards)) return null;
    return {
      version: 1,
      name: session.name,
      cards: session.cards.map(function (item) {
        return {
          deckId: item.deckId,
          cardId: item.card.id,
          optionOrder: Array.isArray(item.optionOrder) ? item.optionOrder.slice() : null
        };
      }),
      i: session.i,
      flipped: !!session.flipped,
      picked: Number.isInteger(session.picked) ? session.picked : null,
      score: Number.isInteger(session.score) && session.score >= 0 ? session.score : 0,
      answers: (session.answers || []).map(function (answer) {
        return {
          deckId: answer.item.deckId,
          cardId: answer.item.card.id,
          ok: !!answer.ok,
          selected: answer.selected
        };
      }),
      marks: Object.assign({}, session.marks || {}),
      opts: Object.assign({}, session.opts || {}),
      ids: Array.isArray(session.ids) ? session.ids.slice() : [],
      remaining: Number.isFinite(session.remaining) && session.remaining >= 0 ? session.remaining : null
    };
  }

  function restore(saved, decks) {
    if (!saved || saved.version !== 1 || MODES.indexOf(saved.name) < 0 || !Array.isArray(saved.cards) || !Array.isArray(decks)) return null;
    if (!saved.cards.length || saved.cards.length > 2000) return null;
    var cardMap = new Map();
    decks.forEach(function (deck) {
      (deck.cards || []).forEach(function (card) { cardMap.set(deck.id + '|' + card.id, { deckId: deck.id, card: card }); });
    });
    var cards = [];
    for (var i = 0; i < saved.cards.length; i++) {
      var savedItem = saved.cards[i];
      if (!savedItem || typeof savedItem.deckId !== 'string' || typeof savedItem.cardId !== 'string') return null;
      var item = cardMap.get(savedItem.deckId + '|' + savedItem.cardId);
      if (!item) return null;
      if (saved.name !== 'flash') {
        if (!Array.isArray(savedItem.optionOrder) || savedItem.optionOrder.length !== 4 || savedItem.optionOrder.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 3; }) || new Set(savedItem.optionOrder).size !== 4) return null;
        item.optionOrder = savedItem.optionOrder.slice();
      }
      cards.push(item);
    }
    var index = Number.isInteger(saved.i) ? Math.max(0, Math.min(saved.i, cards.length - 1)) : 0;
    var answers = [];
    if (Array.isArray(saved.answers)) {
      saved.answers.forEach(function (answer) {
        if (!answer || typeof answer.deckId !== 'string' || typeof answer.cardId !== 'string' || LETTERS.indexOf(answer.selected) < 0) return;
        var answeredItem = cardMap.get(answer.deckId + '|' + answer.cardId);
        if (answeredItem) answers.push({ item: answeredItem, ok: !!answer.ok, selected: answer.selected });
      });
    }
    var marks = {};
    if (saved.marks && typeof saved.marks === 'object' && !Array.isArray(saved.marks)) {
      Object.keys(saved.marks).forEach(function (key) {
        if (saved.marks[key] === 'known' || saved.marks[key] === 'unknown') marks[key] = saved.marks[key];
      });
    }
    var picked = Number.isInteger(saved.picked) && saved.picked >= 0 && saved.picked < 4 ? saved.picked : null;
    var remaining = Number.isFinite(saved.remaining) && saved.remaining >= 0 ? saved.remaining : undefined;
    return {
      name: saved.name,
      cards: cards,
      i: index,
      flipped: !!saved.flipped,
      picked: picked,
      score: Number.isInteger(saved.score) && saved.score >= 0 ? saved.score : answers.filter(function (answer) { return answer.ok; }).length,
      answers: answers,
      marks: marks,
      opts: saved.opts && typeof saved.opts === 'object' && !Array.isArray(saved.opts) ? saved.opts : {},
      ids: Array.isArray(saved.ids) ? saved.ids.filter(function (id) { return typeof id === 'string'; }) : [],
      remaining: remaining
    };
  }

  function calculateStreak(timestamps, now) {
    now = Number.isFinite(now) ? now : Date.now();
    if (!Array.isArray(timestamps) || !timestamps.length) return 0;
    var nowDate = new Date(now);
    var todayStr = nowDate.getFullYear() + '-' + String(nowDate.getMonth() + 1).padStart(2, '0') + '-' + String(nowDate.getDate()).padStart(2, '0');
    var yesterdayDate = new Date(now - 86400000);
    var yesterdayStr = yesterdayDate.getFullYear() + '-' + String(yesterdayDate.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayDate.getDate()).padStart(2, '0');

    var daysSet = new Set();
    timestamps.forEach(function (ts) {
      if (!Number.isFinite(ts) || ts <= 0) return;
      var d = new Date(ts);
      daysSet.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    });

    var currentCheckDate = daysSet.has(todayStr) ? nowDate : (daysSet.has(yesterdayStr) ? yesterdayDate : null);
    if (!currentCheckDate) return 0;

    var streak = 0;
    var cursor = new Date(currentCheckDate.getFullYear(), currentCheckDate.getMonth(), currentCheckDate.getDate());
    while (true) {
      var key = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
      if (daysSet.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function selectPlanCards(options) {
    options = options || {};
    var dueItems = Array.isArray(options.dueItems) ? options.dueItems : [];
    var weakItems = Array.isArray(options.weakItems) ? options.weakItems : [];
    var allItems = Array.isArray(options.allItems) ? options.allItems : [];
    var isMastered = typeof options.isMastered === 'function' ? options.isMastered : function () { return false; };
    var decks = Array.isArray(options.decks) ? options.decks : [];
    var completedToday = options.completedToday || {};

    var cards = [];

    // 1. Due / Daily Review Card
    var dueLimit = 10;
    var countDue = dueItems.length;
    if (countDue > 0) {
      var countToReview = Math.min(countDue, dueLimit);
      var estMinutes = Math.max(1, Math.round(countToReview * 0.35));
      cards.push({
        id: 'due',
        type: 'review',
        title: 'Review ' + countToReview + ' due ' + (countToReview === 1 ? 'card' : 'cards'),
        oneLine: 'Review ' + countToReview + ' due ' + (countToReview === 1 ? 'card' : 'cards') + ' · ' + estMinutes + ' min',
        minuteEstimate: estMinutes,
        state: completedToday.due ? 'done' : 'ready',
        action: 'daily-study',
        icon: 'review'
      });
    } else {
      var unmastered = selectDailyItems([], allItems, isMastered, dueLimit);
      if (unmastered.length > 0) {
        var countStudy = Math.min(unmastered.length, dueLimit);
        var estStudyMin = Math.max(1, Math.round(countStudy * 0.35));
        cards.push({
          id: 'due',
          type: 'review',
          title: 'Study ' + countStudy + ' unmastered cards',
          oneLine: 'Study ' + countStudy + ' cards · ' + estStudyMin + ' min',
          minuteEstimate: estStudyMin,
          state: completedToday.due ? 'done' : 'ready',
          action: 'daily-study',
          icon: 'review'
        });
      } else {
        cards.push({
          id: 'due',
          type: 'review',
          title: 'All due cards reviewed',
          oneLine: 'Review cards · All caught up',
          minuteEstimate: 0,
          state: 'done',
          action: 'daily-study',
          icon: 'review'
        });
      }
    }

    // 2. Weak spots Card
    var weakLimit = 5;
    var countWeak = weakItems.length;
    if (countWeak > 0) {
      var countWeakToStudy = Math.min(countWeak, weakLimit);
      var estWeakMin = Math.max(1, Math.round(countWeakToStudy * 0.4));
      cards.push({
        id: 'weak',
        type: 'weak',
        title: 'Weak spots (' + countWeakToStudy + ')',
        oneLine: 'Weak spots · ' + estWeakMin + ' min',
        minuteEstimate: estWeakMin,
        state: completedToday.weak ? 'done' : 'ready',
        action: 'weak',
        icon: 'target'
      });
    } else {
      cards.push({
        id: 'weak',
        type: 'weak',
        title: 'No weak spots',
        oneLine: 'Weak spots · 0 min',
        minuteEstimate: 0,
        state: 'done',
        action: 'weak',
        icon: 'target'
      });
    }

    // 3. New lesson Card
    var nextDeck = null;
    for (var i = 0; i < decks.length; i++) {
      var d = decks[i];
      var unmasteredInDeck = (d.cards || []).filter(function (c) { return !isMastered({ deckId: d.id, card: c }); });
      if (unmasteredInDeck.length > 0) {
        nextDeck = d;
        break;
      }
    }

    if (nextDeck) {
      var cleanTitle = nextDeck.title.replace(/^(?:Discipleship Experience\s*)?(?:\(Section\s*\d+\)\s*)?/i, '').trim();
      cards.push({
        id: 'lesson',
        type: 'lesson',
        title: 'Try a new lesson',
        oneLine: 'Try a new lesson · ' + cleanTitle,
        minuteEstimate: 4,
        state: completedToday.lesson ? 'done' : 'ready',
        action: 'setup',
        mode: 'flash',
        deckId: nextDeck.id,
        icon: 'spark'
      });
    } else {
      cards.push({
        id: 'exam',
        type: 'exam',
        title: 'Challenge exam',
        oneLine: 'Challenge exam · 15 min',
        minuteEstimate: 15,
        state: 'ready',
        action: 'exam',
        icon: 'trophy'
      });
    }

    return cards;
  }

  return Object.freeze({
    selectDailyItems: selectDailyItems,
    selectPlanCards: selectPlanCards,
    calculateStreak: calculateStreak,
    snapshot: snapshot,
    restore: restore
  });
});
