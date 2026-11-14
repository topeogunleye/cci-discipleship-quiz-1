# API.Bible translations

KJV (King James Version), NKJV (New King James Version), and MSG (The Message)
are built-in choices in Settings and Bible previews. Their stable preference IDs
are `APIBIBLE_KJV`, `APIBIBLE_NKJV`, and `APIBIBLE_MSG`; backups and profile settings
preserve these IDs. KJV is the initial default for new profiles and for missing
or invalid preferences; existing valid saved choices are preserved. Preview
changes remain temporary.

The owner confirmed these three API.Bible license selections after setting the
application's monthly user range to no more than 5,000. This is account-reported
license selection, not a successful production passage check. Keep the declared
user range accurate and review NKJV licensing before exceeding 5,000 monthly users.
No new key or subscription change is required by this implementation.

Legacy `NKJV` and YouVersion NKJV ID `114` preferences resolve through API.Bible
without rewriting the saved value. Other catalog IDs identified as NKJV also use
API.Bible. Duplicate provider entries remain a single picker row, retaining the
selected ID. New profiles still default to KJV; other saved translations stay intact.
GNT is no longer an unconditional choice: it appears only after a successful
catalog passage check (or through the independently licensed YouVersion catalog).
An existing `APIBIBLE_GNT` preference remains valid and visible with an unavailable
label when absent from the catalog; backups and profiles never silently reset it.

Set `API_BIBLE_KEY` as an encrypted Cloudflare Pages secret in Production and any
Preview environment that needs this integration. For local testing, put it in the
ignored `.dev.vars` file. The key is never sent to the browser. Existing
`YOUVERSION_APP_KEY` and `ESV_API_KEY` secrets remain in use.

The `/api/api-bible` Function discovers English translations in the key's
accessible `/bibles` catalog without hardcoding publisher-specific IDs. Metadata
is cached in memory for one hour. Client passage responses use `no-store` and
never enter the offline asset cache; the server keeps successful API.Bible
Scripture responses in the Cloudflare edge cache for seven days as described below.
References reuse the existing parser, with full API.Bible verse-range IDs and
chapter endpoints for whole chapters. Multipart references return only complete
results from one translation. No partial passage is shown after a failed request.

The preview displays the returned publisher copyright and API.Bible attribution,
and offers a BibleGateway link where an exact supported translation is known,
otherwise a clearly labelled YouVersion passage search. Web displays report
the returned FUMS tokens through the official tracker, loaded only when API.Bible
text is displayed. No account ID or learner details are supplied to the tracker.
The CSP permits only the additional tracker script and its reporting endpoint.
If NKJV fails, the preview requests API.Bible KJV once and displays
"NKJV unavailable — showing KJV. Your saved default is unchanged."
Both responses must match the requested translation. If KJV also fails, the preview
shows an unavailable state; it does not silently substitute ASV or another version.
Closing or superseding a request never starts a fallback. Other API.Bible editions
retain the existing clearly labelled YouVersion ASV fallback. The saved preference
remains unchanged in every case. Passage responses without publisher attribution
are rejected rather than displayed.

Deploy the private rate-limiter Worker before the Pages Function. The existing
main deployment workflow already uses that order. The new `/check/apibible` scope
isolates API.Bible usage from ESV and YouVersion, limits individual clients, and
reserves quota for every upstream catalog or content call. Its conservative
budget is 150 calls per rolling day and 30 per hour (at most 4,650 calls over 31
days for this deployment). API.Bible also enforces the account's monthly quota;
other apps sharing the key consume that allowance independently.

Before rollout, verify a real passage for each of KJV, NKJV and MSG, its copyright,
the FUMS request, saved defaults after reload, legacy NKJV preferences, and KJV
fallback behavior (including both services failing). Automated
tests use synthetic text and do not require or transmit a real API key.
The local checkout has no provider key, so production NKJV access remains a
rollout check. No deployment or account changes are performed by the implementation.

Provider references:
- https://docs.api.bible/quick-start/working-with-bibles/
- https://docs.api.bible/guides/passages/
- https://docs.api.bible/resources/fair-use/
- https://docs.api.bible/quick-start/rate-limiting/

## Seven-day Scripture cache

API.Bible chapter and passage responses are cached with the Cloudflare Cache API
for 604,800 seconds. Cache keys hash the provider key and complete upstream URL,
isolating credentials, editions, references and formatting without storing the
raw key in the cache URL. The current key's accessible translation catalog is
still checked before passage lookup. Only successful, nonempty text with publisher
attribution is cached. Metadata and errors bypass storage. Cache read/write
failures fall back to normal quota-protected requests; expired text is never
served after a failed refresh. Concurrent misses share an upstream fetch within
each running Function instance. Edge cache entries are shared within a Cloudflare
location, may be evicted early, and do not guarantee one upstream request globally.

Cache hits occur before upstream quota reservation. The public response remains
`no-store`, includes the publisher copyright and original FUMS tokens, and reports
`X-Bible-Cache: HIT`, `MISS`, `MIXED`, or `BYPASS` for diagnostics. Each displayed
passage still triggers the existing FUMS report, including repeat views of cached
text. This adds no offline Bible downloads or ESV server caching.

Policy: https://care.api.bible/article/401-caching-content (refresh within 30 days;
seven-day expiry stays below the recommended 14-day refresh interval).

## Curated additional translations

The catalog route (`GET /api/api-bible` without query parameters) considers
Good News Translation (GNT), Revised Version 1885 (RV), Douay-Rheims American 1899 (DRA), Translation for
Translators (T4T), updated Brenton Septuagint (LXXUP), JPS Tanakh 1917 (OJPS), and
Targum Onkelos Etheridge (OKE). Before returning each option, it verifies a
Genesis 1:1 passage and a publisher copyright notice with the configured key.
Successful catalog checks are cached for 24 hours and shared between concurrent
requests; probe text and FUMS tokens are never returned. Permission-denied,
missing, empty or unattributed samples are omitted. Temporary failures remain
retryable. Only actual displayed passages are reported as FUMS views.

The final three choices appear in an “Additional editions” group with coverage
labels: the Septuagint and Tanakh cover the Old Testament; Onkelos covers the
Torah (Genesis–Deuteronomy). Requests outside those books return unavailable,
allowing the existing clearly labelled fallback rather than mislabelling text.

Both catalogs load independently, so a provider outage does not hide the other's
versions. A partially loaded catalog retries on the next selector interaction.
Duplicate abbreviations (including the English `eng` prefix) and regional NIV,
WEB and WMB editions share one picker row; an existing saved provider ID is
preserved when it matches that row. ASV, BSB, FBV, Geneva, LSV, TCENT, Orthodox
Jewish Bible, WEBUS and WMB translations have API.Bible backup routes when the
YouVersion request is unavailable or substitutes another translation. A successful
equivalent-provider response keeps the requested translation and displays the
actual provider attribution.
