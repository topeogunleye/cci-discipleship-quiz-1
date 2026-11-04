# Lesson video design QA

## Visual target

Implemented the revised **option 3** concept from this conversation: a focused, theater-style lesson player with the lesson identity above and Flashcards / Take quiz actions below. The generated concept image is visible earlier in the conversation but was not saved as a workspace file, so this report records the target description instead of embedding a source image.

## Result

- Kept the app’s existing dark purple palette, type scale, rounded surfaces, and button styling.
- Centered the player at up to 1,100px wide, reducing it on shorter desktop viewports so the lesson title and both study actions stay visible together.
- Hid unrelated experience and sermon-reminder controls on the video screen so it stays focused.
- Kept Flashcards and Take quiz in a named action group. Both open the existing lesson-specific setup flow.
- On narrow screens, stacked the player and summary while keeping the two actions side by side. At 320px, both actions fit inside the initial 568px viewport.
- Added a compact no-recording state. The disabled Continue lesson button is omitted until a video is configured.
- Added a minimum height for the no-recording state at 320px so its message remains fully visible within the theater frame.

## Screens reviewed

| State | Capture |
|---|---|
| Chapter detail with Watch this chapter entry, desktop | `design-qa/lesson-video-entry-desktop.png` |
| Theater lesson screen, desktop 1280×720 | `design-qa/lesson-video-desktop.png` |
| Theater lesson screen, desktop 1440×900 | `design-qa/lesson-video-desktop-1440.png` |
| Theater lesson screen, mobile 390×844 | `design-qa/lesson-video-mobile.png` |
| Theater lesson screen, narrow mobile 320×568 | `design-qa/lesson-video-320.png` |

## Visual QA

- **Layout and hierarchy:** The player remains the dominant element. At 1440×900 it uses a centered 900×506px frame. At 1280×720, a short-height breakpoint reduces the frame to 740×416px so the chapter heading and both study actions stay in view. At 390px, the 342px player and both actions fit without horizontal overflow. At 320px, the unavailable state expands to 180px high so its text is not clipped; both study buttons remain visible at the bottom of the first viewport.
- **Spacing and readability:** The desktop title and controls are separated from the frame without competing with it. The mobile content stacks in a clear reading order. The 320px action buttons are each about 124px wide.
- **Color and typography:** Existing app tokens and button styles are used. The blue keyboard focus outline follows the app’s focus-visible pattern.
- **Image/media fidelity:** No CCI lesson videos, posters, or video URLs are present in the repository. The player therefore shows an honest unavailable state rather than fabricated lesson footage. The actual player uses native video controls and can show optional captions and a poster when a source is configured.
- **Copy:** The fallback says why playback is unavailable and points to the two working study choices. A dead Continue action is not shown without a video source.

## Interaction and accessibility checks

- Flashcards opened the existing Start flashcards setup, with shuffle and skip-known options.
- Take quiz opened the existing Start quiz setup, with question-count and skip-known options.
- The buttons expose the accessible names “Flashcards” and “Take quiz” in the accessibility tree.
- Keyboard Tab focused Back to lesson with a visible 2.67px blue outline.
- Browser console check returned no warnings or errors.

## Media configuration limitation

`content/lesson-videos.json` is currently empty. Add approved direct MP4/WebM URLs there to enable playback; optional WebVTT captions and poster URLs are supported. The native player does not support YouTube/Vimeo watch-page URLs. No playback claim was made because no media source is configured.

## Checks run

- `npm run build:web` — passed.
- `node --check js/app.js` — passed.
- `node --check service-worker.js` — passed.
- `node --check scripts/build.js` — passed.
- `git diff --check` — passed (Git reports its existing LF-to-CRLF normalization warning for `dist/index.html`).
- Browser review used an isolated `127.0.0.1:8001` profile, leaving the existing localhost:8000 profile untouched.
