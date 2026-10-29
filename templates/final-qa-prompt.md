# `Final QA: CCI Sermons experience`

`Run this prompt only after the implementation on feature/sermons-experience-continuation is believed complete. Work in /home/ubuntu/cci-discipleship-quiz-1.`

## `Non-negotiable constraints`

- `Read handover.md, inspect git status and the full branch diff before any change. Do not discard user changes or reset the branch.`

- `Keep working on feature/sermons-experience-continuation. Do not commit, push, merge, publish, deploy, or switch branches.`

- `Do not alter design-reference images, feature/coverage lists, or states board. Do not add scope.`

- `Do not invent sermon, Scripture, coaching, quiz or audio content. The production catalogue may remain empty; document what content/backend is required.`

## `QA checklist`

1. `Run all relevant repository tests, lint, type checks, and build commands; compare failures to the recorded baseline of 86 tests (84 pass; 2 TODO diagnostics) and explain regressions.`

1. `Verify the segmented toggle and independent Home/navigation/Progress for Discipleship vs Sermons. Confirm shared Settings. Verify Sermon activity never mutates Discipleship progress/quizzes.`

1. `Verify the first-study path: coaching precedes all modes; only Continue marks coaching complete; revisiting it does not interrupt playback. Verify Listen/Read/Quiz/Flashcards choice order after coaching.`

1. `Verify explicit-only audio downloads, progress/cancel/remove/failure, cache persistence across app updates, and mini-player continuity. Verify unavailable/offline media states and no false promises about background reminders.`

1. `Verify written content, coaching and quiz fallback offline; no phantom published content; visible Draft placeholder badge and [Scripture reference] where appropriate.`

1. `Verify quiz progress, correct/incorrect text/icon semantics independent of color, completion, review, retry and return-to-sermon. Verify flashcards.`

1. `Verify reminder toggles, separate unfinished reminders, day/time choices, once-per-day/dismiss behavior, permission rationale and denied/unsupported status.`

1. `If browser visual tooling exists, inspect `**`all required screens`**` at mobile 390px, tablet 834px, desktop 1440px in both light and dark. Check responsive sidebar/tabbar patterns against the repository references; inspect keyboard focus, AA contrast, scrolling, clipping, error/loading/empty/offline/download-in-progress/completion states. Do not claim a viewport/theme was checked unless actually inspected.`

1. `Review generated build output, service-worker cache version/precache list, backup migration, tests and git diff. Ensure no unintentional changes to source references/tracking files or bundled artifacts.`

## `Final response must report`

- `Branch and starting branch; confirm no commit/push/deploy.`

- `Implemented screens and behavior; files changed.`

- `Test/lint/typecheck/build results, including baseline comparisons.`

- `Viewports/themes actually inspected and coverage gaps.`

- `Content/audio/API/backend dependencies and anything not fully supported.`

- `Any deviations from reference images/previews: exact filename, difference, and reason; list unverified values and decisions needed.`

- `Local steps to preview/review the branch.`

`Do not hide failures or claim completeness for unverified features.`
