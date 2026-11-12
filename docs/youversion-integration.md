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

- `npm run build` passes; generated `dist` includes the new controls and shell v51.
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
