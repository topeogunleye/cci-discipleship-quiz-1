# Final QA: CCI Sermons experience

Work in `/home/ubuntu/cci-discipleship-quiz-1`. Read the current handover, repository instructions, and matching templates/prompts. Inspect branch/upstream, `git status`, recent history, complete diff, and protected-file changes before editing. Stay on `feature/sermons-experience-continuation`; do not reset, rebase, or switch branches.

## Constraints

Preserve existing work and scope. Do not alter design-reference images, feature/coverage lists, or the states board. Do not add unrelated features or invent production sermon, Scripture, coaching, quiz, transcript, flashcard, or audio content. `content/sermons.json` remains empty pending approved content and same-origin audio assets.

## Latest recorded verification

- Baseline: `npm test` reports 86 tests, 84 pass, 0 fail, and 2 existing TODO diagnostics (answer-letter distribution and longest-option-correct rate). Rerun after changes and distinguish TODOs from regressions.
- `npm run build` passed; `node --check` passed for relevant JavaScript; `git diff --check` passed. `package.json` has no separate lint/typecheck script.
- Earlier visual checks covered Sermons Home at 390px, 834px, and 1440px in light/dark. Latest recorded QA inspected Home, Library empty state, Downloads, Progress, and shared Settings at 1280px in light/dark, with no horizontal overflow or runtime console errors. Mobile/tablet checks were not repeated in that run. Recheck any route/theme/viewport needed; claim only actual checks.
- Real-media playback/download/cancel/remove, populated coaching/reader/quiz/flashcards/reminders, keyboard-only operation, and formal WCAG contrast calculations remain unverified. See `handover.md` for exact limits.

## QA checklist

1. Rerun `npm test`, `npm run build`, and `node --check` for changed JavaScript. Compare results with the baseline; report the two known TODOs accurately.
2. Verify separate Discipleship/Sermons navigation and progress, shared Settings, storage migration/backup, and non-mutation of Discipleship state.
3. Review first-study coaching gates, completion timing, resume, quiz/flashcard flows, and accessible feedback using synthetic data only in test fixtures.
4. Review explicit-only audio caching/removal, same-origin validation, cancellation/progress, cache persistence, byte accounting, player continuity, and offline/unavailable behavior. Do not claim production media verification without approved media.
5. Review reminder settings, timing/dismissal semantics, notification disclosures, and absence of background-delivery promises.
6. If browser tooling is available, inspect affected screens at 390/834/1440 in light/dark, plus keyboard focus, contrast, overflow, loading/error/offline and empty states. Record exact screens and viewports.
7. Review generated `dist`, service-worker cache behavior, source catalogue, backup/migration, and complete diff. Confirm no protected/reference/tracking files or secrets changed.
8. Update `handover.md` and keep this prompt plus `templates/continuation-prompt.md`, `prompts/sermons-final-qa.md`, and `prompts/sermons-continue.md` aligned with current verified facts.

## Commit and push

Do not commit or push merely because QA is complete. Commit/push only when the user explicitly authorizes those exact actions and target branch. The earlier instruction was completed by commit `0c09629`; it does not authorize future changes. A fresh direct instruction is sufficient—do not impose an additional threshold. Never merge or deploy unless separately requested. If GitHub authentication is unavailable, preserve any local commit and report the blocker without requesting credentials in chat.

## Final report

Report branch/base, files changed, test/build/check output, exact visual QA, content/media/backend dependencies, unverified cases, design-reference deviations, and staged/committed/pushed state. Do not hide failures or imply production content exists.
