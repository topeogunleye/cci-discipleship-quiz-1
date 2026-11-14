const { passageIds } = require('./youversion.cjs');
const API = 'https://rest.api.bible/v1';
const TITLES = { KJV: 'King James Version', MSG: 'The Message', GNT: 'Good News Translation' };
let cached = null;
let cachedKey = '';
let expires = 0;
let inflight = null;

async function upstream(path, key, fetcher) {
  const response = await fetcher(API + path, {
    headers: { 'api-key': key, Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const error = new Error('Bible service unavailable');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function versions(key, fetcher = fetch) {
  if (cachedKey === key && cached && Date.now() < expires) return cached;
  if (cachedKey === key && inflight) return inflight;
  if (cachedKey !== key) { cached = null; expires = 0; }
  cachedKey = key;
  const pending = (async () => {
    const result = await upstream('/bibles?language=eng', key, fetcher);
    if (!Array.isArray(result.data)) throw new Error('Invalid Bible catalog');
    const found = new Map();
    for (const bible of result.data) {
      if (bible.language?.id !== 'eng' || !/^[a-zA-Z0-9-]{1,80}$/.test(bible.id || '')) continue;
      const abbreviations = [bible.abbreviationLocal, bible.abbreviation].map(a => String(a || '').replace(/^eng/i, '').toUpperCase());
      const abbreviation = abbreviations.find(a => Object.hasOwn(TITLES, a));
      if (!abbreviation || found.has(abbreviation)) continue;
      found.set(abbreviation, { id: 'APIBIBLE_' + abbreviation, upstreamId: bible.id,
        abbreviation, title: TITLES[abbreviation], copyright: String(bible.copyright || ''), publisher: '' });
    }
    const catalog = [...found.values()];
    if (cachedKey === key) { cached = catalog; expires = Date.now() + 3600000; }
    return catalog;
  })();
  inflight = pending;
  try { return await pending; } finally { if (inflight === pending) inflight = null; }
}

async function passage(reference, preferred, key, fetcher = fetch) {
  const ids = passageIds(reference);
  if (!ids || !/^APIBIBLE_(KJV|MSG|GNT)$/.test(preferred)) return { status: 400, error: 'Enter a supported Bible reference and translation.' };
  const version = (await versions(key, fetcher)).find(v => v.id === preferred);
  if (!version) return { status: 404, error: 'This translation is not available to the configured API.Bible key.' };
  // Fetch sequentially to avoid amplifying a rate limit. Never return partial text.
  const parts = [];
  for (const id of ids) {
    const [book, chapter, verses] = id.split('.');
    const range = verses && verses.split('-');
    const path = !verses ? '/chapters/' + id : '/passages/' + book + '.' + chapter + '.' + range[0] + (range[1] ? '-' + book + '.' + chapter + '.' + range[1] : '');
    const result = await upstream('/bibles/' + version.upstreamId + path + '?content-type=text&include-titles=false&include-verse-numbers=true&include-notes=false', key, fetcher);
    if (typeof result.data?.content !== 'string' || !result.data.content.trim()) return { status: 404, error: 'Passage text is unavailable.' };
    parts.push(result);
  }
  const { upstreamId, ...publicVersion } = version;
  publicVersion.copyright = [...new Set(parts.map(p => p.data.copyright || version.copyright).filter(Boolean))].join('\n');
  return { text: parts.map(p => p.data.content.trim()).join('\n\n'), version: publicVersion,
    provider: 'api-bible', fallback: false, reference,
    fumsTokens: parts.map(p => p.meta?.fumsToken).filter(t => typeof t === 'string' && t.length < 4096) };
}

module.exports = { versions, passage };
