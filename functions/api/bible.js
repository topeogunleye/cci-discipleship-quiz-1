import bible from '../_lib/youversion.cjs';
import auth from '../_lib/auth.cjs';

export async function onRequestGet({ request, env }) {
  const headers = auth.withCors({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, request, env);
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!auth.originAllowed(request, env)) return reply({ error: 'Origin not allowed.' }, 403);
  const params = new URL(request.url).searchParams;
  if (['q', 'version', 'fallback'].some(name => params.getAll(name).length > 1)) return reply({ error: 'Duplicate query parameters are not supported.' }, 400);
  const reference = params.get('q'), version = params.get('version') || 'ASV';
  if ((reference !== null && !bible.passageIds(reference)) || !/^(?:[1-9]\d{0,9}|NKJV|ASV)$/.test(version)) return reply({ error: 'Enter a supported Bible reference and translation.' }, 400);
  if (params.has('fallback') && params.get('fallback') !== 'none') return reply({ error: 'Unsupported fallback policy.' }, 400);
  if (!env.YOUVERSION_APP_KEY) return reply({ error: 'Bible previews are not configured yet.' }, 503);
  try {
    // Reuse the deployed private limiter. Each upstream call reserves quota,
    // including catalog pages and fallback attempts; missing protection fails closed.
    const limitedFetch = async (url, options) => {
      const limiter = env.ESV_RATE_LIMITER, ip = request.headers.get('CF-Connecting-IP');
      if (!limiter || typeof limiter.fetch !== 'function' || !ip) throw new Error('Limiter unavailable');
      const reservation = await limiter.fetch(new Request('https://esv-rate-limiter.internal/check/youversion', {
        method: 'POST', headers: { 'X-ESV-Client-IP': ip }, signal: AbortSignal.timeout(5000)
      }));
      if (!reservation.ok) {
        const error = new Error('Bible request limit');
        error.status = reservation.status;
        error.retryAfter = reservation.headers.get('Retry-After'); error.limitSource = 'app';
        error.limitReason = reservation.headers.get('X-Bible-Limit-Reason');
        throw error;
      }
      return fetch(url, options);
    };
    const catalog = await bible.versions(env.YOUVERSION_APP_KEY, limitedFetch);
    if (reference === null) {
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
      return reply({ versions: catalog });
    }
    const result = await bible.passage(reference, version, catalog, env.YOUVERSION_APP_KEY, limitedFetch, { fallback: params.get('fallback') !== 'none' });
    const status = result.status || 200;
    const edition = String(result.version?.abbreviation || '').replace(/^eng/i, '').toUpperCase();
    const freshTranslation = params.has('fallback') || result.fallback || ['NKJV', '114', '1588'].includes(version) || ['NKJV', 'AMP'].includes(edition);
    if (status === 200 && !result.error && !freshTranslation) {
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    }
    return reply(result, status);
  } catch (error) {
    if (error.status === 429) {
      headers.set('Retry-After', /^\d+$/.test(error.retryAfter || '') ? String(error.retryAfter) : '60');
      headers.set('X-Bible-Limit-Source', error.limitSource || 'provider');
      headers.set('Access-Control-Expose-Headers', 'Retry-After, X-Bible-Limit-Source');
      return reply({ error: 'Bible previews are temporarily rate-limited. Please try again later.', source: error.limitSource || 'provider', reason: error.limitReason || 'rate-limit' }, 429);
    }
    return reply({ error: 'Bible service unavailable. Please try again later.' }, 503);
  }
}
