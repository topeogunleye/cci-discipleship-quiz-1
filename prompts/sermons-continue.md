# Continue implementation: CCI Sermons experience

Work in `/home/ubuntu/cci-discipleship-quiz-1`. Before changing anything, read `handover.md`, the user brief if available, repository-local instructions, and the current copies in `templates/` and `prompts/`. Inspect `git status`, current branch/upstream, recent history, and the complete diff. Stay on `feature/sermons-experience-continuation`; do not reset, rebase, clean, or switch branches. The last verified committed revision before this prompt/template refresh was `0c09629` (`docs: update Sermons QA handover`), pushed to the matching origin branch; verify current state rather than assuming it is unchanged.

## Scope and constraints

- Follow the approved Sermons requirements and current `handover.md`. Do not alter design references (`design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`), feature/coverage lists, or the states board. Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Keep Discipleship and Sermons as separate top-level experiences with separate Home/navigation/Progress and shared Settings. Sermons activity must not mutate Discipleship progress or quiz state. Preserve the five-part coaching flow and mark coaching complete only on Continue; after coaching, Listen/Read/Quiz/Flashcards may be completed in any order.
- Keep audio downloads explicit, user-controlled, separately stored, removable, and accessible. Explain reminders are evaluated on app open; do not promise background notifications.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` remains empty until approved content and same-origin audio URLs are supplied. Keep honest empty/offline/unavailable states and synthetic content limited to tests.
- The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt`; verify it is available in the current environment. If it is absent and required details are unclear, work only from verified repository instructions and ask for the missing requirement rather than inventing it.

## Current implementation and known gaps

The separate experience toggle, routes/navigation, shared Settings, Sermons state/migration/backup normalization, coaching gate, study-mode flows, player/mini-player, explicit Cache API audio controls, offline byte-range playback, reminders, responsive styles, and regression tests are recorded in `handover.md`. The production catalogue is empty, so real-media playback/downloads, authored coaching/reader/quiz/flashcard journeys, and populated-progress reminders cannot be validated end to end. Use the handover for exact test and visual coverage; do not overstate it.

## Work only where justified

1. Review the current diff and run `npm test` and `npm run build` before new implementation work.
2. Fix verified defects only, add focused regression tests, and do not weaken unrelated tests.
3. With approved content/media, test the complete first-study path, all study modes, audio/progress, offline download/cancel/remove/failure, reminder timing/dismissal, backup/restore, and state isolation. Keep synthetic fixtures in tests only.
4. Recheck applicable routes at 390/834/1440 in light/dark if tooling permits; inspect focus/overflow/contrast, generated `dist`, and the service worker. Record exactly what was checked.
5. Update `handover.md`, this prompt, and `templates/final-qa-prompt.md` plus `prompts/` copies when requirements, code, test results, authorization, or Git state changes. Keep duplicates aligned and replace stale instructions rather than appending conflicting ones.

## Commit and push

Do not commit or push without direct user authorization for the exact action and target branch. The earlier instruction was fulfilled by commit `0c09629`; it is not blanket authorization for later changes. A fresh direct instruction is sufficient—do not impose an additional threshold. After authorization, rerun final checks, stage only intended files, scan for secrets, and push only `feature/sermons-experience-continuation`. Never merge or deploy unless separately requested. If GitHub authentication is unavailable, do not ask the user to paste credentials or change destinations; retain the local commit and report the blocker.
