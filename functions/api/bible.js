import bible from '../_lib/youversion.cjs';
import auth from '../_lib/auth.cjs';

export async function onRequestGet({ request, env }) {
  const headers = auth.withCors({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }, request, env);
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!auth.originAllowed(request, env)) return reply({ error: 'Origin not allowed.' }, 403);
  const params = new URL(request.url).searchParams;
  const reference = params.get('q'), version = params.get('version') || 'NKJV';
  if ((reference !== null && !bible.passageIds(reference)) || !/^(?:[1-9]\d{0,9}|NKJV)$/.test(version)) return reply({ error: 'Enter a supported Bible reference and translation.' }, 400);
  if (!env.YOUVERSION_APP_KEY) return reply({ error: 'Bible previews are not configured yet.' }, 503);
  try {
    const catalog = await bible.versions(env.YOUVERSION_APP_KEY);
    if (reference === null) return reply({ versions: catalog });
    const result = await bible.passage(reference, version, catalog, env.YOUVERSION_APP_KEY);
    return reply(result, result.status || 200);
  } catch (error) {
    return reply({ error: 'Bible service unavailable. Please try again later.' }, 503);
  }
}
