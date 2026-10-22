# CCI Discipleship Quiz — Engineering Handover

This document provides complete context, architectural constraints, changes made across all 6 Redesign Prompts, verification status, and known gaps for continuing development or deploying the app.

---

## 1. Project Overview & Architectural Boundaries

- **Core Purpose**: A mobile-first coaching app for Christian Central Church International (CCI) discipleship decks. Features spaced repetition (Leitner system), interactive chapter journeys, multiple-choice quizzes, timed exams, weak-spot review, offline persistence, and backup/restore.
- **Design Paradigm**: Friendly coaching UI inspired by layout and interaction patterns of modern habit apps (big rounded cards, pill buttons, saturated color palette, system sans stack only, one task per screen, short encouraging copy, no serif/parchment styling, and no guilt messaging).
- **Hard Constraints**:
  - **Zero External Dependencies at Runtime**: Vanilla HTML5, modern CSS with custom properties, and modular JavaScript (`parser.js`, `study.js`, `storage.js`, `mobile-study.js`, `app.js`). No external web fonts, CDNs, or frameworks.
  - **Single-File Distribution**: `scripts/build.js` bundles CSS, JS modules, bridge, and starter decks into standalone `dist/index.html` (~1.14 MB).
  - **Offline & Native First**: Service worker (`service-worker.js`) precaches core assets and 12 chapter decks. Capacitor 8 packages the identical web bundle into native iOS and Android shells.
  - **Content Immutability**: All question texts, answers, explanations, `REF:`, and `BIBLE:` lines remain untouched.

---

## 2. Redesign Architecture & Completed Prompts (1–6)

### Prompt 1: Fabulous Coaching Design Tokens & Visual Restyle
- **Typography**: System sans stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`); strictly offline, no web fonts. Headings 700, body 400–500.
- **Surfaces & Radii**: Cards 20–24px, pill buttons 999px, inputs 14px.
- **Color Tokens**:
  - Light mode: Background `#F5F6FB`, cards `#FFFFFF` with soft shadows.
  - Dark mode: Deep indigo `#12103A`, cards `#1D1A55`, surface raised `#25226B`.
  - Primary action: Crimson `#B5173A` (full-width pill on mobile). Secondary: Soft grey `#E8EAF2`. Link: Blue `#2F6FED`.
- **Hero & Deck Gradients**:
  - Hero indigo-to-violet (`#3B2BB0` → `#7A3FD0`) and sunrise (`#FF8A3D` → `#FF4F7A`).
  - 12 distinct deck gradients (indigo, violet, magenta, coral, orange, amber, green, teal, cyan, blue, navy, plum) each meeting WCAG AA 4.5:1 text contrast with white text.

### Prompt 2: Mobile Navigation Shell & Today's Plan Home
- **Bottom Tab Bar**: Persistent 5-tab navigation bar (`Home`, `Journey`, `Practice`, `Progress`, `Settings`) with safe-area bottom inset support.
- **Top Bar**: Minimalist header with study title, flame streak button, and settings shortcut.
- **"Your Plan for Today"**: Dynamic coaching card list via `MobileStudy.selectPlanCards`:
  - Due review card (scaled by daily minutes).
  - Weak spots card.
  - Next unmastered lesson card (prioritizing onboarding starting topic).
- **Saved Session Persistence**: Paused session card with instant "Resume" or "Discard" actions.

### Prompt 3: Journey of Chapters & Interactive Study Timeline
- **Chapters Journey**: Transformed flat deck list into 12 structured chapters.
- **Chapter Detail View**: Displays chapter badge, topic title, mastery progress ring, and stats.
- **Interactive 4-Step Timeline**:
  1. `Flashcards` (Learn foundational cards).
  2. `Quiz` (Active recall practice).
  3. `Weak spots` (Target miss rate cards).
  4. `Chapter exam` (Timed chapter mastery test).
  - Soft-unlock indicators guide learners without restrictive hard locks.

### Prompt 4: One-Question-Per-Screen Study Flow & Completion Screen
- **Study Header**: Safe exit button (`X`) with confirmation modal, eyebrow, and status/timer badge.
- **Progress**: Sleek 6px progress bar across flashcards, quizzes, and exams.
- **Question Experience**: Large title font (`--text-xl`), oversized pill-badge answer cards (`A`–`D`), first-use tooltip ("Tap an answer to check it"), and haptic vibration feedback.
- **Coaching Bottom Sheet**: Smooth slide-up bottom sheet with correctness badge, full explanation, and tappable Bible Reference links.
- **Completion Screen**: `.coaching-completion-screen` with percentage badge, time spent, mastered cards count, and positive non-shaming coaching copy via `MobileStudy.formatCompletionFeedback`.

### Prompt 5: Onboarding Flow, Commitment Interaction & Gentle Streaks
- **First-Run Onboarding Flow (Skippable)**:
  - Step 0: Splash screen with branded gradient art.
  - Step 1: Welcome screen highlighting bite-sized study, spaced repetition, and scripture grounding.
  - Steps 2–5: 4 one-question screens with large tap cards (Goal, Daily Minutes, Starting Topic, Preferred Time).
  - Step 6: "Your Study Plan" summary hero card.
  - Step 7: "Tap and Hold to Commit" screen (1.1s hold interaction with animated SVG progress ring and haptic feedback; tap/keyboard accessible).
- **Daily Plan Customization**: User's chosen daily minutes (5, 10, 15, 20 min) directly set session card limits and time estimates.
- **Gentle Streaks (`views.streak`)**:
  - Gentle celebration screen shown after the first session of the day when streaks are enabled.
  - "Daily Grace" encouraging messaging ("No guilt, no pressure; your progress is right here waiting for you").
  - 7-day milestone week tracker.
  - Optional: can be disabled in Settings; no mandatory reminders or guilt-inducing streak loss notices.
- **Data Migration (`DATA_VERSION = 9`)**:
  - `DATA_VERSION` bumped to `9`.
  - Sanitization and defaults for `onboarding` and `streak` objects on load and backup restore.

### Prompt 6: QA, Accessibility & Native Sync
- **WCAG AA Audit**: Contrast ratios verified across light and dark palettes, buttons, and all 12 deck gradients.
- **Touch Targets**: All interactive elements (tab buttons, option cards, close buttons, back buttons) verified $\ge 48\text{dp}$.
- **Accessibility**: Full keyboard `:focus-visible` outlines, ARIA roles (`role="main"`, `role="navigation"`, `role="progressbar"`, `aria-pressed`, `aria-selected`), and complete `@media (prefers-reduced-motion: reduce)` support.
- **Service Worker**: Cache version bumped to `cci-study-pwa-v15`.
- **Test Suite**: 57 tests passing (`node --test`), 0 failing, 2 known `# TODO` content lint checks.

---

## 3. Environment Verification & Platform Matrix

| Target | Build Command | Status in Current Environment | Notes |
|---|---|---|---|
| **Web (Standalone)** | `npm run build:web` | **Verified & Working** | Generates `dist/index.html` (1.14 MB) containing inlined scripts, styles, and decks. |
| **PWA / Service Worker** | `service-worker.js` | **Verified & Working** | Version `v15` shell and deck caching with offline fallback. |
| **Capacitor Sync** | `npm run sync` | **Verified & Working** | Generates `android/app/src/main/assets/public` and `ios/App/App/public`. |
| **Android Shell Build** | `cd android && ./gradlew assembleDebug` | **Requires JDK / Android SDK** | Cannot compile APK locally on Windows environment without JDK 17+ installed. Runs automatically in GitHub Actions CI. |
| **iOS Shell Build** | `xcodebuild` / Xcode | **Requires macOS** | Xcode toolchain is macOS-only. Unsigned iOS simulator app builds in GitHub Actions CI. |

---

## 4. Key File Index

- `style.css`: Master CSS design system and tokens (coaching cards, pill buttons, dark mode, reduced motion).
- `js/app.js`: Application lifecycle, view renderers (`views.home`, `views.journey`, `views.chapter`, `views.quiz`, `views.results`, `views.streak`, `views.onboarding`, `views.settings`), state persistence, and event routing.
- `js/mobile-study.js`: Pure coaching logic (`selectPlanCards`, `formatCompletionFeedback`, `parseChapterTitle`, `getChapterSteps`, `calculateStreak`, `normalizeOnboarding`, `normalizeStreak`).
- `js/storage.js`: IndexedDB adapter (`cci-study-data`) with localStorage fallback.
- `js/parser.js`: Question parser and serializer.
- `js/study.js`: Leitner spaced repetition algorithms and exam question sampling.
- `service-worker.js`: Cache `v15` service worker.
- `tests/mobile-study.test.js`: Unit tests for coaching features, chapter steps, and onboarding normalization.
- `tests/storage.test.js`: IndexedDB/localStorage persistence and migration unit tests.
- `tests/pwa.test.js`: PWA manifest, service worker caching, and asset registration tests.
- `tests/content-lint.test.js`: Starter deck content integrity and application lifecycle regression tests.

---

## 5. Verification Commands

Run from the project root:

```bash
# 1. Run full test suite (57 passing)
node --test

# 2. Build bridge and single-file offline distribution
npm run build

# 3. Synchronize native Android and iOS Capacitor projects
npm run sync
```
