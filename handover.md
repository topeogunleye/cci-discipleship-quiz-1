# Sermons Experience — Implementation Handover

**Repository:** <https://github.com/topeogunleye/cci-discipleship-quiz-1>
**Current branch/upstream:** `feature/sermons-experience-continuation` / `origin/feature/sermons-experience-continuation`
**Base:** `feature/sermons-experience` at `1d0fe27` (`Add handover file`)
**Last verified implementation/QA snapshot:** `0c09629` (`docs: update Sermons QA handover`), confirmed on the matching upstream branch. This refresh changes six repository documents only; no app source changes are intended. The user explicitly authorized committing and pushing these six documents to `feature/sermons-experience-continuation`. The installed skill package remains outside this repository and is excluded. Do not merge or deploy.

## Source of truth and scope

- Read this handover, the user brief if available, repository-local instructions, the files in `templates/`, and their project-specific counterparts in `prompts/` before continuing.
- Do not edit `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`, feature/coverage lists, or the states board.
- Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` intentionally remains empty until approved content and same-origin audio URLs are supplied.
- The original brief was referenced at `/home/ubuntu/upload/pasted_content.txt`; verify it is available in the current environment. If it is absent and required details are unclear, ask for the missing requirement instead of inventing it.

## What is implemented

- Separate accessible Discipleship/Sermons toggle, independent Sermons Home/Library/Downloads/Progress, route-aware navigation, and shared Settings.
- Separate Sermons state with schema-v11 migration/backup normalization; first-study coaching gate; Listen/Read/Quiz/Flashcards flows; player/mini-player; explicit-only Cache API audio download/cancel/remove; offline byte-range playback; independent reminder settings; responsive light/dark styling.
- Catalogue/content validation and honest empty, draft, offline, and unavailable states. The production catalogue is still empty; do not fabricate content to fill it.

## Files changed on the original implementation branch

`js/app.js`, `js/sermons.js`, `js/sermons-ui.js`, `service-worker.js`, `style.css`, `tests/content-lint.test.js`, `tests/pwa.test.js`, `tests/sermons.test.js`, the handover/prompts, and generated distribution files. No design references/tracking files or dependency manifests were intentionally changed in that implementation. For this prompt/template refresh, inspect `git status` for the exact documentation-only paths and do not assume they have been committed.

## Verification snapshot

- `npm test`: 86 tests, 84 pass, 0 fail, 2 existing TODO diagnostics (answer-letter distribution and longest-option-correct rate). Rerun after code changes.
- `npm run build`, relevant `node --check`, and `git diff --check` passed at the last recorded QA run. `package.json` has no separate lint/typecheck script.
- Earlier browser checks recorded Sermons Home at 390/834/1440 in both themes. Latest continuation QA inspected Home, Library empty state, Downloads, Progress, and shared Settings at 1280px in light/dark; no horizontal overflow or runtime console errors were observed. Mobile/tablet sizes were not recaptured in that latest run, and no full pixel comparison/formal accessibility audit was completed.
- Not verified with real content/media: production recording playback/seek/speed, real Cache API download/cancel/removal, populated coaching/reader/quiz/flashcards/reminders, keyboard-only operation, or formal WCAG contrast calculations. See `templates/final-qa-prompt.md` for the full checklist.

## Content dependencies and next steps

1. Obtain approved sermon metadata, same-origin audio files/URLs, five coaching sections, reviewed transcript sections, quiz questions/options/answers/explanations, and flashcards before validating real-content flows.
2. With approved content, test the complete first-study path and each mode; playback/seek/rate; explicit cache progress/cancel/remove, quota/offline failure; backup migration/restore; reminder timing/dismissal; and state isolation.
3. Recheck affected routes at 390/834/1440 in both themes if tooling permits, compare with repository references, test keyboard/focus/contrast, and inspect generated `dist`/service-worker changes.
4. Keep `templates/continuation-prompt.md` aligned with `prompts/sermons-continue.md`, and `templates/final-qa-prompt.md` aligned with `prompts/sermons-final-qa.md`. Update both pairs when verified facts, scope, branch state, or authorization changes; remove stale instructions instead of appending contradictory ones.
5. Commit/push only when the user explicitly authorizes those exact actions and target branch. A direct instruction suffices; do not add an additional publication gate. Never merge or deploy unless separately requested.
