'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sync = require('../js/progress-sync.js');

test('merges progress made on two devices since a shared snapshot', () => {
  const base = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 2, misses: 1, lastSeen: 10 } }, best: { pct: 70, date: 10 } } }, completedToday: { '2026-11-03': 2 }, streak: { lastStreakDate: '2026-11-02' } };
  const local = structuredClone(base), remote = structuredClone(base);
  local.progress.d1.cards.q1 = { attempts: 3, misses: 1, lastSeen: 20 };
  remote.progress.d1.cards.q1 = { attempts: 4, misses: 2, lastSeen: 30 };
  local.completedToday['2026-11-03'] = 3;
  remote.completedToday['2026-11-03'] = 4;
  remote.progress.d1.best = { pct: 85, date: 30 };
  const merged = Sync.merge(base, local, remote);
  assert.deepEqual(merged.progress.d1.cards.q1, { attempts: 5, misses: 2, lastSeen: 30 });
  assert.equal(merged.completedToday['2026-11-03'], 5);
  assert.deepEqual(merged.progress.d1.best, { pct: 85, date: 30 });
});

test('preserves a device snapshot when importing it into an empty account', () => {
  const device = { schemaVersion: 1, progress: { d1: { cards: { q1: 'known' }, best: { pct: 80, date: 1 } } }, completedToday: {}, streak: { lastStreakDate: null } };
  const merged = Sync.merge(Sync.empty(), device, Sync.empty());
  assert.equal(merged.progress.d1.cards.q1, 'known');
  assert.equal(merged.progress.d1.best.pct, 80);
  assert.equal(Sync.hasProgress(merged), true);
});

test('applies cloud data only to current canonical decks', () => {
  const state = { decks: [{ id: 'active', cards: [{ id: 'active.q1' }] }], progress: { removed: { cards: { old: 'known' } } }, completedToday: {}, streak: { lastStreakDate: null } };
  const result = Sync.apply(state, { progress: { active: { cards: { 'active.q1': 'known', 'active.q2': 'unknown' }, best: null }, removed: { cards: { old: 'known' }, best: null } }, completedToday: {}, streak: { lastStreakDate: null } }, ['active']);
  assert.equal(result.progress.active.cards['active.q1'], 'known');
  assert.equal(result.progress.active.cards['active.q2'], undefined);
  assert.equal(result.progress.removed.cards.old, 'known');
});

test('does not double-count a same-device write after a compare-and-set retry', () => {
  const base = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 2, misses: 1, lastSeen: 10 } }, best: null } }, completedToday: { '2026-11-03': 2 }, streak: { lastStreakDate: null } };
  const local = structuredClone(base);
  local.progress.d1.cards.q1 = { attempts: 3, misses: 1, lastSeen: 20 };
  local.completedToday['2026-11-03'] = 3;
  const remote = {
    schemaVersion: 2,
    progress: { d1: { cards: { q1: { attempts: 3, misses: 1, lastSeen: 20 } }, best: null } },
    completedToday: { '2026-11-03': 3 }, streak: { lastStreakDate: null },
    deviceCounters: { deviceA: { progress: { d1: { cards: { q1: { attempts: 1, misses: 0 } } } }, completedToday: { '2026-11-03': 1 } } }
  };
  const merged = Sync.mergeForDevice(base, local, remote, 'deviceA');
  assert.equal(merged.progress.d1.cards.q1.attempts, 3);
  assert.equal(merged.progress.d1.cards.q1.misses, 1);
  assert.equal(merged.completedToday['2026-11-03'], 3);
});

test('combines independent device counters while retaining legacy progress', () => {
  const base = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 2, misses: 1, lastSeen: 10 } }, best: null } }, completedToday: { '2026-11-03': 2 }, streak: { lastStreakDate: null } };
  const local = structuredClone(base);
  local.progress.d1.cards.q1 = { attempts: 3, misses: 1, lastSeen: 20 };
  local.completedToday['2026-11-03'] = 3;
  const remote = {
    schemaVersion: 2,
    progress: { d1: { cards: { q1: { attempts: 3, misses: 2, lastSeen: 30 } }, best: null } },
    completedToday: { '2026-11-03': 3 }, streak: { lastStreakDate: null },
    deviceCounters: { deviceB: { progress: { d1: { cards: { q1: { attempts: 1, misses: 1 } } } }, completedToday: { '2026-11-03': 1 } } }
  };
  const merged = Sync.mergeForDevice(base, local, remote, 'deviceA');
  assert.equal(merged.progress.d1.cards.q1.attempts, 4);
  assert.equal(merged.progress.d1.cards.q1.misses, 2);
  assert.equal(merged.completedToday['2026-11-03'], 4);
});

test('creates a compact, idempotent checkpoint for explicit guest progress imports', () => {
  const guest = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 3, misses: 1, lastSeen: 12 } }, best: { pct: 80, date: 12 } } }, completedToday: { '2026-11-03': 4 }, streak: { lastStreakDate: '2026-11-03' } };
  const checkpoint = Sync.importCheckpoint(guest);
  const delta = Sync.delta(checkpoint, guest);
  assert.equal(delta.progress.d1.cards.q1.attempts, 0);
  assert.equal(delta.completedToday['2026-11-03'], 0);
  assert.deepEqual(checkpoint.progress.d1.cards.q1, { attempts: 3, misses: 1 });
});

test('stores guest-import receipts with cloud progress so concurrent retries are idempotent', () => {
  const guest = { schemaVersion: 1, progress: { d1: { cards: { q1: { attempts: 2, misses: 1, lastSeen: 12 } }, best: null } }, completedToday: { '2026-11-03': 2 }, streak: { lastStreakDate: null } };
  const first = Sync.mergeForDevice(Sync.empty(), Sync.empty(), Sync.empty(), 'deviceA', guest);
  const retried = Sync.mergeForDevice(Sync.empty(), Sync.empty(), first, 'deviceA', guest);
  assert.equal(first.progress.d1.cards.q1.attempts, 2);
  assert.equal(retried.progress.d1.cards.q1.attempts, 2);
  assert.equal(retried.completedToday['2026-11-03'], 2);
  assert.deepEqual(retried.deviceCounters.deviceA.guestImport.progress.d1.cards.q1, { attempts: 2, misses: 1 });
});


test('validates snapshot payload sizes against the 5 MB cloud database ceiling', () => {
  const normal = Sync.empty();
  const result = Sync.validateSnapshotSize(normal);
  assert.equal(result.valid, true);
  assert.equal(result.nearLimit, false);
  assert.ok(result.size > 0 && result.size < 1000);

  const oversized = {
    schemaVersion: 2,
    progress: {},
    completedToday: {},
    streak: { lastStreakDate: null },
    deviceCounters: {
      overflow: 'x'.repeat(Sync.MAX_SNAPSHOT_BYTES + 10)
    }
  };

  assert.throws(() => {
    Sync.validateSnapshotSize(oversized);
  }, /Progress snapshot exceeds maximum allowed size of 5 MB/);
});
