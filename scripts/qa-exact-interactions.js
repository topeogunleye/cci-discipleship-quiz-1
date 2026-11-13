/**
 * Exact Interactions QA Runner with Precise Selectors
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME = '/usr/bin/google-chrome';
const PROD = 'https://cci-discipleship-quiz.pages.dev';
const SCREENSHOTS = '/home/gamp/cci-discipleship-quiz-1/screenshots';
const RESULTS = [];

function check(name, pass, detail = '') {
  RESULTS.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${name} ${detail ? '— ' + detail : ''}`);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  try {
    await page.goto(PROD, { waitUntil: 'networkidle2', timeout: 20000 });
    
    // Skip onboarding
    await page.evaluate(() => {
      const skip = document.querySelector('[data-act="skip-onboarding"], button.btn-skip, [data-act="onboarding-skip"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('skip'));
      if (skip) skip.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 1. Open Journey and click first chapter
    await page.evaluate(() => {
      const tab = document.querySelector('[data-tab="journey"]');
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    
    const chapterId = await page.evaluate(() => {
      const firstHit = document.querySelector('[data-act="open-chapter"]');
      if (firstHit) {
        const id = firstHit.dataset.id;
        firstHit.click();
        return id;
      }
      return null;
    });
    await new Promise(r => setTimeout(r, 1500));
    check('Open Chapter Detail', chapterId !== null, `Opened: ${chapterId}`);

    // 2. Start Flashcards & Modal Confirm
    await page.evaluate(() => {
      const btn = document.querySelector('[data-act="setup"][data-mode="flash"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const start = document.querySelector('#modal [data-act="start"]');
      if (start) start.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-02-flashcard-active.png` });

    // 3. Flip Card
    const flipped = await page.evaluate(() => {
      const btn = document.querySelector('button.flip[data-act="flip"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-03-flashcard-flipped.png` });
    check('Flip Flashcard to Reveal Answer', flipped);

    // 4. Rate Card
    const rated = await page.evaluate(() => {
      const markBtn = document.querySelector('button[data-act="mark"][data-v="known"]');
      if (markBtn) { markBtn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-04-flashcard-rated.png` });
    check('Rate Flashcard (I know it)', rated);

    // 5. Exit Flashcard Session
    await page.evaluate(() => {
      const close = document.querySelector('button.study-close-btn[data-act="pause-session"]');
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 6. Start Quiz
    await page.evaluate(() => {
      const btn = document.querySelector('[data-act="setup"][data-mode="quiz"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const start = document.querySelector('#modal [data-act="start"]');
      if (start) start.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-05-quiz-active.png` });
    check('Start Quiz Session');

    // 7. Pick Option
    const optionText = await page.evaluate(() => {
      const opt = document.querySelector('button.opt[data-act="pick"]');
      if (opt) {
        const text = opt.textContent.trim();
        opt.click();
        return text;
      }
      return null;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-06-quiz-picked.png` });
    check('Select Quiz Option', optionText !== null, optionText?.substring(0, 40));

    // 8. Check Explanation and Bible Reference
    const feedback = await page.evaluate(() => {
      const exp = document.querySelector('.card-note, .feedback-panel');
      const bibleLink = document.querySelector('a.bible-reference-link[data-bible-reference-link="true"]');
      return {
        explanation: exp ? exp.textContent.trim().substring(0, 100) : null,
        bibleRef: bibleLink ? bibleLink.textContent.trim() : null
      };
    });
    check('Quiz Instant Feedback & Explanation', feedback.explanation !== null, feedback.explanation || 'None');
    check('Bible Reference Link Rendered', feedback.bibleRef !== null, feedback.bibleRef || 'None');

    // 9. Click Bible Reference for ESV Preview
    if (feedback.bibleRef) {
      await page.evaluate(() => {
        const link = document.querySelector('a.bible-reference-link[data-bible-reference-link="true"]');
        if (link) link.click();
      });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: `${SCREENSHOTS}/verified-07-bible-popover.png` });
      const popoverText = await page.evaluate(() => {
        const pop = document.querySelector('.bible-preview-popover, [role="dialog"]');
        return pop ? pop.textContent.trim().substring(0, 120) : null;
      });
      check('ESV Bible Passage Preview Popover Opens', popoverText !== null, popoverText || 'Failed to open');
    }

    // 10. Exit Quiz
    await page.evaluate(() => {
      const close = document.querySelector('button.study-close-btn[data-act="pause-session"]');
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 11. Open Lesson Video
    await page.evaluate(() => {
      const vBtn = document.querySelector('[data-act="open-lesson-video"]');
      if (vBtn) vBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-08-video-guest-gate.png` });

    const gateText = await page.evaluate(() => {
      const gate = document.querySelector('.lesson-video-auth-required');
      return gate ? gate.textContent.trim().replace(/\s+/g, ' ') : null;
    });
    check('Video Guest Sign-In Gate Active', gateText !== null, gateText?.substring(0, 100));

    // 12. Click "Sign in or create account" from Video Gate
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-return-video]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-09-account-settings.png` });

    const inSettings = await page.evaluate(() => {
      const tab = document.querySelector('.tab-btn.active[data-tab="settings"], .desktop-nav-item.active[data-tab="settings"]');
      return tab !== null;
    });
    check('Directs to Settings with Return Video Context', inSettings);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SCREENSHOTS}/verified-exact-results.json`, JSON.stringify(RESULTS, null, 2));
}

run().catch(e => console.error(e));
