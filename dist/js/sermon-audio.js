(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SermonAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Deliberately NOT prefixed "cci-study-pwa-": the service worker deletes every cache with that prefix on update.
  var CACHE_NAME = 'cci-sermon-audio-v1';

  function hashUrl(url) {
    var h = 5381;
    for (var i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function nativeFileName(url) { return 'sermon-audio/' + hashUrl(url) + '.audio'; }

  /**
   * One interface for both places a download can live:
   * - web: a Cache Storage entry (played back through a temporary blob URL)
   * - native app: a file in app storage written by the native bridge (which also avoids CORS)
   * Everything is injected so it can be tested without a browser.
   */
  function createAudioStore(deps) {
    deps = deps || {};
    var cacheStorage = deps.caches || null;
    var fetchFn = deps.fetch || null;
    var native = deps.native && deps.native.isNative ? deps.native : null;
    var urlApi = deps.URL || null;
    var storage = deps.storage || null;
    var blobUrls = Object.create(null);

    function supported() { return !!native || !!(cacheStorage && fetchFn); }

    function openCache() { return cacheStorage.open(CACHE_NAME); }

    async function isDownloaded(url) {
      if (!supported() || !url) return false;
      try {
        if (native) return !!(await native.audioExists(nativeFileName(url)));
        var cache = await openCache();
        return !!(await cache.match(url));
      } catch (error) { return false; }
    }

    async function download(url, options) {
      options = options || {};
      if (!supported()) throw new Error('Offline downloads are not available in this browser.');
      var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
      if (native) {
        await native.downloadAudio(url, nativeFileName(url), onProgress, options.signal);
        onProgress(1);
        return true;
      }
      var response;
      try { response = await fetchFn(url, { signal: options.signal, mode: 'cors' }); }
      catch (error) {
        if (error && error.name === 'AbortError') throw error;
        throw new Error('Could not download this recording. The host may not allow downloads, or you may be offline.');
      }
      if (!response || !response.ok) throw new Error('Could not download this recording (' + (response && response.status ? response.status : 'no response') + ').');
      var total = Number(response.headers && response.headers.get && response.headers.get('content-length')) || options.expectedBytes || 0;
      var type = (response.headers && response.headers.get && response.headers.get('content-type')) || 'audio/mpeg';
      var chunks = [], received = 0;
      if (response.body && typeof response.body.getReader === 'function') {
        var reader = response.body.getReader();
        for (;;) {
          var step = await reader.read();
          if (step.done) break;
          chunks.push(step.value);
          received += step.value.length;
          if (total) onProgress(Math.min(0.99, received / total));
        }
      } else {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
      }
      var blob = new Blob(chunks, { type: type });
      var cache = await openCache();
      try {
        await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(blob.size) } }));
      } catch (error) {
        throw new Error('Not enough storage space to keep this recording offline.');
      }
      if (storage && typeof storage.persist === 'function') { try { await storage.persist(); } catch (e) {} }
      onProgress(1);
      return true;
    }

    async function remove(url) {
      if (!supported()) return false;
      release(url);
      try {
        if (native) { await native.deleteAudio(nativeFileName(url)); return true; }
        var cache = await openCache();
        return await cache.delete(url);
      } catch (error) { return false; }
    }

    function release(url) {
      if (blobUrls[url] && urlApi && urlApi.revokeObjectURL) { try { urlApi.revokeObjectURL(blobUrls[url]); } catch (e) {} }
      delete blobUrls[url];
    }

    /** Returns { src, local } — the downloaded copy if there is one, otherwise the original URL. */
    async function playable(url) {
      if (await isDownloaded(url)) {
        try {
          if (native) return { src: await native.audioSrc(nativeFileName(url)), local: true };
          var cache = await openCache();
          var hit = await cache.match(url);
          if (hit && urlApi && urlApi.createObjectURL) {
            release(url);
            blobUrls[url] = urlApi.createObjectURL(await hit.blob());
            return { src: blobUrls[url], local: true };
          }
        } catch (error) {}
      }
      return { src: url, local: false };
    }

    return { supported: supported, isDownloaded: isDownloaded, download: download, remove: remove, playable: playable, release: release };
  }

  return { CACHE_NAME: CACHE_NAME, nativeFileName: nativeFileName, createAudioStore: createAudioStore };
});
