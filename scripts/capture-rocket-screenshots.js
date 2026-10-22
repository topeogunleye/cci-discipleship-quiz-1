'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.join(__dirname, '..', '.tmp-chrome-profile');
const distHtml = 'file:///' + path.resolve(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/');
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  try {
    let versionData = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        versionData = await res.json();
        if (versionData) break;
      } catch (e) {
        await sleep(200);
      }
    }
    if (!versionData) throw new Error('Chrome CDP failed to start');

    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const pages = await listRes.json();
    const wsUrl = pages[0].webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (err) {
        console.error('onmessage err:', err);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    const viewports = [
      { name: '360', width: 360, height: 740 },
      { name: '430', width: 430, height: 860 }
    ];

    const themes = ['light', 'dark'];

    for (const vp of viewports) {
      for (const th of themes) {
        console.log(`Capturing ${vp.name}px ${th}...`);
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: true
        });

        await send('Page.navigate', { url: distHtml });
        await sleep(700);

        // Ensure onboarding completed and set theme in localStorage
        await send('Runtime.evaluate', {
          expression: `(function() {
            try {
              var s = JSON.parse(localStorage.getItem('flashdecks.v1') || '{}');
              s.onboarding = { completed: true, dailyMinutes: 10, goal: 'habit', startingTopic: 'soteriology' };
              s.settings = s.settings || {};
              s.settings.theme = '${th}';
              localStorage.setItem('flashdecks.v1', JSON.stringify(s));
            } catch(e) {}
            if (document.documentElement) {
              document.documentElement.setAttribute('data-theme', '${th}');
            }
          })()`
        });

        // Re-navigate to pick up storage
        await send('Page.navigate', { url: distHtml });
        await sleep(700);

        await send('Runtime.evaluate', {
          expression: `(function() {
            if (document.documentElement) {
              document.documentElement.setAttribute('data-theme', '${th}');
            }
          })()`
        });
        await sleep(300);

        // 1. Home closed
        let shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, `rocket-home-closed-${th}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
        console.log(`Saved rocket-home-closed-${th}-${vp.name}.png`);

        // 2. Home menu open
        await send('Runtime.evaluate', {
          expression: `(function() {
            var btn = document.getElementById('rocket-fab-btn');
            if (btn) btn.click();
          })()`
        });
        await sleep(400);
        shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, `rocket-home-menu-open-${th}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
        console.log(`Saved rocket-home-menu-open-${th}-${vp.name}.png`);

        // 3. Lesson picker (Flashcards)
        await send('Runtime.evaluate', {
          expression: `(function() {
            var pill = document.querySelector('[data-act="rocket-flash"]');
            if (pill) pill.click();
          })()`
        });
        await sleep(400);
        shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, `rocket-picker-flash-${th}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
        console.log(`Saved rocket-picker-flash-${th}-${vp.name}.png`);

        // Close picker and reopen menu to click Quiz
        await send('Runtime.evaluate', {
          expression: `(function() {
            var closeBtn = document.querySelector('[data-act="close-picker"]');
            if (closeBtn) closeBtn.click();
          })()`
        });
        await sleep(300);

        await send('Runtime.evaluate', {
          expression: `(function() {
            var btn = document.getElementById('rocket-fab-btn');
            if (btn) btn.click();
          })()`
        });
        await sleep(300);

        // 4. Lesson picker (Quiz)
        await send('Runtime.evaluate', {
          expression: `(function() {
            var pill = document.querySelector('[data-act="rocket-quiz"]');
            if (pill) pill.click();
          })()`
        });
        await sleep(400);
        shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotsDir, `rocket-picker-quiz-${th}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
        console.log(`Saved rocket-picker-quiz-${th}-${vp.name}.png`);
      }
    }

    ws.close();
    console.log('Successfully captured all rocket screenshots!');
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
