const TTL_SECONDS = 7 * 24 * 60 * 60;
const pending = new Map();

// Cache only successful, attributed Scripture responses. Metadata, failures and
// ESV content never pass through this cache. The raw key is never stored in a URL.
function createCachedFetch({ cache, origin, fetcher, onStatus = () => {}, now = Date.now, cryptoImpl = globalThis.crypto }) {
  return async (url, options) => {
    const parsed = new URL(url);
    const eligible = parsed.origin === 'https://rest.api.bible' && /^\/v1\/bibles\/[a-zA-Z0-9-]+\/(?:passages|chapters)\//.test(parsed.pathname);
    if (!eligible) return fetcher(url, options);
    if (!cache || !cryptoImpl?.subtle) { onStatus('BYPASS'); return fetcher(url, options); }
    const keyMaterial = String(options?.headers?.['api-key'] || '') + '\n' + parsed.href;
    const hash = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
    const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    const key = new Request(new URL('/__api-bible-cache/v1/' + digest, origin).href);
    try {
      const cached = await cache.match(key);
      const storedAt = Number(cached?.headers.get('X-CCI-Cached-At'));
      const age = now() - storedAt;
      if (cached?.ok && Number.isFinite(storedAt) && storedAt > 0 && age >= 0 && age < TTL_SECONDS * 1000) {
        onStatus('HIT'); return cached;
      }
    } catch (_) { /* A cache failure must not take down the upstream service. */ }
    onStatus('MISS');
    if (!pending.has(key.url)) {
      const load = (async () => {
        const response = await fetcher(url, options);
        if (response.ok) {
          try {
            const data = await response.clone().json();
            if (typeof data.data?.content === 'string' && data.data.content.trim() && typeof data.data.copyright === 'string' && data.data.copyright.trim()) {
              const stored = new Response(JSON.stringify(data), { headers: {
                'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + TTL_SECONDS,
                'X-CCI-Cached-At': String(now())
              } });
              await cache.put(key, stored);
            }
          } catch (_) { /* Invalid or uncachable responses are returned, never stored. */ }
        }
        return response;
      })();
      pending.set(key.url, load);
    }
    const load = pending.get(key.url);
    try { return (await load).clone(); } finally { if (pending.get(key.url) === load) pending.delete(key.url); }
  };
}

module.exports = { createCachedFetch, TTL_SECONDS };
