(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var INTERVAL_DAYS = [1, 3, 7, 14];
  var DAY_MS = 24 * 60 * 60 * 1000;
  var BACKUP_REMINDER_DAYS = 14;
  var BACKUP_REMINDER_STUDIES = 50;

  function calendarDaysAfter(timestamp, days) {
    var date = new Date(timestamp);
    date.setDate(date.getDate() + days);
    return date.getTime();
  }

  function normalizeRecord(record, now) {
    now = Number.isFinite(now) ? now : Date.now();
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { box: 1, dueAt: now, attempts: 0, misses: 0, lastSeen: null };
    }
    var box = Number.isInteger(record.box) ? Math.max(1, Math.min(4, record.box)) : 1;
    var attempts = Number.isInteger(record.attempts) ? Math.max(0, record.attempts) : 0;
    var misses = Number.isInteger(record.misses) ? Math.max(0, Math.min(attempts, record.misses)) : 0;
    return {
      box: box,
      dueAt: Number.isFinite(record.dueAt) ? record.dueAt : now,
      attempts: attempts,
      misses: misses,
      lastSeen: Number.isFinite(record.lastSeen) ? record.lastSeen : null
    };
  }

  function migrateLegacyMark(mark, now) {
    now = Number.isFinite(now) ? now : Date.now();
    if (mark !== 'known' && mark !== 'unknown') return normalizeRecord(mark, now);
    var box = mark === 'known' ? 2 : 1;
    return {
      box: box,
      dueAt: mark === 'known' ? calendarDaysAfter(now, INTERVAL_DAYS[box - 1]) : now,
      attempts: 0,
      misses: 0,
      lastSeen: null
    };
  }

  function isDueToday(record, now) {
    now = Number.isFinite(now) ? now : Date.now();
    var normalized = normalizeRecord(record, now);
    var startTomorrow = new Date(now);
    startTomorrow.setHours(24, 0, 0, 0);
    return normalized.dueAt < startTomorrow.getTime();
  }

  function review(record, correct, now) {
    now = Number.isFinite(now) ? now : Date.now();
    var next = normalizeRecord(record, now);
    next.attempts++;
    if (correct) next.box = Math.min(4, next.box + 1);
    else { next.box = 1; next.misses++; }
    next.lastSeen = now;
    next.dueAt = calendarDaysAfter(now, INTERVAL_DAYS[next.box - 1]);
    return next;
  }

  function dueItems(items, now) {
    return items.filter(function (item) { return isDueToday(item.record, now); });
  }

  function missRate(record) {
    var normalized = normalizeRecord(record);
    return normalized.attempts ? normalized.misses / normalized.attempts : 0;
  }

  function weakSpots(items, count) {
    return items.map(function (item, index) {
      return { item: item, index: index, record: normalizeRecord(item.record) };
    }).filter(function (entry) { return entry.record.attempts > 0; }).sort(function (a, b) {
      return missRate(b.record) - missRate(a.record) || b.record.misses - a.record.misses || b.record.attempts - a.record.attempts || a.index - b.index;
    }).slice(0, Math.max(0, count)).map(function (entry) { return entry.item; });
  }

  function examQuestions(items, count, random) {
    var shuffled = items.slice();
    random = typeof random === 'function' ? random : Math.random;
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var current = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = current;
    }
    return count > 0 ? shuffled.slice(0, count) : shuffled;
  }

  function newBackupReminder(now) {
    return { anchorAt: Number.isFinite(now) ? now : Date.now(), cardsStudied: 0 };
  }

  function normalizeBackupReminder(reminder, now) {
    now = Number.isFinite(now) ? now : Date.now();
    if (!reminder || typeof reminder !== 'object' || Array.isArray(reminder)) return newBackupReminder(now);
    return {
      anchorAt: Number.isFinite(reminder.anchorAt) ? reminder.anchorAt : now,
      cardsStudied: Number.isInteger(reminder.cardsStudied) ? Math.max(0, reminder.cardsStudied) : 0
    };
  }

  function backupReminderDue(reminder, now) {
    now = Number.isFinite(now) ? now : Date.now();
    var normalized = normalizeBackupReminder(reminder, now);
    return normalized.cardsStudied >= BACKUP_REMINDER_STUDIES || now - normalized.anchorAt >= BACKUP_REMINDER_DAYS * DAY_MS;
  }

  function recordStudied(reminder, count, now) {
    var normalized = normalizeBackupReminder(reminder, now);
    normalized.cardsStudied += Number.isInteger(count) && count > 0 ? count : 1;
    return normalized;
  }

  return {
    INTERVAL_DAYS: INTERVAL_DAYS.slice(),
    normalizeRecord: normalizeRecord,
    migrateLegacyMark: migrateLegacyMark,
    isDueToday: isDueToday,
    review: review,
    dueItems: dueItems,
    missRate: missRate,
    weakSpots: weakSpots,
    examQuestions: examQuestions,
    newBackupReminder: newBackupReminder,
    normalizeBackupReminder: normalizeBackupReminder,
    backupReminderDue: backupReminderDue,
    recordStudied: recordStudied,
    resetBackupReminder: newBackupReminder
  };
});
