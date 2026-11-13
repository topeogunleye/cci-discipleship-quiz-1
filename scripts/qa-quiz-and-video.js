/**
 * Quiz, Bible Reference Popover & Lesson Video Gate Test
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
    
    // Skip onboarding if present
    await page.evaluate(() => {
      const skip = document.querySelector('[data-act="skip-onboarding"], button.btn-skip, [data-act="onboarding-skip"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('skip'));
      if (skip) skip.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 1. Open Journey -> First Chapter
    await page.evaluate(() => document.querySelector('[data-tab="journey"]')?.click());
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => document.querySelector('[data-act="open-chapter"]')?.click());
    await new Promise(r => setTimeout(r, 1500));

    // 2. Start Quiz directly from Chapter Timeline
    await page.evaluate(() => {
      const qBtn = document.querySelector('[data-act="setup"][data-mode="quiz"]');
      if (qBtn) qBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const start = document.querySelector('#modal [data-act="start"]');
      if (start) start.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-quiz-01-question.png` });

    const inQuiz = await page.evaluate(() => {
      const opt = document.querySelector('button.opt[data-act="pick"]');
      return opt !== null;
    });
    check('In Quiz Session with Answer Options', inQuiz);

    // 3. Select Answer Option A
    const selectedText = await page.evaluate(() => {
      const opt = document.querySelector('button.opt[data-act="pick"]');
      if (opt) {
        const t = opt.textContent.trim();
        opt.click();
        return t;
      }
      return null;
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-quiz-02-feedback.png` });
    check('Select Answer Option', selectedText !== null, selectedText?.substring(0, 40));

    // 4. Verify Explanation & Bible Link in Feedback
    const fb = await page.evaluate(() => {
      const p = document.querySelector('.feedback-panel, .coaching-bottom-sheet');
      const text = p ? p.textContent.replace(/\s+/g, ' ') : '';
      const bibleLink = document.querySelector('a.bible-reference-link[data-bible-reference-link="true"]');
      return {
        panelVisible: p !== null,
        feedbackText: text.substring(0, 150),
        hasBibleLink: bibleLink !== null,
        bibleRef: bibleLink ? bibleLink.textContent.trim() : null
      };
    });
    check('Feedback Panel Shows Result & Explanation', fb.panelVisible, fb.feedbackText);
    check('Bible Reference Link Present in Feedback', fb.hasBibleLink, fb.bibleRef || 'No Bible link');

    // 5. Click Bible Reference Link to Open ESV Preview Popover
    if (fb.hasBibleLink) {
      await page.evaluate(() => {
        const link = document.querySelector('a.bible-reference-link[data-bible-reference-link="true"]');
        if (link) link.click();
      });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: `${SCREENSHOTS}/verified-quiz-03-bible-popover.png` });

      const popover = await page.evaluate(() => {
        const pop = document.querySelector('.bible-preview-popover, [role="dialog"], .bible-preview');
        return {
          isOpen: pop !== null,
          text: pop ? pop.textContent.replace(/\s+/g, ' ').substring(0, 150) : null
        };
      });
      check('ESV Bible Popover Dialog Opened', popover.isOpen, popover.text || 'Popover failed to render');
    }

    // 6. Return to Chapter Detail
    await page.evaluate(() => {
      const close = document.querySelector('button.study-close-btn[data-act="pause-session"]');
      if (close) close.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Go back to Journey -> Chapter 1
    await page.evaluate(() => document.querySelector('[data-tab="journey"]')?.click());
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => document.querySelector('[data-act="open-chapter"]')?.click());
    await new Promise(r => setTimeout(r, 1500));

    // 7. Click "Open video lesson" in Chapter Detail
    const videoClicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-act="open-lesson-video"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-video-01-gate.png` });
    check('Click Open Video Lesson', videoClicked);

    // 8. Verify Video Guest Gate
    const gateInfo = await page.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent.replace(/\s+/g, ' ') : '';
      const hasAuthMsg = text.includes('Sign in to watch this lesson') && text.includes('Create a free account or sign in to watch');
      const parts = Array.from(document.querySelectorAll('.lesson-part-btn, [data-act="lesson-video-select"]')).map(b => b.textContent.trim());
      const hasSettingsBtn = document.querySelector('button[data-return-video]') !== null;
      return { hasAuthMsg, partsCount: parts.length, parts: parts.slice(0, 3), hasSettingsBtn, text: text.substring(0, 200) };
    });
    check('Video Guest Gate Active (Sign-in required)', gateInfo.hasAuthMsg, gateInfo.text.substring(0, 100));
    check('Video Lesson Parts Selector Rendered', gateInfo.partsCount > 0, `Parts (${gateInfo.partsCount}): ${gateInfo.parts.join(', ')}`);
    check('Video Gate Account Action Button Present', gateInfo.hasSettingsBtn);

    // 9. Click "Sign in or create account" from Video Gate
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-return-video]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-video-02-settings-return.png` });

    const settingsCheck = await page.evaluate(() => {
      const text = document.getElementById('app').textContent;
      const isSettings = text.includes('Settings') || text.includes('Account');
      const hasSignIn = text.includes('Sign in') || text.includes('Create account');
      return { isSettings, hasSignIn };
    });
    check('Redirects to Settings with Return Context', settingsCheck.isSettings && settingsCheck.hasSignIn);

  } catch (err) {
    console.error('Quiz/Video test error:', err);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SCREENSHOTS}/verified-quiz-video-results.json`, JSON.stringify(RESULTS, null, 2));
}

run().catch(e => console.error(e));
