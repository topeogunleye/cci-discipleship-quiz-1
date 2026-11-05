const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('  async function removeRetiredLocalData()');
const end = source.indexOf('\n\n  function boot()', start);
assert.ok(start >= 0 && end > start, 'The app startup cleanup function must be available');

async function runCleanup({ storageFailure = false, storageResult = { ok: true }, cacheFailure = false, nativeFailure = false } = {}) {
  const calls = [], warnings = [];
  const context = {
    storageAdapter: {
      async removeRetiredSermonData() {
        calls.push('storage');
        if (storageFailure) throw new Error('private learner record must not be logged');
        return storageResult;
      }
    },
    window: {
      caches: {
        async delete(name) {
          calls.push(name);
          if (cacheFailure) throw new Error('private cached recording must not be logged');
          return true;
        }
      },
      CciNative: {
        async removeRetiredDownloads() {
          calls.push('native');
          if (nativeFailure) throw new Error('private app file path must not be logged');
        }
      },
      console: { warn: (...args) => warnings.push(args) }
    }
  };
  await vm.runInNewContext(source.slice(start, end) + '\nremoveRetiredLocalData()', context);
  return { calls, warnings };
}

function assertAllBackendsAttempted(calls) {
  assert.deepEqual(calls, ['storage', 'cci-sermon-downloads-v1', 'cci-sermon-audio-v1', 'native']);
}

test('a browser cache cleanup failure does not skip native cleanup or reject startup', async () => {
  const { calls, warnings } = await runCleanup({ cacheFailure: true });
  assertAllBackendsAttempted(calls);
  assert.deepEqual(warnings, [['Retired browser downloads could not be cleaned; cleanup will retry next launch.']]);
});

test('a native cleanup failure preserves successful browser and profile cleanup', async () => {
  const { calls, warnings } = await runCleanup({ nativeFailure: true });
  assertAllBackendsAttempted(calls);
  assert.deepEqual(warnings, [['Retired native downloads could not be cleaned; cleanup will retry next launch.']]);
});

test('a rejected profile cleanup does not prevent either download cleanup or reject startup', async () => {
  const { calls, warnings } = await runCleanup({ storageFailure: true });
  assertAllBackendsAttempted(calls);
  assert.deepEqual(warnings, [['Some retired local data could not be cleaned; cleanup will retry next launch.']]);
});

test('incomplete profile cleanup reports a generic warning and still attempts both download backends', async () => {
  const { calls, warnings } = await runCleanup({ storageResult: { ok: false } });
  assertAllBackendsAttempted(calls);
  assert.deepEqual(warnings, [['Some retired local data could not be cleaned; cleanup will retry next launch.']]);
});

test('all cleanup failures remain independent and never log errors or learner details', async () => {
  const { calls, warnings } = await runCleanup({ storageFailure: true, cacheFailure: true, nativeFailure: true });
  assertAllBackendsAttempted(calls);
  assert.equal(warnings.length, 3);
  for (const args of warnings) {
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], 'string');
    assert.doesNotMatch(args[0], /private|recording|file path|learner record/);
  }
});
