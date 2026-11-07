(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.CCIAccount = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DEFAULT_API_BASE = 'https://cci-discipleship-quiz.pages.dev';

  function createAccount(options) {
    options = options || {};
    var sleep = typeof options.sleep === 'function' ? options.sleep : function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
    var fetcher = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var supabaseApi = options.Supabase || (typeof root !== 'undefined' ? root.Supabase : null);
    var localStorage = Object.prototype.hasOwnProperty.call(options, 'localStorage') ? options.localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
    var isNativeApp = typeof window !== 'undefined' && window.CciNative && window.CciNative.isNative;
    var apiBase = String(options.apiBase || (typeof window !== 'undefined' && window.CCI_API_BASE) || (typeof window !== 'undefined' && !isNativeApp && /^https?:$/.test(window.location.protocol) ? window.location.origin : DEFAULT_API_BASE)).replace(/\/$/, '');
    var client = null, authSubscription = null, onChange = null, currentSession = null, configured = false, videoReady = false, videoReadyUserId = null, videoAccessError = '', currentTicket = null;
    var cookieSync = Promise.resolve(), lastToken = null, lastUserId = null, cachedDeviceId = null, videoRetryTimer = null;
    var resumeHandler = null;
    var initializationState = 'idle', initializationError = '', initializationPromise = null, lifecycleId = 0;

    function status() {
      return { configured: configured, user: currentSession && currentSession.user ? currentSession.user : null, session: currentSession, videoReady: videoReady, videoAccessError: videoAccessError, ticket: currentTicket, apiBase: apiBase, initializationState: initializationState, initializationError: initializationError };
    }

    function notify() {
      if (typeof onChange === 'function') onChange(status());
    }

    function clearVideoRetryTimer() {
      if (videoRetryTimer !== null) clearTimeout(videoRetryTimer);
      videoRetryTimer = null;
    }

    function scheduleVideoRetry(token, delay) {
      clearVideoRetryTimer();
      if (!token || typeof window === 'undefined' || !currentSession || currentSession.access_token !== token) return;
      videoRetryTimer = setTimeout(function () {
        videoRetryTimer = null;
        if (currentSession && currentSession.access_token === token) syncVideoSession(currentSession, true);
      }, Number.isFinite(delay) && delay > 0 ? delay : 30000);
    }

    function syncVideoSession(session, force) {
      var token = session && session.access_token || '';
      var userId = session && session.user && session.user.id || null;
      if (token === lastToken && !force) { videoReady = !!token && videoReady; notify(); return Promise.resolve(videoReady); }
      var wasVideoReady = videoReady;
      var nextRetryDelay = 0;
      lastToken = token;
      clearVideoRetryTimer();
      cookieSync = cookieSync.catch(function () {}).then(function () {
        if (!fetcher) throw new Error('Network access is unavailable.');
        return fetcher(apiBase + '/api/auth/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(token ? { accessToken: token } : { clear: true })
        });
      }).then(function (response) {
        if (!response.ok) {
          var error = new Error('Video access could not be prepared.');
          error.status = response.status;
          var retryAfter = Number(response.headers && response.headers.get('Retry-After'));
          if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = Math.min(300, retryAfter);
          throw error;
        }
        return response.json().catch(function () { return null; }).then(function (data) {
          currentTicket = token && data && data.ticket ? data.ticket : null;
          videoReady = !!token && !!currentSession && currentSession.access_token === token;
          videoReadyUserId = videoReady ? userId : null;
          videoAccessError = '';
          return videoReady;
        });
      }).catch(function (error) {
        if (token && currentSession && currentSession.access_token === token) {
          if (error && error.status === 401) {
            videoReady = false;
            videoReadyUserId = null;
            nextRetryDelay = 0;
            videoAccessError = 'Your video session is no longer valid. Refresh your sign-in to watch lessons.';
          } else {
            videoReady = wasVideoReady && videoReadyUserId === userId;
            if (!videoReady) videoReadyUserId = null;
            nextRetryDelay = error && Number.isFinite(error.retryAfter) ? error.retryAfter * 1000 : 30000;
            videoAccessError = 'Video access is temporarily unavailable. Your account remains signed in; retry shortly.';
          }
        } else {
          videoReady = false;
          videoReadyUserId = null;
          videoAccessError = '';
        }
        return false;
      }).then(function (result) {
        if (token && currentSession && currentSession.access_token === token && nextRetryDelay > 0) scheduleVideoRetry(token, nextRetryDelay);
        notify();
        return result;
      });
      return cookieSync;
    }

    function acceptSession(session) {
      var id = session && session.user && session.user.id || null;
      var token = session && session.access_token || null;
      var changed = id !== lastUserId || token !== lastToken;
      if (!session) currentTicket = null;
      currentSession = session || null;
      lastUserId = id;
      if (!changed) { notify(); return; }
      syncVideoSession(session).then(notify);
    }

    function authError(error) {
      if (!error) return 'The account request could not be completed.';
      var message = typeof error === 'string' ? error : String(error.message || error);
      message = String(message || '').trim();
      if (!message) return 'The account request could not be completed.';
      if (/^(load failed|failed to fetch|network request failed|networkerror)$/i.test(message)
        || /fetch(?:ing)? failed|load failed|network.*failed/i.test(message)) {
        return 'Account services could not be reached. Check your connection and try again.';
      }
      if (/cors|cross[- ]origin|blocked by cors|origin.*not allowed|not allowed.*origin/i.test(message)) {
        return 'The account service is temporarily unavailable. Please try again.';
      }
      return message.length > 240 ? message.slice(0, 237) + '…' : message;
    }

    function readBase(userId) {
      if (!localStorage || !userId) return null;
      try {
        var value = localStorage.getItem('cci-study-progress-base.' + userId);
        return value ? JSON.parse(value) : null;
      } catch (error) { return null; }
    }

    function writeBase(userId, snapshot) {
      if (!localStorage || !userId) return false;
      try { localStorage.setItem('cci-study-progress-base.' + userId, JSON.stringify(snapshot)); return true; }
      catch (error) { return false; }
    }

    function deviceId(preferred) {
      if (cachedDeviceId) return cachedDeviceId;
      if (typeof preferred === 'string' && /^[a-zA-Z0-9._-]{16,120}$/.test(preferred)) return (cachedDeviceId = preferred);
      var key = 'cci-study-sync-device-id';
      if (localStorage) {
        try {
          var saved = localStorage.getItem(key);
          if (typeof saved === 'string' && /^[a-zA-Z0-9._-]{16,120}$/.test(saved)) return (cachedDeviceId = saved);
        } catch (error) {}
      }
      var bytes = new Uint8Array(16), cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto;
      if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
      else for (var index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
      var generated = 'device-' + Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      cachedDeviceId = generated;
      if (localStorage) { try { localStorage.setItem(key, generated); } catch (error) {} }
      return generated;
    }

    function cleanUpClient() {
      if (authSubscription && typeof authSubscription.unsubscribe === 'function') authSubscription.unsubscribe();
      if (client && client.auth && typeof client.auth.stopAutoRefresh === 'function') client.auth.stopAutoRefresh();
      clearVideoRetryTimer();
      if (resumeHandler && typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('focus', resumeHandler);
        window.removeEventListener('online', resumeHandler);
        if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', resumeHandler);
      }
      resumeHandler = null;
      authSubscription = null; client = null; currentSession = null; lastToken = null; lastUserId = null; configured = false; videoReady = false; videoReadyUserId = null; videoAccessError = '';
    }

    function init(changeHandler) {
      if (typeof changeHandler === 'function') onChange = changeHandler;
      if (initializationPromise) return initializationPromise;
      if (configured && initializationState === 'ready') { notify(); return Promise.resolve(status()); }
      cleanUpClient();
      var requestId = ++lifecycleId;
      initializationError = '';
      if (!fetcher || !supabaseApi || typeof supabaseApi.createClient !== 'function') {
        initializationState = 'unconfigured';
        initializationError = 'Account support is not available in this app build.';
        notify(); return Promise.resolve(status());
      }
      initializationState = 'loading';
      notify();
      initializationPromise = (async function () {
        try {
          var controller = typeof AbortController === 'function' ? new AbortController() : null;
          var timeout = setTimeout(function () { if (controller) controller.abort(); }, 2500);
          var response;
          try { response = await fetcher(apiBase + '/api/auth/config', { credentials: 'include', cache: 'no-store', signal: controller ? controller.signal : undefined }); }
          finally { clearTimeout(timeout); }
          if (requestId !== lifecycleId) return status();
          var config = await response.json();
          if (requestId !== lifecycleId) return status();
          if (!response.ok || !config.configured || !config.url || !config.publishableKey) {
            var configError = new Error('Account service is not configured.');
            configError.unconfigured = (response.ok || response.status === 503) && config.configured === false;
            throw configError;
          }
          client = supabaseApi.createClient(config.url, config.publishableKey, {
            auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
          });
          configured = true;
          var subscriptionResult = client.auth.onAuthStateChange(function (_event, session) { if (requestId === lifecycleId) acceptSession(session); });
          authSubscription = subscriptionResult && subscriptionResult.data && subscriptionResult.data.subscription || null;
          var result = await client.auth.getSession();
          if (requestId !== lifecycleId) return status();
          if (result.error) throw result.error;
          acceptSession(result.data && result.data.session || null);
          resumeHandler = function () {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
              if (currentSession) syncVideoSession(currentSession, true);
            }
          };
          if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('focus', resumeHandler);
            window.addEventListener('online', resumeHandler);
            if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', resumeHandler);
          }
          initializationState = 'ready';
        } catch (error) {
          if (requestId !== lifecycleId) return status();
          cleanUpClient();
          initializationState = error && error.unconfigured ? 'unconfigured' : 'unavailable';
          initializationError = initializationState === 'unconfigured'
            ? 'Account services are not configured yet.'
            : 'Account services could not be reached. Check your connection and try again.';
          if (typeof options.onError === 'function') options.onError(authError(error));
        }
        notify();
        return status();
      })().finally(function () { if (requestId === lifecycleId) initializationPromise = null; });
      return initializationPromise;
    }

    function retry() {
      return init();
    }

    async function signUp(email, password) {
      if (!client) return { error: 'Account service is not configured.' };
      var result = await client.auth.signUp({ email: String(email || '').trim(), password: String(password || ''), options: { emailRedirectTo: (typeof window !== 'undefined' ? window.location.origin : apiBase) } });
      if (result.error) return { error: authError(result.error) };
      if (result.data.session) { acceptSession(result.data.session); await cookieSync; }
      return { user: result.data.user || null, session: result.data.session || null, videoReady: videoReady, videoAccessError: videoAccessError, confirmationRequired: !result.data.session };
    }

    async function signIn(email, password) {
      if (!client) return { error: 'Account service is not configured.' };
      var result = await client.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
      if (result.error) return { error: authError(result.error) };
      acceptSession(result.data.session);
      await cookieSync;
      return { user: result.data.user || null, session: result.data.session || null, videoReady: videoReady, videoAccessError: videoAccessError };
    }

    async function signOut() {
      if (!client) return { error: 'Account service is not configured.' };
      var result = await client.auth.signOut({ scope: 'local' });
      if (result.error) return { error: authError(result.error) };
      acceptSession(null);
      await cookieSync;
      return { ok: true };
    }

    async function readProgress() {
      if (!client) throw new Error('Account service is not configured.');
      var result = await client.rpc('get_user_progress');
      if (result.error) throw result.error;
      return result.data || { version: 0, data: null };
    }

    async function writeProgress(expectedVersion, snapshot) {
      if (!client) throw new Error('Account service is not configured.');
      var result = await client.rpc('sync_user_progress', { p_expected_version: expectedVersion, p_data: snapshot });
      if (result.error) throw result.error;
      return result.data;
    }

    async function syncProgress(localSnapshot, syncEngine, additionalSnapshot, stableDeviceId) {
      if (!currentSession || !syncEngine) throw new Error('Sign in to sync study progress.');
      var userId = currentSession.user.id;
      var activeDeviceId = deviceId(stableDeviceId);
      var base = readBase(userId), baseInitialized = !!base;
      for (var attempt = 0; attempt < 6; attempt++) {
        var remote = await readProgress();
        var remoteVersion = Number.isInteger(remote.version) && remote.version >= 0 ? remote.version : 0;
        var remoteSnapshot = remote.data || syncEngine.empty();
        if (!baseInitialized) { base = remoteVersion > 0 ? remoteSnapshot : syncEngine.empty(); baseInitialized = true; }
        var merged = typeof syncEngine.mergeForDevice === 'function'
          ? syncEngine.mergeForDevice(base, localSnapshot, remoteSnapshot, activeDeviceId, additionalSnapshot)
          : syncEngine.merge(base, additionalSnapshot ? syncEngine.merge(syncEngine.empty(), localSnapshot, additionalSnapshot) : localSnapshot, remoteSnapshot);
        if (typeof syncEngine.validateSnapshotSize === 'function') {
          syncEngine.validateSnapshotSize(merged);
        }
        var result = await writeProgress(remoteVersion, merged);
        if (result && result.ok === true) {
          var checkpointSaved = writeBase(userId, merged);
          return { snapshot: merged, version: result.version, deviceId: activeDeviceId, imported: !!additionalSnapshot, checkpointSaved: checkpointSaved };
        }
        if (!result || result.ok !== false) throw new Error('Cloud progress returned an invalid response.');
        if (attempt < 5) {
          var backoff = Math.min(600, 30 * Math.pow(2, attempt));
          var jitter = Math.floor(Math.random() * (backoff / 2));
          await sleep(backoff + jitter);
        }
      }
      throw new Error('Progress changed on another device. Try syncing again while online.');
    }

    function destroy() {
      ++lifecycleId;
      cleanUpClient();
      initializationPromise = null;
      initializationState = 'idle';
      initializationError = '';
    }

    function playbackTicket() {
      return currentTicket || (currentSession && currentSession.access_token) || '';
    }

    return { init: init, retry: retry, status: status, signUp: signUp, signIn: signIn, signOut: signOut, syncProgress: syncProgress, syncVideoSession: syncVideoSession, playbackTicket: playbackTicket, destroy: destroy, apiBase: apiBase };
  }

  return { create: createAccount, DEFAULT_API_BASE: DEFAULT_API_BASE };
});
