# CCI Discipleship Quiz

A lightweight, offline-first study app for CCI discipleship lessons. The web app includes bundled lesson decks, and Capacitor packages the same experience for iPhone and Android.

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

## Build for iPhone and Android

The phone apps use Capacitor to package the same offline-first HTML/CSS/JavaScript app in native iOS and Android shells. Install the pinned dependencies and rebuild the web bundle before opening a native project:

```bash
npm ci
npm run sync
npx cap open android
npx cap open ios
```

Android builds require Android Studio and its Android SDK. iOS builds and simulator testing require macOS and Xcode. Native exports use the platform share sheet, while study data and bundled lesson decks remain on the device. The mobile app does not require an account or network connection for core study features. Store signing and submission are separate release steps.

### Cloud builds

The [Mobile CI workflow](.github/workflows/mobile-build.yml) runs on pushes to `main` or `feature/mobile-app`, pull requests to `main`, and manual dispatch. Download its artifacts from the workflow run in GitHub Actions. It produces an Android **debug APK** and an **unsigned iOS Simulator app** zipped for download. The iOS artifact is for Simulator, not a physical iPhone; a device-installable IPA or App Store release needs Apple signing credentials and provisioning profiles.

### App icons and splash screens

The source artwork is in `mobile-assets/`: `cci-app-icon-1024.png` is the 1024-square launcher icon, `cci-android-foreground-512.png` is the Android adaptive-icon foreground, and `cci-splash-2732.png` is the 2732-square splash master. The generated iOS assets live in `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and `ios/App/App/Assets.xcassets/Splash.imageset/`. Android uses `android/app/src/main/res/mipmap-*` for launcher icons and `android/app/src/main/res/drawable-*` for splash images; its adaptive-icon background color is set in `android/app/src/main/res/values/ic_launcher_background.xml`.

To rebrand, replace the source images while preserving the icon's square format and splash's centered composition, then regenerate or replace the platform-specific resources and build again. To use Capacitor's documented `@capacitor/assets` generator, stage or rename images into `assets/icon-only.png`, `assets/icon-foreground.png`, `assets/icon-background.png`, `assets/splash.png`, and optional `assets/splash-dark.png`. Use a foreground artwork layer with transparent safe margins and a separate background for Android adaptive icons. Source icons should be at least 1024×1024 and splash images at least 2732×2732. Generate native resources with `npx capacitor-assets generate --ios --android`. Android 12 and later use the system splash-screen treatment rather than the older full-screen splash. This repository checks in the generated assets directly and does not currently add `@capacitor/assets` as a dependency; audit the generator and its dependency tree before adding it.

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
- **Today’s Study:** start a short, optional session from due cards, or cards not yet mastered when nothing is due; paused sessions can be resumed later.
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
BIBLE: John 3:16; Romans 5:12 (also optional)
```

`EXPLANATION:`, `REF:` and `BIBLE:` are optional single-line fields that may follow `ANSWER:`. Use the explanation for why the answer is correct, the reference for a lesson, slide, or Scripture passage, and `BIBLE:` for the Bible references cited in the lesson. In the starter decks, `BIBLE:` separates what the lessons and decks confirm (`Confirmed in lesson and deck:`, `Also cited in lesson segment:`) from anything added through online research (`Added from online research:`, with source links). It is shown as **Bible References** beneath **Reference**. Decks and backups created before these fields were added remain importable.

Question numbers may also use `1.` instead of `Q1.`. Blank lines are optional between questions. Invalid questions are reported and skipped.

**Export all .txt** creates a portable text export of the decks. **Backup data** creates a versioned JSON backup that also preserves learning progress, best quiz scores, and preferences. To restore one, choose the `.json` file from **Add deck** and confirm replacement. Keep a backup before clearing browser data or moving to another browser/device.

## Data and privacy

Decks, preferences, and study progress are stored locally in IndexedDB, with local storage as a fallback. Existing `flashdecks.v1` data is copied automatically and that key is kept until the IndexedDB copy is confirmed. The app reminds you to back up after 14 days or 50 cards studied; the reminder can be dismissed. There is no server-side account, sync, or third-party remote service. Browser storage can be cleared by the browser, so export or back up anything you want to keep.

## Accessibility and responsive behavior

The interface supports keyboard navigation, visible focus, screen-reader labels and status announcements, reduced-motion preferences, and small/mobile screens. Quiz options can be selected with **A–D** or **1–4**; flashcards can be flipped with **Enter** or **Space** and moved with the arrow keys.
