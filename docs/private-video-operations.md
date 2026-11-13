# Private video operations and verification

## Android playback and session-cookie checklist

Run these checks on installed debug builds in a non-production test environment using a QA account and existing authorized lesson objects. The app targets Android SDK 36 and calls the hosted Pages API from Capacitor’s `https://localhost` origin. Do not paste cookies, access tokens, passwords, or complete sensitive request headers into bug reports or logs.

1. Install the current Android build on a physical device with the supported Android System WebView. Record the Android version, WebView version, and app build. Use Chrome remote debugging if needed, but inspect only whether the `__Host-cci-video-session` cookie is set and sent; never copy or export its value.
2. Sign in and confirm `/api/auth/session` returns success, uses credentialed CORS for the configured origin, and sets a Secure, HttpOnly, `SameSite=None`, `Path=/` cookie with a short expiry. Confirm the video request sends credentials. If the cookie is absent or omitted, record the WebView third-party-cookie policy and reproduce before considering a native `CookieManager` override.
3. Open a lesson, verify the protected video request returns `206` for a byte range with a matching `Content-Range`, and verify the response is `private, no-store`. Confirm captions load, transcript search works, and selecting a transcript cue seeks the player.
4. Keep playback active through at least one four-minute session-cookie renewal. Seek during playback and verify playback position, play/pause state, captions, and transcript state remain intact. Repeat after app background/resume and after a brief network interruption.
5. In the QA environment, verify expired/invalid credentials return an authentication response, while Supabase throttling/server/network failures return a retryable service response rather than an incorrect sign-in prompt. Confirm a transient renewal failure does not clear the Supabase account session or replace an already-playing video element.
6. Sign out and confirm the same-device cookie is cleared and subsequent requests cannot retrieve video or transcript data. Do not test by sharing cookie values or attempting access to non-catalog object keys outside the test suite.

Do not add `CookieManager.setAcceptThirdPartyCookies` or weaken server-side authorization unless a supported installed build reproduces the cookie failure and a focused fix is validated. Website playback alone does not verify the installed Android WebView behavior.

## R2 storage and usage check

The user reported that the Cloudflare dashboard showed **9.92 GB** for `cci-lesson-videos` on 2026-11-06. This is a point-in-time, bucket-level dashboard reading provided by the user. It is not an independently inspected value and does not establish the account’s monthly-average billed storage, storage class, other bucket usage, operation totals, or public-domain configuration. By the displayed number it is about 99.2% of a 10 GB allowance, leaving approximately 0.08 GB (80 MB). Cloudflare’s free Standard allowance and billing are account-wide; inspect the account’s overall usage before estimating cost.

For a read-only monthly check:

1. In Cloudflare, select the account that owns the Pages project and open **R2**. Confirm the bucket name is exactly `cci-lesson-videos`.
2. Check bucket analytics for stored bytes/object count and the selected time period. Record the displayed unit (GB versus GiB), timestamp, storage class, and whether the value is current or period-averaged.
3. Open account-level R2 usage/billing details and record Standard and Infrequent Access GB-months, Class A and Class B operations, and usage from every bucket. Compare account totals with the current included allowances; do not subtract the same free allowance independently for each bucket.
4. Check whether public `r2.dev` access or a public custom domain is enabled. The intended design is a private bucket accessed through the authenticated Pages Function; this runbook does not authorize changing bucket access.
5. Recheck after adding approved content and near the billing-period close. The 9.92 GB reading is already close to the Standard free storage allowance, so review storage and account-wide usage before adding more media. Do not delete or re-encode lessons solely to reduce a point-in-time metric; determine ownership and backup requirements first.

For Standard storage beyond the included allowance, the assessment uses the published $0.015 per GB-month rate; Class B read operations have a separate allowance and rate. Confirm current account pricing and rounded billed usage in the dashboard before forecasting an invoice. R2 Standard egress is free, but the account can still incur storage or operation charges.

## Access-policy decision

The server now limits video reads to exact object keys in the canonical lesson catalog. This prevents an authenticated user from asking the R2 binding for arbitrary non-catalog `.mp4` objects. It does not decide whether every registered Supabase user is entitled to every lesson. The repository currently uses public self-registration and does not define enrollment roles or an approval workflow. The product owner must decide that policy before adding user-specific authorization; do not invent roles or treat catalog membership as proof of learner entitlement.
