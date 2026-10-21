# Mobile App Outcomes

## iPhone and Android packaging
- [x] Package the existing CCI Discipleship Study application for both iPhone and Android using Capacitor, reusing the current HTML/CSS/JavaScript app rather than rewriting it in React Native or Flutter. Both native shells are generated and synced.
- [x] Build the shared static web bundle from the existing app and bundle it in both native shells, with the 12 lesson decks, Bible References, flashcards, quizzes, timed exams, spaced repetition, weak-spot review, progress, deck editing, import/export, and backup/restore preserved.
- [x] Do not change any question text, answer choices, correct answers, explanations, or Bible references as part of the mobile conversion.

## Guided daily study
- [x] Provide a guided “Today’s Study” entry point that prioritizes cards already due for spaced repetition and, when no cards are due, offers a short study session using existing cards the learner has not mastered.
- [x] Keep this routine optional and modest; do not add generated devotional or doctrinal teaching, mandatory streaks, social features, or required reminders.
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
