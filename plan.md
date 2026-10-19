# CCI Discipleship Study — Mobile App Plan

## Product and implementation approach

Build the existing CCI Discipleship Study app for iPhone and Android by packaging its current static web application with Capacitor. Do not rewrite the app in React Native or Flutter: the current app is a vanilla HTML/CSS/JavaScript PWA, already responsive, offline-capable, and includes the study modes, decks, Bible references, and local progress that the mobile app must retain. The shared source remains the existing app; `node scripts/build.js` produces the static `dist/` bundle that Capacitor embeds in both native shells.

Use a maintained compatible Capacitor release and its CLI, iOS and Android platform packages. Add only the native plugins needed for system back handling and exporting/sharing backup files. Keep deck and learner data on-device, preserve existing JSON backup/import behavior, and make no sign-in, cloud sync, external content, or server a requirement. Opening the app and studying its bundled decks must work in airplane mode. Do not modify question text, answers, explanations, or Bible references.

Adapt the existing home screen into a guided “Today’s Study” entry point: prioritize scheduled due cards; when nothing is due, offer a short session from cards the learner has not mastered. Keep this a modest routine over existing cards, not a new devotional or generated teaching feature. Retain direct access to all current study modes and tools. Add native back navigation that returns from a study session to its prior screen and does not unexpectedly exit a session; use native share/file handling for backup and deck exports where browser-style downloads do not work reliably.

Do not publish, sign for store release, or submit to an app store. The user has explicitly authorized committing and pushing this work to `feature/mobile-app`; never push to `main`. The current Linux environment cannot run Xcode or a real iOS Simulator; Android native build/device verification also depends on Android SDK tooling being available. Report any device-level or release-build checks that cannot be completed here rather than implying they passed.

## Project structure
- `index.html`, `style.css`, and `js/`: shared mobile-responsive application, current study flows, and mobile-specific journey/native bridge adjustments.
- `decks/` and `icons/`: unchanged lesson content and existing app identity assets bundled with the app.
- `scripts/build.js`: existing deterministic builder, extended only if needed to create the native web asset bundle.

- `capacitor.config.*`: shared Capacitor application ID, display name, and web output directory.
- `android/` and `ios/`: generated native shells, platform configuration, app icons/splash assets, and minimal native wiring.
- `tests/`: existing Node test suite plus focused checks for mobile bridge fallbacks, study journey selection, and build output.
- `package.json` and its lockfile: reproducible native-packaging scripts and Capacitor dependencies only.

## Design

**Design Movement:** A guided daily-study rhythm inspired by the calm, step-by-step journey pattern in Fabulous, grounded in the app’s existing editorial learning interface rather than imitating Fabulous branding.

**Core Principles:** Scripture-study first; short, clear next steps; progress without guilt; offline by default.

**Color Philosophy:** Preserve the warm parchment background, deep blue-green text, muted gold accent, and existing light/dark themes. Use the gold for a single “continue today” action and the sage color for gentle progress, not streak pressure.

**Layout Paradigm:** A portrait-first, one-handed reading flow. Put the current recommended study action near the top, followed by mastery and due-review context, then the searchable lesson list and study tools. Respect safe areas and large text.

**Signature Elements:** A compact “Today’s Study” card with a realistic time estimate; a clear, low-pressure progress indicator; readable scripture-reference and lesson-note blocks.

**Interaction Philosophy:** Use large touch targets and explicit actions. Let learners start a review, skip a session, pause, and return without losing progress. Never make streaks, reminders, or social features mandatory.

**Animation:** Keep transitions short and optional; honor reduced-motion settings. Use no celebration animation that blocks returning to study.

**Typography System:** Keep the current system sans-serif for controls and readable body text, with the existing serif heading style for a quiet editorial contrast. Support OS text scaling without clipped controls.

**Brand Essence:** A pocket study companion for CCI discipleship learners, built around the actual lesson decks and offline review. Personality: grounded, clear, encouraging.

**Brand Voice:** Headlines are specific; buttons say what happens; progress language is encouraging rather than judgmental. Examples: “A few cards are ready for review.” “Pick up where you left off.”

**Wordmark & Logo:** Reuse the current CCI Discipleship identity and icon assets, refining only native launcher and splash treatments needed for platform masks and dimensions. Do not create a Fabulous lookalike or replace CCI branding.

**Signature Brand Color:** Existing muted CCI gold, `#8B6E2F` in light mode.
