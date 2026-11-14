# API.Bible translations

KJV (King James Version), MSG (The Message), and GNT (Good News Translation)
are built-in choices in Settings and Bible previews. Their stable preference IDs
are `APIBIBLE_KJV`, `APIBIBLE_MSG`, and `APIBIBLE_GNT`; backups and profile settings
preserve these IDs. Preview changes remain temporary.

Set `API_BIBLE_KEY` as an encrypted Cloudflare Pages secret in Production and any
Preview environment that needs this integration. For local testing, put it in the
ignored `.dev.vars` file. The key is never sent to the browser. Existing
`YOUVERSION_APP_KEY` and `ESV_API_KEY` secrets remain in use.

The `/api/api-bible` Function discovers the three English translations in the
key's accessible `/bibles` catalog. It does not hardcode publisher-specific IDs
or expose extra translations. Metadata is cached in memory for one hour; passage
text and tracking tokens use `no-store` and never enter the offline asset cache.
References reuse the existing parser, with full API.Bible verse-range IDs and
chapter endpoints for whole chapters. Multipart references return only complete
results from one translation. No partial passage is shown after a failed request.

The preview displays the returned publisher copyright and API.Bible attribution,
and offers a BibleGateway link in the actual translation. Web displays report
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
