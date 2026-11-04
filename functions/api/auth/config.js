import auth from '../../_lib/auth.cjs';

function cors(request, env) {
  return auth.withCors({ 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, request, env);
}

export function onRequestOptions({ request, env }) {
  if (!auth.originAllowed(request, env)) return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 204, headers: cors(request, env) });
}

export function onRequestGet({ request, env }) {
  const config = auth.supabaseConfig(env);
  return auth.jsonResponse(config
    ? { configured: true, url: config.url, publishableKey: config.anonKey }
    : { configured: false }, config ? 200 : 503, cors(request, env));
}
