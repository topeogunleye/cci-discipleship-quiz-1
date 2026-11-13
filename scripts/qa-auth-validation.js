/**
 * Test Account Form Input Validation on Production
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

    // Go to settings
    await page.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
    await new Promise(r => setTimeout(r, 1500));

    // Test 1: Empty inputs click Sign In
    await page.evaluate(() => {
      const signInBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Sign in');
      if (signInBtn) signInBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    const emptyFeedback = await page.evaluate(() => {
      const toast = document.getElementById('toast')?.textContent.trim();
      const msg = document.querySelector('.account-status, .account-error, [role="status"]')?.textContent.trim();
      return toast || msg || '';
    });
    check('Validation: Empty credentials rejected', emptyFeedback.length > 0, emptyFeedback);

    // Test 2: Invalid email format
    await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"], input[autocomplete="email"], input[id*="email"], .settings-row input');
      if (emailInput) {
        emailInput.value = 'invalid-email-format';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const pwInput = document.querySelector('input[type="password"]');
      if (pwInput) {
        pwInput.value = 'short';
        pwInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const signInBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Sign in');
      if (signInBtn) signInBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: `${SCREENSHOTS}/verified-auth-validation.png` });

    const invalidFeedback = await page.evaluate(() => {
      const toast = document.getElementById('toast')?.textContent.trim();
      const msg = document.querySelector('.account-status, .account-error, [role="status"]')?.textContent.trim();
      return toast || msg || '';
    });
    check('Validation: Malformed email/short password rejected with clear message', invalidFeedback.length > 0, invalidFeedback);

  } catch (err) {
    console.error('Validation test error:', err);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SCREENSHOTS}/verified-auth-results.json`, JSON.stringify(RESULTS, null, 2));
}

run().catch(e => console.error(e));
