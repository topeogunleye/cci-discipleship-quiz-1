const ESV_PASSAGE_TEXT_URL = 'https://api.esv.org/v3/passage/text/';
// The app requests one linked citation at a time. Accept a single chapter,
// optionally narrowed to verse numbers/ranges, and cap the result at the
// longest biblical chapter (Psalm 119). This prevents callers from turning the
// public proxy into a multi-book or large-range ESV quota sink.
const MAX_REFERENCE_LENGTH = 80;
const MAX_CHAPTER = 150;
const MAX_VERSE = 176;
const MAX_VERSES_PER_REQUEST = 176;
// Crossway's ESV API terms allow up to 500 verses per query/page and no more than half of
// any book. Requests here are limited to a single chapter (at most 176 verses), and no
// chapter of a book with three or more chapters reaches half of that book, so the
// published limits hold by construction. Do not raise MAX_VERSES_PER_REQUEST above 500 or
// accept multi-chapter references without adding an explicit half-of-book check.
//
// The ESV terms also cap locally stored text at 500 verses in total, so passage text is
// never written to a shared server cache (Cache API, KV or R2). Responses are no-store;
// the app keeps a small in-memory copy per browser session.
const UPSTREAM_TIMEOUT_MS = 5000;

function isBoundedPassageReference(reference) {
  const match = /^([1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(\d{1,3})(?::\s*(\d{1,3}(?:\s*[-\u2013\u2014]\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*[-\u2013\u2014]\s*\d{1,3})?)*))?$/.exec(reference);
  if (!match) return false;
  const chapter = Number(match[2]);
  if (chapter < 1 || chapter > MAX_CHAPTER) return false;
  if (!match[3]) return true;

  let verseCount = 0;
  for (const part of match[3].split(',')) {
    const range = /^(\d{1,3})(?:\s*[-\u2013\u2014]\s*(\d{1,3}))?$/.exec(part.trim());
    if (!range) return false;
    const firstVerse = Number(range[1]);
    const lastVerse = Number(range[2] || range[1]);
    if (firstVerse < 1 || lastVerse > MAX_VERSE || firstVerse > lastVerse) return false;
    verseCount += lastVerse - firstVerse + 1;
    if (verseCount > MAX_VERSES_PER_REQUEST) return false;
  }
  return true;
}

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
  if (!limiterService || typeof limiterService.fetch !== 'function') return { status: 'unavailable' };

  // Cloudflare supplies this header at the edge. Do not trust client-provided
  // forwarding headers as a substitute for the actual connecting IP.
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp) return { status: 'unavailable' };

  try {
    const limiterRequest = new Request('https://esv-rate-limiter.internal/check/esv', {
      method: 'POST',
      headers: { 'X-ESV-Client-IP': clientIp }
    });
    const result = await limiterService.fetch(limiterRequest);
    if (result.status === 429) {
      return { status: 'limited', retryAfter: result.headers.get('Retry-After') || '60' };
    }
    return { status: result.ok ? 'allowed' : 'unavailable' };
  } catch (error) {
    // Fail closed if the private rate-limiter Worker is unavailable so requests
    // do not continue to consume the shared upstream ESV quota unprotected.
    return { status: 'unavailable' };
  }
}

export async function onRequestGet(context) {
  const { request, env } = context || {};
  const url = new URL(request.url);
  const references = url.searchParams.getAll('q');
  const reference = references.length === 1 ? references[0].trim().replace(/\s+/g, ' ') : '';
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || !isBoundedPassageReference(reference)) {
    return jsonResponse({ error: 'Enter a valid Bible passage reference.' }, 400);
  }
  if (!env || !env.ESV_API_KEY) {
    return jsonResponse({ error: 'ESV passage previews are not configured.' }, 503);
  }

  const rateLimit = await checkRateLimit(request, env);
  if (rateLimit.status === 'limited') {
    return jsonResponse({ error: 'Too many passage requests. Please try again later.' }, 429, {
      'Retry-After': String(rateLimit.retryAfter)
    });
  }
  if (rateLimit.status === 'unavailable') {
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
