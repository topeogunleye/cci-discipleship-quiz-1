# Final QA: CCI Sermons experience

Work in `/home/ubuntu/cci-discipleship-quiz-1`. Read `handover.md`, inspect `git status` and the full diff before changing anything. Continue on `feature/sermons-experience-continuation`, created from `feature/sermons-experience` at `1d0fe27`. Do not reset, rebase, switch branches, merge, publish, or deploy. The user authorizes a handover, commit and push only when 20 credits remain. No available balance tool has been found; verify the threshold rather than guessing, and ask the user to confirm if no meter is accessible.

## Constraints

Preserve existing work and scope. Do not alter repository design-reference images, feature/coverage lists or the states board. Do not add unrelated features. Do not invent sermon, Scripture, coaching, quiz, transcript or audio content. `content/sermons.json` is intentionally empty pending an approved content source.

## Verification already recorded in `handover.md`

- Latest recorded `npm test`: 86 tests, 84 pass, 0 fail, 2 pre-existing TODO diagnostics (answer-letter distribution and longest-option-correct rate); rerun after any changes.
- Latest recorded `npm run build`: successful; Sermons assets are included in the generated PWA distribution.
- Sermons Home visually inspected at 390px, 834px and 1440px in light and dark. Library empty state and shared Settings were opened at the standard desktop preview viewport. A malformed shell boundary found during visual QA was fixed and guarded by a regression test.
- Test-only app interactions verify coaching gates, continuous playback while revisiting coaching, and quiz completion without changing Discipleship progress; synthetic tests also cover streamed cancellation without partial cache entries, explicit same-origin media download/removal, and service-worker v28 full/range playback from the dedicated audio cache. Real-media end-to-end playback/download/cancel/remove, populated coaching/reader/quiz/flashcards, keyboard-only behavior and formal WCAG contrast calculations remain unverified because no approved production content/media is available and those checks were not completed. Do not claim them as verified.

## QA checklist

1. Re-run `npm test`, `npm run build`, and `node --check` for changed JavaScript after any edits. Compare results with the above record and explain any new failures. `package.json` has no separate lint/typecheck script.
2. Review the experience toggle, route/sidebar/tab separation, shared Settings, state migration/backup and proof that Sermons progress remains separate from Discipleship.
3. Review first-study gating, coaching completion timing, resume state, quiz feedback/review/retry/completion, flashcard behavior and all user actions. Use only test fixtures for synthetic content.
4. Review explicit-only audio download behavior, same-origin validation, independent recording/narration cancellation, progress, cache persistence, byte accounting, removal, quota/offline failure handling, player continuity and unsupported capability messaging. Where real media is absent, report the limitation rather than claiming end-to-end verification.
5. Review reminder toggles, days/time, once-per-day/dismiss behavior, notification permission/denied/unsupported disclosures, and ensure no background-delivery promise is made.
6. If browser tooling is available, inspect affected routes at 390/834/1440 in light/dark, plus keyboard focus, contrast, overflow, error/loading/offline and empty states. State exactly which screens and themes were inspected.
7. Review generated `dist` files, service-worker precache/cache behavior, source catalogue, backup/migration and complete `git diff`. Confirm no reference/tracking files changed.

## Final report

Report the current branch and parent branch, files changed, test/build/check output (including the two TODOs), exact visual QA performed, content/media/backend dependencies, unverified cases, deviations from the design references, and local preview/review instructions. Commit and push only after the 20-credit threshold is verified; never merge/deploy. Do not hide failures or imply the empty catalogue contains production data.
