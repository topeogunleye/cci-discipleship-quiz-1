# YouVersion production verification — November 13, 2026

PR #53 merged at 185030b93ec5b2d1b4c6e5fd622645589f6ad0a2.
Production Pages workflow: https://github.com/topeogunleye/cci-discipleship-quiz-1/actions/runs/43387483573

Local build and 22 test files passed. Pre-merge web, Android and iOS CI passed.
The production workflow deployed the private limiter and Pages successfully.

Browser checks on https://cci-discipleship-quiz.pages.dev/:
- Installed the offered app update normally, preserving saved progress.
- Catalog loaded 11 English translations: ASV, BSB, CPDV, enggnv, engWEBUS,
  FBV, LSV, TCENT, TOJB2011, WMB, WMBBE.
- Search for Berean filtered the catalog correctly.
- Selected BSB as the saved default, reloaded and confirmed persisted ID 3034.
- Restored the original NKJV default.
- Opened John 3:1–10 from the existing paused flashcard session without grading
  cards or advancing progress. Received BSB passage text, attribution, correct
  external link and explicit NKJV-unavailable fallback notice.
- Switched the preview to ASV: received ASV text and version link.
- Closed and reopened the preview: preference returned to NKJV, with BSB fallback.

NKJV is not currently available to the App Key. The owner must request/enable
appropriate translation access in YouVersion before actual NKJV text can load.
No keys were exposed. No account was created, learner data cleared, or study
answer submitted. The saved default was restored to NKJV after testing.

Direct Python HTTP probes were rejected by Cloudflare (403/1010); live verification
was completed through the browser. Screenshot: live-fallback.png.
