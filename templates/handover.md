# Sermons Experience — Implementation Handover

**Repository:** <https://github.com/topeogunleye/cci-discipleship-quiz-1>
**Current branch/upstream:** `feature/sermons-experience-continuation` / `origin/feature/sermons-experience-continuation`
**Base:** `feature/sermons-experience` at `1d0fe27` (`Add handover file`)
**Last verified implementation/QA snapshot:** `0c09629` (`docs: update Sermons QA handover`), pushed to the matching feature branch; verify the actual branch head before relying on this snapshot.
**Publication rule:** Commit/push only after the user explicitly authorizes those exact actions and target branch. A direct instruction is sufficient; do not apply an additional publication gate. Previous authorization is not blanket consent for future changes.

## Source of truth and scope

- Read this handover, the user brief if available, repository-local instructions, `templates/`, and matching project prompts in `prompts/` before continuing.
- Do not edit `design-reference/mobile`, `design-reference/desktop`, `design-reference/desktop-2x`, feature/coverage lists, or the states board.
- Do not add Notes, social features, devotionals, unrelated screens, or the unapproved charcoal quiz-show theme.
- Do not invent production sermon, Scripture, coaching, transcript, quiz, flashcard, or audio content. `content/sermons.json` remains empty until approved content and same-origin media URLs are supplied.
- If the original brief `/home/ubuntu/upload/pasted_content.txt` is unavailable and required details are unclear, ask for the missing requirement rather than inventing it.

## Implemented

- Separate accessible Discipleship/Sermons toggle, independent Sermons Home/Library/Downloads/Progress, route-aware navigation, and shared Settings.
- Separate Sermons state/migration/backup; coaching gate; study modes; player/mini-player; explicit audio caching/removal; offline byte-range playback; independent reminders; responsive light/dark styling.
- Keep all content-dependent empty/offline/unavailable states honest while the approved catalogue is empty.

## Verification snapshot

- `npm test`: 86 tests, 84 pass, 0 fail, and 2 existing TODO diagnostics (answer-letter distribution and longest-option-correct rate).
- `npm run build`, relevant `node --check`, and `git diff --check` passed at the last recorded QA run; rerun after changes.
- Earlier visual checks: Home at 390/834/1440 in light/dark. Latest recorded QA: Home, Library empty state, Downloads, Progress, shared Settings at 1280px in light/dark; no horizontal overflow or runtime console errors. Mobile/tablet were not recaptured in that latest run; do not imply broader coverage.
- Production media and populated-content flows, keyboard-only review, and formal contrast calculations remain unverified; refer to `handover.md` and the final-QA prompt for details.

## Next steps

1. Use only approved content/media to validate complete study-mode and audio flows; otherwise keep tests synthetic and production states empty.
2. Recheck affected routes, build output, service-worker behavior, tests, and full diff after any implementation change.
3. Keep this handover and both template/prompt pairs aligned whenever project facts, test results, branch state, or authorization changes. Replace stale facts instead of appending conflicting instructions.
4. If the user explicitly authorizes a commit/push, rerun final checks, stage only intended files, inspect for secrets/generated artifacts, and push only the named feature branch. Never merge/deploy unless separately requested.
