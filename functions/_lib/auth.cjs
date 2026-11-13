'use strict';

const VIDEO_COOKIE = '__Host-cci-video-session';
const JWKS_TTL_MS = 5 * 60 * 1000;
const JWKS_UNKNOWN_KID_REFRESH_COOLDOWN_MS = 30 * 1000;
const JWKS_FAILURE_BACKOFF_MS = 30 * 1000;
const jwksCache = new Map();
const jwksInflight = new Map();
const jwksRefreshAt = new Map();
const jwksFailureUntil = new Map();

function jsonResponse(body, status, headers) {
  const resultHeaders = new Headers(headers || {});
  resultHeaders.set('Cache-Control', 'no-store');
  resultHeaders.set('Content-Type', 'application/json; charset=utf-8');
  resultHeaders.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status: status || 200, headers: resultHeaders });
}

function isPublishableKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).role === 'anon';
  } catch (error) { return false; }
}

function supabaseConfig(env) {
  env = env || {};
  const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/$/, '') : '';
  const key = typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY.trim() : (typeof env.SUPABASE_PUBLISHABLE_KEY === 'string' ? env.SUPABASE_PUBLISHABLE_KEY.trim() : '');
  if (!url || !isPublishableKey(key)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
    return { url: parsed.origin, anonKey: key };
  } catch (error) { return null; }
}

function allowedOrigins(request, env) {
  const origins = new Set();
  function serializedOrigin(value) {
    const parsed = new URL(value);
    return parsed.origin === 'null' ? parsed.protocol + '//' + parsed.host : parsed.origin;
  }
  try { origins.add(serializedOrigin(request.url)); } catch (error) {}
  String((env || {}).ALLOWED_APP_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).forEach(value => {
    try { origins.add(serializedOrigin(value)); } catch (error) {}
  });
  return origins;
}

function withCors(headers, request, env) {
  const result = new Headers(headers || {});
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins(request, env).has(origin)) {
    result.set('Access-Control-Allow-Origin', origin);
    result.set('Access-Control-Allow-Credentials', 'true');
    result.set('Vary', 'Origin');
  }
  return result;
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(request, env).has(origin);
}

function authServiceUnavailable(retryAfter) {
  const error = new Error('Authentication service is temporarily unavailable.');
  error.name = 'AuthServiceUnavailableError';
  const seconds = retryAfter === null || retryAfter === undefined || retryAfter === '' ? NaN : Number(retryAfter);
  error.retryAfter = Number.isFinite(seconds) ? Math.max(1, Math.min(300, Math.floor(seconds))) : 30;
  return error;
}

function authServiceUnavailableResponse(request, env, error) {
  const seconds = Number(error && error.retryAfter);
  const retryAfter = Number.isFinite(seconds) ? Math.max(1, Math.min(300, Math.floor(seconds))) : 30;
  const headers = withCors({ 'Retry-After': String(retryAfter) }, request, env);
  return jsonResponse({ error: 'Authentication service is temporarily unavailable. Please retry.' }, 503, headers);
}

function isUserId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

async function getAuthenticatedUser(accessToken, env, fetcher) {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) return null;
  const config = supabaseConfig(env);
  if (!config) throw authServiceUnavailable(30);
  const requestFetch = fetcher || fetch;
  let response;
  try {
    response = await requestFetch(config.url + '/auth/v1/user', {
      headers: { apikey: config.anonKey, Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      cache: 'no-store'
    });
  } catch (error) { throw authServiceUnavailable(30); }
  if (response.status === 401) return null;
  if (!response.ok) {
    const retryAfter = response.status === 429 ? response.headers.get('Retry-After') : null;
    throw authServiceUnavailable(retryAfter);
  }
  let user;
  try { user = await response.json(); }
  catch (error) { throw authServiceUnavailable(30); }
  if (!user || !isUserId(user.id)) throw authServiceUnavailable(30);
  return user;
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded token segment.');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJwt(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (!header || typeof header !== 'object' || Array.isArray(header) || !claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
    return { header, claims, signature: decodeBase64Url(parts[2]), signingInput: new TextEncoder().encode(parts[0] + '.' + parts[1]) };
  } catch (error) { return null; }
}

function accessTokenExpiration(token) {
  const decoded = decodeJwt(token);
  return decoded && Number.isFinite(decoded.claims.exp) ? decoded.claims.exp : null;
}

function accessTokenSubject(token) {
  const decoded = decodeJwt(token);
  return decoded && isUserId(decoded.claims.sub) ? decoded.claims.sub : null;
}

async function fetchJwks(url, fetcher, forceRefresh) {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.keys;
  if (jwksInflight.has(url)) return jwksInflight.get(url);
  const retryAt = jwksFailureUntil.get(url) || 0;
  if (retryAt > now) {
    if (cached && cached.expiresAt > now) return cached.keys;
    throw authServiceUnavailable(Math.max(1, Math.ceil((retryAt - now) / 1000)));
  }
  if (forceRefresh) {
    const lastRefreshAt = jwksRefreshAt.get(url) || 0;
    if (now - lastRefreshAt < JWKS_UNKNOWN_KID_REFRESH_COOLDOWN_MS) {
      return cached ? cached.keys : fetchJwks(url, fetcher, false);
    }
    // Throttle refreshes per Supabase project, not per attacker-controlled kid.
    jwksRefreshAt.set(url, now);
  }
  const requestFetch = fetcher || fetch;
  const request = Promise.resolve().then(() => requestFetch(url + '/auth/v1/.well-known/jwks.json', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  })).then(async response => {
    if (!response || !response.ok) throw authServiceUnavailable(30);
    let data;
    try { data = await response.json(); } catch (error) { throw authServiceUnavailable(30); }
    if (!data || !Array.isArray(data.keys)) throw authServiceUnavailable(30);
    const keys = data.keys.filter(key => key && typeof key === 'object' && typeof key.kid === 'string');
    jwksCache.set(url, { keys, expiresAt: Date.now() + JWKS_TTL_MS });
    jwksFailureUntil.delete(url);
    return keys;
  }).catch(error => {
    jwksFailureUntil.set(url, Date.now() + JWKS_FAILURE_BACKOFF_MS);
    if (error && error.name === 'AuthServiceUnavailableError') throw error;
    throw authServiceUnavailable(30);
  }).finally(() => jwksInflight.delete(url));
  jwksInflight.set(url, request);
  return request;
}

function validAccessClaims(claims, issuer, nowSeconds) {
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return claims.iss === issuer
    && audiences.includes('authenticated')
    && claims.role === 'authenticated'
    && isUserId(claims.sub)
    && Number.isFinite(claims.exp)
    && claims.exp > nowSeconds
    && (claims.nbf === undefined || (Number.isFinite(claims.nbf) && claims.nbf <= nowSeconds + 30));
}

async function verifySupabaseAccessToken(accessToken, env, fetcher, nowMilliseconds) {
  const config = supabaseConfig(env);
  if (!config) throw authServiceUnavailable(30);
  const decoded = decodeJwt(accessToken);
  if (!decoded) return null;
  const header = decoded.header;
  const claims = decoded.claims;
  if ((Array.isArray(header.crit) && header.crit.length) || header.b64 === false) return null;
  if (!validAccessClaims(claims, config.url + '/auth/v1', Math.floor((nowMilliseconds === undefined ? Date.now() : nowMilliseconds) / 1000))) return null;
  const subtle = typeof crypto !== 'undefined' && crypto && crypto.subtle;
  if (!subtle) throw authServiceUnavailable(30);

  let key;
  let algorithm;
  try {
    if (header.alg === 'HS256') {
      const secret = typeof (env || {}).SUPABASE_JWT_SECRET === 'string' ? env.SUPABASE_JWT_SECRET : '';
      if (!secret) {
        if ((env || {}).VIDEO_AUTH_MODE === 'remote') return getAuthenticatedUser(accessToken, env, fetcher);
        throw authServiceUnavailable(30);
      }
      key = await subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      algorithm = { name: 'HMAC' };
    } else if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (typeof header.kid !== 'string' || !header.kid || header.kid.length > 200) return null;
      let keys = await fetchJwks(config.url, fetcher, false);
      let jwk = keys.find(candidate => candidate.kid === header.kid && candidate.alg === header.alg);
      if (!jwk) {
        keys = await fetchJwks(config.url, fetcher, true);
        jwk = keys.find(candidate => candidate.kid === header.kid && candidate.alg === header.alg);
      }
      if (!jwk || (jwk.use && jwk.use !== 'sig') || (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes('verify'))) return null;
      if (header.alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256') {
        key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        algorithm = { name: 'ECDSA', hash: 'SHA-256' };
      } else if (header.alg === 'RS256' && jwk.kty === 'RSA') {
        key = await subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        algorithm = { name: 'RSASSA-PKCS1-v1_5' };
      } else return null;
    } else return null;
    const valid = await subtle.verify(algorithm, key, decoded.signature, decoded.signingInput);
    return valid ? { id: claims.sub } : null;
  } catch (error) {
    if (error && error.name === 'AuthServiceUnavailableError') throw error;
    return null;
  }
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(obj) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function ticketSigningKey(env) {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  if (!subtle) return null;
  const secret = env && typeof env.VIDEO_TICKET_SECRET === 'string' ? env.VIDEO_TICKET_SECRET : '';
  const encoder = new TextEncoder();
  if (encoder.encode(secret).byteLength < 32) return null;
  return subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createPlaybackTicket(userId, videoId, lifetimeSeconds, env) {
  if (!isUserId(userId) || typeof videoId !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(videoId)) return null;
  const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  if (!subtle) return null;
  const now = Math.floor(Date.now() / 1000);
  const requestedLifetime = Number.isFinite(lifetimeSeconds) ? Math.floor(lifetimeSeconds) : 3600;
  if (requestedLifetime <= 0) return null;
  const exp = now + Math.min(3600, requestedLifetime);
  const header = { alg: 'HS256', typ: 'TICKET' };
  const claims = { iss: 'cci-study', aud: 'cci-study-video', sub: userId, key: videoId, iat: now, nbf: now, exp: exp, typ: 'ticket' };
  const signingInput = base64UrlJson(header) + '.' + base64UrlJson(claims);
  const key = await ticketSigningKey(env);
  if (!key) return null;
  const signatureBytes = await subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return signingInput + '.' + encodeBase64Url(new Uint8Array(signatureBytes));
}

function isPlaybackTicket(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) return false;
  const decoded = decodeJwt(token);
  return !!(decoded && decoded.header && decoded.header.alg === 'HS256' && decoded.header.typ === 'TICKET');
}

async function verifyPlaybackTicket(ticket, requestedVideoId, env) {
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 8192) return null;
  const decoded = decodeJwt(ticket);
  if (!decoded || !decoded.header || decoded.header.alg !== 'HS256' || decoded.header.typ !== 'TICKET') return null;
  const claims = decoded.claims;
  if (!claims || claims.typ !== 'ticket' || claims.iss !== 'cci-study' || claims.aud !== 'cci-study-video' || !isUserId(claims.sub)) return null;
  if (typeof requestedVideoId !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(requestedVideoId) || claims.key !== requestedVideoId) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.iat) || claims.iat > now + 30 || !Number.isFinite(claims.nbf) || claims.nbf > now + 30 || !Number.isFinite(claims.exp) || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > 3600) return null;
  try {
    const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!subtle) return null;
    const key = await ticketSigningKey(env);
    if (!key) return null;
    const valid = await subtle.verify('HMAC', key, decoded.signature, decoded.signingInput);
    return valid ? { id: claims.sub, ticket: true } : null;
  } catch (e) { return null; }
}
function videoToken(request) {
  if (!request) return '';
  if (typeof request.url === 'string') {
    try {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get('ticket');
      if (queryToken && typeof queryToken === 'string' && queryToken.length >= 20 && queryToken.length <= 8192) {
        return queryToken.trim();
      }
    } catch (e) {}
  }
  if (request.headers && typeof request.headers.get === 'function') {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const bearer = authHeader.slice(7).trim();
      if (bearer.length >= 20 && bearer.length <= 8192) return bearer;
    }
    const raw = request.headers.get('Cookie') || '';
    for (const part of raw.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== VIDEO_COOKIE) continue;
      try { return decodeURIComponent(part.slice(separator + 1).trim()); }
      catch (error) { return ''; }
    }
  }
  return '';
}

function videoCookie(accessToken, maxAge) {
  if (!accessToken) return VIDEO_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
  const requestedAge = Number(maxAge);
  const lifetime = Number.isFinite(requestedAge) ? requestedAge : 3600;
  return VIDEO_COOKIE + '=' + encodeURIComponent(accessToken) + '; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=' + Math.max(1, Math.min(3600, Math.floor(lifetime)));
}

module.exports = { VIDEO_COOKIE, jsonResponse, isPublishableKey, supabaseConfig, allowedOrigins, withCors, originAllowed, authServiceUnavailable, authServiceUnavailableResponse, getAuthenticatedUser, verifySupabaseAccessToken, accessTokenExpiration, accessTokenSubject, createPlaybackTicket, verifyPlaybackTicket, isPlaybackTicket, videoToken, videoCookie, __test: { decodeJwt, validAccessClaims, resetJwksCache: () => { jwksCache.clear(); jwksInflight.clear(); jwksRefreshAt.clear(); jwksFailureUntil.clear(); } } };
