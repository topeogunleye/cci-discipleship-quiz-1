'use strict';

const VIDEO_COOKIE = '__Host-cci-video-session';

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
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) throw authServiceUnavailable(30);
  return user;
}

function videoToken(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== VIDEO_COOKIE) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch (error) { return ''; }
  }
  return '';
}

function videoCookie(accessToken, maxAge) {
  if (!accessToken) return VIDEO_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
  return VIDEO_COOKIE + '=' + encodeURIComponent(accessToken) + '; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=' + Math.max(1, Math.min(300, Math.floor(maxAge || 300)));
}

module.exports = { VIDEO_COOKIE, jsonResponse, isPublishableKey, supabaseConfig, allowedOrigins, withCors, originAllowed, authServiceUnavailable, authServiceUnavailableResponse, getAuthenticatedUser, videoToken, videoCookie };
