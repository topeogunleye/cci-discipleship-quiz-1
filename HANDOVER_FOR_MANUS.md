# CCI Discipleship Quiz — Engineering Handover for Manus AI

This document provides complete context, architectural constraints, changes made, and immediate next steps for Manus AI to continue building directly from the current state.

---

## 1. Project Overview & Architectural Boundaries

- **Core Purpose**: A lightweight, zero-dependency discipleship study app for Christian Central Church International (CCI) lesson decks. Includes flashcards (Leitner spaced repetition), multiple-choice quizzes, timed exams, deck creation/editing, and offline storage/backup.
- **Architecture**:
  - **Zero Build Tooling / Zero Dependencies**: Vanilla HTML5, modern CSS with custom properties (CSS variables), and modular vanilla ES6/UMD JavaScript. No npm packages, frameworks (React, Vue, etc.), or external runtime CDNs.
  - **Single-File Distribution**: `scripts/build.js` inlines `style.css`, all 4 JS modules (`parser.js`, `study.js`, `storage.js`, `app.js`), and starter deck text into `dist/index.html`.
  - **Offline & PWA First**: Service worker (`service-worker.js`) precaches core assets and deck files. The app also operates standalone via `file://`.
  - **Data Persistence**: Two-tier storage via `js/storage.js` (IndexedDB `cci-study-data` primary, with fallback & migration from `localStorage` key `flashdecks.v1`).

---

## 2. Completed Work (Phase 1: Visual & Phase 2: Dashboard Hierarchy Redesign)

A complete, production-ready editorial redesign and dashboard refinement have been implemented:

### A. Design Tokens & Visual Language ([`style.css`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/style.css))
- **Surfaces**: Warm parchment and ivory tones (`--bg: #F6F3EE`, `--surface: #FFFDF9`, `--surface-dim: #EDE9E1`).
- **Typography**: Editorial serif (`Georgia`, `Iowan Old Style`, `Palatino`) for major headers, questions, and scores; clean sans-serif (`Segoe UI`, system UI) for navigation, buttons, and metadata.
- **Accents & Palettes**:
  - Primary Accent: Muted gold (`#8B6E2F` light / `#D4A84B` dark).
  - Ink & Body: Deep evergreen/ink-navy (`#1B2A2F` light / `#E6EEEE` dark).
  - Secondary: Subtle sage (`#6B8F71` light / `#8FC29A` dark) for mastery progress bars and success tags.
  - Semantic Status: Forest green (`#2D6A4F`) for correct answers and crimson (`#9B2C2C`) for errors.
- **WCAG AA Compliance**: High-contrast ratios verified across all light and dark theme pairings (e.g., ink on bg > 13:1; muted text on bg > 4.7:1).
- **Motion & Accessibility**: Explicit support for `prefers-reduced-motion`, visible focus rings (`:focus-visible`), touch targets $\ge 48\text{px}$, and safe-area insets (`env(safe-area-inset-*)`).

### B. Refined Learning Dashboard Hierarchy (Prompt 2 Implementation)
- **Brand & Greeting**: Clear title hierarchy ("CCI Discipleship" with "Rooted in Truth · Growing in Faith" sub-brand).
- **Hero Action Section**: Prominent contextual card for the next useful study action (e.g. "Review Now (X cards due)", "Continue Studying", or "Take Exam").
- **Deck Cards & Responsive Grid**:
  - **Visible Section Badges & Topics**: Decks cleanly display section pills (e.g., `Section 1`) and topics (`Soteriology`).
  - **Single Primary Study CTA**: Each deck features one clear primary study button (`Study Flashcards` in filled accent), secondary `Quiz`, and demoted `Edit`.
  - **Status Indicators**: Clean status badges (`Not started`, `X% mastered`, `Mastered`) plus due/weak counts.
  - **Responsive 2-Column Grid on Desktop / Clean Stack on Mobile**: `.deck-grid` uses CSS Grid `repeat(auto-fill, minmax(330px, 1fr))` on desktop/tablet and stacks neatly on phones ($\le 600\text{px}$).
- **Secondary Tools**: Clean, uncluttered access to spaced repetition ("Due today"), "Weak spots", "Exam", theme toggle, and data backup/export.
- **Strict Data Integrity**: 100% derived from real app state; no fake streaks, achievements, or synthetic counters.

### C. Assets & PWA Sync
- [`index.html`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/index.html): Theme color updated to `#8B6E2F`.
- [`manifest.webmanifest`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/manifest.webmanifest): Theme & background color updated to match palette.
- [`service-worker.js`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/service-worker.js): Cache version was bumped to `cci-study-pwa-v2` for the dashboard redesign and is now `cci-study-pwa-v3` after the Prompt 3 study-session updates.
- [`icons/icon.svg`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/icons/icon.svg): Recolored with muted gold, ivory, sage, and deep green.

---

## 3. Current Verification Status

Run these commands in PowerShell or Bash from `c:\Users\topeo\Downloads\cci-discipleship-quiz`:

1. **Test Suite**:
   ```powershell
   node --test
   ```
   *Expected Result*: **32 passed, 0 failed, 2 TODO**.
   *Note on the 2 TODOs*: `Check 2: Answer-letter distribution` and `Check 3: Longest option is correct rate` in `tests/content-lint.test.js` are deliberate `# TODO` markers flagging question-authoring skew in the original church curriculum. They do not fail the build.

2. **Standalone Build**:
   ```powershell
   node scripts/build.js
   ```
   *Expected Result*: Successfully generates `dist/index.html` (~269KB) with zero external script or link references.

---

## 4. Immediate Backlog & Open Tasks for Manus AI

### Task 1: Generate Updated Raster Icons (`icons/icon-*.png`)
- **Current State**: `icons/icon.svg` was updated to the new gold/sage palette, but `icons/icon-192.png` and `icons/icon-512.png` (as well as their copies in `dist/icons/`) still use the legacy royal-blue background.
- **Action**: Render or convert `icons/icon.svg` into 192x192 and 512x512 PNG files and update both `icons/` and `dist/icons/`.

### Task 2: Live Browser QA & Visual Refinements
- **Setup**: Start a local server with `python -m http.server 8000` or Node static server and test at `http://localhost:8000`.
- **Items to Validate**:
  - Theme toggle cycles cleanly (`auto` $\rightarrow$ `light` $\rightarrow$ `dark` $\rightarrow$ `auto`) and persists across page reloads.
  - Flashcard 3D flip card behavior on touch devices (swipe left/right to move, tap to flip).
  - Exam countdown clock (`#exam-clock`) and post-exam review list formatting.
  - Bulk select dock (`#bar`) positioning with iOS safe-area bottom bar.
  - Inline deck card editor (`views.edit`) form spacing.

### Task 3: Content Explanations Review (If authorized)
- Consult [`explanations-todo.md`](file:///c:/Users/topeo/Downloads/cci-discipleship-quiz/explanations-todo.md) for starter deck questions currently missing `EXPLANATION:` or `REF:` fields.
- *Constraint*: Do not fabricate scripture references or theological rationale without human review from CCI course material.

---

## 5. Key File Index

- `style.css`: Master CSS design system and tokens.
- `js/app.js`: Application lifecycle, view controllers, and renderers.
- `js/parser.js`: Question parser and serializer (`DECK:`, `Q1.`, `ANSWER:`, etc.).
- `js/study.js`: Leitner spaced repetition algorithms and exam question sampling.
- `js/storage.js`: IndexedDB and localStorage adapter.
- `scripts/build.js`: Single-file HTML inliner.
- `tests/content-lint.test.js`: Content linting tests and integrity verification.

---

## 6. Completed Work: Prompt 3 — Study Sessions

The flashcard, quiz, exam, results, and answer-review views have been refined while preserving the existing study algorithms and stored data formats.

- Study sessions are constrained to a **720px maximum reading width**, including on wide desktop layouts.
- Flashcards now use a semantic button with distinct question/answer faces, visible flip guidance, `aria-pressed`/`aria-hidden` state, and the existing Space/Enter/click/touch-swipe controls. Explanations and references remain conditional on source data.
- Quiz feedback uses a restrained status panel and a separate correct-option letter badge. Exam selections receive only a neutral selected state; correctness, explanations, and references remain withheld until submission.
- Results have a clearer score/new-best/action hierarchy. Exam answer review visually separates the learner's answer from the correct answer.
- Added regression coverage for flashcard face/content states, Enter/Space flipping, horizontal swipe navigation, quiz feedback, neutral exam selection, and post-submission answer comparison.
- Incremented the service-worker cache to `cci-study-pwa-v3` so existing offline installations can fetch the updated JS/CSS; added a cache-version regression assertion.
- Browser QA exercised eight study states at **360px, 768px, and 1280px** in light and dark color-scheme preferences (48 captures total). No horizontal overflow was detected. The standalone `dist/index.html` was smoke-tested: 12 starter decks loaded, CSS was inlined, and there were no external runtime scripts.
- Verification: `node --test` reports **32 passed, 0 failed, 2 TODO**. The two pre-existing TODO content checks remain intentionally unresolved (answer-letter distribution and longest-correct-answer skew). `node scripts/build.js` completes successfully.

Primary files changed for this continuation: `js/app.js`, `style.css`, `service-worker.js`, `tests/content-lint.test.js`, and `tests/pwa.test.js`; `dist/` was regenerated.
