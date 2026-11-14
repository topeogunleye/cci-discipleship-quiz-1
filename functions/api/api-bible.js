import bible from '../_lib/api-bible.cjs';
import references from '../_lib/youversion.cjs';
import auth from '../_lib/auth.cjs';
import passageCache from '../_lib/api-bible-cache.cjs';

export async function onRequestGet({ request, env }) {
  const headers = auth.withCors({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, request, env);
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!auth.originAllowed(request, env)) return reply({ error: 'Origin not allowed.' }, 403);
  const params = new URL(request.url).searchParams;
  const reference = params.get('q'), version = params.get('version');
  const catalogRequest = reference === null && version === null;
  if (!catalogRequest && (params.getAll('q').length !== 1 || params.getAll('version').length !== 1 || !references.passageIds(reference) || !bible.supportedVersion(version))) return reply({ error: 'Enter a supported Bible reference and translation.' }, 400);
  if (!env.API_BIBLE_KEY) return reply({ error: 'Bible previews are not configured yet.' }, 503);
  try {
    const cacheStatuses = new Set();
    const limitedFetch = async (url, options) => {
      const limiter = env.ESV_RATE_LIMITER, ip = request.headers.get('CF-Connecting-IP');
      if (!limiter || typeof limiter.fetch !== 'function' || !ip) throw new Error('Limiter unavailable');
      const reservation = await limiter.fetch(new Request('https://esv-rate-limiter.internal/check/apibible', {
        method: 'POST', headers: { 'X-ESV-Client-IP': ip }, signal: AbortSignal.timeout(5000)
      }));
      if (!reservation.ok) {
        const error = new Error('Bible request limit'); error.status = reservation.status;
        error.retryAfter = reservation.headers.get('Retry-After'); error.limitSource = 'app';
        error.limitReason = reservation.headers.get('X-Bible-Limit-Reason'); throw error;
      }
      return fetch(url, options);
    };
    const cachedFetch = passageCache.createCachedFetch({
      cache: typeof caches === 'undefined' ? null : caches.default,
      origin: new URL(request.url).origin, fetcher: limitedFetch,
      onStatus: status => cacheStatuses.add(status)
    });
    if (catalogRequest) return reply({ versions: await bible.verifiedVersions(env.API_BIBLE_KEY, cachedFetch) });
    const result = await bible.passage(reference, version, env.API_BIBLE_KEY, cachedFetch);
    headers.set('X-Bible-Cache', cacheStatuses.size > 1 ? 'MIXED' : [...cacheStatuses][0] || 'BYPASS');
    return reply(result, result.status || 200);
  } catch (error) {
    if (error.status === 429) {
      headers.set('Retry-After', /^\d+$/.test(error.retryAfter || '') ? String(error.retryAfter) : '60');
      headers.set('X-Bible-Limit-Source', error.limitSource || 'provider');
      headers.set('Access-Control-Expose-Headers', 'Retry-After, X-Bible-Limit-Source');
      return reply({ error: 'Bible previews are temporarily rate-limited. Please try again later.', source: error.limitSource || 'provider', reason: error.limitReason || 'rate-limit' }, 429);
    }
    if ([403, 404].includes(error.status)) return reply({ error: 'This passage or translation is unavailable.' }, error.status);
    return reply({ error: 'Bible service unavailable. Please try again later.' }, 503);
  }
}
