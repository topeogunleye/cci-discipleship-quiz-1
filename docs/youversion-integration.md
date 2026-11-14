# YouVersion Bible references

Bible reference previews now use the server-side `/api/bible` Cloudflare Pages
Function. Set `YOUVERSION_APP_KEY` as an encrypted Pages secret for each intended
environment (Production and, if desired, Preview). Do not put it in frontend
code, a committed environment file, or a screenshot. A new deployment is needed
to use the Function and secret together. No deployment is performed by this change.

The server catalog follows every page of licensed English translations returned by
YouVersion (`language_ranges[]=en`, without `all_available=true`). It does not
assume the NKJV license has been granted. Accept any required publisher licenses
in the YouVersion portal yourself, then verify the catalog with your App Key.

Settings saves a default per local learner profile, included in existing backups.
NKJV is the initial preference. Settings and previews offer just AMP, NIV, NKJV,
KJV, MSG and ESV, without a search field. A verse preview's selection resets on
reopening and never changes the saved default. Primary external passage links open
on YouVersion, except for displayed ESV text: its main button opens the exact
passage on ESV.org, with a smaller YouVersion link for additional translations.
Fallbacks link to the translation actually displayed. The current
client uses the catalog only for saved-ID metadata, not to add picker options.
Every non-AMP choice (NIV, NKJV, KJV, MSG and ESV) uses AMP as its only fallback
for any loading failure, including missing text, provider errors, rate limits,
network failures and timeouts.
Every passage uses one translation throughout. The UI shows
the actual translation, publisher copyright, YouVersion link and an explicit
fallback notice. Timeouts/rate limits do not trigger a catalog-wide request storm.
Publisher attribution prefers `copyright`, then `promotional_content`, following
YouVersion's SDK guidance. If both are absent from the catalog, the server reads
the edition's detailed metadata through the existing rate limiter. Unattributed
text is not displayed. Resolved metadata shares the existing one-hour catalog TTL.

The client requests `/api/bible` with `fallback=none` so the selected edition and
the single AMP retry are controlled in one place across all three providers.
Each attempt has a 20-second deadline; closing or switching cancels it without
starting a fallback. Legacy callers without this parameter also get AMP as the
only alternative. Direct AMP requests never substitute BSB, ASV, KJV or another
edition. If AMP fails, the preview shows an unavailable notice and retains an
external YouVersion reference link. Saved defaults remain unchanged. AMP text
uses its own copyright and passage links. Strict, fallback, NKJV and AMP passage
responses are `no-store`, including URLs distinct from older cached substitutions.

Passage text uses textContent, never publisher-provided HTML. It is not persisted
in local storage or cached by the service worker; responses have no-store headers.
All existing study content, learner progress and account flows remain intact.
Original ESV source links in authored decks and ESV attribution for embedded lesson
quotations remain as provenance; rendered reference links/previews use YouVersion.
The old ESV endpoint is retained for already-installed clients during rollout.
Its secret can be retired separately once old clients no longer depend on it.

Supported references include canonical English book names, whole chapters,
chapter ranges (up to eight), same-chapter verse ranges and comma-separated verse
selections. Single-chapter books accept verse-only notation. All current authored
ESV reference links are covered by a parsing test. Unsupported custom references
retain a YouVersion search link rather than showing a guessed passage.

Validation uses synthetic fixture text, not a live key. Before production rollout,
verify licensed NKJV access (or the fallback notice), the full English catalog,
a real passage and its attribution, and native-origin requests if shipping native
apps. The existing allowed-origin policy is reused for native API access. The
production secret cannot be read back for local testing.

Official API reference: https://developers.youversion.com/api/bibles
Usage guide: https://developers.youversion.com/api-usage

## Checks performed

- `npm run build` passes; generated `dist` includes the new controls and shell v55.
- `npm test` passes all 19 test files (existing content-quality TODOs remain).
- New tests cover the authored reference corpus, catalog pagination/language
  filtering, NKJV preference, scoped fallback, copyright/link metadata, secret
  redaction, request validation, origin rejection, rate-limit behavior, temporary
  versus saved selection, stale responses and timeout recovery.
- Local browser checks verified Settings, NKJV initialization, unavailable-catalog
  feedback, keyboard-opened flashcard reference previews and external YouVersion
  links. Local screenshots are `/tmp/youversion-settings.png` and
  `/tmp/youversion-preview.png`. Live licensed passages remain unverified because
  the secret is stored only in Cloudflare, not in the local preview.
- No commits, pushes, deployments or production-data changes were performed.

## Integration with current main

The integration preserves the current video study modal and its portaled Bible
preview, hash routing, cloud sync and security changes. It reuses the existing
private `ESV_RATE_LIMITER` service binding for every outgoing YouVersion and ESV
request. Each provider has its own per-IP limit key and its own upstream budget
(`/check/esv` and `/check/youversion`), so heavy use of one cannot exhaust the
other. The ESV budget stays below the ESV API's published 5,000/day and 1,000/hour
limits (4,000 per rolling day and 900 per clock hour); budgets are kept as hourly
counters in the Durable Object rather than one entry per request. Missing or failed
rate-limit protection fails closed. Preview deployments therefore need the
YouVersion secret, the ESV key and the service binding. No new secret is introduced
for the limiter, and no existing security control is disabled.

## ESV translation

ESV is one of the six fixed options in Settings and verse previews; NKJV remains
the initial default. Selecting ESV loads text from
`/api/esv-passage`; if that request fails, is rate limited, or the daily budget is
spent, the preview tries AMP from `/api/bible` with the notice "ESV unavailable —
showing Amplified (AMP). Your saved default is unchanged."

Crossway's ESV API terms apply: the ESV copyright notice and a link to esv.org are
shown with every ESV passage, a request is limited to one chapter (at most 176
verses, well under the 500-verse / half-a-book limit), and no more than 500 verses
may be stored. For that reason ESV text is never written to a shared server cache
(Cache API, KV or R2); `/api/esv-passage` responses are `no-store`. The app keeps at
most eight recently opened passages (about 40,000 characters) in memory for the
current session only. It additionally counts verses using metadata returned by
Crossway, evicting old entries to stay within 500 cached verses and strictly below
half of each book across all entries. Overlapping passages count separately,
conservatively. Responses without trustworthy verse metadata are not cached.
The server checks returned ranges against the single-chapter and book limits
before supplying cache metadata; ESV passage responses remain `no-store`.

Book totals follow the canonical versification table at
https://gist.github.com/rmcguire/421ed209649bd0b62c9e3a8ed6cac177,
conservatively excluding its listed omitted New Testament verse numbers.
