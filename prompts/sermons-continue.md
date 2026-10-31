# Continue implementation: CCI Sermons experience

Work in the repository working copy for <https://github.com/topeogunleye/cci-discipleship-quiz-1>. First read `handover.md`, this prompt, `templates/final-qa-prompt.md`, the project prompt copies in `prompts/`, and any repository-local instructions. Inspect `git status`, current branch/upstream, recent history, full diff, and PR #8's live GitHub state before acting. The Sermons branch is `feature/sermons-experience-continuation`; merge commit `8334100` integrated `feature/evangelism-deck-questions` at `4383a959`. The Sermons implementation before that merge was `9579c3b`. Verify live refs and do not assume this snapshot is current.

## Scope and constraints

- Do not edit `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`, feature/coverage lists, or the states board. Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Keep Discipleship and Sermons as separate top-level experiences with separate Home/navigation/Progress and shared Settings. Sermons activity must not mutate Discipleship progress or quiz state. Preserve the five-part coaching flow and mark coaching complete only on Continue; after coaching, Listen/Read/Quiz/Flashcards may be completed in any order.
- Keep audio downloads explicit, user-controlled, separately stored, removable, and accessible. Explain reminders are evaluated on app open; do not promise background notifications.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` remains empty pending approved content and same-origin audio URLs. Synthetic content is allowed only in tests.
- The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt`, but it was unavailable in the 2026-10-29 environment. Ask if a required detail remains unclear rather than guessing.

## Current implementation and verification

The Sermons experience includes independent routes/state, coaching and study modes, player/mini-player, explicit Cache API audio controls, offline byte-range playback, reminders, and responsive themes. Follow-up hardening covers prototype-free ID maps, status-appropriate unavailable copy, standalone asset copying/whitespace normalization, and service-worker cache v29 with Sermons audio-cache behavior. The PR branch also includes the Evangelism feature-branch history; the Evangelism source deck was already present identically in `main`.

Latest verified run after resolving the merge: `npm test` reported 88 tests, 86 pass, 0 fail, and 2 existing content-balance `TODO` diagnostics. `npm run build` passed (`dist/index.html`, 1,479,586 bytes); all 12 manifest-listed decks matched their `dist` copies. Changed JavaScript passed `node --check`, and the resolved source/test/generated files had no merge markers. Earlier browser QA covered Sermons Home, Library, Downloads, Progress, and Settings at 390/834/1440px in light/dark. The visual route matrix was not repeated after branch integration. The previous offline-reload check was inconclusive; do not claim full offline navigation from it. See `handover.md` for exact evidence and remaining unverified real-media/content flows.

## Work only where justified

1. Recheck Git status, branch/upstream, full diff, and PR #8 state. Preserve existing work. Run `npm test`, `npm run build`, relevant syntax checks, and diff hygiene checks before finishing.
2. Fix only verified defects and add focused regression tests. Preserve safe user-ID handling and honest unavailable/draft labels; do not weaken unrelated tests.
3. With approved content/media, validate coaching, all study modes, playback/seek/rate, explicit download/cancel/remove/failure, reminder timing/dismissal, backup/restore, and state isolation. Keep synthetic fixtures in tests only.
4. If browser tooling permits, recheck affected routes at 390/834/1440 in light/dark, keyboard focus, overflow, generated `dist`, deck parity, precache completeness, and service-worker behavior. Report inconclusive checks honestly.
5. Keep `handover.md` identical to `templates/handover.md`, this prompt identical to `prompts/sermons-continue.md`, and `templates/final-qa-prompt.md` identical to `prompts/sermons-final-qa.md`; update their verified facts together.
6. An independent uncommitted TestFlight workflow change set exists on a separate local branch/worktree. Do not stage, commit, push, or reset it as part of Sermons work.

## Authorized delivery

The user explicitly requested PR #8 from `feature/sermons-experience-continuation` to `main`, merging `feature/evangelism-deck-questions` into that PR's head, and merging PR #8 into `main`. Verify the live PR and branch state before repeating any step; this specific authorization does not extend to future merges, direct pushes to `main`, TestFlight uploads, code signing, or App Store submission. The merge has already been requested, so do not block on another confirmation once GitHub checks and mergeability are ready.
