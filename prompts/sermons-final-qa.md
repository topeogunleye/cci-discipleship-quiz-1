# Final QA: CCI Sermons experience

Work in `/home/ubuntu/cci-discipleship-quiz-1`. Read the current handover, repository instructions, and matching templates/prompts. Inspect branch/upstream, `git status`, recent history, complete diff, and protected-file changes before editing. Stay on `feature/sermons-experience-continuation`; do not reset, rebase, or switch branches. Local `HEAD` and upstream were both `3423334` at the start of the 2026-10-29 continuation. Follow-up source/test/build/docs and generated `dist` files were prepared under direct authorization to commit and push to this branch; verify current state in Git.

## Constraints

Preserve existing work and scope. Do not alter design-reference images, feature/coverage lists, or the states board. Do not add unrelated features or invent production sermon, Scripture, coaching, quiz, transcript, flashcard, or audio content. `content/sermons.json` remains empty pending approved content and same-origin audio assets. The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt` but was unavailable in the 2026-10-29 environment check; ask if any required detail is missing rather than guessing.

## Latest recorded verification — 2026-10-29

- `npm test`: 88 tests, 86 pass, 0 fail, 2 existing `TODO` diagnostics (answer-letter distribution and longest-option-correct rate). The TODO assertions are known content-balance issues, not failed suite tests.
- Focused `node --test tests/sermons.test.js tests/pwa.test.js`: 20/20 passed. `npm run build` passed and generated `dist/index.html` (1,372,611 bytes). `node --check` passed for changed app/build/service-worker/test JavaScript. The final staged diff passed `git diff --cached --check`.
- Four behavioral/PWA defects were addressed: prototype-sensitive state IDs; contradictory Sermons Home empty state when published records exist; draft wording on missing published formats; and standalone `dist/` service-worker precache references to omitted CSS/JS files. The build now copies required assets, normalizes copied JS/CSS whitespace, uses worker cache v29, and tests check precache completeness and asset cleanliness.
- Chromium installed the generated `/dist/` service worker: it activated and controlled the page, 19/19 core entries were cached, and no console errors were observed. A separate offline-reload probe was inconclusive in this environment (`ERR_INTERNET_DISCONNECTED`); do not claim end-to-end offline navigation from it.
- Earlier headless Chromium checked Sermons Home, Library, Downloads, Progress, and Settings at 390px, 834px, and 1440px in light/dark, with no horizontal overflow, page error, or console error. Clean screenshots of Home (390px/1440px, light) and Library (834px/1440px, dark) were visually reviewed. Targeted keyboard testing at 390px and 1440px activated the experience switch, Library/Settings navigation, and a theme control with a visible 3px focus outline.
- Real-media playback/download/cancel/remove, populated coaching/reader/quiz/flashcards/reminders, full keyboard coverage, formal WCAG contrast calculations, pixel-by-pixel reference comparison, and approved production content remain unverified.

## QA checklist

1. Rerun `npm test`, `npm run build`, `node --check` for changed JavaScript, and `git diff --check`; report the two known TODOs accurately.
2. Verify separate Discipleship/Sermons navigation and progress, shared Settings, storage migration/backup, and non-mutation of Discipleship state.
3. Cover prototype-named sermon IDs in normalization, summaries, serialization/restore, and updates; verify published missing-format copy is neutral and draft-only labels remain status-specific.
4. Review first-study coaching gates, completion timing, resume, quiz/flashcard flows, and accessible feedback using synthetic data only in test fixtures.
5. Review explicit-only audio caching/removal, same-origin validation, cancellation/progress, cache persistence, byte accounting, player continuity, and offline/unavailable behavior. Do not claim production media verification without approved media.
6. Review reminder settings, timing/dismissal semantics, notification disclosures, and absence of background-delivery promises.
7. If browser tooling permits, inspect affected screens at 390/834/1440 in light/dark, plus keyboard focus, contrast, overflow, loading/error/offline and empty states. Record exact screens and viewports. Treat the previous Chromium offline-reload result as inconclusive and report any new failure honestly.
8. Rebuild `dist`, verify every service-worker `CORE_FILES` path exists in the package, and test worker installation/activation. Review the source catalogue, backup/migration, complete diff, and protected files; confirm no secrets or unrelated artifacts changed.
9. Update `handover.md` and keep this prompt plus `templates/continuation-prompt.md`, `prompts/sermons-final-qa.md`, and `prompts/sermons-continue.md` aligned with current verified facts. Keep `templates/handover.md` synchronized with `handover.md`.

## Commit and push

The user directly authorized commit and push of this exact follow-up change set to `feature/sermons-experience-continuation`. Inspect current branch and upstream before acting; if already pushed, report its exact SHA instead of repeating. Future change sets require fresh direct authorization. Never merge or deploy unless separately requested. If GitHub authentication is unavailable, preserve any local commit and report the blocker without requesting credentials in chat.

## Final report

Report branch/base, files changed, test/build/check output, exact visual and browser QA, content/media/backend dependencies, unverified cases, design-reference deviations, and staged/committed/pushed state. Do not hide failures or imply production content exists.
