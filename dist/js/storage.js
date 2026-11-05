(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyStorage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Retire only fields owned by the removed Sermons experience. Never infer
  // ownership from deck titles, IDs, or the contents of shared progress maps.
  function withoutRetiredSermonData(raw) {
    try {
      var value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return raw;
      var changed = Object.prototype.hasOwnProperty.call(value, 'sermons');
      delete value.sermons;
      if (value.settings && typeof value.settings === 'object' && !Array.isArray(value.settings)) {
        ['showDraftSermons', 'experience'].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(value.settings, key)) {
            delete value.settings[key]; changed = true;
          }
        });
      }
      return changed ? JSON.stringify(value) : raw;
    } catch (error) { return raw; }
  }

  function createStorage(options) {
    options = options || {};
    var indexedDB = Object.prototype.hasOwnProperty.call(options, 'indexedDB') ? options.indexedDB : (typeof window !== 'undefined' ? window.indexedDB : null);
    var localStorage = Object.prototype.hasOwnProperty.call(options, 'localStorage') ? options.localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
    var databaseName = options.databaseName || 'cci-study-data';
    var storeName = options.storeName || 'state';
    var recordKey = options.recordKey || 'current';
    var legacyKey = options.legacyKey || 'flashdecks.v1';
    var databasePromise = null;
    var indexedDBUnavailable = false;

    function storageKey(owner) {
      return typeof owner === 'string' && owner ? 'account:' + encodeURIComponent(owner) : recordKey;
    }
    function localKey(owner) {
      return typeof owner === 'string' && owner ? legacyKey + '.account.' + encodeURIComponent(owner) : legacyKey;
    }

    function openDatabase() {
      if (!indexedDB || indexedDBUnavailable) return Promise.reject(new Error('IndexedDB is unavailable'));
      if (databasePromise) return databasePromise;
      databasePromise = new Promise(function (resolve, reject) {
        var request;
        try { request = indexedDB.open(databaseName, 1); }
        catch (error) { indexedDBUnavailable = true; reject(error); return; }
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames || !db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { indexedDBUnavailable = true; reject(request.error || new Error('Could not open IndexedDB')); };
        request.onblocked = function () { indexedDBUnavailable = true; reject(new Error('IndexedDB upgrade was blocked')); };
      });
      return databasePromise;
    }

    function readDatabase(db, key) {
      return new Promise(function (resolve, reject) {
        var transaction;
        try { transaction = db.transaction(storeName, 'readonly'); }
        catch (error) { reject(error); return; }
        var request = transaction.objectStore(storeName).get(key || recordKey);
        request.onsuccess = function () { resolve(request.result == null ? null : request.result); };
        request.onerror = function () { reject(request.error || new Error('Could not read IndexedDB')); };
        transaction.onerror = function () { reject(transaction.error || new Error('Could not read IndexedDB')); };
      });
    }

    function writeDatabase(db, raw, key) {
      return new Promise(function (resolve, reject) {
        var transaction;
        try {
          transaction = db.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).put(raw, key || recordKey);
        } catch (error) { reject(error); return; }
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('Could not write IndexedDB')); };
        transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB write was aborted')); };
      });
    }

    function readLegacy(owner) {
      if (!localStorage) return null;
      return localStorage.getItem(localKey(owner));
    }

    function clearLegacyAfterConfirmation(raw, owner) {
      if (!localStorage) return false;
      try {
        var key = localKey(owner);
        localStorage.setItem(key, raw);
        if (localStorage.getItem(key) !== raw) return false;
        localStorage.removeItem(key);
        return true;
      } catch (error) { return false; }
    }

    function fallbackLoad(owner) {
      var raw;
      try { raw = readLegacy(owner); }
      catch (error) {
        return Promise.resolve({ raw: null, backend: 'unavailable', ok: false, notice: 'IndexedDB and browser storage are unavailable. Changes cannot be saved.' });
      }
      return Promise.resolve({
        raw: raw,
        backend: localStorage ? 'localStorage' : 'unavailable',
        ok: !!localStorage,
        migrated: false,
        notice: localStorage
          ? 'IndexedDB is unavailable; using browser local storage. Your legacy backup has been kept.'
          : 'IndexedDB is unavailable and browser local storage could not be accessed. Changes cannot be saved.'
      });
    }

    function load(owner) {
      var key = storageKey(owner);
      return openDatabase().then(function (db) {
        return readDatabase(db, key).then(function (stored) {
          var legacy;
          try { legacy = readLegacy(owner); }
          catch (error) { return { raw: stored, backend: 'indexedDB', ok: true, migrated: false, notice: 'Could not access the legacy localStorage copy; IndexedDB is active.' }; }
          if (legacy === null) return { raw: stored, backend: 'indexedDB', ok: true, migrated: false, notice: '' };
          if (stored === legacy) {
            var cleared = clearLegacyAfterConfirmation(stored, owner);
            return { raw: stored, backend: 'indexedDB', ok: true, migrated: true, notice: cleared ? '' : 'IndexedDB is confirmed, but the legacy localStorage copy could not be removed.' };
          }
          return writeDatabase(db, legacy, key).then(function () {
            return readDatabase(db, key).then(function (confirmed) {
              if (confirmed !== legacy) throw new Error('IndexedDB migration could not be confirmed');
              var cleared = clearLegacyAfterConfirmation(legacy, owner);
              return { raw: legacy, backend: 'indexedDB', ok: true, migrated: true, notice: cleared ? '' : 'IndexedDB is confirmed, but the legacy localStorage copy could not be removed.' };
            });
          }).catch(function () {
            return { raw: legacy, backend: 'localStorage', ok: true, migrated: false, notice: 'IndexedDB migration failed; using local storage and keeping the legacy copy.' };
          });
        });
      }).catch(function () { return fallbackLoad(owner); });
    }

    function save(raw, owner) {
      raw = withoutRetiredSermonData(raw);
      var key = storageKey(owner);
      return openDatabase().then(function (db) {
        return writeDatabase(db, raw, key).then(function () {
          return readDatabase(db, key).then(function (confirmed) {
            if (confirmed !== raw) throw new Error('IndexedDB save could not be confirmed');
            var cleared = clearLegacyAfterConfirmation(raw, owner);
            return { backend: 'indexedDB', ok: true, notice: cleared || !localStorage ? '' : 'Saved to IndexedDB, but the localStorage backup could not be refreshed.' };
          });
        });
      }).catch(function () {
        try {
          if (!localStorage) throw new Error('Browser storage is unavailable');
          localStorage.setItem(localKey(owner), raw);
          return { backend: 'localStorage', ok: true, notice: 'IndexedDB could not save; using local storage. The existing browser key is preserved as a fallback.' };
        } catch (error) {
          return { backend: 'unavailable', ok: false, notice: 'Study data could not be saved. Export a backup before closing this page.' };
        }
      });
    }

    async function removeRetiredSermonData() {
      var ok = true;
      // Include inactive accounts, but leave auth tokens and sync baselines alone.
      try {
        if (localStorage) {
          for (var index = 0; index < localStorage.length; index++) {
            var key = localStorage.key(index);
            if (key !== legacyKey && !(typeof key === 'string' && key.startsWith(legacyKey + '.account.'))) continue;
            var raw = localStorage.getItem(key), cleaned = withoutRetiredSermonData(raw);
            if (cleaned !== raw) localStorage.setItem(key, cleaned);
          }
        }
      } catch (error) { ok = false; }
      if (indexedDB && !indexedDBUnavailable) {
        try {
          var db = await openDatabase();
          await new Promise(function (resolve, reject) {
            var transaction = db.transaction(storeName, 'readwrite');
            var request = transaction.objectStore(storeName).openCursor();
            request.onsuccess = function () {
              var cursor = request.result;
              if (!cursor) return;
              if (cursor.key === recordKey || (typeof cursor.key === 'string' && cursor.key.startsWith('account:'))) {
                var cleaned = withoutRetiredSermonData(cursor.value);
                if (cleaned !== cursor.value) cursor.update(cleaned);
              }
              cursor.continue();
            };
            request.onerror = function () { reject(request.error); };
            transaction.oncomplete = resolve;
            transaction.onerror = transaction.onabort = function () { reject(transaction.error); };
          });
        } catch (error) { ok = false; }
      }
      return { ok: ok };
    }

    return { load: load, save: save, removeRetiredSermonData: removeRetiredSermonData };
  }

  return { createStorage: createStorage, withoutRetiredSermonData: withoutRetiredSermonData };
});
