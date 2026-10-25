# Mobile App Outcomes

## iPhone and Android packaging
- [x] Package the existing CCI Discipleship Study application for both iPhone and Android using Capacitor, reusing the current HTML/CSS/JavaScript app rather than rewriting it in React Native or Flutter. Both native shells are generated and synced.
- [x] Build the shared static web bundle from the existing app and bundle it in both native shells, with the 12 lesson decks, Bible References, flashcards, quizzes, timed exams, spaced repetition, weak-spot review, progress, deck editing, import/export, and backup/restore preserved.
- [x] Do not change any question text, answer choices, correct answers, explanations, or Bible references as part of the mobile conversion.

## Guided daily study
- [x] Provide a guided “Today’s Study” entry point that prioritizes cards already due for spaced repetition and, when no cards are due, offers a short study session using existing cards the learner has not mastered.
- [x] Keep this routine optional and modest; mandatory streaks, social features, or required reminders remain disallowed. Per the project owner's decision (Prompt 2C), devotional articles are allowed when written strictly from the existing lessons and verified Bible References, gated by `status: "draft" | "reviewed"` with draft filtering and requiring leader review before release.
- [x] Keep direct access to all existing study modes and tools, and make it possible to pause and return without losing saved progress.

## Offline use, local data, and native behavior
- [x] Make the bundled lesson decks and core study experience work without an internet connection; do not require sign-in, cloud sync, external content, or a backend for core use.
- [x] Preserve existing learner data behavior and JSON backup/import compatibility, including existing local persistence and backup/restore safety.
- [x] Add native back navigation that returns from a study session to its prior screen and does not unexpectedly exit an active session.
- [x] Provide native file-sharing behavior for backup and deck exports where browser-style downloads do not work reliably.

## Mobile usability and delivery boundaries
- [x] Support portrait, one-handed use, safe-area insets, readable text scaling, screen readers, visible focus/keyboard interaction where relevant, reduced motion, and large touch targets on iPhone and Android.
- [x] Adopt a Fabulous-style coaching UI (interaction and layout patterns only; no Fabulous logo, mascot, illustrations, name, or wording): big rounded cards (20–24px), full-width pill buttons (999px), saturated color palette (crimson primary `#B5173A`, light background `#F5F6FB`, dark indigo `#12103A`), hero and per-deck gradients, system sans typography only (no serifs, parchment, or small-caps), and encouraging non-shaming progress language.
- [x] Mandatory streaks and reminders stay off; optional streaks and low-pressure daily study plans are allowed.
- [x] Document local iOS and Android build and test steps, and clearly state any device or release-build checks that cannot be completed in the available Linux environment.
- [x] Do not publish, sign for store release, or submit to an app store. The user explicitly authorized a commit and push to `feature/mobile-app`; never push to `main`.

---

## Fabulous-Style Coaching Redesign (Prompts 1–6)

- [x] **Prompt 1 — Design Tokens & Visual Restyle:** Clean sans typography only (`system-ui`), cards 20–24px, pill buttons 999px, primary crimson action (`#B5173A`), light background (`#F5F6FB`) and deep indigo dark mode (`#12103A`), indigo/violet and sunrise hero gradients, 12 distinct deck gradients meeting 4.5:1 contrast, inline SVG artwork.
- [x] **Prompt 2 — Navigation Shell & Today's Plan Home:** Persistent mobile tab bar (`Home`, `Journey`, `Practice`, `Progress`, `Settings`), contextual hero action card, "Your Plan for Today" short cards (due review, weak spots, new lesson) with minute estimates and states, and safe-area insets.
- [x] **Prompt 3 — Journey of Chapters & Chapter Timeline:** Replaced flat deck list with 12 structured chapters; chapter detail screen featuring progress rings and an interactive 4-step study timeline (`Flashcards` → `Quiz` → `Weak spots` → `Chapter exam`) with soft unlock recommendations.
- [x] **Prompt 4 — One-Question-Per-Screen Study Flow:** Large question cards (`--text-xl`), big touch-target answer options (`A`–`D`), thin `6px` progress bar, safe exit `X` button with confirmation, coaching bottom sheet feedback with tappable Bible References, first-use tooltip, and "Well done!" encouraging completion screen.
- [x] **Prompt 5 — Onboarding & Optional Streaks:** First-run skippable onboarding (Splash → Welcome → 4 goal/time/topic questions → Study plan summary → Tap-and-hold to commit). Daily plan length adapted to user's time commitment. Gentle streak celebration screen after first session of the day with no guilt messaging and optional toggle in Settings. `DATA_VERSION` bumped to 9 with migration and legacy backup compatibility.
- [x] **Prompt 6 — QA, Accessibility & Native Sync:** WCAG AA contrast audit across light/dark modes and all 12 deck gradients, 48dp minimum touch targets, keyboard navigation and visible focus rings, ARIA roles and labels, 200% text scaling resilience, prefers-reduced-motion media query coverage, offline service worker cache `v15`, and Capacitor native sync for iOS & Android. All 57 tests passing.
- [x] **Prompt 2B — Rocket Study Menu & Lesson Picker:** 56px rocket FAB button on Home, Journey, and Practice; tap reveals dimmed backdrop, morphing X button, and 4 stacked pills (Flashcards, Quiz, Start a Challenge, Start Exam); full-screen Lesson Picker with All Lessons tile and 2-column chapter grid; 10-item mixed Challenge quiz; focus trap, Escape, native back handling, and reduced-motion support.
- [x] **Prompt 2C — Hide Section Labels & Devotional Feed:** Remove "Section N" labels in favor of clean topic titles, introduce bundled devotional articles (`content/devotionals.json`) gated by leader review, swipeable daily devotional home feed card, article reader view with expandable body, reflection, today's step integration with Plan, and `DATA_VERSION` 10 migration.


---

## Evangelism deck question append

- [x] Append the supplied questions to the existing Section 9 Evangelism deck without changing any existing question, option, answer, explanation, reference, or Bible-reference line.
- [x] Compare exact wording and clear same-concept paraphrases against the deck and attachment. Skipped five confirmed repeats: source Q53→existing Q53, source Q77→existing Q56, source Q85→existing Q58, source Q99→existing Q61, and source Q177→existing Q77. Kept related-but-distinct Q150 (acknowledging a Supreme Being versus the existing question's detached/transcendent characterization), Q31 (Penn Gillette's statement versus the existing practical application), Q38 (the event after prayer versus its significance), and Q163 (Jesus' Middle Eastern identity versus African Christian history).
- [x] Added the other 165 questions with unique increasing labels Q82–Q246. All question text, options, answers, and explanations are preserved; lesson names and timestamps remain in REF, with redundant “Celebration Church International - LMS.mp4” filenames removed to satisfy the repository's reference-lint rule. Any BIBLE lines are retained as supplied.
- [x] Parser validation reports one Evangelism deck, 229 questions, zero errors and warnings, and strictly increasing IDs. `node --test`: 73 tests, 71 pass, zero non-TODO failures, two existing `# TODO` content-lint tests. Branch is `feature/evangelism-deck-questions`, based on fetched `origin/main`; no push to `main`.
- [x] Bump the service-worker cache to v27 and align its PWA assertions because the offline deck asset changed; rebuild `dist/` so web and offline bundles include all 229 Evangelism questions.

---

## Additional African traditional religion questions — transcript-only scope

- [x] Added 12 questions, Q247–Q258, using only `NEW-AGE-SPIRITUALITY-IV` and `NEW-AGE-SPIRITUALITY-V` transcript material; no external sources were used for question facts or wording.
- [x] Audited existing Q197–Q208; kept additions distinct, attributed speaker claims, and cited the transcript timestamp in every new `REF:` line. Existing 229 question records remain byte-for-byte equivalent after parsing; parser reports 241 total questions, zero errors, zero warnings, and IDs Q1–Q258 in increasing order.
- [x] Bumped the service-worker cache to v28, updated its PWA assertions, rebuilt `dist`, and verified exact source/offline deck parity. `node --test`: 73 tests, 71 pass, 0 fail, 2 known `# TODO` tests.
- [ ] Commit and push only `feature/evangelism-deck-questions`; never push to `main`.
