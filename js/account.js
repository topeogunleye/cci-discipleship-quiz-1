(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.CCIAccount = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DEFAULT_API_BASE = 'https://cci-discipleship-quiz.pages.dev';

  function createAccount(options) {
    options = options || {};
    var fetcher = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    var supabaseApi = options.Supabase || (typeof root !== 'undefined' ? root.Supabase : null);
    var localStorage = Object.prototype.hasOwnProperty.call(options, 'localStorage') ? options.localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
    var apiBase = String(options.apiBase || (typeof window !== 'undefined' && window.CCI_API_BASE) || (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol) ? window.location.origin : DEFAULT_API_BASE)).replace(/\/$/, '');
    var client = null, authSubscription = null, onChange = null, currentSession = null, configured = false, videoReady = false;
    var cookieSync = Promise.resolve(), lastToken = null, lastUserId = null, cachedDeviceId = null, videoRefreshTimer = null;
    var resumeHandler = null;

    function status() {
      return { configured: configured, user: currentSession && currentSession.user ? currentSession.user : null, session: currentSession, videoReady: videoReady, apiBase: apiBase };
    }

    function notify() {
      if (typeof onChange === 'function') onChange(status());
    }

    function clearVideoRefreshTimer() {
      if (videoRefreshTimer !== null) clearTimeout(videoRefreshTimer);
      videoRefreshTimer = null;
    }

    function scheduleVideoRefresh(token) {
      clearVideoRefreshTimer();
      if (!token || typeof window === 'undefined' || !currentSession || currentSession.access_token !== token) return;
      videoRefreshTimer = setTimeout(function () {
        videoRefreshTimer = null;
        if (currentSession && currentSession.access_token === token) syncVideoSession(currentSession, true);
      }, 240000);
    }

    function syncVideoSession(session, force) {
      var token = session && session.access_token || '';
      if (token === lastToken && !force) { videoReady = !!token && videoReady; notify(); return Promise.resolve(videoReady); }
      lastToken = token;
      clearVideoRefreshTimer();
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
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to watch lessons.' : 'Video access could not be prepared.');
        videoReady = !!token && !!currentSession && currentSession.access_token === token;
        return videoReady;
      }).catch(function () { videoReady = false; return false; }).then(function (result) {
        if (token && currentSession && currentSession.access_token === token) scheduleVideoRefresh(token);
        notify();
        return result;
      });
      return cookieSync;
    }

    function acceptSession(session) {
      var id = session && session.user && session.user.id || null;
      var token = session && session.access_token || null;
      var changed = id !== lastUserId || token !== lastToken;
      currentSession = session || null;
      lastUserId = id;
      if (!changed) { notify(); return; }
      syncVideoSession(session).then(notify);
    }

    function authError(error) {
      if (!error) return 'The account request could not be completed.';
      var message = String(error.message || error);
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

    async function init(changeHandler) {
      onChange = changeHandler || null;
      if (!fetcher || !supabaseApi || typeof supabaseApi.createClient !== 'function') {
        configured = false; notify(); return status();
      }
      try {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timeout = setTimeout(function () { if (controller) controller.abort(); }, 2500);
        var response;
        try { response = await fetcher(apiBase + '/api/auth/config', { credentials: 'include', cache: 'no-store', signal: controller ? controller.signal : undefined }); }
        finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('Account service is not configured.');
        var config = await response.json();
        if (!config.configured || !config.url || !config.publishableKey) throw new Error('Account service is not configured.');
        client = supabaseApi.createClient(config.url, config.publishableKey, {
          auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
        });
        configured = true;
        var subscriptionResult = client.auth.onAuthStateChange(function (_event, session) { acceptSession(session); });
        authSubscription = subscriptionResult && subscriptionResult.data && subscriptionResult.data.subscription || null;
        var result = await client.auth.getSession();
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
      } catch (error) {
        configured = false;
        client = null;
        if (typeof options.onError === 'function') options.onError(authError(error));
      }
      notify();
      return status();
    }

    async function signUp(email, password) {
      if (!client) return { error: 'Account service is not configured.' };
      var result = await client.auth.signUp({ email: String(email || '').trim(), password: String(password || ''), options: { emailRedirectTo: (typeof window !== 'undefined' ? window.location.origin : apiBase) } });
      if (result.error) return { error: authError(result.error) };
      if (result.data.session) { acceptSession(result.data.session); await cookieSync; }
      return { user: result.data.user || null, session: result.data.session || null, videoReady: videoReady, confirmationRequired: !result.data.session };
    }

    async function signIn(email, password) {
      if (!client) return { error: 'Account service is not configured.' };
      var result = await client.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
      if (result.error) return { error: authError(result.error) };
      acceptSession(result.data.session);
      await cookieSync;
      return { user: result.data.user || null, session: result.data.session || null, videoReady: videoReady };
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
        var result = await writeProgress(remoteVersion, merged);
        if (result && result.ok === true) {
          var checkpointSaved = writeBase(userId, merged);
          return { snapshot: merged, version: result.version, deviceId: activeDeviceId, imported: !!additionalSnapshot, checkpointSaved: checkpointSaved };
        }
        if (!result || result.ok !== false) throw new Error('Cloud progress returned an invalid response.');
      }
      throw new Error('Progress changed on another device. Try syncing again while online.');
    }

    function destroy() {
      if (authSubscription && typeof authSubscription.unsubscribe === 'function') authSubscription.unsubscribe();
      clearVideoRefreshTimer();
      if (resumeHandler && typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('focus', resumeHandler);
        window.removeEventListener('online', resumeHandler);
        if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', resumeHandler);
      }
      resumeHandler = null;
      authSubscription = null; client = null; currentSession = null; lastToken = null; lastUserId = null; configured = false; videoReady = false;
    }

    return { init: init, status: status, signUp: signUp, signIn: signIn, signOut: signOut, syncProgress: syncProgress, syncVideoSession: syncVideoSession, destroy: destroy, apiBase: apiBase };
  }

  return { create: createAccount, DEFAULT_API_BASE: DEFAULT_API_BASE };
});
