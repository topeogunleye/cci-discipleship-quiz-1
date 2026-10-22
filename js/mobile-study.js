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

  function selectChallengeItems(dueItems, weakItems, allItems, isMastered, limit) {
    var target = Number.isInteger(limit) && limit > 0 ? limit : 10;
    var seen = new Set();
    var selected = [];

    function add(item) {
      if (!item || !item.card || !item.card.id) return;
      var key = (item.deckId || '') + ':' + item.card.id;
      if (seen.has(key)) return;
      seen.add(key);
      selected.push(item);
    }

    // 1. Due cards first
    (dueItems || []).forEach(function (item) {
      if (selected.length < target) add(item);
    });

    // 2. Weak spots
    (weakItems || []).forEach(function (item) {
      if (selected.length < target) add(item);
    });

    // 3. Unmastered cards
    (allItems || []).forEach(function (item) {
      if (selected.length < target) {
        var mastered = typeof isMastered === 'function' ? isMastered(item) : false;
        if (!mastered) add(item);
      }
    });

    // 4. Any remaining cards if needed
    (allItems || []).forEach(function (item) {
      if (selected.length < target) add(item);
    });

    return selected.slice(0, target);
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
    var dailyMinutes = Number.isInteger(options.dailyMinutes) && options.dailyMinutes > 0 ? options.dailyMinutes : 10;
    var dueLimit = Number.isInteger(options.dueLimit) && options.dueLimit > 0 ? options.dueLimit : dailyMinutes;
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

    // 3. New lesson Card (prioritizing startingTopic if unmastered)
    var nextDeck = null;
    if (options.startingTopic) {
      var topicSlug = String(options.startingTopic).toLowerCase();
      var topicKeywords = {
        soteriology: ['soteriology', 'salvation', 'section 1', 'section 2'],
        christology: ['christology', 'predestination', 'trinity', 'section 3', 'section 4'],
        conduct: ['conduct', 'prayer', 'section 5', 'section 6'],
        bible: ['bible', 'evangelism', 'apologetics', 'authority', 'church history', 'section 7', 'section 8', 'section 12']
      }[topicSlug] || [topicSlug];

      for (var t = 0; t < decks.length; t++) {
        var cand = decks[t];
        var titleLow = (cand.title || '').toLowerCase();
        var matches = topicKeywords.some(function (kw) { return titleLow.indexOf(kw) >= 0; });
        if (matches) {
          var unmasteredInTopic = (cand.cards || []).filter(function (c) { return !isMastered({ deckId: cand.id, card: c }); });
          if (unmasteredInTopic.length > 0) {
            nextDeck = cand;
            break;
          }
        }
      }
    }

    if (!nextDeck) {
      for (var i = 0; i < decks.length; i++) {
        var d = decks[i];
        var unmasteredInDeck = (d.cards || []).filter(function (c) { return !isMastered({ deckId: d.id, card: c }); });
        if (unmasteredInDeck.length > 0) {
          nextDeck = d;
          break;
        }
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

    // 4. Today's Devotion Card (when available)
    if (options.todayDevotion) {
      var devId = options.todayDevotion.id;
      var isDevRead = !!(completedToday.devotion || (typeof options.isDevotionRead === 'function' && options.isDevotionRead(devId)));
      cards.push({
        id: 'devotion',
        type: 'devotion',
        title: "Read today's devotion",
        oneLine: "Read today's devotion · 1 min",
        minuteEstimate: 1,
        state: isDevRead ? 'done' : 'ready',
        action: 'open-devotional',
        devotionalId: devId,
        icon: 'spark'
      });
    }

    return cards;
  }

  function filterDevotionals(devotionals, showDrafts) {
    if (!Array.isArray(devotionals)) return [];
    return devotionals.filter(function (item) {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.id !== 'string' || !item.id) return false;
      if (typeof item.title !== 'string' || !item.title) return false;
      if (showDrafts) return true;
      return item.status === 'reviewed';
    });
  }

  function getTodayDevotional(devotionals, timestampOrDate) {
    if (!Array.isArray(devotionals) || devotionals.length === 0) return null;
    var ts = Number.isFinite(timestampOrDate) ? timestampOrDate : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0);
    var days = Math.floor(ts / 86400000);
    var index = Math.abs(days) % devotionals.length;
    return devotionals[index] || devotionals[0] || null;
  }

  
  function parseChapterTitle(title) {
    var raw = String(title || '').trim();
    var match = /^(?:Discipleship Experience\s*)?\(Section\s*(\d+)\)\s*(.+)$/i.exec(raw);
    if (match) {
      return {
        sectionNum: parseInt(match[1], 10),
        sectionLabel: 'Section ' + match[1],
        topic: match[2].trim()
      };
    }
    return {
      sectionNum: null,
      sectionLabel: 'Lesson',
      topic: raw
    };
  }

  function getChapterSteps(deck, progress, options) {
    options = options || {};
    var cards = deck && Array.isArray(deck.cards) ? deck.cards : [];
    var totalCards = cards.length;
    var progCards = (progress && progress.cards) || {};
    var isMasteredFn = typeof options.isMastered === 'function'
      ? options.isMastered
      : function (card) {
        var r = progCards[card.id];
        return r && typeof r === 'object' && r.box >= 2;
      };

    var masteredCount = 0;
    var attemptsCount = 0;
    var weakCount = 0;

    cards.forEach(function (c) {
      if (isMasteredFn(c)) masteredCount++;
      var r = progCards[c.id];
      if (r && typeof r === 'object') {
        if (r.attempts > 0) attemptsCount++;
        if (r.misses > 0) weakCount++;
      }
    });

    var hasStudied = attemptsCount > 0 || masteredCount > 0;
    var quizUnlocked = totalCards > 0 && hasStudied;
    var examUnlocked = totalCards > 0 && (masteredCount >= Math.min(5, totalCards));

    return [
      {
        id: 'flash',
        mode: 'flash',
        title: 'Study Flashcards',
        desc: 'Review concepts and Scripture references at your own pace',
        state: masteredCount === totalCards && totalCards > 0 ? 'complete' : (hasStudied ? 'in-progress' : 'unlocked'),
        action: 'setup',
        meta: totalCards > 0 ? (masteredCount + ' of ' + totalCards + ' mastered') : 'No cards',
        icon: 'flash'
      },
      {
        id: 'quiz',
        mode: 'quiz',
        title: 'Chapter Quiz',
        desc: 'Test your retention with instant feedback and explanations',
        state: progress && progress.best ? 'complete' : (quizUnlocked ? 'unlocked' : 'recommended-next'),
        action: 'setup',
        meta: progress && progress.best ? ('Best score: ' + progress.best.pct + '%') : (quizUnlocked ? 'Ready to test' : 'Study flashcards first (optional)'),
        icon: 'quiz'
      },
      {
        id: 'weak',
        mode: 'weak',
        title: 'Weak Spot Practice',
        desc: 'Focus on questions you have previously missed',
        state: weakCount === 0 ? (attemptsCount > 0 ? 'complete' : 'unlocked') : 'in-progress',
        action: 'chapter-weak',
        meta: weakCount > 0 ? (weakCount + ' ' + (weakCount === 1 ? 'card' : 'cards') + ' to strengthen') : (attemptsCount > 0 ? 'No weak spots!' : 'Available anytime'),
        icon: 'target'
      },
      {
        id: 'exam',
        mode: 'exam',
        title: 'Mastery Challenge',
        desc: 'Comprehensive timed review for this chapter',
        state: masteredCount === totalCards && totalCards > 0 ? 'complete' : (examUnlocked ? 'unlocked' : 'unlocked'),
        action: 'chapter-exam',
        meta: masteredCount >= totalCards && totalCards > 0 ? 'Chapter Mastered' : 'Open anytime',
        icon: 'trophy'
      }
    ];
  }

  
  function formatCompletionFeedback(stats) {
    stats = stats || {};
    var kind = stats.kind || 'quiz';
    var score = Number.isInteger(stats.score) ? stats.score : 0;
    var total = Number.isInteger(stats.total) ? stats.total : 0;
    var minutes = stats.minutes !== undefined ? stats.minutes : 1;
    var cardsMastered = Number.isInteger(stats.cardsMastered) ? stats.cardsMastered : 0;
    var pct = total > 0 ? Math.round(100 * score / total) : 0;

    var title = 'Well done!';
    var message = 'Every review builds and strengthens your discipleship foundation.';

    if (kind === 'flash') {
      title = 'Session Complete!';
      if (cardsMastered > 0) {
        message = 'Outstanding dedication! You are developing strong grasp of these Scriptures.';
      } else {
        message = 'Great effort! Re-reading and reviewing is how deep understanding takes root.';
      }
    } else if (kind === 'exam') {
      if (pct >= 80) {
        title = 'Exceptional Mastery!';
        message = 'You demonstrated comprehensive discipleship knowledge under exam conditions.';
      } else if (pct >= 50) {
        title = 'Well Done!';
        message = 'Solid work! Review the explanations below to turn missed items into strengths.';
      } else {
        title = 'Good Effort!';
        message = 'Challenging questions reveal exactly what to focus on next. Keep pressing forward!';
      }
    } else {
      if (pct === 100) {
        title = 'Perfect Score!';
        message = 'Flawless recall! Your knowledge of this discipleship chapter is rock solid.';
      } else if (pct >= 70) {
        title = 'Well done!';
        message = 'Terrific progress! You have a firm grasp of the core doctrines and teachings.';
      } else {
        title = 'Good practice session!';
        message = 'Mistakes are simply stepping stones in discipleship. Check the explanations and review!';
      }
    }

    return {
      title: title,
      message: message,
      pct: pct,
      score: score,
      total: total,
      minutes: Math.max(1, Math.round(minutes)),
      cardsMastered: cardsMastered
    };
  }

  function defaultOnboarding(hasActivity) {
    return {
      completed: !!hasActivity,
      goal: 'habit',
      dailyMinutes: 10,
      startingTopic: 'soteriology',
      preferredTime: 'anytime',
      committed: false
    };
  }

  function normalizeOnboarding(raw, hasActivity) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return defaultOnboarding(hasActivity);
    }
    var validGoals = ['habit', 'exam', 'theology', 'review'];
    var validTopics = ['soteriology', 'christology', 'conduct', 'bible'];
    var validTimes = ['morning', 'midday', 'evening', 'anytime'];
    return {
      completed: typeof raw.completed === 'boolean' ? raw.completed : !!hasActivity,
      goal: typeof raw.goal === 'string' && validGoals.indexOf(raw.goal) >= 0 ? raw.goal : 'habit',
      dailyMinutes: Number.isInteger(raw.dailyMinutes) && raw.dailyMinutes > 0 ? raw.dailyMinutes : 10,
      startingTopic: typeof raw.startingTopic === 'string' && validTopics.indexOf(raw.startingTopic) >= 0 ? raw.startingTopic : 'soteriology',
      preferredTime: typeof raw.preferredTime === 'string' && validTimes.indexOf(raw.preferredTime) >= 0 ? raw.preferredTime : 'anytime',
      committed: !!raw.committed
    };
  }

  function normalizeStreak(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { lastStreakDate: null };
    }
    return {
      lastStreakDate: typeof raw.lastStreakDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastStreakDate) ? raw.lastStreakDate : null
    };
  }

  function formatPickerDecks(decks, isMastered) {
    if (!Array.isArray(decks)) return [];
    return decks.map(function (d, index) {
      var cards = Array.isArray(d.cards) ? d.cards : [];
      var total = cards.length;
      var mastered = cards.filter(function (c) {
        return typeof isMastered === 'function' ? isMastered(d.id, c.id) : false;
      }).length;
      var pct = total ? Math.round(100 * mastered / total) : 0;
      var parsed = parseChapterTitle(d.title);
      var secNum = parsed.sectionNum || (index + 1);
      var gradClass = 'deck-grad-' + (((secNum - 1) % 12) + 1);
      return {
        id: d.id,
        title: d.title,
        topic: parsed.topic,
        sectionNum: secNum,
        totalCards: total,
        masteredCount: mastered,
        pct: pct,
        gradientClass: gradClass
      };
    });
  }

  return Object.freeze({
    defaultOnboarding: defaultOnboarding,
    normalizeOnboarding: normalizeOnboarding,
    normalizeStreak: normalizeStreak,
    formatCompletionFeedback: formatCompletionFeedback,
    parseChapterTitle: parseChapterTitle,
    getChapterSteps: getChapterSteps,
    selectDailyItems: selectDailyItems,
    selectChallengeItems: selectChallengeItems,
    formatPickerDecks: formatPickerDecks,
    selectPlanCards: selectPlanCards,
    filterDevotionals: filterDevotionals,
    getTodayDevotional: getTodayDevotional,
    calculateStreak: calculateStreak,
    snapshot: snapshot,
    restore: restore
  });
});
