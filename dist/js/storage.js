(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudyStorage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
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

    function readDatabase(db) {
      return new Promise(function (resolve, reject) {
        var transaction;
        try { transaction = db.transaction(storeName, 'readonly'); }
        catch (error) { reject(error); return; }
        var request = transaction.objectStore(storeName).get(recordKey);
        request.onsuccess = function () { resolve(request.result == null ? null : request.result); };
        request.onerror = function () { reject(request.error || new Error('Could not read IndexedDB')); };
        transaction.onerror = function () { reject(transaction.error || new Error('Could not read IndexedDB')); };
      });
    }

    function writeDatabase(db, raw) {
      return new Promise(function (resolve, reject) {
        var transaction;
        try {
          transaction = db.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).put(raw, recordKey);
        } catch (error) { reject(error); return; }
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('Could not write IndexedDB')); };
        transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB write was aborted')); };
      });
    }

    function readLegacy() {
      if (!localStorage) return null;
      return localStorage.getItem(legacyKey);
    }

    function clearLegacyAfterConfirmation(raw) {
      if (!localStorage) return false;
      try {
        localStorage.setItem(legacyKey, raw);
        if (localStorage.getItem(legacyKey) !== raw) return false;
        localStorage.removeItem(legacyKey);
        return true;
      } catch (error) { return false; }
    }

    function fallbackLoad(cause) {
      var raw;
      try { raw = readLegacy(); }
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

    function load() {
      return openDatabase().then(function (db) {
        return readDatabase(db).then(function (stored) {
          var legacy;
          try { legacy = readLegacy(); }
          catch (error) { return { raw: stored, backend: 'indexedDB', ok: true, migrated: false, notice: 'Could not access the legacy localStorage copy; IndexedDB is active.' }; }
          if (legacy === null) return { raw: stored, backend: 'indexedDB', ok: true, migrated: false, notice: '' };
          if (stored === legacy) {
            var cleared = clearLegacyAfterConfirmation(stored);
            return { raw: stored, backend: 'indexedDB', ok: true, migrated: true, notice: cleared ? '' : 'IndexedDB is confirmed, but the legacy localStorage copy could not be removed.' };
          }
          return writeDatabase(db, legacy).then(function () {
            return readDatabase(db).then(function (confirmed) {
              if (confirmed !== legacy) throw new Error('IndexedDB migration could not be confirmed');
              var cleared = clearLegacyAfterConfirmation(legacy);
              return { raw: legacy, backend: 'indexedDB', ok: true, migrated: true, notice: cleared ? '' : 'IndexedDB is confirmed, but the legacy localStorage copy could not be removed.' };
            });
          }).catch(function () {
            return { raw: legacy, backend: 'localStorage', ok: true, migrated: false, notice: 'IndexedDB migration failed; using local storage and keeping the legacy copy.' };
          });
        });
      }).catch(function (error) { return fallbackLoad(error); });
    }

    function save(raw) {
      return openDatabase().then(function (db) {
        return writeDatabase(db, raw).then(function () {
          return readDatabase(db).then(function (confirmed) {
            if (confirmed !== raw) throw new Error('IndexedDB save could not be confirmed');
            var cleared = clearLegacyAfterConfirmation(raw);
            return { backend: 'indexedDB', ok: true, notice: cleared || !localStorage ? '' : 'Saved to IndexedDB, but the localStorage backup could not be refreshed.' };
          });
        });
      }).catch(function () {
        try {
          if (!localStorage) throw new Error('Browser storage is unavailable');
          localStorage.setItem(legacyKey, raw);
          return { backend: 'localStorage', ok: true, notice: 'IndexedDB could not save; using local storage. The existing browser key is preserved as a fallback.' };
        } catch (error) {
          return { backend: 'unavailable', ok: false, notice: 'Study data could not be saved. Export a backup before closing this page.' };
        }
      });
    }

    return { load: load, save: save };
  }

  return { createStorage: createStorage };
});
