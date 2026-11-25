# Video and lesson navigation

## Behavior

Previous/Next navigate recordings within the current lesson. At the first recording, Previous becomes **Previous lesson: [title]**. At the last recording, Next becomes **Next lesson: [title]**. The former separate Next lesson row is removed.

Lesson destinations follow the manifest-loaded curriculum order. Previous lesson opens that lesson's final recording at 0:00 paused; Next lesson opens its first recording at 0:00 paused. An earlier visit selection does not override these explicit destinations. Ordinary chapter-entry visit resume remains unchanged.

Single-video lessons expose both lesson directions. If an adjacent lesson has no recordings, its button explicitly offers the lesson overview. If that lesson is missing locally, its destination is named as unavailable and Journey is offered; no lesson is silently skipped. At the first/final curriculum lesson, the unavailable direction is disabled with explicit context. The final lesson offers Back to Journey without wrapping or implying completion. Custom decks do not receive guessed curriculum destinations.

## Focus and responsive layout

Within a lesson, focus stays on the selected direction's control, including when it becomes a lesson action. A disabled endpoint focuses the navigation context instead of the opposite direction. This fixes the audited sequence where advancing to the last recording focused Previous and another Enter moved backward.

Cross-lesson navigation focuses the navigation's programmatic context heading. Its visible text gives recording position; its accessible name identifies the lesson and recording. Enter on that heading does not activate another video or lesson. This placement keeps context and controls visible in short landscape layouts. Background video-page renders preserve this focus.

At 1024px and wider, the existing navigation instance moves to the header's right side. Smaller layouts retain it below the player. A three-column grid aligns directional controls around the count; at 700px and below, the count sits above two equal-width controls. Destination titles wrap, and paired controls stretch to equal height. Existing CCI theme styles, fonts and focus outlines remain in use.

## Data and playback preservation

Outgoing media is paused and its visit-only position is retained. Explicit lesson transitions save active unfinished practice when needed, without submitting answers, changing scores or marking a lesson complete. Paused sessions, recorded learning progress, authentication, protected media endpoints, captions, transcripts, Bible references, video IDs/titles/groups/order, and ordinary resume actions are preserved. No cloud schema or storage-key migration is required.

No dependencies, fonts or media precaches were added. Service-worker cache version advances from v92 to v93 with its related test.

## Validation

Implementation branch: `codex/boundary-aware-lesson-navigation`, based on clean `main` at `9e95e55`. Focused tests cover bidirectional destinations, scope preservation, missing/single-video cases, curriculum endpoints, history, directional focus and context focus across background renders. Existing video-scope assertions reflect the new explicit controls and heading.

The local static preview was checked in an isolated Chrome profile through Playwright. Browser checks cover forward/backward lesson transitions, the audited keyboard sequence, safe final-endpoint behavior, Back/Forward/reload, and guest-only unfinished flashcard practice at card 2 of 6. Content-only browser response fixtures exercise single-video and missing-video lessons without modifying server data or authentication.

The 56-state matrix covers first/last recordings at 360×800, 390×844, 768×1024, 1024×768, 1440×900, 800×360 and 844×390 CSS pixels in light, dark, automatic-light and automatic-dark states. It showed no horizontal overflow, aligned control pairs and navigation target heights above 48px. These are desktop-browser simulations, not real-device tests.

The in-app Browser connection remains unavailable. Private media, fullscreen, actual captions, full authenticated sign-in return, real screen-reader output and native browser zoom remain unverified. The static preview has no live auth/functions backend. Authentication and private playback unit tests remain relevant, but do not replace an authorized media check. No production learner data was changed.

No commit, push, merge or deployment was performed for this implementation.
