const ESV_PASSAGE_TEXT_URL = 'https://api.esv.org/v3/passage/text/';
const MAX_REFERENCE_LENGTH = 180;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestGet({ request, env }) {
  const reference = new URL(request.url).searchParams.get('q') || '';
  if (!reference || reference.length > MAX_REFERENCE_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9 .,:;\u2013\u2014-]*$/.test(reference)) {
    return jsonResponse({ error: 'Enter a valid Bible passage reference.' }, 400);
  }
  if (!env || !env.ESV_API_KEY) {
    return jsonResponse({ error: 'ESV passage previews are not configured.' }, 503);
  }

  const apiUrl = new URL(ESV_PASSAGE_TEXT_URL);
  apiUrl.searchParams.set('q', reference);
  apiUrl.searchParams.set('include-headings', 'false');
  apiUrl.searchParams.set('include-footnotes', 'false');
  apiUrl.searchParams.set('include-verse-numbers', 'false');
  apiUrl.searchParams.set('include-passage-references', 'false');
  apiUrl.searchParams.set('include-short-copyright', 'true');

  try {
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: 'Token ' + env.ESV_API_KEY
      }
    });
    if (!response.ok) return jsonResponse({ error: 'The ESV passage could not be loaded.' }, response.status === 429 ? 503 : 502);

    const data = await response.json();
    const text = Array.isArray(data.passages)
      ? data.passages.filter(function (passage) { return typeof passage === 'string'; }).join('\n\n').trim()
      : '';
    if (!text) return jsonResponse({ error: 'The ESV passage could not be found.' }, 404);
    return jsonResponse({ text: text });
  } catch (error) {
    return jsonResponse({ error: 'The ESV passage service is temporarily unavailable.' }, 502);
  }
}
