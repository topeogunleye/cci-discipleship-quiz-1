const ESV_PASSAGE_TEXT_URL = 'https://api.esv.org/v3/passage/text/';
const MAX_REFERENCE_LENGTH = 180;
const UPSTREAM_TIMEOUT_MS = 5000;
const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

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

async function checkRateLimit(request, env) {
  const limiterService = env && env.ESV_RATE_LIMITER;
  if (!limiterService || typeof limiterService.fetch !== 'function') return 'unavailable';

  // Cloudflare supplies this header at the edge. Do not trust client-provided
  // forwarding headers as a substitute for the actual connecting IP.
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp) return 'unavailable';

  try {
    const limiterRequest = new Request('https://esv-rate-limiter.internal/check', {
      method: 'POST',
      headers: { 'X-ESV-Client-IP': clientIp }
    });
    const result = await limiterService.fetch(limiterRequest);
    if (result.status === 429) return 'limited';
    return result.ok ? 'allowed' : 'unavailable';
  } catch (error) {
    // Fail closed if the private rate-limiter Worker is unavailable so requests
    // do not continue to consume the shared upstream ESV quota unprotected.
    return 'unavailable';
  }
}

export async function onRequestGet(context) {
  const { request, env } = context || {};
  const url = new URL(request.url);
  const reference = url.searchParams.get('q') || '';
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9 .,:;\u2013\u2014-]*$/.test(reference)) {
    return jsonResponse({ error: 'Enter a valid Bible passage reference.' }, 400);
  }
  if (!env || !env.ESV_API_KEY) {
    return jsonResponse({ error: 'ESV passage previews are not configured.' }, 503);
  }

  const rateLimit = await checkRateLimit(request, env);
  if (rateLimit === 'limited') {
    return jsonResponse({ error: 'Too many passage requests. Please try again shortly.' }, 429, {
      'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS)
    });
  }
  if (rateLimit === 'unavailable') {
    return jsonResponse({ error: 'The ESV passage service is temporarily unavailable.' }, 503, {
      'Retry-After': '30'
    });
  }

  const canonicalRef = reference.trim().replace(/\s+/g, ' ');

  const apiUrl = new URL(ESV_PASSAGE_TEXT_URL);
  apiUrl.searchParams.set('q', canonicalRef);
  apiUrl.searchParams.set('include-headings', 'false');
  apiUrl.searchParams.set('include-footnotes', 'false');
  apiUrl.searchParams.set('include-verse-numbers', 'false');
  apiUrl.searchParams.set('include-passage-references', 'false');
  apiUrl.searchParams.set('include-short-copyright', 'true');

  const canAbortUpstream = typeof AbortController === 'function' && typeof setTimeout === 'function';
  const controller = canAbortUpstream ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT_MS) : null;
  try {
    const fetchOptions = {
      headers: {
        Accept: 'application/json',
        Authorization: 'Token ' + env.ESV_API_KEY
      }
    };
    if (controller) fetchOptions.signal = controller.signal;
    const response = await fetch(apiUrl.toString(), fetchOptions);
    if (!response.ok) return jsonResponse({ error: 'The ESV passage could not be loaded.' }, response.status === 429 ? 503 : 502);

    const data = await response.json();
    const text = Array.isArray(data.passages)
      ? data.passages.filter(function (passage) { return typeof passage === 'string'; }).join('\n\n').trim()
      : '';
    if (!text) return jsonResponse({ error: 'The ESV passage could not be found.' }, 404);

    return jsonResponse({ text: text }, 200);
  } catch (error) {
    return jsonResponse({ error: 'The ESV passage service is temporarily unavailable.' }, 502);
  } finally {
    if (timeoutId !== null && typeof clearTimeout === 'function') clearTimeout(timeoutId);
  }
}
