// Only server-side Functions import this module. Never return the App Key.
const API = 'https://api.youversion.com/v1';
const books = 'Genesis:GEN|Exodus:EXO|Leviticus:LEV|Numbers:NUM|Deuteronomy:DEU|Joshua:JOS|Judges:JDG|Ruth:RUT|1 Samuel:1SA|2 Samuel:2SA|1 Kings:1KI|2 Kings:2KI|1 Chronicles:1CH|2 Chronicles:2CH|Ezra:EZR|Nehemiah:NEH|Esther:EST|Job:JOB|Psalms:PSA|Proverbs:PRO|Ecclesiastes:ECC|Song of Solomon:SNG|Isaiah:ISA|Jeremiah:JER|Lamentations:LAM|Ezekiel:EZK|Daniel:DAN|Hosea:HOS|Joel:JOL|Amos:AMO|Obadiah:OBA|Jonah:JON|Micah:MIC|Nahum:NAM|Habakkuk:HAB|Zephaniah:ZEP|Haggai:HAG|Zechariah:ZEC|Malachi:MAL|Matthew:MAT|Mark:MRK|Luke:LUK|John:JHN|Acts:ACT|Romans:ROM|1 Corinthians:1CO|2 Corinthians:2CO|Galatians:GAL|Ephesians:EPH|Philippians:PHP|Colossians:COL|1 Thessalonians:1TH|2 Thessalonians:2TH|1 Timothy:1TI|2 Timothy:2TI|Titus:TIT|Philemon:PHM|Hebrews:HEB|James:JAS|1 Peter:1PE|2 Peter:2PE|1 John:1JN|2 John:2JN|3 John:3JN|Jude:JUD|Revelation:REV';
const bookMap = Object.fromEntries(books.split('|').map(pair => { const [name, id] = pair.split(':'); return [name.toLowerCase(), id]; }));
Object.assign(bookMap, { psalm: 'PSA', 'song of songs': 'SNG' });
function passageIds(reference) {
  if (typeof reference !== 'string' || reference.length > 180) return null;
  const match = /^([1-3]?\s*[A-Za-z ]+?)\s+(\d[\d\s,:–—-]*)$/.exec(reference.trim());
  if (!match) return null;
  const book = bookMap[match[1].trim().toLowerCase().replace(/\s+/g, ' ')];
  if (!book) return null;
  let spec = match[2].replace(/[–—]/g, '-').replace(/\s/g, '');
  if (['OBA', 'PHM', '2JN', '3JN', 'JUD'].includes(book) && !spec.includes(':')) spec = '1:' + spec;
  const pieces = spec.split(':');
  if (pieces.length > 2) return null;
  const positive = n => /^\d+$/.test(n) && +n > 0 && +n <= 176;
  const ids = [];
  const chapter = pieces[0];
  if (pieces.length === 2 && (!positive(chapter) || +chapter > 150)) return null;
  for (const part of (pieces[1] || chapter).split(',')) {
    const range = part.split('-');
    if (range.length > 2 || !range.every(positive) || (range[1] && +range[1] < +range[0])) return null;
    if (pieces.length === 2) ids.push(book + '.' + (+chapter) + '.' + range.map(Number).join('-'));
    else for (let n = +range[0]; n <= +(range[1] || range[0]); n++) ids.push(book + '.' + n);
  }
  return ids.length && ids.length <= 8 ? [...new Set(ids)] : null;
}
async function upstream(path, key, fetcher) {
  const response = await fetcher(API + path, { headers: { 'X-YVP-App-Key': key, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) { const error = new Error('Bible service unavailable'); error.status = response.status; throw error; }
  return response.json();
}
const CATALOG_TTL_MS = 60 * 60 * 1000;
function attribution(bible) {
  return [bible.copyright, bible.promotional_content].find(value => typeof value === 'string' && value.trim()) || '';
}
let cachedCatalog = null;
let cachedCatalogKey = '';
let cachedCatalogTime = 0;
let cachedCatalogInflight = null;

function clearCatalogCache() {
  cachedCatalog = null;
  cachedCatalogKey = '';
  cachedCatalogTime = 0;
  cachedCatalogInflight = null;
}

async function versions(key, fetcher = fetch, force = false) {
  const now = Date.now();
  if (!force && cachedCatalog && cachedCatalogKey === key && (now - cachedCatalogTime) < CATALOG_TTL_MS) {
    return cachedCatalog;
  }
  if (!force && cachedCatalogInflight && cachedCatalogKey === key) {
    return cachedCatalogInflight;
  }
  cachedCatalogKey = key;
  const loadPromise = (async () => {
    const result = [], tokens = new Set();
    let token = '';
    do {
      const query = new URLSearchParams({ 'language_ranges[]': 'en', page_size: '99' });
      if (token) query.set('page_token', token);
      const page = await upstream('/bibles?' + query, key, fetcher);
      if (!Array.isArray(page.data)) throw new Error('Invalid Bible catalog');
      for (const bible of page.data) {
        if (!Number.isSafeInteger(bible.id) || !/^en(?:-|$)/i.test(bible.language_tag || '')) continue;
        result.push({ id: String(bible.id), abbreviation: String(bible.abbreviation || ''), title: String(bible.title || bible.localized_title || ''), copyright: attribution(bible), publisher: String(bible.publisher_name || '') });
      }
      token = page.next_page_token || '';
      if (token && tokens.has(token)) throw new Error('Repeated catalog page');
      tokens.add(token);
      if (tokens.size > 50) throw new Error('Catalog pagination limit');
    } while (token);
    const sorted = [...new Map(result.map(b => [b.id, b])).values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation) || a.id.localeCompare(b.id));
    cachedCatalog = sorted;
    cachedCatalogTime = Date.now();
    return sorted;
  })();
  cachedCatalogInflight = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (cachedCatalogInflight === loadPromise) cachedCatalogInflight = null;
  }
}
async function passage(reference, preferred, catalog, key, fetcher = fetch, { fallback = true } = {}) {
  const ids = passageIds(reference);
  if (!ids) return { status: 400, error: 'This reference cannot be previewed. Open it on YouVersion.' };
  const requested = catalog.find(b => b.id === preferred || b.abbreviation.toUpperCase() === preferred.toUpperCase());
  const abbreviation = bible => String(bible?.abbreviation || '').replace(/^eng/i, '').toUpperCase();
  const amp = preferred === '1588' || abbreviation(requested) === 'AMP';
  const amplified = catalog.find(b => b.id === '1588' && abbreviation(b) === 'AMP') || catalog.find(b => abbreviation(b) === 'AMP');
  // AMP is the only alternative. Current clients own retries across providers;
  // legacy callers retain the same bounded fallback here. Never mix editions.
  const alternative = fallback && !amp && amplified !== requested ? amplified : null;
  let lastError;
  for (const bible of [requested, alternative].filter(Boolean)) {
    try {
      // Some licensed editions expose attribution only in their detailed metadata.
      // These reads use the same quota-protected fetcher as every passage request.
      if (!String(bible.copyright || '').trim()) {
        const details = await upstream('/bibles/' + bible.id, key, fetcher);
        bible.copyright = attribution(details.data || details);
      }
      if (!String(bible.copyright || '').trim()) { lastError = null; continue; }
      const parts = await Promise.all(ids.map(id => upstream('/bibles/' + bible.id + '/passages/' + encodeURIComponent(id) + '?format=text', key, fetcher)));
      if (parts.some(p => typeof p.content !== 'string' || !p.content.trim())) { lastError = null; continue; }
      const book = reference.trim().match(/^([1-3]?\s*[A-Za-z ]+?)\s+\d/)[1];
      const links = ids.map(id => {
        const [, chapter, verses] = id.split('.');
        return { label: book + ' ' + chapter + (verses ? ':' + verses.replace(/-/g, '–') : ''),
          url: 'https://www.bible.com/bible/' + bible.id + '/' + id };
      });
      return { text: parts.map(p => p.content.trim()).join('\n\n'), version: bible, fallback: bible !== requested,
        url: links[0].url, links, reference };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && ![403, 404].includes(lastError.status)) throw lastError;
  return { status: 404, error: 'Passage text is not available in the supported translations. Open the passage on YouVersion.' };
}
module.exports = { passageIds, versions, passage, __test: { clearCatalogCache } };
