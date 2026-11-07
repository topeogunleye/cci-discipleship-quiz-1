const ESV_PASSAGE_TEXT_URL = 'https://api.esv.org/v3/passage/text/';
const MAX_REFERENCE_LENGTH = 180;
const CACHE_CONTROL_SUCCESS = 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400';

function jsonResponse(body, status, customHeaders) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      headers.set(key, value);
    }
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: headers
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context || {};
  const url = new URL(request.url);
  const reference = url.searchParams.get('q') || '';
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9 .,:;\u2013\u2014-]*$/.test(reference)) {
    return jsonResponse({ error: 'Enter a valid Bible passage reference.' }, 400);
  }
  if (!env || !env.ESV_API_KEY) {
    return jsonResponse({ error: 'ESV passage previews are not configured.' }, 503);
  }

  const canonicalRef = reference.trim().replace(/\s+/g, ' ');
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('q', canonicalRef);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  const cache = typeof caches !== 'undefined' && caches && caches.default ? caches.default : null;
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (cacheError) {}
  }

  const apiUrl = new URL(ESV_PASSAGE_TEXT_URL);
  apiUrl.searchParams.set('q', canonicalRef);
  apiUrl.searchParams.set('include-headings', 'false');
  apiUrl.searchParams.set('include-footnotes', 'false');
  apiUrl.searchParams.set('include-verse-numbers', 'false');
  apiUrl.searchParams.set('include-passage-references', 'false');
  apiUrl.searchParams.set('include-short-copyright', 'true');

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: 'Token ' + env.ESV_API_KEY
      }
    });
    if (!response.ok) return jsonResponse({ error: 'The ESV passage could not be loaded.' }, response.status === 429 ? 503 : 502);

    const data = await response.json();
    const text = Array.isArray(data.passages)
      ? data.passages.filter(function (passage) { return typeof passage === 'string'; }).join('\n\n').trim()
      : '';
    if (!text) return jsonResponse({ error: 'The ESV passage could not be found.' }, 404);

    const successResponse = jsonResponse({ text: text }, 200, { 'Cache-Control': CACHE_CONTROL_SUCCESS });
    if (cache) {
      try {
        const storePromise = cache.put(cacheKey, successResponse.clone());
        if (typeof waitUntil === 'function') waitUntil(storePromise);
        else if (context && typeof context.waitUntil === 'function') context.waitUntil(storePromise);
        else await storePromise;
      } catch (putError) {}
    }
    return successResponse;
  } catch (error) {
    return jsonResponse({ error: 'The ESV passage service is temporarily unavailable.' }, 502);
  }
}
