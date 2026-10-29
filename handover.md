# Sermons Experience — Implementation Handover

**Status:** The implementation and QA-document updates are on `feature/sermons-experience-continuation`, tracking `origin/feature/sermons-experience-continuation`. This QA continuation changes documentation only; no application source changes were made. The production catalogue remains empty pending approved sermon/audio assets. On 2026-10-29, the user directly authorized committing and pushing this feature branch. Do not merge or deploy. **Created from:** `feature/sermons-experience` at `1d0fe27` (`Add handover file`). Do not reset or rebase.

## Source of truth and scope

- Repository: <https://github.com/topeogunleye/cci-discipleship-quiz-1>
- Existing visual references: `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`. Do not edit these, the feature/coverage lists, or the states board.
- Original Sermons brief: `/home/ubuntu/upload/pasted_content.txt`; preserve its constraints. Keep the catalogue empty until approved content is supplied.
- Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- No production sermon, Scripture, coaching, quiz, transcript, or audio text may be invented. `content/sermons.json` intentionally remains empty (`schemaVersion: 1`). Use its empty/offline states until an approved content source is supplied.

## What is implemented

- A separate accessible Discipleship/Sermons experience toggle, independent Sermons Home/Library/Downloads/Progress navigation, route-aware sidebar/tab navigation, and shared Settings.
- Sermons routes/rendering and empty/draft/offline states for coaching, detail, player, reader, quiz, flashcards, completion, and progress. Coaching completion is recorded on Continue; first-study gates and unfinished-mode resume state are separate from Discipleship progress.
- Separate Sermons state with schema-v11 migration and backup normalization; reader/quiz/flashcards render authored content only. Catalogue shape and same-origin HTTP(S) media URLs are checked before rendering.
- Explicit user-initiated streaming audio caching/removal through a separate Cache API store, per-kind byte accounting and cancel controllers, progress feedback, playback position/speed persistence, and a persistent mini-player. Recording and coaching narration controls have explicit accessible names. Streaming avoids holding an extra full-file copy in memory where TransformStream is available; a canceled transfer rejects without publishing partial offline audio. The same audio element is retained across same-sermon rerenders so revisiting coaching does not interrupt playback; a fresh app launch restores the position paused rather than autoplaying stale state. Service-worker v28 serves cached audio offline with byte-range responses and does not duplicate streamed or explicitly downloaded media in the shell cache; activation preserves the dedicated user-managed audio cache.
- Independent regular and unfinished reminders, day/time preferences, accessible in-app reminder actions/dismissal, notification permission/status disclosure, and `Show Draft Sermons` setting. Background notifications are not claimed or implemented.
- Responsive Sermons shell/CSS with light/dark theme support. A malformed shell boundary found during QA was corrected and covered with a regression assertion.

## Files changed on this continuation branch

`js/app.js`, `js/sermons.js`, `js/sermons-ui.js`, `service-worker.js`, `style.css`, `tests/content-lint.test.js`, `tests/pwa.test.js`, `tests/sermons.test.js`, `handover.md`, both continuation prompts, generated `dist/index.html`, generated `dist/service-worker.js`, and generated/untracked `dist/content/sermons.json`. The source catalogue is `content/sermons.json` and remains empty. No reference/tracking files were changed. Dependencies were installed from the lockfile; no dependency manifest changes were intended.

## Verification completed

- `npm test`: **86 tests; 84 pass; 0 fail; 2 TODO diagnostics** on the current continuation QA rerun. The TODOs are content-lint diagnostics for answer-letter distribution and the rate at which the longest option is correct.
- `npm run build`: passes after `npm ci`; generated PWA distribution includes Sermons code and the intentionally empty catalogue. The build produced no unexpected tracked artifact changes.
- `node --check` passed for `js/app.js`, `js/sermons.js`, `js/sermons-ui.js`, `service-worker.js`, the three relevant test files, and `scripts/build.js`. `git diff --check` passed after updating the QA template.
- Additional regression coverage verifies test-only coaching-to-quiz interaction without changing Discipleship progress, same-node playback while revisiting coaching, zero seek-position persistence, null/non-finite score and download normalization, streaming cancellation without partial cache entries, same-origin explicit download/removal, v28 offline media byte-range serving, and that streamed media is not implicitly copied into the shell cache. Hidden draft downloads remain visible/removable, and Home/Library sort dated sermons newest-first. Service-worker v28 preserves the separate user audio cache during activation.
- Earlier browser visual checks (recorded before this continuation) covered Sermons Home at 390px, 834px, and 1440px in both light and dark; Library empty state and shared Settings were opened at the standard desktop preview viewport. In this continuation, the built app was reviewed at 1280px in light/dark across Home, Library empty state, Downloads, Progress, and shared Settings; the 1280px page had no horizontal overflow, and no runtime console errors were observed. Mobile/tablet sizes were not re-captured in this continuation, and no full pixel comparison against every reference was performed.
- Not verified with real content: play/seek/speed against a real recording, actual Cache API download/cancel/removal over a production media URL, authored coaching completion flow, reader, quiz and flashcard sessions, or real reminder delivery with populated progress. These cannot be end-to-end validated while the catalogue is empty. Keyboard-only operation and formal WCAG contrast calculations were not fully audited.
- There is no separate lint/typecheck script in `package.json`; tests and build were run.

## Content and integration dependencies / next steps

1. Obtain approved sermon metadata, same-origin audio URLs/files, five coaching section texts, reviewed transcript sections, quiz questions/options/answers/explanations, and flashcards. Populate `content/sermons.json` using its schema and do not fabricate placeholders as production content.
2. With approved fixture content, run the complete first-study path and each mode; test audio playback, seek/rate, cache progress/cancel/remove, quota/offline failure, simultaneous recording/narration downloads, backup migration/restore, reminder timing/dismissal, and state separation. Add targeted tests for any newly found regressions.
3. Inspect all routes at 390/834/1440 and both themes, compare against repository references, test keyboard focus/contrast, and review generated `dist`/service-worker changes.
4. Recheck `git status`, full diff, tests and build. Keep the branch uncommitted/unpushed until the user explicitly directs otherwise.

## Continuation prompts

- [`prompts/sermons-continue.md`](prompts/sermons-continue.md) — safe implementation continuation prompt for another AI.
- [`prompts/sermons-final-qa.md`](prompts/sermons-final-qa.md) — final QA/report prompt for another AI.
