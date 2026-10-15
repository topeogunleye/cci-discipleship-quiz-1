# CCI Discipleship Quiz

A lightweight, dependency-free study app for CCI discipleship lessons. It runs entirely in the browser and includes the bundled lesson decks.

## Run locally

For development, serve the repository over HTTP so the app can fetch the individual deck files:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

To create a standalone offline copy, run:

```bash
node scripts/build.js
```

Open `dist/index.html` directly or share that single file. The build script uses only Node.js built-ins; no package installation, account, or backend is required.

## Install as an offline app

Service workers require a secure context, so use `http://localhost` for local installation or host the app over HTTPS. Open the app while online, then use the browser's **Install app** or **Add to Home Screen** command. The service worker caches the app shell and all decks for offline use. When an update is ready, choose **Update now** in the app. Opening `index.html` with `file://` continues to work, but service-worker installation is disabled for that mode.

To install the standalone build, serve the `dist/` directory over localhost or HTTPS after running the build command above.

Run all tests with Node.js 18 or newer:

```bash
node --test
```

## Study tools

- **Flashcards:** reveal answers, mark cards as known or still learning, and move with the keyboard or touch gestures.
- **Quizzes:** choose a deck or a selection of decks, set a question limit, skip mastered cards, and retake or review missed questions. Choices are shuffled on each attempt.
- **Spaced repetition:** study due cards from all decks with Leitner intervals of 1, 3, 7, and 14 days.
- **Weak spots:** quiz the questions with the highest recorded miss rates across decks.
- **Exam mode:** take a timed, mixed-deck exam and review answers after submission or time expiry.
- **Progress:** see deck-level mastery, saved quiz bests, and collection totals.
- **Deck search and editing:** find a deck quickly; rename a deck and add, edit, delete, search, or export its cards.
- **Themes:** cycle through automatic, light, and dark appearance.

## Import and backup

Import one or more plain-text (`.txt`) decks, or paste deck text and preview it before saving. Questions should follow this format:

```text
DECK: My study deck

Q1. What is the main topic?
A) First option
B) Second option
C) Third option
D) Fourth option
ANSWER: A
EXPLANATION: The explanation text goes here and is strictly optional.
REF: Lesson 2, Page 4 (also optional)
```

`EXPLANATION:` and `REF:` are optional single-line fields that may follow `ANSWER:`. Use the explanation for why the answer is correct, and the reference for a lesson, slide, or Scripture passage. Decks and backups created before these fields were added remain importable.

Question numbers may also use `1.` instead of `Q1.`. Blank lines are optional between questions. Invalid questions are reported and skipped.

**Export all .txt** creates a portable text export of the decks. **Backup data** creates a versioned JSON backup that also preserves learning progress, best quiz scores, and preferences. To restore one, choose the `.json` file from **Add deck** and confirm replacement. Keep a backup before clearing browser data or moving to another browser/device.

## Data and privacy

Decks, preferences, and study progress are stored in IndexedDB, with local storage as a fallback. Existing `flashdecks.v1` data is copied automatically and that key is kept until the IndexedDB copy is confirmed. The app reminds you to back up after 14 days or 50 cards studied; the reminder can be dismissed. There is no server-side account or sync, and the source includes no third-party runtime dependencies. Browser storage can be cleared by the browser, so export or back up anything you want to keep.

## Accessibility and responsive behavior

The interface supports keyboard navigation, visible focus, screen-reader labels and status announcements, reduced-motion preferences, and small/mobile screens. Quiz options can be selected with **A–D** or **1–4**; flashcards can be flipped with **Enter** or **Space** and moved with the arrow keys.
