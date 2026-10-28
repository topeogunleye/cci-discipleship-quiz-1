# Sermons Experience — Implementation Handover

**Status:** Partial implementation; not complete or ready to merge. **Branch:** `feature/sermons-experience`. **Starting branch:** repository default `main`. Do not commit, push, merge, publish, deploy, or reset/rebase the branch unless the user explicitly asks.

## Source of truth and scope

- Repository: <https://github.com/topeogunleye/cci-discipleship-quiz-1>
- Existing visual reference source: `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`. Do not edit these images.
- Original Sermons feature brief: `/home/ubuntu/upload/pasted_content.txt`.
- Implementation restrictions: `/home/ubuntu/upload/pasted_content_2.txt`.
- Supplemental generated sermon previews, if available: `/home/ubuntu/cci-sermons-mobile-artboards.png`, `/home/ubuntu/cci-sermons-mobile-dark.png`, `/home/ubuntu/cci-sermons-tablet-light.png`, `/home/ubuntu/cci-sermons-tablet-dark.png`, `/home/ubuntu/cci-sermons-desktop-light.png`, `/home/ubuntu/cci-sermons-desktop-dark.png`; split screens are under `/home/ubuntu/cci-sermons-individual/`. These are secondary to the repository references.
- Preserve the existing feature list, coverage list and states board unchanged. Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.

The app must have distinct **Discipleship** and **Sermons** top-level experiences controlled by a segmented toggle. Each has its own Home, navigation and Progress; Settings are shared. Required screens/features include Sermons Home, Library (including empty/offline states), pre-study Coaching (five sections, optional narration and explicit download, completion only on Continue), Detail, Audio Player (playback/seek/speed/progress, persistent mini-player, explicit download/cancel/remove), Written Reader, Quiz and Flashcards, Completion (review/retry/return), Downloads, Sermons Progress, reminder settings and accessible in-app reminders. Coaching must precede the first study; after it, Listen/Read/Quiz/Flashcards may be chosen in any order. Revisit Coaching must not interrupt playback. Sermons progress/quizzes must not alter Discipleship state. Content needs to work offline; audio downloads must always be user-initiated.

Do not invent sermon, Scripture, coaching, quiz or audio content. Use `[Scripture reference]` and a visible `Draft placeholder` badge where appropriate. No published sermons, transcripts, quizzes or audio assets were found in the repo. `content/sermons.json` is intentionally empty; document content/backend dependencies rather than fabricate data.

Responsive targets: 390px mobile, 834px tablet, 1440px desktop; light and dark. Use existing refs/tokens: system sans (`system-ui`, `-apple-system`, `Segoe UI`, Roboto, sans-serif); headings 700/body 400–500; cards 20–24px, pill buttons, 14px inputs; primary `#B5173A`, info `#2F6FED`; light `#F5F6FB` with white cards; dark `#12103A` with cards `#1D1A55`; gradients `#3B2BB0 → #7A3FD0` and `#FF8A3D → #FF4F7A`. Maintain AA contrast, express correct/incorrect with text as well as color, and use only simple original inline illustrations. No web fonts or traced Fabulous artwork.

## Architecture audit findings

- `index.html` mounts `#app`, `#modal`, `#toast`; `js/app.js` owns persisted state `S`, transient state `V`, renderer map `views`, `go()` and document-level `[data-act]` delegation.
- Existing mobile tabs and desktop sidebar are rendered separately by `renderTabBar()` and `renderDesktopSidebar()`. The shared CSS shell changes at 768px, with a 176px tablet rail at 768–900 and a 260px desktop rail at >=901. Reuse existing responsive shell and CSS tokens.
- `js/storage.js` stores the full app state as a single JSON record through IndexedDB. Keep binary audio out of `S`; use a separate user-managed media cache. `scripts/build.js` inlines app code/fallbacks into `dist/index.html` and copies `content/`.
- The service worker precaches shell/content and removes older `cci-study-pwa-*` caches on activation. User-managed audio must be in a separate cache that activation does not evict.
- Untouched-branch test baseline: **73 tests, 71 passing, 0 failures, 2 TODO diagnostics** (known answer-distribution and longest-option-correct content-lint items). This was before current partial edits.

## Current uncommitted state

Current known status:

```
## feature/sermons-experience
 M index.html
 M js/app.js
 M scripts/build.js
 M service-worker.js
 M tests/pwa.test.js
?? content/sermons.json
?? handover.md
?? js/sermons-ui.js
?? js/sermons.js
?? prompts/
?? tests/sermons.test.js
```

Changes made:

- `js/sermons.js`: new pure helper module for isolated Sermons state, coaching start/completion, progress summaries, reminder dates and explicit same-origin Cache API audio download/removal. Needs review and testing.
- `js/sermons-ui.js`: partial renderers for the requested screens, Settings section and reminder banner. Several actions/states are not yet wired. Review accessibility, data assumptions and syntax.
- `content/sermons.json`: intentionally empty catalogue (`schemaVersion: 1`).
- `index.html`: references the Sermons fallback and modules.
- `scripts/build.js`: inlines the Sermons fallback/modules.
- `service-worker.js`: cache version changed from v26 to v27; precaches Sermons code/content. `tests/pwa.test.js` has corresponding assertions.
- `js/app.js`: partially adds `DATA_VERSION = 11`, `S.sermons` initialization/normalization, content loading, migration v11, backup export/restore normalization, Library/Downloads icons, and conditional Sermons nav arrays.
- **Not yet added to `app.js`:** the segmented experience toggle; Sermons `MAIN_TABS`/route registrations/context; the settings-render call for Sermons settings; reminder banner injection; event handlers; actual actions/player/download/reminder/quiz flows; supporting CSS. `MAIN_TABS` remains the original list. A multi-hunk attempt to add routes/context/settings/render code was rejected as ambiguous and performed no replacements. Do not assume those pieces exist.
- `tests/sermons.test.js` was added. `npm test` was run after these edits: **78 tests total, 65 passed, 11 failed, 2 TODO**. Failures include app VM tests missing the new `SermonStudy` dependency, a service-worker activation/cache assertion, and the new audio-download boundary test. The partial app does not yet fully initialize/render the feature. Do not treat this branch snapshot as passing.
- WIP commit `7b464da` (`WIP: scaffold Sermons experience`) has been pushed to `origin/feature/sermons-experience`. The local worktree was clean after that push.

## Next work

1. Inspect current `git status`, the complete diff, repo instructions, the existing feature/coverage/state documents, package scripts, and the new modules. Preserve all existing work.
2. Complete `app.js` integration with narrowly targeted edits: toggle; Sermons view context/registrations; `MAIN_TABS` and correct active states; shared Settings; reminder due/permission/dismiss actions; separate state; route actions for all screens; backup/migration; quiz/flashcards feedback/results/review/retry; player progress and explicit download/cancel/remove; persistent mini-player. Never mutate Discipleship `S.progress` for Sermons activity.
3. Add only necessary Sermons-prefixed CSS using existing tokens. Check both themes and widths 390/834/1440 for overflow, focus and navigation. Do not change reference/tracking files.
4. Implement honest empty/offline/placeholder states. Production data remains empty until an approved source is supplied. Add tests using synthetic fixtures only within tests. Validate catalogue fields/URLs and avoid unsafe cross-origin downloads.
5. Add/update tests for navigation separation, coaching completion only on Continue, persistence/backups, offline content, audio action/cache/quota/cancellation/removal, reminder due/permission-denied/once-per-day behavior, and progress separation.
6. Run `npm test`, available lint/typecheck/build commands (inspect `package.json`), review generated `dist` changes, and visually inspect all screens at target viewports/themes if tooling exists. Report checks not performed honestly.
7. Review the final diff, preserve all existing feature/state documents, and report limitations/backend dependencies. The current WIP checkpoint is already committed and pushed; do not create further commits unless the user explicitly requests them.

## Continuation prompt files

- [`prompts/sermons-continue.md`](prompts/sermons-continue.md) — implementation continuation prompt.
- [`prompts/sermons-final-qa.md`](prompts/sermons-final-qa.md) — final verification/report prompt.

The current WIP checkpoint is pushed. Do not merge, publish or deploy; do not add another commit/push unless explicitly requested.
