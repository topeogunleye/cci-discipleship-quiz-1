import bible from '../_lib/api-bible.cjs';
import references from '../_lib/youversion.cjs';
import auth from '../_lib/auth.cjs';

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
    const limitedFetch = async (url, options) => {
      const limiter = env.ESV_RATE_LIMITER, ip = request.headers.get('CF-Connecting-IP');
      if (!limiter || typeof limiter.fetch !== 'function' || !ip) throw new Error('Limiter unavailable');
      const reservation = await limiter.fetch(new Request('https://esv-rate-limiter.internal/check/apibible', {
        method: 'POST', headers: { 'X-ESV-Client-IP': ip }, signal: AbortSignal.timeout(5000)
      }));
      if (!reservation.ok) { const error = new Error('Bible request limit'); error.status = reservation.status; throw error; }
      return fetch(url, options);
    };
    if (catalogRequest) return reply({ versions: await bible.verifiedVersions(env.API_BIBLE_KEY, limitedFetch) });
    const result = await bible.passage(reference, version, env.API_BIBLE_KEY, limitedFetch);
    return reply(result, result.status || 200);
  } catch (error) {
    if (error.status === 429) { headers.set('Retry-After', '60'); return reply({ error: 'Too many Bible requests. Please try again shortly.' }, 429); }
    if ([403, 404].includes(error.status)) return reply({ error: 'This passage or translation is unavailable.' }, error.status);
    return reply({ error: 'Bible service unavailable. Please try again later.' }, 503);
  }
}
