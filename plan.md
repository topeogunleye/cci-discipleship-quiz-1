# CCI Discipleship Study — Mobile App Plan

## Product and implementation approach

Build the existing CCI Discipleship Study app for iPhone and Android by packaging its current static web application with Capacitor. Do not rewrite the app in React Native or Flutter: the current app is a vanilla HTML/CSS/JavaScript PWA, already responsive, offline-capable, and includes the study modes, decks, Bible references, and local progress that the mobile app must retain. The shared source remains the existing app; `node scripts/build.js` produces the static `dist/` bundle that Capacitor embeds in both native shells.

Use a maintained compatible Capacitor release and its CLI, iOS and Android platform packages. Add only the native plugins needed for system back handling and exporting/sharing backup files. Keep deck and learner data on-device, preserve existing JSON backup/import behavior, and make no sign-in, cloud sync, external content, or server a requirement. Opening the app and studying its bundled decks must work in airplane mode. Do not modify question text, answers, explanations, or Bible references.

Adapt the existing home screen into a guided “Today’s Study” entry point: prioritize scheduled due cards; when nothing is due, offer a short session from cards the learner has not mastered. The owner has now approved a separate, draft-only devotional feature sourced from existing lessons and their Bible References; every starter article remains hidden by default and requires leader review before release. Retain direct access to all current study modes and tools. Add native back navigation that returns from a study session to its prior screen and does not unexpectedly exit a session; use native share/file handling for backup and deck exports where browser-style downloads do not work reliably.

For the approved follow-on work on `feature/manusai-mobile`, add a global Rocket study menu to Home, Journey, and Practice, with quick Flashcards/Quiz lesson selection, a 10-question mixed challenge, and the existing exam setup. Keep current chapter timeline and Practice tab intact. Hide displayed “Section N” prefixes without changing deck IDs, filenames, titles, ordering, or search behavior. Add an offline Daily Devotionals row and article view, 12 draft articles (one per deck) written only from existing deck content and that deck’s BIBLE references, a default-off draft visibility setting, leader-review status gate, local save/read/carousel state, and a `DATA_VERSION` 9-to-10 migration compatible with old backups. Do not quote scripture beyond licensed public-domain KJV/WEB text; optional scripture text may be omitted. Do not add new dependencies, network requirements, invented doctrine, or changes to lesson questions, answers, explanations, Reference, or Bible References.

Do not publish, sign for store release, or submit to an app store. For this follow-on, commit and push only to `feature/manusai-mobile`; never push or merge to `main` or `feature/mobile-app`. The current Linux environment cannot run Xcode or a real iOS Simulator; Android native build/device verification also depends on Android SDK tooling being available. Report any device-level or release-build checks that cannot be completed here rather than implying they passed.

## Project structure
- `index.html`, `style.css`, and `js/`: shared mobile-responsive application, current study flows, and mobile-specific journey/native bridge adjustments.
- `decks/` and `icons/`: unchanged lesson content and existing app identity assets bundled with the app.
- `scripts/build.js`: existing deterministic builder, extended only if needed to create the native web asset bundle.

- `capacitor.config.*`: shared Capacitor application ID, display name, and web output directory.
- `android/` and `ios/`: generated native shells, platform configuration, app icons/splash assets, and minimal native wiring.
- `tests/`: existing Node test suite plus focused checks for mobile bridge fallbacks, study journey selection, and build output.
- `package.json` and its lockfile: reproducible native-packaging scripts and Capacitor dependencies only.

## Design

**Design Movement:** A friendly coaching app interface inspired by Fabulous-style coaching UI interaction and layout patterns (big rounded cards, one task per screen, saturated colour, large tap targets, short encouraging copy). Deliberately replaces the former editorial/cream/serif look with modern coaching UI patterns, while strictly avoiding Fabulous branding (never their logo, mascot, illustrations, name, or wording; own inline SVG landscapes and custom palette).

**Core Principles:** Scripture-study first; short, clear next steps; progress without guilt; offline by default.

**Color Philosophy:** Saturated, distinct coaching palette (own palette, not Fabulous's):
- Primary action: crimson `#B5173A` (pill button, full width at the bottom of the screen on mobile).
- Secondary action: soft grey pill. Link/info: blue `#2F6FED`.
- Backgrounds: light mode `#F5F6FB`, cards white with soft shadow; dark mode deep indigo `#12103A` with cards `#1D1A55`.
- Hero gradients (onboarding, Today card, completion): indigo `#3B2BB0` → violet `#7A3FD0`, and sunrise `#FF8A3D` → `#FF4F7A`.
- 12 per-deck gradients (in `decks/manifest.json` order): vary hue across indigo, violet, magenta, coral, orange, gold, green, teal, cyan, blue, navy, plum (ensuring ≥ 4.5:1 contrast for text).

**Layout Paradigm:** A portrait-first, one-task-per-screen flow with large tap targets. Big rounded cards (20–24px radii), full-width bottom pill buttons (999px), and 14px inputs. Respect safe-area insets and dynamic text scaling.

**Signature Elements:** A prominent "Today's Plan" card with a realistic time estimate; soft-unlock journey chapters; clean explanation/scripture bottom sheets; encouraging non-shaming completion screens.

**Interaction Philosophy:** Large tap targets (≥ 48dp) and explicit actions. Let learners start a review, skip a session, pause, and return without losing progress. Mandatory streaks and reminders stay off; optional streaks and low-pressure daily study plans are allowed.

**Animation:** Keep transitions short and optional; honor reduced-motion settings.

**Typography System:** System sans stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`); offline-first with no web fonts. Headings 700, body 400–500. No serif fonts, no cream/gold paper look, no hairline rules, no small-caps.

**Brand Essence:** A pocket coaching companion for CCI discipleship learners, built around the actual lesson decks and offline review. Personality: grounded, vibrant, encouraging.

**Brand Voice:** Headlines are specific; buttons say what happens; progress language is encouraging rather than judgmental. Examples: "A few cards are ready for review." "Pick up where you left off."

**Wordmark & Logo:** Reuse the current CCI Discipleship identity and icon assets, with custom inline SVGs for landscapes and shapes. Do not trace or recreate Fabulous artwork or replace CCI branding.

**Signature Brand Color:** Crimson primary `#B5173A` in light mode, paired with deep indigo `#12103A` in dark mode.
