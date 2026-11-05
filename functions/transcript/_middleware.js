import auth from '../_lib/auth.cjs';
import transcripts from '../_generated/lesson-transcripts.cjs';

function headersFor(request, env) {
  return auth.withCors({ 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }, request, env);
}

export async function onRequest(context) {
  const request = context.request, env = context.env;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } });
  }
  if (!auth.originAllowed(request, env)) return auth.jsonResponse({ error: 'This app origin is not allowed.' }, 403, headersFor(request, env));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(request, env) });

  const pathname = new URL(request.url).pathname;
  const match = /^\/transcript\/([A-Za-z0-9._-]+\.vtt)$/i.exec(pathname);
  if (!match) return auth.jsonResponse({ error: 'Transcript not found.' }, 404, headersFor(request, env));

  const user = await auth.getAuthenticatedUser(auth.videoToken(request), env);
  if (!user) return auth.jsonResponse({ error: 'Sign in to view this lesson transcript.' }, 401, headersFor(request, env));

  const filename = match[1];
  if (!Object.hasOwn(transcripts, filename)) return auth.jsonResponse({ error: 'Transcript not found.' }, 404, headersFor(request, env));
  const text = transcripts[filename];
  const headers = headersFor(request, env);
  headers.set('Content-Type', 'text/vtt; charset=utf-8');
  headers.set('Content-Length', String(new TextEncoder().encode(text).byteLength));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(request.method === 'HEAD' ? null : text, { headers });
}
