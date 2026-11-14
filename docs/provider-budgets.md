# Scripture provider budgets

All users share each provider's upstream budget. Each catalog page or uncached
passage/chapter request reserves quota before contacting that provider. API.Bible
cache hits bypass upstream reservations. The existing independent per-provider,
per-client 15/minute burst guard remains in place.

| Provider | App budget | Account/provider allowance |
| --- | --- | --- |
| API.Bible | 4,500 per billing month | 5,000/month |
| YouVersion | 9,000 per rolling hour | 10,000/hour, owner-confirmed dashboard |
| ESV | 55/minute, 900/hour, 4,500/day | 60/minute, 1,000/hour, 5,000/day |

Minute/hour/day windows conservatively retain 61 second buckets, 61 minute
buckets, and 25 hourly buckets, respectively. This prevents bursts across clock
boundaries. Storage remains bounded rather than growing per request. Denied
reservations do not spend provider quota. Each provider has a separate Durable
Object, using the existing names so deployments preserve counters. Legacy arrays
and hour buckets migrate conservatively, including when the first admission is denied.

API.Bible has no fixed daily/hourly budget. Its Worker variables are nonsecret:

- `APIBIBLE_BILLING_RESET_DAY=13`: reset at 00:00 UTC on the 13th, clamped to a
  month's last day for reset days that exceed its length.
- `APIBIBLE_INITIAL_CYCLE_START=2026-11-13T00:00:00Z` and
  `APIBIBLE_INITIAL_USAGE=155`: owner-confirmed opening usage. The first monthly
  counter uses the greater of this baseline and already tracked calls, so these
  overlapping counts are not added twice. The baseline is not applied next month.
- Missing/invalid billing configuration fails closed. A persistent monthly
  counter is never reset by deployment, and parallel admissions are transactional.

The 500-call reserve covers untracked usage differences and uncertainty around
the provider's exact reset time. The provider still independently enforces its
allowance. Calls made outside this deployment are not automatically reconciled
with the app counter; review the provider dashboard as usage grows. If the plan
or reset date changes, update configuration to match. Do not reset counters to
work around throttling.

Previews use **selection → ESV → AMP → external reference link**, skipping an
edition already attempted. Selecting ESV tries AMP next; selecting AMP can try
ESV but never retries AMP. Each attempt has a 20-second deadline. Cancellation
stops the chain, and late responses cannot replace a newer selection. NKJV stays
the default for new users; existing saved IDs are preserved. Temporary selections
and fallbacks never overwrite defaults. Displayed text controls attribution,
the main passage link, and the ESV-only secondary YouVersion link.

HTTP 429 notices say "temporarily rate-limited" rather than implying a license
failure. Functions preserve `Retry-After` and distinguish app/provider denials
through `X-Bible-Limit-Source` and the response's `source`/`reason`. The browser
honors a provider cooldown across that provider's translations instead of
immediately retrying it. The distinct provider may still supply a fallback.
No automatic retry loops spend quota. When all attempts fail, the preview retains
a YouVersion reference link without claiming that a translation was displayed.

ESV's single-chapter, verse/book, in-memory cache and copyright restrictions remain
in force. API.Bible's attributed seven-day cache and FUMS reporting are unchanged.
No unrestricted shared ESV cache or new persistent YouVersion text cache is added.

References: [ESV conditions](https://api.esv.org/),
[API.Bible limits](https://docs.api.bible/quick-start/rate-limiting/), and
[YouVersion retry guidance](https://developers.youversion.com/error-codes).
