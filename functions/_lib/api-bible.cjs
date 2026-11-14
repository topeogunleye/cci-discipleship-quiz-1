const { passageIds } = require('./youversion.cjs');
const API = 'https://rest.api.bible/v1';
const EDITIONS = {
  KJV: { title: 'King James Version' }, MSG: { title: 'The Message' }, GNT: { title: 'Good News Translation' },
  RV: { title: 'Revised Version 1885', discover: true },
  DRA: { title: 'Douay-Rheims American 1899', discover: true },
  T4T: { title: 'Translation for Translators', discover: true },
  LXXUP: { title: 'Brenton English Septuagint (Updated)', group: 'Additional editions', coverage: 'Old Testament (Septuagint)', discover: true },
  OJPS: { title: 'JPS Tanakh 1917', group: 'Additional editions', coverage: 'Old Testament (Hebrew Bible)', discover: true },
  OKE: { title: 'Targum Onkelos (Etheridge)', group: 'Additional editions', coverage: 'Torah only (Genesis–Deuteronomy)', discover: true },
  // Equivalent translations are available as backup providers, never extra picker rows.
  ASV: { title: 'American Standard Version' }, BSB: { title: 'Berean Standard Bible' },
  FBV: { title: 'Free Bible Version' }, GNV: { title: 'Geneva Bible' }, LSV: { title: 'Literal Standard Version' },
  TCENT: { title: 'The Text-Critical English New Testament' }, TOJB2011: { title: 'The Orthodox Jewish Bible' },
  WEBUS: { title: 'World English Bible, American English Edition' },
  WMB: { title: 'World Messianic Bible' }, WMBBE: { title: 'World Messianic Bible British Edition' }
};
function supportedVersion(id) { return typeof id === 'string' && id.startsWith('APIBIBLE_') && Object.hasOwn(EDITIONS, id.slice(9)); }
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
      const abbreviation = abbreviations.find(a => Object.hasOwn(EDITIONS, a));
      if (!abbreviation || found.has(abbreviation)) continue;
      found.set(abbreviation, { id: 'APIBIBLE_' + abbreviation, upstreamId: bible.id,
        abbreviation, title: EDITIONS[abbreviation].title, group: EDITIONS[abbreviation].group || '',
        coverage: EDITIONS[abbreviation].coverage || '', copyright: String(bible.copyright || ''), publisher: '' });
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
  if (!ids || !supportedVersion(preferred)) return { status: 400, error: 'Enter a supported Bible reference and translation.' };
  const version = (await versions(key, fetcher)).find(v => v.id === preferred);
  if (!version) return { status: 404, error: 'This translation is not available to the configured API.Bible key.' };
  if (['LXXUP', 'OJPS', 'OKE'].includes(version.abbreviation)) {
    const ot = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL'.split(' ');
    const books = version.abbreviation === 'OKE' ? ot.slice(0, 5) : ot;
    if (ids.some(id => !books.includes(id.split('.')[0]))) return { status: 404, error: 'This edition covers ' + version.coverage + '.' };
  }
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

let verified = null, verification = null;
async function verifiedVersions(key, fetcher = fetch) {
  if (verified?.key === key && Date.now() < verified.expires) return verified.versions;
  if (verification?.key === key) return verification.promise;
  const promise = (async () => {
    const catalog = (await versions(key, fetcher)).filter(v => EDITIONS[v.abbreviation].discover);
    const checks = await Promise.all(catalog.map(async version => {
      try {
        const result = await passage('Genesis 1:1', version.id, key, fetcher);
        if (result.status || !result.text || !result.version.copyright) return null;
        return result.version;
      } catch (error) {
        if ([403, 404].includes(error.status)) return null;
        throw error;
      }
    }));
    const available = checks.filter(Boolean);
    verified = { key, expires: Date.now() + 86400000, versions: available };
    return available;
  })();
  verification = { key, promise };
  try { return await promise; } finally { if (verification?.promise === promise) verification = null; }
}

module.exports = { versions, passage, supportedVersion, verifiedVersions };
