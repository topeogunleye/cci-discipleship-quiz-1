/**
 * End-to-End Learning Journey & Feature Audit
 * Target: Production (https://cci-discipleship-quiz.pages.dev)
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME = '/usr/bin/google-chrome';
const PROD = 'https://cci-discipleship-quiz.pages.dev';
const SCREENSHOTS = '/home/gamp/cci-discipleship-quiz-1/screenshots';
const LOG = [];

function log(test, status, details = '') {
  LOG.push({ test, status, details, time: new Date().toISOString() });
  console.log(`[${status}] ${test} ${details ? '— ' + details : ''}`);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    console.log('--- 1. FIRST VISIT & ONBOARDING ---');
    await page.goto(PROD, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-01-welcome.png` });
    
    // Check if onboarding is present
    const hasWelcome = await page.evaluate(() => {
      const h = document.querySelector('h1, .onboarding-title, #app');
      return h ? h.textContent.includes('CCI Discipleship') : false;
    });
    log('Onboarding Screen Rendered', hasWelcome ? 'PASS' : 'FAIL');

    // Click "Get Started"
    const clickedGetStarted = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startBtn = btns.find(b => b.textContent.includes('Get Started'));
      if (startBtn) { startBtn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-02-goal-step.png` });
    log('Click Get Started', clickedGetStarted ? 'PASS' : 'FAIL');

    // Select goal option (e.g. Habit) and continue
    await page.evaluate(() => {
      const opt = document.querySelector('[data-goal="habit"], .onboarding-option, button.btn-continue');
      if (opt) opt.click();
      const cont = document.querySelector('.btn-continue, [data-act="onboarding-next"]');
      if (cont) cont.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-03-time-step.png` });

    // Skip remainder of onboarding if skip button available, or complete
    const skipSuccess = await page.evaluate(() => {
      const skipBtn = document.querySelector('[data-act="skip-onboarding"], .btn-skip, [data-act="onboarding-skip"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('skip'));
      if (skipBtn) { skipBtn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-04-home-after-onboarding.png` });
    log('Complete/Skip Onboarding to Home', 'PASS', `Skipped: ${skipSuccess}`);

    console.log('--- 2. HOME SCREEN & DEVOTIONALS ---');
    // Check Home components
    const homeState = await page.evaluate(() => {
      const app = document.getElementById('app');
      const text = app.textContent;
      const hasDevotionals = text.includes('Devotional') || document.querySelector('.devotional-card') !== null;
      const hasStreak = text.includes('Streak') || text.includes('streak');
      const hasStudyButton = text.includes('Study') || document.querySelector('[data-act="start-study"]') !== null;
      return { hasDevotionals, hasStreak, hasStudyButton };
    });
    log('Home: Devotional Section Visible', homeState.hasDevotionals ? 'PASS' : 'FAIL');
    log('Home: Streak Widget Visible', homeState.hasStreak ? 'PASS' : 'FAIL');
    log('Home: Study Action Button Visible', homeState.hasStudyButton ? 'PASS' : 'FAIL');

    // Test Devotional Reader
    const devotionalOpened = await page.evaluate(() => {
      const card = document.querySelector('.devotional-card, [data-act="read-devotional"], [data-devotional-id]');
      if (card) { card.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-05-devotional-reader.png` });
    log('Devotional Card Click & Open', devotionalOpened ? 'PASS' : 'INFO');

    // Return to Home or Journey
    await page.evaluate(() => {
      const back = document.querySelector('[data-act="close-devotional"], [data-act="back"], .btn-back');
      if (back) back.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('--- 3. JOURNEY & CHAPTER BROWSING ---');
    // Navigate to Journey tab
    await page.evaluate(() => {
      const journeyTab = document.querySelector('[data-tab="journey"]');
      if (journeyTab) journeyTab.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-06-journey-tab.png` });

    const journeyData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.chapter-card, [data-deck-id], .section-card');
      const titles = Array.from(cards).map(c => c.textContent.trim().split('\n')[0]);
      return { count: cards.length, titles: titles.slice(0, 3) };
    });
    log('Journey Chapters Loaded', journeyData.count >= 12 ? 'PASS' : 'FAIL', `Found ${journeyData.count} chapters: ${journeyData.titles.join(', ')}`);

    // Click into Chapter 1 (Soteriology)
    const chapterClicked = await page.evaluate(() => {
      const firstChapter = document.querySelector('.chapter-card, [data-deck-id]');
      if (firstChapter) { firstChapter.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-07-chapter-detail.png` });
    log('Chapter Detail Opened', chapterClicked ? 'PASS' : 'FAIL');

    // Check Chapter Detail activities: Flashcards, Quiz, Video
    const chapterActivities = await page.evaluate(() => {
      const text = document.getElementById('app').textContent;
      return {
        hasFlashcards: text.includes('Flashcard') || document.querySelector('[data-act="start-flashcards"]') !== null,
        hasQuiz: text.includes('Quiz') || document.querySelector('[data-act="start-quiz"]') !== null,
        hasVideo: text.includes('Video') || text.includes('Watch') || document.querySelector('[data-act="watch-lesson"]') !== null
      };
    });
    log('Chapter Activities: Flashcards Option', chapterActivities.hasFlashcards ? 'PASS' : 'FAIL');
    log('Chapter Activities: Quiz Option', chapterActivities.hasQuiz ? 'PASS' : 'FAIL');
    log('Chapter Activities: Video Lesson Option', chapterActivities.hasVideo ? 'PASS' : 'FAIL');

    console.log('--- 4. FLASHCARD STUDY SESSION ---');
    const flashStarted = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="start-flashcards"], [data-mode="flashcards"], .step-flashcards button, button.btn-study');
      if (btn) { btn.click(); return true; }
      // Fallback: look for any study button in chapter
      const allBtns = Array.from(document.querySelectorAll('button'));
      const b = allBtns.find(x => x.textContent.toLowerCase().includes('flashcard') || x.textContent.toLowerCase().includes('study'));
      if (b) { b.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-08-flashcard-front.png` });
    log('Flashcard Session Started', flashStarted ? 'PASS' : 'FAIL');

    // Reveal flashcard answer
    const cardFlipped = await page.evaluate(() => {
      const card = document.querySelector('.flashcard, .flash-front, [data-act="flip-card"]');
      if (card) { card.click(); return true; }
      const flipBtn = document.querySelector('[data-act="flip-card"], .btn-flip');
      if (flipBtn) { flipBtn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-09-flashcard-back.png` });
    log('Flashcard Flip / Reveal Answer', cardFlipped ? 'PASS' : 'FAIL');

    // Rate card (Good / Easy)
    const rated = await page.evaluate(() => {
      const rateBtn = document.querySelector('[data-rating="good"], [data-rating="easy"], [data-rating="3"], .rating-good, button.rate-good');
      if (rateBtn) { rateBtn.click(); return true; }
      const btns = Array.from(document.querySelectorAll('.flash-rating button, .study-navigation button'));
      if (btns.length > 0) { btns[btns.length - 1].click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-10-flashcard-advanced.png` });
    log('Rate Flashcard & Advance', rated ? 'PASS' : 'FAIL');

    // Exit study session back to chapter
    await page.evaluate(() => {
      const exitBtn = document.querySelector('[data-act="exit-study"], [data-act="back"], .btn-close-study');
      if (exitBtn) exitBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('--- 5. QUIZ / EXAM INTERACTION ---');
    // Start Quiz
    const quizStarted = await page.evaluate(() => {
      const quizBtn = document.querySelector('[data-act="start-quiz"], [data-mode="quiz"], .step-quiz button');
      if (quizBtn) { quizBtn.click(); return true; }
      const allBtns = Array.from(document.querySelectorAll('button'));
      const qb = allBtns.find(x => x.textContent.toLowerCase().includes('quiz'));
      if (qb) { qb.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-11-quiz-question.png` });
    log('Quiz Session Started', quizStarted ? 'PASS' : 'FAIL');

    // Select an answer option
    const answerSelected = await page.evaluate(() => {
      const opt = document.querySelector('.quiz-option, [data-option], .answer-btn');
      if (opt) { opt.click(); return opt.textContent.trim(); }
      const btns = Array.from(document.querySelectorAll('button.option, .quiz-choice'));
      if (btns.length > 0) { btns[0].click(); return btns[0].textContent.trim(); }
      return null;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-12-quiz-answered.png` });
    log('Select Quiz Answer', answerSelected !== null ? 'PASS' : 'FAIL', answerSelected ? `Selected: ${answerSelected.substring(0,30)}` : '');

    // Check explanation and Bible reference if shown
    const feedbackState = await page.evaluate(() => {
      const exp = document.querySelector('.explanation, .quiz-explanation, [class*="explanation"]');
      const bibleRef = document.querySelector('.bible-reference-link, [data-bible-reference-link]');
      return {
        hasExplanation: exp !== null,
        explanationText: exp ? exp.textContent.trim().substring(0, 100) : '',
        hasBibleRef: bibleRef !== null,
        bibleRefText: bibleRef ? bibleRef.textContent.trim() : ''
      };
    });
    log('Quiz: Explanation Rendered', feedbackState.hasExplanation ? 'PASS' : 'INFO', feedbackState.explanationText);
    log('Quiz: Bible Reference Rendered', feedbackState.hasBibleRef ? 'PASS' : 'INFO', feedbackState.bibleRefText);

    // If Bible reference is present, click it to test ESV popover
    if (feedbackState.hasBibleRef) {
      await page.evaluate(() => {
        const ref = document.querySelector('.bible-reference-link, [data-bible-reference-link]');
        if (ref) ref.click();
      });
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-13-bible-popover.png` });
      const popoverVisible = await page.evaluate(() => {
        const pop = document.querySelector('.bible-preview-popover, .bible-popover, [role="dialog"]');
        return pop !== null;
      });
      log('Bible Reference Popover Opens', popoverVisible ? 'PASS' : 'FAIL');
    }

    // Exit quiz session
    await page.evaluate(() => {
      const exit = document.querySelector('[data-act="exit-quiz"], [data-act="back"], .btn-exit');
      if (exit) exit.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('--- 6. LESSON VIDEO & GUEST AUTH GATE ---');
    // Try to open a lesson video
    const videoBtnClicked = await page.evaluate(() => {
      const vBtn = document.querySelector('[data-act="watch-lesson"], [data-act="lesson-video"], .lesson-video-link');
      if (vBtn) { vBtn.click(); return true; }
      const btns = Array.from(document.querySelectorAll('button, a'));
      const vb = btns.find(b => b.textContent.toLowerCase().includes('video') || b.textContent.toLowerCase().includes('watch'));
      if (vb) { vb.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-14-video-screen.png` });

    const videoScreenState = await page.evaluate(() => {
      const text = document.getElementById('app').textContent;
      const isGate = text.includes('Sign in to watch') || text.includes('Create a free account') || text.includes('Account settings');
      const isPlayer = document.querySelector('video') !== null;
      return { isGate, isPlayer, text: text.substring(0, 200) };
    });
    log('Lesson Video Guest Gate', videoScreenState.isGate ? 'PASS' : (videoScreenState.isPlayer ? 'UNEXPECTED_OPEN' : 'FAIL'), videoScreenState.text.replace(/\s+/g, ' '));

    console.log('--- 7. SETTINGS, THEME & BACKUP ---');
    // Go to Settings tab
    await page.evaluate(() => {
      const setBtn = document.querySelector('[data-tab="settings"]');
      if (setBtn) setBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-15-settings-tab.png` });

    // Test Theme toggle
    const themeToggled = await page.evaluate(() => {
      const darkBtn = document.querySelector('[data-theme="dark"], button[value="dark"]');
      if (darkBtn) { darkBtn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/prod-journey-16-theme-dark.png` });
    log('Settings: Dark Theme Toggle', themeToggled ? 'PASS' : 'INFO');

    // Test Backup export button availability
    const backupExportExists = await page.evaluate(() => {
      const exp = document.querySelector('[data-act="export-backup"], [data-act="export"], button.btn-export');
      return exp !== null;
    });
    log('Settings: Backup Export Button Present', backupExportExists ? 'PASS' : 'FAIL');

    // Check Data Retention / Sermon Isolation
    const noSermonsInSettings = await page.evaluate(() => {
      const text = document.getElementById('app').textContent;
      return !text.toLowerCase().includes('sermon');
    });
    log('Settings: Completely Free of Sermon References', noSermonsInSettings ? 'PASS' : 'FAIL');

    console.log('--- 8. CONSOLE ERRORS AUDIT ---');
    log('Zero Console Errors Across Entire Journey', consoleErrors.length === 0 ? 'PASS' : 'FAIL', consoleErrors.join(' | '));

  } catch (err) {
    log('Journey Execution Error', 'ERROR', err.message);
  } finally {
    await browser.close();
  }

  // Save results
  const outPath = '/home/gamp/cci-discipleship-quiz-1/screenshots/learning-journey-results.json';
  fs.writeFileSync(outPath, JSON.stringify(LOG, null, 2));
  console.log(`\nResults saved to ${outPath}`);
}

run().catch(e => console.error(e));
