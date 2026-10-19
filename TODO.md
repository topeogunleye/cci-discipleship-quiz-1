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
- [x] Keep the existing CCI visual identity and light/dark appearance; use encouraging, non-shaming progress language and avoid imitating Fabulous branding.
- [x] Document local iOS and Android build and test steps, and clearly state any device or release-build checks that cannot be completed in the available Linux environment.
- [x] Do not publish, sign for store release, or submit to an app store. The user explicitly authorized a commit and push to `feature/mobile-app`; never push to `main`.
