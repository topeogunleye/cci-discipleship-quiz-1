# API.Bible translations

KJV (King James Version), MSG (The Message), and GNT (Good News Translation)
are built-in choices in Settings and Bible previews. Their stable preference IDs
are `APIBIBLE_KJV`, `APIBIBLE_MSG`, and `APIBIBLE_GNT`; backups and profile settings
preserve these IDs. Preview changes remain temporary.

Set `API_BIBLE_KEY` as an encrypted Cloudflare Pages secret in Production and any
Preview environment that needs this integration. For local testing, put it in the
ignored `.dev.vars` file. The key is never sent to the browser. Existing
`YOUVERSION_APP_KEY` and `ESV_API_KEY` secrets remain in use.

The `/api/api-bible` Function discovers English translations in the key's
accessible `/bibles` catalog without hardcoding publisher-specific IDs. Metadata
is cached in memory for one hour; passage
text and tracking tokens use `no-store` and never enter the offline asset cache.
References reuse the existing parser, with full API.Bible verse-range IDs and
chapter endpoints for whole chapters. Multipart references return only complete
results from one translation. No partial passage is shown after a failed request.

The preview displays the returned publisher copyright and API.Bible attribution,
and offers a BibleGateway link where an exact supported translation is known,
otherwise a clearly labelled YouVersion passage search. Web displays report
the returned FUMS tokens through the official tracker, loaded only when API.Bible
text is displayed. No account ID or learner details are supplied to the tracker.
The CSP permits only the additional tracker script and its reporting endpoint.
If a request fails, the existing YouVersion ASV fallback is clearly labelled and
the saved preference remains unchanged.

Deploy the private rate-limiter Worker before the Pages Function. The existing
main deployment workflow already uses that order. The new `/check/apibible` scope
isolates API.Bible usage from ESV and YouVersion, limits individual clients, and
reserves quota for every upstream catalog or content call. Its conservative
budget is 150 calls per rolling day and 30 per hour (at most 4,650 calls over 31
days for this deployment). API.Bible also enforces the account's monthly quota;
other apps sharing the key consume that allowance independently.

Before rollout, verify a real passage for each of KJV, MSG and GNT, its copyright,
the FUMS request, saved defaults after reload, and fallback behavior. Automated
tests use synthetic text and do not require or transmit a real API key.

Provider references:
- https://docs.api.bible/quick-start/working-with-bibles/
- https://docs.api.bible/guides/passages/
- https://docs.api.bible/resources/fair-use/
- https://docs.api.bible/quick-start/rate-limiting/

## Curated additional translations

The catalog route (`GET /api/api-bible` without query parameters) considers only
Revised Version 1885 (RV), Douay-Rheims American 1899 (DRA), Translation for
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
