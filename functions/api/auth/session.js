import auth from '../../_lib/auth.cjs';

function cors(request, env) {
  return auth.withCors({ 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, request, env);
}

export function onRequestOptions({ request, env }) {
  if (!auth.originAllowed(request, env)) return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 204, headers: cors(request, env) });
}

export async function onRequestPost({ request, env }) {
  if (!auth.originAllowed(request, env)) return auth.jsonResponse({ error: 'This app origin is not allowed.' }, 403, cors(request, env));
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return auth.jsonResponse({ error: 'Expected a JSON request.' }, 415, cors(request, env));
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > 10000) return auth.jsonResponse({ error: 'Request is too large.' }, 413, cors(request, env));

  let body;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 10000) return auth.jsonResponse({ error: 'Request is too large.' }, 413, cors(request, env));
    body = JSON.parse(rawBody);
  } catch (error) { return auth.jsonResponse({ error: 'Invalid request.' }, 400, cors(request, env)); }
  const headers = cors(request, env);
  if (body && body.clear === true) {
    headers.append('Set-Cookie', auth.videoCookie('', 0));
    return auth.jsonResponse({ ok: true }, 200, headers);
  }

  let user;
  try { user = await auth.getAuthenticatedUser(body && body.accessToken, env); }
  catch (error) { return auth.authServiceUnavailableResponse(request, env, error); }
  if (!user) return auth.jsonResponse({ error: 'Sign in again to enable lesson video access.' }, 401, headers);
  const token = body.accessToken;
  // Bind the cookie to the same account whose signed token was remotely validated.
  // The subject is only trusted after getAuthenticatedUser accepts the token.
  if (auth.accessTokenSubject(token) !== user.id) return auth.jsonResponse({ error: 'Sign in again to enable lesson video access.' }, 401, headers);
  const expiresAt = auth.accessTokenExpiration(token);
  const remainingLifetime = expiresAt - Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expiresAt) || remainingLifetime <= 0) return auth.jsonResponse({ error: 'Sign in again to enable lesson video access.' }, 401, headers);
  const maxAge = Math.min(3600, remainingLifetime);
  headers.append('Set-Cookie', auth.videoCookie(token, maxAge));
  return auth.jsonResponse({ ok: true, user: { id: user.id } }, 200, headers);
}
