# Redesign prompts: remove the "editorial" look, move to a Fabulous-style coaching UI

Run these **in order** in Manus, one per session, on branch `feature/mobile-app` (already up to date with `main`, which contains the merged Bible References work). Each prompt ends with a commit. Never push to `main`.

Reference: the 5 screen recordings of the Fabulous app (attach them to Prompt 1 so Manus can view them; the design spec below summarizes them).

> Note: `TODO.md` on this branch says "keep the existing CCI visual identity", "avoid imitating Fabulous branding" and "no mandatory streaks". This redesign deliberately replaces the first of those. The "no Fabulous branding" part still holds: copy layout and interaction patterns, never their logo, mascot, illustrations, name, or wording. Prompt 1 updates `TODO.md` so the docs match.

---

## Shared design spec (paste at the top of every prompt)

**Feel:** friendly coaching app. Big rounded cards, one task per screen, saturated colour, large tap targets, short encouraging copy. No serif fonts, no cream/gold paper look, no hairline rules, no small-caps.

**Tokens (own palette, not Fabulous's):**
- Font: system sans stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`); the app must work offline, so do not load web fonts. Headings 700, body 400–500.
- Radii: cards 20–24px, buttons 999px (pill), inputs 14px.
- Primary action: crimson `#B5173A` (pill, full width at the bottom of the screen on mobile). Secondary: soft grey pill. Link/info: blue `#2F6FED`.
- Backgrounds: light mode `#F5F6FB`, cards white with soft shadow; dark mode deep indigo `#12103A` with cards `#1D1A55`.
- Hero gradients (onboarding, Today card, completion): indigo `#3B2BB0` → violet `#7A3FD0`, and sunrise `#FF8A3D` → `#FF4F7A`.
- One gradient per deck (12 of them, listed in `decks/manifest.json` order): vary hue across indigo, violet, magenta, coral, orange, gold, green, teal, cyan, blue, navy, plum. Text on gradients must meet 4.5:1 contrast.
- Illustration: simple inline SVG landscapes/shapes created for this app (hills, sun, path, mountains). Do not trace or recreate Fabulous artwork.

**Hard constraints (all prompts):**
- Do not change any question text, answers, explanations, `REF:` or `BIBLE:` lines, or deck files.
- No new dependencies; vanilla JS only; offline-first; no sign-in, backend, paywall, "Upgrade" pill, countdown banners, or ads.
- Keep spaced repetition, quizzes, exams, weak-spot review, import/export, backup/restore, deck editing, native back navigation, safe-area insets, screen-reader support, reduced motion and light/dark mode working.
- Keep `node --test` green (39 pass; 2 known `# TODO` content-lint tests still fail). If you change assets, bump the service-worker cache version and the matching assertion in `tests/pwa.test.js`. If you change stored data shape, bump `DATA_VERSION` with a migration and update the migration tests.
- After each prompt: `npm run build` (or `npm run sync` when native assets matter), run the tests, commit with a clear message, push `feature/mobile-app`.

---

## Prompt 1 — Design tokens and visual restyle (no layout changes)

Read `README.md`, `TODO.md`, `plan.md`, `style.css`, `js/app.js`. Watch the attached recordings.
1. Update `TODO.md`/`plan.md`: the goal is now a Fabulous-style coaching UI (patterns only, not branding); mandatory streaks/reminders stay off, optional streaks are allowed.
2. Replace the editorial design in `style.css` with the shared design spec: sans-serif only, new colour tokens for light and dark, large radii, pill buttons, soft shadows, per-deck gradients. Remove serif font tokens and any editorial details (thin rules, small-caps, tight letter-spacing, parchment colours). Update `theme-color` in `index.html` and `manifest.webmanifest`.
3. Do not change HTML structure or JS logic. Replace hard-coded old colours with tokens.
4. Check every existing screen (dashboard, deck list, flashcards, quiz, exam, results, editor, settings, modals) in light and dark at 360px and 430px widths with Playwright/Chromium screenshots. Fix contrast and overflow problems.
Done when: no `Georgia`/serif/parchment/gold remains in `style.css`, screenshots look consistent, tests pass. Commit.

## Prompt 2 — Navigation shell and "Today's plan" home

Add a bottom tab bar (mobile) with 4–5 tabs: **Home, Journey, Practice, Progress, Settings** (map to existing views; do not remove any feature). Rebuild the home screen:
- Top bar: title, optional streak flame counter, profile/settings icon.
- A big hero card "Continue" (resumes the saved session if there is one).
- **Your Plan for Today**: short cards, each with an icon, one-line title, minute estimate and a state (ready / done): e.g. "Review 10 due cards · 3 min", "Weak spots · 2 min", "Try a new lesson".
- Reuse `selectDailyItems` in `js/mobile-study.js`; keep "pause and resume" behaviour.
- Tab bar must respect safe-area insets and work with native back navigation. Desktop: same screens with a left rail or a centred max-width column.
Add tests for plan-card selection logic where it is new. Screenshot at 360 and 430px. Commit.

## Prompt 3 — Journey (decks as chapters)

Turn the deck list into a **Journey**: 12 gradient chapter cards (section title, short subtitle from the deck title, progress % ring/bar, "mastered / total", info icon showing deck details). Tapping opens a chapter view with a vertical timeline of study steps (flashcards, quiz, exam, weak spots) showing locked/unlocked/complete states. Unlocking must be **soft**: never block a learner from any study mode. Keep deck editing/import/export reachable (under Settings or a chapter menu). Commit.

## Prompt 4 — One-question-per-screen study flow

Rework flashcards, quiz and exam screens: close (X) at top, thin progress bar, large question text, big answer cards (A–D) with clear selected/correct/incorrect states, and a bottom full-width Continue/Next pill. After answering, show a bottom sheet with the explanation, **Reference**, and **Bible References** (links still tappable). End each session with a "Well done!" completion screen: score, minutes, cards mastered, encouraging non-shaming copy, and Continue. Keep keyboard and screen-reader support, haptics optional through the existing bridge, reduced motion respected. Add a short tooltip on first use ("Tap an answer to check it"). Commit.

## Prompt 5 — Onboarding and optional streaks

First run only (skippable): splash → welcome screen → 3–5 one-question screens with large tap cards (goal, daily minutes, topics to start with, preferred time) → a "Your study plan" summary card → optional "tap and hold to commit" screen → Home. Store answers locally; use them to set the daily-plan length. Add an optional streak (days studied) with a gentle streak screen after the first session of the day; no guilt messaging, no required reminders. Bump `DATA_VERSION` with a migration; keep backup/import compatible with old backups (missing fields get defaults). Add unit tests for the new storage. Commit.

## Prompt 6 — QA, accessibility and native sync

- Run `npm run sync`, then verify web and Android/iOS shells build per `README.md` (state clearly what cannot be checked on Linux).
- Audit: contrast (WCAG AA), 48dp touch targets, focus order, screen-reader labels on tab bar and cards, 200% text scaling, reduced motion, dark mode, offline service worker.
- Update `README.md`, `TODO.md`, `HANDOVER_FOR_MANUS.md` with the new structure, tokens, and any known gaps. Open a PR from `feature/mobile-app` to `main` and list files changed and anything unverified.
