# Sermons Experience — Integration Handover

**Repository:** <https://github.com/topeogunleye/cci-discipleship-quiz-1>
**PR:** [#8 — feat: add offline-first Sermons experience](https://github.com/topeogunleye/cci-discipleship-quiz-1/pull/8), from `feature/sermons-experience-continuation` to `main`.
**PR base at creation:** `main` at `5626653` (the merge commit for PR #7).
**Sermons branch integration:** Sermons implementation at `9579c3b`; merge commit `8334100` incorporates `feature/evangelism-deck-questions` at `4383a959`. The Evangelism source deck and its generated `dist` copy were verified identical to `origin/main` at integration time, so this incorporates the requested branch history without adding new Evangelism content relative to `main`.
**Authorization:** The user explicitly requested PR #8, integration of the Evangelism branch into its head, and merging PR #8 into `main`. Check the live GitHub PR and branch refs before repeating or continuing any step. This does not authorize App Store signing, TestFlight upload, App Store submission, or future unrelated merges.

## Scope and source of truth

- Read this file, the continuation and final-QA prompts in `templates/` and `prompts/`, and repository-local instructions before continuing.
- Do not edit `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`, feature/coverage lists, or the states board.
- Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` remains empty until approved content and same-origin audio URLs are supplied. Synthetic content is allowed only in tests.
- The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt`, but that file was unavailable in the 2026-10-29 environment. Ask rather than inventing any required detail that remains unclear.

## Implemented Sermons experience and hardening

- Separate accessible Discipleship/Sermons toggle, independent Sermons Home/Library/Downloads/Progress, route-aware navigation, and shared Settings.
- Separate Sermons state with schema-v11 migration/backup normalization; first-study coaching gate; Listen/Read/Quiz/Flashcards flows; player/mini-player; explicit-only Cache API audio download/cancel/remove; offline byte-range playback; independent reminder settings; responsive light/dark styling.
- Catalogue validation and honest empty, draft, offline, and unavailable states. The production catalogue remains empty; do not fabricate content.
- Progress/download maps are prototype-free. Published records with missing formats use neutral unavailable copy. The standalone build copies the CSS/JS assets listed in the service-worker precache, normalizes copied assets, and retains service-worker cache v29 plus Sermons audio-cache handling.
- The PR branch includes the Evangelism branch merge requested by the user. The Evangelism deck already exists in `main`; the PR's intended feature delta remains the Sermons implementation.

## Verification snapshot — 2026-10-29

- `npm test`: 88 tests, 86 pass, 0 fail, 2 existing content-balance `TODO` diagnostics.
- `npm run build` passed and generated `dist/index.html` (1,479,586 bytes). All 12 decks in `decks/manifest.json` were verified byte-identical to their `dist/decks/` copies. The generated service worker retains cache v29 and Sermons audio-cache behavior.
- `node --check` passed for `js/app.js`, `js/sermons.js`, `js/sermons-ui.js`, `scripts/build.js`, `service-worker.js`, `tests/content-lint.test.js`, `tests/pwa.test.js`, and `tests/sermons.test.js`. No conflict markers remained in the resolved source, PWA tests, or regenerated `dist` files; merge diff checks passed.
- Earlier headless Chromium route QA covered Sermons Home, Library, Downloads, Progress, and Settings at 390px, 834px, and 1440px in light and dark themes, with no horizontal overflow, page errors, or console errors. This route matrix was not repeated after the branch-history integration.
- Earlier Chromium service-worker testing confirmed installation/activation and 19/19 core precache entries. The post-integration build/test verified all 12 source/dist deck copies, but did not repeat browser installation. A separate offline-reload probe was inconclusive (`ERR_INTERNET_DISCONNECTED`); do not claim end-to-end offline navigation.
- Real-media playback/download/cancel/remove, authored coaching/reader/quiz/flashcards, populated-progress reminders, and pixel-by-pixel reference comparison remain unverified because approved content/media are unavailable.

## Next steps and safe delivery

1. Verify PR #8's live head, base, check state, and merge status on GitHub; the user has authorized this specific PR merge.
2. Keep `templates/continuation-prompt.md` byte-for-byte aligned with `prompts/sermons-continue.md`, `templates/final-qa-prompt.md` aligned with `prompts/sermons-final-qa.md`, and this handover aligned with `templates/handover.md`.
3. Preserve an independent uncommitted TestFlight workflow change set on a separate local branch; do not stage, commit, push, or reset it as part of the Sermons PR.
4. Future changes, PR merges, signing, uploads, or App Store submissions require fresh, direct authorization for the exact action. Never push directly to `main`.
