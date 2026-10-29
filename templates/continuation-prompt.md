# Continue implementation: CCI Sermons experience

Work in `/home/ubuntu/cci-discipleship-quiz-1`. Before changing anything, read `handover.md`, the user brief if available, repository-local instructions, and the matching files in `templates/` and `prompts/`. Inspect `git status`, branch/upstream, recent history, and the complete diff. Stay on `feature/sermons-experience-continuation`; do not reset, rebase, clean, or switch branches. Local `HEAD` and upstream were both `3423334` at the start of the 2026-10-29 continuation. Follow-up source, test, build, generated `dist`, and documentation changes were prepared under direct user authorization for commit and push to this branch; inspect Git status and upstream to establish their actual publication state.

## Scope and constraints

- Follow the approved Sermons requirements and current `handover.md`. Do not alter design references (`design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`), feature/coverage lists, or the states board. Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Keep Discipleship and Sermons as separate top-level experiences with separate Home/navigation/Progress and shared Settings. Sermons activity must not mutate Discipleship progress or quiz state. Preserve the five-part coaching flow and mark coaching complete only on Continue; after coaching, Listen/Read/Quiz/Flashcards may be completed in any order.
- Keep audio downloads explicit, user-controlled, separately stored, removable, and accessible. Explain reminders are evaluated on app open; do not promise background notifications.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` remains empty until approved content and same-origin audio URLs are supplied. Keep synthetic content limited to tests.
- The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt`, but it was unavailable in the 2026-10-29 environment check. If missing details remain unclear from repository instructions, ask rather than guessing.

## Current implementation and follow-up fixes

The separate experience toggle, routes/navigation, shared Settings, Sermons state/migration/backup normalization, coaching gate, study-mode flows, player/mini-player, explicit Cache API audio controls, offline byte-range playback, reminders, and responsive styles are recorded in `handover.md`. This continuation added prototype-free progress/download maps; status-aware copy for missing formats; a correct Home state when published records exist; standalone-build copying of the CSS/JS assets required by the worker precache; trailing-whitespace normalization for copied CSS/JS; service-worker cache v29; and focused regression tests. The production catalogue is empty, so real-media playback/downloads, authored coaching/reader/quiz/flashcard journeys, and populated-progress reminders cannot be validated end to end.

Latest verification (2026-10-29): `npm test` reports 88 tests, 86 pass, 0 fail, and 2 existing `TODO` diagnostics (answer-letter distribution and longest-option-correct rate). Focused Sermons/PWA tests passed 20/20; `npm run build`, changed-file `node --check`, and the final staged diff passed `git diff --cached --check`. Chromium installed the generated `/dist/` service worker and confirmed 19/19 core entries cached with no console errors. An offline reload probe was inconclusive (`ERR_INTERNET_DISCONNECTED`), so do not claim end-to-end offline navigation. Earlier responsive checks covered Home, Library, Downloads, Progress, and Settings at 390/834/1440 in light/dark with no overflow or page/console errors; see `handover.md` for exact evidence and remaining limits.

## Work only where justified

1. Review the current Git status, branch/upstream, and full diff; preserve existing work. Run `npm test` and `npm run build` before further implementation.
2. Fix only verified defects, add focused regression tests, and do not weaken unrelated tests. Keep status-specific unavailable/draft labels accurate and preserve safe handling of user-controlled IDs.
3. With approved content/media, test first-study coaching, all study modes, audio/progress, offline download/cancel/remove/failure, reminder timing/dismissal, backup/restore, and state isolation. Keep synthetic fixtures in tests only.
4. Recheck affected routes at 390/834/1440 in light/dark if tooling permits; inspect keyboard focus, overflow, generated `dist`, precache completeness, and service-worker behavior. Record exact results, including inconclusive checks.
5. Update `handover.md`, this template and its `prompts/` copy, and `templates/final-qa-prompt.md` plus its project copy when requirements, code, test results, authorization, or Git state changes. Keep duplicates byte-for-byte aligned where the handover says they are copies, and replace stale facts rather than appending conflicting ones.

## Commit and push

The user directly authorized commit and push of this exact follow-up change set to `feature/sermons-experience-continuation`. Verify whether publication has already completed before acting; do not repeat a completed push. After success, report the exact commit SHA and upstream state. Future changes require fresh direct authorization for their exact action and branch. Never merge or deploy unless separately requested. If GitHub authentication is unavailable, do not ask the user to paste credentials; preserve any local commit and report the blocker.
