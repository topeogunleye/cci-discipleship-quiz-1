# YouVersion Bible references

Bible reference previews now use the server-side `/api/bible` Cloudflare Pages
Function. Set `YOUVERSION_APP_KEY` as an encrypted Pages secret for each intended
environment (Production and, if desired, Preview). Do not put it in frontend
code, a committed environment file, or a screenshot. A new deployment is needed
to use the Function and secret together. No deployment is performed by this change.

The catalog follows every page of licensed English translations returned by
YouVersion (`language_ranges[]=en`, without `all_available=true`). It does not
assume the NKJV license has been granted. Accept any required publisher licenses
in the YouVersion portal yourself, then verify the catalog with your App Key.

Settings saves a default per local learner profile, included in existing backups.
NKJV is the initial preference. A verse preview has its own searchable translation
selector; its choice resets on reopening and never changes the saved default.
If the preference is absent or the passage returns 403/404, the service tries
available alternatives, favoring NKJV, KJV, BSB, then WEBUS. It makes at most three
translation attempts. Every passage uses one translation throughout. The UI shows
the actual translation, publisher copyright, YouVersion link and an explicit
fallback notice. Timeouts/rate limits do not trigger a catalog-wide request storm.

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

ESV is a built-in option in the translation dropdown (Settings and verse previews)
next to ASV, which remains the default. Selecting it loads text from
`/api/esv-passage`; if that request fails, is rate limited, or the daily budget is
spent, the preview shows ASV from `/api/bible` with the notice "ESV unavailable —
showing ASV. Your saved default is unchanged."

Crossway's ESV API terms apply: the ESV copyright notice and a link to esv.org are
shown with every ESV passage, a request is limited to one chapter (at most 176
verses, well under the 500-verse / half-a-book limit), and no more than 500 verses
may be stored. For that reason ESV text is never written to a shared server cache
(Cache API, KV or R2); `/api/esv-passage` responses are `no-store`. The app keeps at
most eight recently opened passages (about 40,000 characters) in memory for the
current session only, which avoids repeat requests without persisting text.
