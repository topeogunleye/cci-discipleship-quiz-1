import auth from '../_lib/auth.cjs';

function headersFor(request, env) {
  return auth.withCors({ 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }, request, env);
}

export async function onRequest(context) {
  const request = context.request, env = context.env;
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } });
  }
  if (!auth.originAllowed(request, env)) return auth.jsonResponse({ error: 'This app origin is not allowed.' }, 403, headersFor(request, env));

  const pathname = new URL(request.url).pathname;
  const filename = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (!/^[A-Za-z0-9._-]+\.vtt$/i.test(filename)) return auth.jsonResponse({ error: 'Transcript not found.' }, 404, headersFor(request, env));

  const user = await auth.getAuthenticatedUser(auth.videoToken(request), env);
  if (!user) return auth.jsonResponse({ error: 'Sign in to view this lesson transcript.' }, 401, headersFor(request, env));

  const response = await context.next();
  const headers = new Headers(response.headers);
  headersFor(request, env).forEach((value, key) => headers.set(key, value));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
