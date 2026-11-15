(function () {
  'use strict';
  // Preserve bookmarks and installed-app shortcuts from the former root app.
  // Ordinary landing anchors stay on this page; no storage is read or changed.
  function forwardAppLink() {
    var hash = window.location.hash;
    var query = new URLSearchParams(window.location.search);
    var authCallback = /^#(?:access_token|refresh_token|error(?:_code|_description)?)=/.test(hash) || query.has('code') || query.has('error');
    if (hash.indexOf('#/') === 0 || authCallback) {
      window.location.replace('app/' + window.location.search + hash);
      return true;
    }
    return false;
  }
  if (forwardAppLink()) return;
  window.addEventListener('hashchange', forwardAppLink);
  // Existing installations need the new cache version. First-time visitors
  // download the study shell only when they choose to open the app.
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.register('service-worker.js').catch(function () {});
  }
})();
