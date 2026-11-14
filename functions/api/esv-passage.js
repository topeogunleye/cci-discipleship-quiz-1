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
// any book. Limit requests to one chapter, then validate the actual returned verse
// ranges and book size before displaying or caching them.
//
// The ESV terms also cap locally stored text at 500 verses in total, so passage text is
// never written to a shared server cache (Cache API, KV or R2). Responses are no-store;
// the app keeps a small in-memory copy per browser session.
const UPSTREAM_TIMEOUT_MS = 5000;

// Canonical verse totals in Crossway book order. NT totals conservatively
// exclude omitted verse numbers. Only counts are stored here, never ESV text.
// Versification data: https://gist.github.com/rmcguire/421ed209649bd0b62c9e3a8ed6cac177
const BOOK_VERSES = [0, 1533,1213,859,1288,959,658,618,85,810,695,816,719,942,822,280,406,167,1070,2461,915,222,117,1292,1364,154,1273,357,197,73,146,21,48,105,47,56,53,38,211,55,1067,673,1149,878,1003,432,437,257,149,155,104,95,89,47,113,83,46,25,303,108,105,61,105,13,15,25,404];

function cacheMetadata(parsed) {
  if (!Array.isArray(parsed) || !parsed.length) return null;
  let book = null, chapter = null, verseCount = 0;
  for (const range of parsed) {
    if (!Array.isArray(range) || range.length !== 2) return null;
    const [start, end] = range;
    const currentBook = Math.floor(start / 1000000);
    const currentChapter = Math.floor(start / 1000);
    // All returned ranges must stay inside the single requested chapter.
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || Math.floor(start / 1000) !== Math.floor(end / 1000) || !BOOK_VERSES[currentBook] || start % 1000 < 1 || end % 1000 > MAX_VERSE) return null;
    if ((book !== null && book !== currentBook) || (chapter !== null && chapter !== currentChapter)) return null;
    book = currentBook;
    chapter = currentChapter;
    verseCount += end - start + 1;
  }
  const bookLimit = Math.floor((BOOK_VERSES[book] - 1) / 2);
  if (verseCount > MAX_VERSES_PER_REQUEST || verseCount > bookLimit) return null;
  return { book, verseCount, bookLimit };
}

function normalizeSingleChapterReference(reference) {
  return reference.replace(/^(Obadiah|Philemon|2\s+John|3\s+John|Jude)\s+(\d[\d\s,–—-]*)$/i, '$1 1:$2');
}

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
      return { status: 'limited', retryAfter: result.headers.get('Retry-After') || '60', reason: result.headers.get('X-Bible-Limit-Reason') || 'rate-limit' };
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
  const reference = references.length === 1 ? normalizeSingleChapterReference(references[0].trim().replace(/\s+/g, ' ')) : '';
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || !isBoundedPassageReference(reference)) {
    return jsonResponse({ error: 'Enter a valid Bible passage reference.' }, 400);
  }
  if (!env || !env.ESV_API_KEY) {
    return jsonResponse({ error: 'ESV passage previews are not configured.' }, 503);
  }

  const rateLimit = await checkRateLimit(request, env);
  if (rateLimit.status === 'limited') {
    return jsonResponse({ error: 'ESV previews are temporarily rate-limited. Please try again later.', source: 'app', reason: rateLimit.reason }, 429, {
      'Retry-After': String(rateLimit.retryAfter), 'X-Bible-Limit-Source': 'app', 'Access-Control-Expose-Headers': 'Retry-After, X-Bible-Limit-Source'
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
    if (response.status === 429) return jsonResponse({ error: 'ESV previews are temporarily rate-limited. Please try again later.', source: 'provider' }, 429, {
      'Retry-After': /^\d+$/.test(response.headers.get('Retry-After') || '') ? response.headers.get('Retry-After') : '60',
      'X-Bible-Limit-Source': 'provider', 'Access-Control-Expose-Headers': 'Retry-After, X-Bible-Limit-Source'
    });
    if (!response.ok) return jsonResponse({ error: 'The ESV passage could not be loaded.' }, 502);

    const data = await response.json();
    const text = Array.isArray(data.passages)
      ? data.passages.filter(function (passage) { return typeof passage === 'string'; }).join('\n\n').trim()
      : '';
    if (!text) return jsonResponse({ error: 'The ESV passage could not be found.' }, 404);

    const cache = cacheMetadata(data.parsed);
    if (data.parsed !== undefined && !cache) return jsonResponse({ error: 'This ESV passage exceeds the supported verse or book limit.' }, 400);
    // Missing metadata may still be displayed, but must never enter the client cache.
    return jsonResponse(cache ? { text: text, cache } : { text: text }, 200);
  } catch (error) {
    return jsonResponse({ error: 'The ESV passage service is temporarily unavailable.' }, 502);
  } finally {
    if (timeoutId !== null && typeof clearTimeout === 'function') clearTimeout(timeoutId);
  }
}
