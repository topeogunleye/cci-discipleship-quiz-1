# Continue implementation: CCI Sermons experience

Continue in `/home/ubuntu/cci-discipleship-quiz-1`. Read `handover.md`, inspect `git status` and the full diff before editing. The current branch is `feature/sermons-experience-continuation`, created from `feature/sermons-experience` at `1d0fe27`. **Stay on this branch**; do not reset, rebase, or switch branches. Preserve existing work. The user authorizes a handover, commit and push only when 20 credits remain. No credit-balance tool has been found, so do not guess or commit/push until the threshold is verified; ask the user to confirm if the meter is unavailable. Never merge, publish or deploy.

## Non-negotiable scope

Follow the original brief at `/home/ubuntu/upload/pasted_content.txt` and the user’s branch/handover instructions. Do not modify design references (`design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`), feature/coverage lists, or the states board. No Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.

Keep Discipleship and Sermons as separate top-level experiences with separate Home/navigation/Progress and shared Settings. Do not let Sermons activity mutate Discipleship progress or quiz state. Preserve the five-part coaching flow and mark coaching complete only on Continue. After coaching, Listen/Read/Quiz/Flashcards can be completed in any order. Audio downloads must be explicit, user-controlled, stored outside the main JSON study state, and removable. Use accessible text/icon feedback in addition to color. Explain that reminders are evaluated on app open; do not claim background notifications.

**Do not invent production content.** `content/sermons.json` is intentionally empty because no approved sermons, Scriptures, coaching text, transcripts, quizzes, flashcards, or audio assets were found. Keep honest empty/offline/unavailable states. Production implementation of content-dependent routes and real media flows requires approved content and same-origin audio URLs.

## Current state

The toggle, Sermons routes/nav, shared reminders/settings, separate state/migration/backups, coaching gate, quiz/progress flows, player/mini-player, explicit streaming Cache API download/cancel/remove, offline audio playback with byte ranges, library/reader/download/progress UIs, service-worker v28 handling, responsive CSS and regression tests are implemented. Same-sermon rerenders preserve the audio element while revisiting coaching; fresh launches restore playback position paused. The generated distribution is in `dist/`. See `handover.md` for the current changed-file list and verification details.

A browser visual check was completed at 390px, 834px and 1440px in light and dark themes for Sermons Home; Library empty state and shared Settings were also inspected at the standard desktop preview viewport. A shell-markup bug found during preview was corrected and tested. Do not assume unvisited real-content states were end-to-end verified.

## Work only where justified

1. Review the existing full diff and run `npm test` and `npm run build` before any new work.
2. Fix verified defects and add focused regression tests. Do not rewrite functioning flows or weaken unrelated tests.
3. If the user supplies approved catalogue/media, test the complete first-study path, all study modes, playback and progress, offline download/cancel/remove/failure, reminder timing/dismissal, backup/restore, and state isolation. Keep synthetic data in tests only.
4. Recheck responsive screens at 390/834/1440 in light/dark if tooling permits; compare with repository references, check keyboard/focus/overflow/contrast, inspect generated `dist` and the service worker.
5. Finish by updating `handover.md` and these prompts if the state changes; clearly state any content/backend dependency. When the 20-credit condition is verifiably met, prepare the final handover, commit the branch and push it to its feature-branch remote. Until then, leave changes uncommitted/unpushed.
