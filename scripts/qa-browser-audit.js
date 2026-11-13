/**
 * CCI Discipleship App — Browser QA Audit Script
 * Target: origin/main (78e4e81) on production + local (localhost:8787)
 * Run: node scripts/qa-browser-audit.js
 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/usr/bin/google-chrome';
const PROD = 'https://cci-discipleship-quiz.pages.dev';
const LOCAL = 'http://127.0.0.1:8000';
const SCREENSHOTS = path.join(__dirname, '..', 'screenshots');
const RESULTS = [];

fs.mkdirSync(SCREENSHOTS, { recursive: true });

function result(scenario, env, expected, actual, status, notes = '') {
  const r = { scenario, env, expected, actual, status, notes, ts: new Date().toISOString() };
  RESULTS.push(r);
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'BLOCKED' ? '⛔' : '⚠️';
  console.log(`${icon} [${status}] ${scenario} (${env})\n   Expected: ${expected}\n   Actual:   ${actual}${notes ? '\n   Note: ' + notes : ''}\n`);
  return r;
}

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function waitForApp(page) {
  // Wait for the app div to have content (JS has rendered)
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.children.length > 0 && app.textContent.trim().length > 10;
  }, { timeout: 15000 });
}

async function runAudit() {
  console.log('=== CCI Discipleship QA Browser Audit ===');
  console.log(`Chrome: ${CHROME}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 }
  });

  try {
    // ===== SECTION 1: VERSION VERIFICATION =====
    console.log('--- SECTION 1: Version / Sermons Removal ---\n');

    for (const [label, url] of [['production', PROD], ['local', LOCAL]]) {
      const page = await browser.newPage();
      const consoleErrors = [];
      const networkErrors = [];
      const networkRequests = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('requestfailed', req => networkErrors.push(`${req.failure()?.errorText} ${req.url()}`));
      page.on('response', res => networkRequests.push({ url: res.url(), status: res.status() }));

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await waitForApp(page);

        // Check for sermon tabs in rendered DOM
        const sermonTabVisible = await page.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('[data-tab]'));
          return tabs.some(t => t.dataset.tab && t.dataset.tab.includes('sermon'));
        });
        result(
          'No sermon tab in navigation',
          label,
          'No visible sermon tab',
          sermonTabVisible ? 'SERMON TAB FOUND' : 'No sermon tab visible',
          sermonTabVisible ? 'FAIL' : 'PASS'
        );

        // Check for experience switcher
        const switcherVisible = await page.evaluate(() => {
          const switcher = document.querySelector('[data-act="experience-switch"]');
          if (!switcher) return 'not found';
          const rect = switcher.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 ? 'VISIBLE' : 'hidden (zero size)';
        });
        result(
          'No experience switcher visible',
          label,
          'Experience switcher hidden or absent',
          switcherVisible,
          (switcherVisible === 'not found' || switcherVisible === 'hidden (zero size)') ? 'PASS' : 'FAIL',
          'Switcher: ' + switcherVisible
        );

        // Check sermon JS files are loaded (main still has them)
        const sermonJsLoaded = networkRequests.some(r => r.url.includes('sermons.js') && r.status === 200);
        result(
          'Sermon JS files absent from network (should be removed in discipleship-only)',
          label,
          'No sermons.js loaded (discipleship-only), or expected on main',
          sermonJsLoaded ? 'sermons.js loaded (200)' : 'sermons.js NOT loaded',
          label === 'local' ? (sermonJsLoaded ? 'INFO' : 'PASS') : 'INFO',
          label === 'production' ? 'On main branch — sermons.js still present (expected)' : 'On main branch locally'
        );

        // Check for console errors
        result(
          'No console errors on page load',
          label,
          '0 console errors',
          consoleErrors.length === 0 ? 'No errors' : `${consoleErrors.length} errors: ${consoleErrors.slice(0,3).join(' | ')}`,
          consoleErrors.length === 0 ? 'PASS' : 'FAIL',
          consoleErrors.slice(0,5).join('\n')
        );

        await screenshot(page, `${label}-home-desktop-1280`);

      } catch (e) {
        result('Page load', label, 'App renders', `Error: ${e.message}`, 'FAIL');
      }
      await page.close();
    }

    // ===== SECTION 2: Navigation Tabs =====
    console.log('\n--- SECTION 2: Navigation & Tabs ---\n');
    const page2 = await browser.newPage();
    await page2.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(page2);

    const tabs = await page2.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-tab]')).map(t => ({
        tab: t.dataset.tab,
        text: t.textContent.trim(),
        visible: t.offsetWidth > 0 && t.offsetHeight > 0
      }));
    });
    const visibleTabs = tabs.filter(t => t.visible).map(t => t.tab);
    const expectedTabs = ['home', 'journey', 'progress', 'settings'];
    const unexpectedSermonTabs = visibleTabs.filter(t => t.includes('sermon'));
    result(
      'Discipleship tabs present (home, journey, progress, settings)',
      'local',
      expectedTabs.join(', '),
      visibleTabs.join(', '),
      expectedTabs.every(t => visibleTabs.includes(t)) ? 'PASS' : 'FAIL'
    );
    result(
      'No sermon tabs visible',
      'local',
      'No sermon tabs',
      unexpectedSermonTabs.length === 0 ? 'No sermon tabs' : unexpectedSermonTabs.join(', '),
      unexpectedSermonTabs.length === 0 ? 'PASS' : 'FAIL'
    );

    // Check Practice tab (may be a sub-tab, not main nav)
    const practiceExists = await page2.evaluate(() => {
      return !!document.querySelector('[data-tab="practice"]') || !!document.querySelector('[data-act*="practice"]');
    });
    result(
      'Practice accessible from Journey',
      'local',
      'Practice button exists somewhere in app',
      practiceExists ? 'Practice control found' : 'No practice control found',
      'INFO'
    );

    // ===== SECTION 2b: Onboarding =====
    console.log('\n--- SECTION 2b: Onboarding Flow ---\n');
    // Open in a fresh context to simulate first visit
    const incognito = await browser.createBrowserContext();
    const freshPage = await incognito.newPage();
    await freshPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(freshPage);

    const onboardingVisible = await freshPage.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      return {
        hasOnboarding: /onboard|welcome|get started|your goal|minutes|study/i.test(text),
        appText: text.substring(0, 300)
      };
    });
    result(
      'Onboarding shown to new user',
      'local (fresh context)',
      'Onboarding screen visible',
      onboardingVisible.hasOnboarding ? 'Onboarding text found' : 'No onboarding found',
      onboardingVisible.hasOnboarding ? 'PASS' : 'FAIL',
      'App text: ' + onboardingVisible.appText.substring(0, 200)
    );
    await screenshot(freshPage, 'local-onboarding-fresh');

    // Check for sermon references in rendered HTML
    const renderedSermonRefs = await freshPage.evaluate(() => {
      const text = document.documentElement.innerHTML;
      const matches = text.match(/data-tab="sermons-\w+"|experience-switch.*sermons|Sermons<\/button/g) || [];
      return matches;
    });
    result(
      'No rendered sermon controls in fresh session',
      'local (fresh)',
      'No sermon DOM controls rendered',
      renderedSermonRefs.length === 0 ? 'None found' : renderedSermonRefs.join(', '),
      renderedSermonRefs.length === 0 ? 'PASS' : 'FAIL'
    );

    await freshPage.close();
    await incognito.close();

    // ===== SECTION 3: Journey Tab & Chapter Discovery =====
    console.log('\n--- SECTION 3: Journey & Chapter Discovery ---\n');
    // Skip onboarding by injecting state
    const journeyPage = await browser.newPage();
    await journeyPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(journeyPage);

    // Skip onboarding if present
    try {
      await journeyPage.evaluate(() => {
        // Try to skip onboarding
        const skipBtn = document.querySelector('[data-act="skip-onboarding"], [data-act="onboarding-skip"], button[class*="skip"]');
        if (skipBtn) skipBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {}

    // Click Journey tab
    try {
      await journeyPage.evaluate(() => {
        const btn = document.querySelector('[data-tab="journey"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1500));
      await screenshot(journeyPage, 'local-journey-tab');

      const journeyContent = await journeyPage.evaluate(() => {
        const app = document.getElementById('app');
        return {
          text: app ? app.textContent.substring(0, 500) : '',
          hasChapters: !!app && (app.querySelectorAll('.chapter-card, .chapter-item, [data-chapter], [data-act*="chapter"]').length > 0 ||
            /section|chapter|soteriology|christology|trinity/i.test(app.textContent))
        };
      });
      result(
        'Journey tab shows chapter/section list',
        'local',
        'Chapters or sections visible',
        journeyContent.hasChapters ? 'Chapters found' : 'No chapters found',
        journeyContent.hasChapters ? 'PASS' : 'FAIL',
        journeyContent.text.substring(0, 200)
      );
    } catch (e) {
      result('Journey tab navigation', 'local', 'Journey renders', `Error: ${e.message}`, 'FAIL');
    }
    await journeyPage.close();

    // ===== SECTION 4: Mobile Layout =====
    console.log('\n--- SECTION 4: Mobile Layout (390px) ---\n');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(mobilePage);
    await screenshot(mobilePage, 'local-home-mobile-390');

    const mobileLayout = await mobilePage.evaluate(() => {
      const app = document.getElementById('app');
      const tabBar = document.querySelector('.tab-bar, [class*="tab-bar"], nav[class*="bottom"]');
      const overflow = Array.from(document.querySelectorAll('*')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > window.innerWidth + 2 && r.width > 10;
      }).map(el => el.tagName + '.' + el.className.split(' ')[0]);
      return {
        hasTabBar: !!tabBar,
        overflowElements: overflow.slice(0, 5),
        appHeight: app ? app.getBoundingClientRect().height : 0
      };
    });
    result(
      'Mobile tab bar visible at 390px',
      'local (390px)',
      'Tab bar present',
      mobileLayout.hasTabBar ? 'Tab bar found' : 'No tab bar found',
      mobileLayout.hasTabBar ? 'PASS' : 'FAIL'
    );
    result(
      'No horizontal overflow on mobile',
      'local (390px)',
      '0 overflow elements',
      mobileLayout.overflowElements.length === 0 ? 'No overflow' : mobileLayout.overflowElements.join(', '),
      mobileLayout.overflowElements.length === 0 ? 'PASS' : 'FAIL'
    );
    await mobilePage.close();

    // ===== SECTION 5: Tablet Layout =====
    const tabletPage = await browser.newPage();
    await tabletPage.setViewport({ width: 768, height: 1024 });
    await tabletPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(tabletPage);
    await screenshot(tabletPage, 'local-home-tablet-768');
    const tabletLayout = await tabletPage.evaluate(() => {
      const overflow = Array.from(document.querySelectorAll('*')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > window.innerWidth + 2 && r.width > 10;
      }).map(el => el.tagName + '.' + el.className.split(' ')[0]);
      return { overflowElements: overflow.slice(0, 5) };
    });
    result(
      'No horizontal overflow on tablet (768px)',
      'local (768px)',
      '0 overflow elements',
      tabletLayout.overflowElements.length === 0 ? 'No overflow' : tabletLayout.overflowElements.join(', '),
      tabletLayout.overflowElements.length === 0 ? 'PASS' : 'FAIL'
    );
    await tabletPage.close();

    // ===== SECTION 6: Account / Auth Gate =====
    console.log('\n--- SECTION 6: Account & Auth Gate ---\n');
    const authPage = await browser.newPage();
    await authPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(authPage);

    // Navigate to settings to find account section
    await authPage.evaluate(() => {
      const btn = document.querySelector('[data-tab="settings"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await screenshot(authPage, 'local-settings');

    const settingsContent = await authPage.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      return {
        hasAccount: /sign in|sign up|account|email|create account/i.test(text),
        hasTheme: /theme|dark|light/i.test(text),
        hasBackup: /backup|export|import/i.test(text),
        text: text.substring(0, 600)
      };
    });
    result(
      'Settings page shows account section',
      'local',
      'Account/sign-in controls present',
      settingsContent.hasAccount ? 'Account section found' : 'No account section',
      settingsContent.hasAccount ? 'PASS' : 'FAIL'
    );
    result(
      'Settings page shows theme control',
      'local',
      'Theme selector present',
      settingsContent.hasTheme ? 'Theme control found' : 'No theme control',
      settingsContent.hasTheme ? 'PASS' : 'FAIL'
    );
    result(
      'Settings page shows backup/export control',
      'local',
      'Backup/export control present',
      settingsContent.hasBackup ? 'Backup control found' : 'No backup control',
      settingsContent.hasBackup ? 'PASS' : 'FAIL'
    );

    // Check lesson video auth gate (click on a lesson video if available)
    await authPage.evaluate(() => {
      // Try to navigate to journey first
      const btn = document.querySelector('[data-tab="journey"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Look for a lesson video link
    const lessonVideoGate = await authPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('[data-act*="lesson"], [data-act*="video"], [data-tab*="lesson"]'));
      if (links.length === 0) return { found: false };
      links[0].click();
      return { found: true, text: links[0].textContent.trim() };
    });
    await new Promise(r => setTimeout(r, 2000));

    const videoGateContent = await authPage.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      return {
        hasGate: /sign in|create.*account|guest|watch.*lesson/i.test(text),
        text: text.substring(0, 400)
      };
    });
    if (lessonVideoGate.found) {
      await screenshot(authPage, 'local-video-auth-gate');
      result(
        'Lesson video shows auth gate for guests',
        'local',
        'Sign-in gate appears for unauthenticated users',
        videoGateContent.hasGate ? 'Auth gate shown' : 'No gate found',
        videoGateContent.hasGate ? 'PASS' : 'FAIL',
        videoGateContent.text.substring(0, 200)
      );
    } else {
      result(
        'Lesson video auth gate',
        'local',
        'Auth gate shown',
        'No lesson video link found to click',
        'BLOCKED',
        'Journey may require onboarding completion or chapter selection first'
      );
    }
    await authPage.close();

    // ===== SECTION 7: Progress Tab =====
    console.log('\n--- SECTION 7: Progress Tab ---\n');
    const progressPage = await browser.newPage();
    await progressPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(progressPage);
    await progressPage.evaluate(() => {
      const btn = document.querySelector('[data-tab="progress"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await screenshot(progressPage, 'local-progress');
    const progressContent = await progressPage.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      return {
        hasProgress: /progress|streak|mastery|studied|card|section/i.test(text),
        text: text.substring(0, 400)
      };
    });
    result(
      'Progress tab renders',
      'local',
      'Progress/streak data shown',
      progressContent.hasProgress ? 'Progress content found' : 'No progress content',
      progressContent.hasProgress ? 'PASS' : 'FAIL'
    );
    await progressPage.close();

    // ===== SECTION 8: Accessibility basics =====
    console.log('\n--- SECTION 8: Accessibility Basics ---\n');
    const a11yPage = await browser.newPage();
    await a11yPage.goto(LOCAL, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(a11yPage);

    const a11y = await a11yPage.evaluate(() => {
      // Check for aria-labels on nav buttons
      const tabBtns = Array.from(document.querySelectorAll('[data-tab]'));
      const withoutLabel = tabBtns.filter(b => !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.textContent.trim());
      // Check for skip link
      const skipLink = document.querySelector('a[href="#main"], a[href="#content"], [class*="skip"]');
      // Check for lang attribute
      const htmlLang = document.documentElement.lang;
      // Check heading hierarchy
      const h1s = document.querySelectorAll('h1');
      // Check for role="status" on toasts
      const liveRegions = document.querySelectorAll('[role="status"], [aria-live]');
      // Images without alt
      const imgs = document.querySelectorAll('img');
      const imgsNoAlt = Array.from(imgs).filter(i => !i.alt && i.getAttribute('aria-hidden') !== 'true');
      return {
        tabBtnsWithoutLabel: withoutLabel.length,
        hasSkipLink: !!skipLink,
        htmlLang,
        h1Count: h1s.length,
        liveRegionCount: liveRegions.length,
        imgsNoAltCount: imgsNoAlt.length,
        totalTabBtns: tabBtns.length
      };
    });
    result(
      'HTML lang attribute present',
      'local',
      'lang="en" on <html>',
      `lang="${a11y.htmlLang}"`,
      a11y.htmlLang ? 'PASS' : 'FAIL'
    );
    result(
      'Live region for toast notifications',
      'local',
      'At least 1 aria-live/role=status region',
      `${a11y.liveRegionCount} live regions`,
      a11y.liveRegionCount > 0 ? 'PASS' : 'FAIL'
    );
    result(
      'Nav buttons have aria labels',
      'local',
      'All tab buttons labelled',
      a11y.tabBtnsWithoutLabel === 0 ? 'All labelled' : `${a11y.tabBtnsWithoutLabel} unlabelled`,
      a11y.tabBtnsWithoutLabel === 0 ? 'PASS' : 'FAIL'
    );
    result(
      'No images missing alt text',
      'local',
      '0 images without alt',
      `${a11y.imgsNoAltCount} images without alt`,
      a11y.imgsNoAltCount === 0 ? 'PASS' : 'FAIL'
    );
    await a11yPage.close();

    // ===== SECTION 9: PWA Manifest =====
    console.log('\n--- SECTION 9: PWA Manifest ---\n');
    const manifestRes = await (async () => {
      const p = await browser.newPage();
      const r = await p.goto(`${LOCAL}/manifest.webmanifest`, { timeout: 10000 });
      const text = await r.text();
      await p.close();
      try { return JSON.parse(text); } catch { return null; }
    })();
    result(
      'PWA manifest accessible and valid JSON',
      'local',
      'Valid manifest.webmanifest',
      manifestRes ? `name: "${manifestRes.name}", display: "${manifestRes.display}"` : 'Invalid or missing',
      manifestRes ? 'PASS' : 'FAIL'
    );
    result(
      'PWA manifest display is standalone',
      'local',
      'display: standalone',
      manifestRes ? `display: ${manifestRes.display}` : 'N/A',
      manifestRes && manifestRes.display === 'standalone' ? 'PASS' : 'FAIL'
    );

    // ===== SECTION 10: Offline.html =====
    const offlineRes = await (async () => {
      const p = await browser.newPage();
      const r = await p.goto(`${LOCAL}/offline.html`, { timeout: 10000 });
      const text = await r.text();
      await p.close();
      return { status: r.status(), hasOfflineMsg: /offline|no connection/i.test(text) };
    })();
    result(
      'offline.html accessible with offline message',
      'local',
      'offline.html returns 200 with offline message',
      `HTTP ${offlineRes.status}, hasOfflineMsg: ${offlineRes.hasOfflineMsg}`,
      offlineRes.status === 200 && offlineRes.hasOfflineMsg ? 'PASS' : 'FAIL'
    );

    // ===== SECTION 11: API Endpoints =====
    console.log('\n--- SECTION 11: API Endpoints ---\n');
    const endpoints = [
      ['/api/auth/config', 'GET', 200, 'Auth config endpoint'],
      ['/api/auth/session', 'POST', null, 'Auth session endpoint (POST required)'],
    ];
    for (const [ep, method, expectedStatus, label] of endpoints) {
      const p = await browser.newPage();
      const resp = await p.goto(`${LOCAL}${ep}`, { timeout: 10000 }).catch(() => null);
      if (resp) {
        const status = resp.status();
        result(
          label,
          'local',
          expectedStatus ? `HTTP ${expectedStatus}` : 'Reachable',
          `HTTP ${status}`,
          expectedStatus ? (status === expectedStatus ? 'PASS' : 'FAIL') : (status < 500 ? 'PASS' : 'FAIL')
        );
      } else {
        result(label, 'local', 'Reachable', 'Navigation failed', 'FAIL');
      }
      await p.close();
    }

    // Test production auth/config specifically
    const prodAuthRes = await (async () => {
      const p = await browser.newPage();
      const r = await p.goto(`${PROD}/api/auth/config`, { timeout: 10000 });
      const text = await r.text();
      await p.close();
      return { status: r.status(), body: text.substring(0, 200) };
    })();
    result(
      '/api/auth/config returns configured:true (was 503 historically)',
      'production',
      'HTTP 200 with configured:true',
      `HTTP ${prodAuthRes.status}: ${prodAuthRes.body}`,
      prodAuthRes.status === 200 && prodAuthRes.body.includes('"configured":true') ? 'PASS' : 'FAIL'
    );

    // ===== SECTION 12: Service Worker Registration =====
    console.log('\n--- SECTION 12: Service Worker ---\n');
    const swRes = await (async () => {
      const p = await browser.newPage();
      const r = await p.goto(`${LOCAL}/service-worker.js`, { timeout: 10000 });
      const text = await r.text();
      await p.close();
      return {
        status: r.status(),
        hasCacheName: /CACHE_NAME/.test(text),
        hasSermonAudioCache: /cci-sermon-downloads-v1/.test(text),
        hasSermonCoreFiles: /js\/sermons\.js/.test(text),
        cacheVersion: (text.match(/CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*'(v\d+)'/) || [])[1]
      };
    })();
    result(
      'Service worker accessible',
      'local',
      'HTTP 200',
      `HTTP ${swRes.status}`,
      swRes.status === 200 ? 'PASS' : 'FAIL'
    );
    result(
      'Service worker cache version present',
      'local',
      'Versioned cache name',
      swRes.cacheVersion ? `Cache version: ${swRes.cacheVersion}` : 'No version found',
      swRes.cacheVersion ? 'PASS' : 'FAIL'
    );
    result(
      'Service worker includes sermon audio cache constant (main branch)',
      'local (main branch)',
      'cci-sermon-downloads-v1 present (main); should be absent in discipleship-only',
      swRes.hasSermonAudioCache ? 'cci-sermon-downloads-v1 PRESENT' : 'cci-sermon-downloads-v1 absent',
      'INFO',
      'Main branch still has sermon audio cache handling — expected on main, should be removed in discipleship-only branch'
    );
    result(
      'Service worker caches sermon JS (main branch)',
      'local (main branch)',
      'sermons.js in CORE_FILES (main branch expected)',
      swRes.hasSermonCoreFiles ? 'sermons.js in CORE_FILES' : 'sermons.js NOT in CORE_FILES',
      'INFO',
      'Main branch still caches sermon JS — expected; should be removed in discipleship-only'
    );

    // ===== SECTION 13: Broken Links / 404s =====
    console.log('\n--- SECTION 13: Broken Assets on Production ---\n');
    const assetChecks = [
      '/style.css', '/js/app.js', '/js/parser.js', '/js/study.js', '/js/storage.js',
      '/js/progress-sync.js', '/js/account.js', '/js/transcripts.js',
      '/js/native-bridge.bundle.js', '/js/supabase.bundle.js',
      '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'
    ];
    const p13 = await browser.newPage();
    const failedAssets = [];
    for (const asset of assetChecks) {
      const r = await p13.goto(`${PROD}${asset}`, { timeout: 10000 }).catch(() => null);
      if (!r || r.status() !== 200) failedAssets.push(`${asset} (${r ? r.status() : 'failed'})`);
    }
    await p13.close();
    result(
      'All core production assets return 200',
      'production',
      '0 broken assets',
      failedAssets.length === 0 ? 'All OK' : failedAssets.join(', '),
      failedAssets.length === 0 ? 'PASS' : 'FAIL'
    );

    // ===== SECTION 14: Home screen (desktop) with screenshot =====
    console.log('\n--- SECTION 14: Home / Devotionals ---\n');
    const homePage = await browser.newPage();
    await homePage.goto(PROD, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(homePage);
    await screenshot(homePage, 'prod-home-desktop-after-js');

    const homeContent = await homePage.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      return {
        hasDevotional: /devotional|today|daily/i.test(text),
        hasStreak: /streak/i.test(text),
        text: text.substring(0, 500)
      };
    });
    result(
      'Home tab shows devotional/daily content',
      'production',
      'Devotional or daily content visible',
      homeContent.hasDevotional ? 'Devotional content found' : 'No devotional content',
      homeContent.hasDevotional ? 'PASS' : 'FAIL',
      homeContent.text.substring(0, 200)
    );
    await homePage.close();

    // Check production settings for sermon controls
    const prodSettings = await browser.newPage();
    await prodSettings.goto(PROD, { waitUntil: 'networkidle2', timeout: 20000 });
    await waitForApp(prodSettings);
    await prodSettings.evaluate(() => {
      const btn = document.querySelector('[data-tab="settings"]');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));
    await screenshot(prodSettings, 'prod-settings');
    const prodSettingsContent = await prodSettings.evaluate(() => {
      const app = document.getElementById('app');
      const text = app ? app.textContent : '';
      const experienceSwitcher = document.querySelector('[data-act="experience-switch"]');
      const sermonSettings = /sermon reminder|show.*draft.*sermon|sermon.*download/i.test(text);
      return { experienceSwitcher: !!experienceSwitcher, sermonSettings, text: text.substring(0, 600) };
    });
    result(
      'Settings shows no sermon-specific controls (experience switcher)',
      'production',
      'No experience switcher rendered',
      prodSettingsContent.experienceSwitcher ? 'Experience switcher FOUND' : 'No experience switcher',
      prodSettingsContent.experienceSwitcher ? 'FAIL' : 'PASS',
      'Main branch may still render it; check if Sermons experience is accessible'
    );
    result(
      'Settings shows no sermon reminder/draft controls',
      'production',
      'No sermon-specific settings controls',
      prodSettingsContent.sermonSettings ? 'Sermon settings FOUND' : 'No sermon settings',
      prodSettingsContent.sermonSettings ? 'FAIL' : 'PASS'
    );
    await prodSettings.close();

  } finally {
    await browser.close();
  }

  // ===== OUTPUT SUMMARY =====
  console.log('\n========== AUDIT SUMMARY ==========\n');
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, INFO: 0 };
  RESULTS.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
  console.log(`PASS: ${counts.PASS}  FAIL: ${counts.FAIL}  BLOCKED: ${counts.BLOCKED}  INFO: ${counts.INFO}`);
  
  const failures = RESULTS.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(r => console.log(`  ❌ [${r.env}] ${r.scenario}\n     ${r.actual}`));
  }

  // Write JSON results
  const resultsFile = path.join(__dirname, '..', 'screenshots', 'qa-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(RESULTS, null, 2));
  console.log(`\nResults saved to: ${resultsFile}`);
  console.log(`Screenshots in:   ${SCREENSHOTS}/`);
  
  return RESULTS;
}

runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
