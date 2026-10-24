# Design audit — desktop-devotion-reader

Audit only; no application source was changed. Repository branch: topeogunleye/cci-discipleship-quiz-1, desktop-devotion-reader.

## Scope and capture notes

All three design folders were present and non-empty: mobile (10 PNGs), desktop (13 PNGs), and desktop-2x (13 PNGs). I opened all 36 design images, using the desktop-2x images for detail checks. The app was captured in Chrome at 390×844, 834×1112, and 1440×1000. Screenshots are in screenshots/audit/.

The capture state has onboarding completed, a backup reminder aged 14 days, a paused quiz at card 9, and the Quiz screen on a verified wrong answer with explanation visible. Practice has two lessons selected. Devotion uses the real “Grace That Sets You Free” article and was captured collapsed and expanded. The Lesson 3 sheet was aligned to the reference lesson. Navigation paths exercised: Home → Journey → lesson details, Home → study menu → picker, Journey → lesson → quiz → completion, and Home → devotion → expand.

The desktop and tablet design PNGs are taller than the requested app viewport (some are 1,500–2,800px high). The captures preserve the requested 1,000px/1,112px viewport height; content below that fold is not represented in the app screenshots.

## Summary matrix

“Dark” lists only dark-theme comparisons for which a dark reference exists. Dark mobile/tablet variants without a design are not scored. The counts include 33 light screen/viewport comparisons plus five referenced dark desktop comparisons.

| Screen/state | Mobile 390×844 (light) | Tablet 834×1112 (light) | Desktop 1440×1000 (light) | Dark reference comparison |
|---|---|---|---|---|
| Home | Major | Major | Match | Desktop: Match |
| Home with devotion | Major | No reference | Match | Desktop: Match |
| Journey | Minor | No reference | Match | — |
| Create menu | Minor | No reference | No reference | — |
| Practice picker (Flashcards) | Major | No reference | No reference | — |
| Practice select several | Major | No reference | Match | Desktop: Match |
| Lesson sheet / modal | Major | No reference | Major | — |
| Quiz question + explanation | Minor | Minor | Minor | Desktop: Minor |
| Session complete | Major | No reference | Minor | — |
| Devotion reader, collapsed | Major | No reference | No reference | — |
| Devotion reader, expanded | No reference | No reference | Match | Desktop: Match |

**Overall: 9 Match, 7 Minor, 9 Major, 0 Missing, 13 No reference (38 comparisons).** No blocker-level issue was found. “Major” means the visible layout or state differs substantially; “Minor” means the intended screen is present with smaller copy, spacing, or state differences.

## Findings by screen and viewport

### 1. Home

**Mobile 390×844 — Major**

Matches: the due-backup reminder and paused-session state are present; the hero uses the purple gradient and the app’s live card count.

1. **Major.** Design: “Study”, a three-card stats row, and a lesson-card grid follow the paused hero. App: the header says “CCI Discipleship”; the narrow Home layout proceeds into a daily devotion carousel and plan list, with no stats row or lesson grid. Likely cause: Home markup in js/app.js (views.home, .mobile-home-content, desktopHome) and the under-901px layout in style.css (.desktop-home-content is hidden until desktop). References/captures: design-reference/mobile/Mobile · Home.png; screenshots/audit/home-light-mobile-390.png.

**Tablet 834×1112 — Major**

Matches: backup reminder and Continue session are visible.

1. **Major.** Design: tablet keeps the sidebar navigation and uses a two-column lesson grid beneath the hero and stats. App: at 834px it still uses the narrow/mobile shell, a bottom tab bar, horizontal devotion cards, and stacked plan rows; the designed lesson grid and sidebar are absent. Likely cause: style.css desktop-shell/display rules and the 901px desktop breakpoint, plus the separate mobile/desktop Home markup in js/app.js. References/captures: design-reference/desktop/Home — tablet.png; screenshots/audit/home-light-tablet-834.png.

**Desktop 1440×1000 — Match**

Matches: sidebar, paused hero, stats, lessons, and daily study rail follow the reference. Live counts differ from sample figures as expected. The design canvas extends below the captured 1,000px viewport. Capture: screenshots/audit/home-light-desktop-1440.png. Dark desktop also matches: screenshots/audit/home-dark-desktop-1440.png vs design-reference/desktop/Home — dark.png.

### 2. Home with devotion

**Mobile 390×844 — Major**

Matches: the devotional carousel uses real devotional data and remains reachable from Home.

1. **Major.** Design: a featured “Today’s devotion” coral card appears directly below the header, before the smaller devotional row. App: it renders only the horizontal Daily Devotionals carousel below the study hero; the featured card from the desktop variant is not in the mobile markup. Likely cause: js/app.js views.home, where devotionSection builds the carousel and desktopDevotionFeature is used only in desktopHome. References/captures: design-reference/mobile/Mobile · Home with devotion.png; screenshots/audit/home-with-devotion-light-mobile-390.png.

**Tablet 834×1112 — No reference.** No tablet Home-with-devotion design was supplied. The Home tablet finding above applies to the available tablet Home screen.

**Desktop 1440×1000 — Match**

Matches: the featured devotional, study rail, and other devotional rows are present. Dark desktop also matches: screenshots/audit/home-with-devotion-light-desktop-1440.png and home-with-devotion-dark-desktop-1440.png; reference design-reference/desktop/Home.png and Home — dark.png. Below-fold content is limited by the 1,000px capture.

### 3. Journey

**Mobile 390×844 — Minor**

Matches: chapter cards, progress indicators, bottom navigation, and lesson ordering are present.

1. **Minor.** Design: a concise “Pick any chapter. Nothing is locked.” intro leads into the chapter list. App: it adds a chapter count and a search/filter control above the cards, increasing the top-of-list chrome. Likely cause: js/app.js views.journey and its chapter search/header markup. References/captures: design-reference/mobile/Mobile · Journey.png; screenshots/audit/journey-light-mobile-390.png.

**Tablet 834×1112 — No reference.** No tablet Journey PNG was supplied.

**Desktop 1440×1000 — Match**

Matches: two-column chapter grid, desktop sidebar, and progress treatment. Capture: screenshots/audit/journey-light-desktop-1440.png; reference: design-reference/desktop/Journey.png. Lower rows are below the app viewport.

### 4. Create menu

**Mobile 390×844 — Minor**

Matches: the modal backdrop, floating action menu, close control, and all four study actions are present over Home with the seeded paused session.

1. **Minor.** Design order is Challenge, Exam, Quiz, Flashcards. App order is Flashcards, Quiz, Challenge, Exam. Likely cause: renderRocketFab in js/app.js and the .rocket-pill-btn stack in style.css. References/captures: design-reference/mobile/Mobile · Create menu.png; screenshots/audit/create-menu-light-mobile-390.png.

**Tablet and desktop — No reference.** The supplied Create menu design is mobile only.

### 5. Practice picker — Flashcards

**Mobile 390×844 — Major**

Matches: the picker opens from the floating study menu, lists live lesson data, and uses the deck gradients.

1. **Major.** Design: includes All lessons, Mixed review, all lesson tiles, a “Select several” switch, and a sticky start action. App: the Flashcards picker has All Lessons and lesson tiles only; it has no Mixed review tile, multi-select control, or sticky start bar. Selecting a tile immediately opens setup. The app has multi-select on the separate Practice screen, not in this picker state. Likely cause: js/app.js views.picker and its .picker-tile data-act="setup" buttons; contrast with views.practice/.practice-multi. References/captures: design-reference/mobile/Mobile · Flashcards picker.png; screenshots/audit/flashcards-picker-light-mobile-390.png.

**Tablet and desktop — No reference.** The desktop Practice.png design corresponds to the separate Practice selection screen.

### 6. Practice — select several

**Mobile 390×844 — Major**

Matches: the separate Practice page supports selecting two lessons and shows a count and start action.

1. **Major.** Design: the multi-select state remains inside a focused Quiz lesson picker, with All lessons and Mixed review tiles, a “Select several” switch, and a sticky “Start · 2 lessons” button. App: the equivalent state is a full Practice page with four mode cards, a “What to cover” section, and a different start-bar label. The standalone Quiz picker captured in quiz-picker-light-mobile-390.png has no selection state at all. Likely cause: the split between js/app.js views.practice and views.picker; views.picker immediately maps each tile to setup. References/captures: design-reference/mobile/Mobile · Quiz picker (select several).png; screenshots/audit/quiz-picker-light-mobile-390.png and practice-light-mobile-390.png.

**Tablet 834×1112 — No reference.** No tablet Practice design was supplied.

**Desktop 1440×1000 — Match**

Matches: mode selector, mixed review, deck grid, selected lessons, and start bar. Dark desktop also matches. Captures: screenshots/audit/practice-light-desktop-1440.png and practice-dark-desktop-1440.png; references: design-reference/desktop/Practice.png and Practice — dark.png.

### 7. Lesson sheet / modal

**Mobile 390×844 — Major**

Matches: the modal is bottom-positioned, has rounded corners, and shows live Lesson 3 counts.

1. **Major.** Design: a lesson sheet overlays Home and offers “Study this lesson”. App: the sheet is opened from the Journey chapter card, overlays the Journey screen, and ends with “Done”; it does not provide the designed primary lesson action. Likely cause: the chapter-info button in js/app.js views.journey and the chapter-info handler (opens a statistics-only .sheet); style.css #modal .sheet controls the positioning. References/captures: design-reference/mobile/Mobile · Lesson sheet.png; screenshots/audit/lesson-detail-modal-light-mobile-390.png.

**Tablet 834×1112 — No reference.** No tablet lesson-sheet design was supplied.

**Desktop 1440×1000 — Major**

1. **Major.** Design: a compact lesson detail panel with a primary “Study this lesson” action. App: the info sheet is a statistics dialog with only “Done”, layered over the Journey detail/timeline. Likely cause: js/app.js chapter-info handler and .chapter-info-btn; style.css #modal .sheet. References/captures: design-reference/desktop/Lesson detail panel.png; screenshots/audit/lesson-detail-modal-light-desktop-1440.png.

### 8. Quiz question with explanation

**Mobile 390×844 — Minor**

Matches: wrong selection is red, correct answer is identified in green, and the explanation is visible with a next-question action.

1. **Minor.** Design copy shows the criminal-on-the-cross lesson question; the app capture uses another real question from the same lesson. The question content is data-driven, so this is a state/content difference rather than a styling mismatch. Likely source: js/app.js quiz question rendering and the selected lesson data. References/captures: design-reference/mobile/Mobile · Quiz + explanation.png; screenshots/audit/quiz-light-mobile-390.png.

**Tablet 834×1112 — Minor**

Matches: question, four answers, and explanation fit the tablet stack.

1. **Minor.** The selected real question and progress position differ from the reference sample. Likely source: live quiz selection and js/app.js question rendering. References/captures: design-reference/desktop/Quiz — tablet.png; screenshots/audit/quiz-light-tablet-834.png.

**Desktop 1440×1000 — Minor**

Matches: wide answer column, right-side explanation panel, correct/wrong states, crimson progress, and Continue action. Dark desktop uses the same structure against the referenced dark palette.

1. **Minor.** The app shows another real question and position than the design sample; the requested wrong-answer explanation is present. Likely source: live quiz data/state, not a different layout. References/captures: design-reference/desktop/Quiz question.png and Quiz — dark.png; screenshots/audit/quiz-light-desktop-1440.png and quiz-dark-desktop-1440.png.

### 9. Session complete

**Mobile 390×844 — Major**

Matches: result score, time, and mastered count are shown.

1. **Major.** Design: full-screen orange-to-coral background, landscape illustration, centered “Well done!” heading, and white stat cards. App: a light page with a compact purple result card and stacked review/retake/continue buttons. Likely cause: mobile completion styling uses the default .completion-hero-card at style.css:3578; the full-bleed reference treatment is only applied by the min-width:901px rule at style.css:6981. References/captures: design-reference/mobile/Mobile · Session complete.png; screenshots/audit/session-complete-light-mobile-390.png.

**Tablet 834×1112 — No reference.** No tablet completion design was supplied.

**Desktop 1440×1000 — Minor**

Matches: full-screen gradient, sun/landscape artwork, centered result, and pill actions. The app’s actual score is data-driven and differs from the design sample. Likely source: js/app.js completion result view and the desktop completion rules in style.css. References/captures: design-reference/desktop/Session complete.png; screenshots/audit/session-complete-light-desktop-1440.png.

### 10. Devotion reader — collapsed

**Mobile 390×844 — Major**

Matches: real article title, scripture, hero artwork, and collapsed first-paragraph state.

1. **Major.** Design: full-width hero artwork at the top, Share and Save pills below it, then a fixed “Mark as read” button at the bottom of the viewport. App: the hero is inset with rounded corners; the action rail is hidden at ≤900px; the read action is in normal document flow after the article and is below the captured viewport. Likely cause: js/app.js views.devotional places actions in .devotional-reader-rail/.devotional-footer-bar; style.css hides the rail at max-width:900px and styles the default footer as non-fixed. References/captures: design-reference/mobile/Mobile · Devotion (collapsed).png; screenshots/audit/devotion-collapsed-light-mobile-390.png.

**Tablet 834×1112 and desktop 1440×1000 — No reference.** No separate collapsed-reader design was supplied at those sizes.

### 11. Devotion reader — expanded

**Mobile and tablet — No reference.** Only the collapsed mobile devotional design was supplied.

**Desktop 1440×1000 — Match**

Matches: full-width illustrated header, article column, Share/Save controls, Mark as read action, and more-devotions rail. The reference artboard is taller than the requested viewport, so lower article callouts are below the screenshot. Dark desktop also matches. Captures: screenshots/audit/devotion-expanded-light-desktop-1440.png and devotion-dark-desktop-1440.png; references: design-reference/desktop/Devotion reader.png and Devotion reader — dark.png.

## Cross-cutting findings

- The requested brand tokens are present in style.css: crimson #B5173A, dark background #12103A, dark surface #1D1A55, system sans-serif stack, 22px card radius, pill button radius, and 12 deck gradients. No serif or small-caps CSS was found. These are not broad blockers.
- The body color token pairs checked meet contrast targets: light ink/background 16.54:1, light muted/background 4.76:1, dark ink/background 16.17:1, dark muted/surface 5.08:1. One exception needs attention: dark --faint (#615E87) on #12103A is 2.98:1; .hint uses this token for small text, below the 4.5:1 body threshold and just below 3:1 large-text threshold.
- Global focus-visible outlines exist (style.css:400), and desktop overrides are present (style.css:5166). Screenshot comparison does not verify keyboard traversal, focus order, or every 44px tap target.
- Deck gradients and the principal accent token match the references. The largest differences are responsive composition and state placement, not the base palette.
- Wrong-answer state, correct answer, multi-selection, collapsed/expanded devotion, and session completion were reachable. No requested primary screen was unreachable; the multi-select picker design is not present as a state in the app’s standalone picker route.

## Ready-to-run Claude Code fix prompts

Apply prompts in order. Each is scoped for one reviewable commit.

### 1. Home composition on mobile and tablet

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact Home differences in this report: mobile currently says “CCI Discipleship” and omits the stats row and lesson grid; the 834px tablet currently uses the mobile stack and bottom tab bar instead of the designed sidebar and two-column lesson grid. Use design-reference/mobile/Mobile · Home.png, design-reference/mobile/Mobile · Home with devotion.png, and design-reference/desktop/Home — tablet.png. Compare against screenshots/audit/home-light-mobile-390.png, home-with-devotion-light-mobile-390.png, and home-light-tablet-834.png.

Acceptance: recapture Home at 390×844 and 834×1112 with the due reminder and paused session. Match the title, hero, stats, lesson-grid presence/order, tablet navigation shell, and spacing/radii. Do not change behavior outside Home composition. Run npm test and keep the offline service worker valid.

### 2. Lesson detail sheet

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact Lesson sheet differences in this report: the current stats-only dialog opens over Journey and has a “Done” action; the design sheet opens over Home and provides “Study this lesson”. Use design-reference/mobile/Mobile · Lesson sheet.png and design-reference/desktop/Lesson detail panel.png. Compare against screenshots/audit/lesson-detail-modal-light-mobile-390.png and lesson-detail-modal-light-desktop-1440.png.

Acceptance: recapture the lesson sheet at 390×844 and 1440×1000. Match the reference backdrop, bottom-sheet/panel placement, lesson title and stats, and primary action. Keep the existing chapter navigation and lesson-start behavior within this sheet’s scope; do not change unrelated navigation. Run npm test and keep the offline service worker valid.

### 3. Practice picker and multi-select state

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact picker differences in this report: the Flashcards picker is missing Mixed review, “Select several”, and a sticky start action; the Quiz picker design is a multi-select state, while the app’s standalone Quiz picker starts setup immediately from each lesson tile. Use design-reference/mobile/Mobile · Flashcards picker.png, design-reference/mobile/Mobile · Quiz picker (select several).png, and design-reference/desktop/Practice.png. Compare against screenshots/audit/flashcards-picker-light-mobile-390.png, quiz-picker-light-mobile-390.png, practice-light-mobile-390.png, and practice-light-desktop-1440.png.

Acceptance: recapture Flashcards picker and Quiz multi-select at 390×844, plus Practice at 1440×1000. Match Mixed review, selected tile states, selection switch, sticky start action, and labels. Preserve existing study setup semantics; do not change behavior outside picker and selection flows. Run npm test and keep the offline service worker valid.

### 4. Mobile devotion reader

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact mobile reader differences in this report: make the hero full width as shown; keep Share and Save visible; pin “Mark as read” to the viewport bottom while the article scrolls. Use design-reference/mobile/Mobile · Devotion (collapsed).png. Compare against screenshots/audit/devotion-collapsed-light-mobile-390.png and devotion-expanded-light-mobile-390.png.

Acceptance: recapture collapsed and expanded reader states at 390×844. Match hero width/shape, Share/Save placement, collapsed excerpt, and fixed read action without clipping article text. Preserve share, save, expand/collapse, and mark-read behavior; do not change other devotional behavior. Run npm test and keep the offline service worker valid.

### 5. Mobile session-complete layout

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact mobile completion difference in this report: replace the compact purple card on a light page with the reference’s full-screen sunset gradient, landscape, centered result heading, and white stat cards. Use design-reference/mobile/Mobile · Session complete.png and compare against screenshots/audit/session-complete-light-mobile-390.png. Keep the result values and actions data-driven.

Acceptance: recapture completion at 390×844 and 1440×1000. Match the mobile art direction and preserve the current desktop treatment and result actions. Do not change scoring or navigation behavior outside completion presentation. Run npm test and keep the offline service worker valid.

### 6. Create menu ordering

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the exact menu difference in this report: reorder the pills to Challenge, Exam, Quiz, Flashcards to match the mobile design. Use design-reference/mobile/Mobile · Create menu.png and screenshots/audit/create-menu-light-mobile-390.png.

Acceptance: recapture the open menu at 390×844 with a paused Home session. Match action order, pill alignment, and close control. Keep each action’s existing destination and do not change behavior outside the menu presentation. Run npm test and keep the offline service worker valid.

### 7. Dark hint contrast

Shared design spec: Match the supplied designs at mobile 390×844, tablet 834×1112, and desktop 1440×1000. Use the system font stack only, weights 700 and 400–500, no serif or small caps, crimson #B5173A, dark background #12103A and surface #1D1A55, the supplied deck gradients, 20–24px cards, pill buttons, tap targets at least 44px, and contrast of at least 4.5:1 for body text and 3:1 for large text.

Fix the contrast issue in this report: dark --faint (#615E87) on #12103A measures 2.98:1, and .hint uses that token for small text. Use the dark Home/Quiz references and screenshots/audit/home-dark-desktop-1440.png and quiz-dark-desktop-1440.png to check the affected muted-label style.

Acceptance: adjust only the insufficient dark hint/text token or its use; recheck body contrast ≥4.5:1 and large text ≥3:1 in both themes, then recapture the dark Home and Quiz screenshots. Do not change other color tokens or behavior outside this contrast fix. Run npm test and keep the offline service worker valid.

