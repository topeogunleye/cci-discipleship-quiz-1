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

  return Object.freeze({ selectDailyItems: selectDailyItems, snapshot: snapshot, restore: restore });
});
