import auth from '../_lib/auth.cjs';
import videoCatalog from '../_lib/video-catalog.cjs';

function cors(request, env) {
  return auth.withCors({ 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, ETag' }, request, env);
}

function safeObjectKey(value) {
  if (typeof value !== 'string' || value.length < 5 || value.length > 1024 || value.indexOf('\0') >= 0 || value.indexOf('\\') >= 0) return false;
  if (!/\.mp4$/i.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return true;
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  let offset, length;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size <= 0) return { invalid: true };
    length = Math.min(suffix, size);
    offset = size - length;
  } else {
    offset = Number(match[1]);
    const end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end < offset || offset >= size) return { invalid: true };
    length = Math.min(end, size - 1) - offset + 1;
  }
  return { offset, length };
}

function unauthorized(request, env) {
  return auth.jsonResponse({ error: 'Sign in to watch this lesson.' }, 401, cors(request, env));
}

export function onRequestOptions({ request, env }) {
  if (!auth.originAllowed(request, env)) return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 204, headers: cors(request, env) });
}

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } });
  if (!auth.originAllowed(request, env)) return auth.jsonResponse({ error: 'This app origin is not allowed.' }, 403, cors(request, env));
  let user;
  try { user = await auth.getAuthenticatedUser(auth.videoToken(request), env); }
  catch (error) { return auth.authServiceUnavailableResponse(request, env, error); }
  if (!user) return unauthorized(request, env);
  if (!env || !env.LESSON_VIDEOS) return auth.jsonResponse({ error: 'Lesson video storage is not configured.' }, 503, cors(request, env));

  const key = new URL(request.url).searchParams.get('key') || '';
  if (!safeObjectKey(key) || !videoCatalog.isCatalogVideoKey(key)) return auth.jsonResponse({ error: 'Lesson video not found.' }, 404, cors(request, env));
  const headers = cors(request, env);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', 'video/mp4');
  headers.set('Content-Disposition', 'inline');

  try {
    const object = request.method === 'HEAD'
      ? await env.LESSON_VIDEOS.head(key)
      : await env.LESSON_VIDEOS.get(key, request.headers.has('Range') ? { range: request.headers } : undefined);
    if (!object) return auth.jsonResponse({ error: 'Lesson video not found.' }, 404, headers);
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    const range = request.headers.has('Range') ? parseRange(request.headers.get('Range'), object.size) : null;
    if (range && range.invalid) {
      headers.set('Content-Range', 'bytes */' + object.size);
      return new Response(null, { status: 416, headers });
    }

    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(object.size));
      return new Response(null, { status: 200, headers });
    }
    if (!object.body) return auth.jsonResponse({ error: 'Lesson video could not be opened.' }, 503, headers);
    if (range && object.range) {
      const start = Number(object.range.offset);
      const length = Number(object.range.length);
      headers.set('Content-Length', String(length));
      headers.set('Content-Range', 'bytes ' + start + '-' + (start + length - 1) + '/' + object.size);
      return new Response(object.body, { status: 206, headers });
    }
    if (range) return auth.jsonResponse({ error: 'The requested video range could not be served.' }, 502, headers);
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    if (request.headers.has('Range')) {
      try {
        const metadata = await env.LESSON_VIDEOS.head(key);
        if (metadata) {
          const failedRange = parseRange(request.headers.get('Range'), metadata.size);
          if (failedRange && failedRange.invalid) {
            headers.set('Content-Range', 'bytes */' + metadata.size);
            return new Response(null, { status: 416, headers });
          }
        }
      } catch (headError) {}
    }
    return auth.jsonResponse({ error: 'Lesson video is temporarily unavailable.' }, 502, headers);
  }
}

export const __test = { safeObjectKey, parseRange };
