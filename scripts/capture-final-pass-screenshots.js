'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const distHtml = 'file:///' + path.join(root, 'dist', 'index.html').replace(/\\/g, '/');
const outputDir = path.join(root, 'screenshots', 'final-pass');
const userDataDir = path.join(os.tmpdir(), `cci-final-pass-chrome-${process.pid}`);
const chromeCandidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const chromePath = chromeCandidates.find(candidate => fs.existsSync(candidate));
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 1400 },
  { name: 'tablet-834', width: 834, height: 1112 },
  { name: 'mobile-390', width: 390, height: 844 }
];
const themes = ['light', 'dark'];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function connectChrome(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome remote debugging did not become available');
}

function createClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;
  let opened;

  const ready = new Promise((resolve, reject) => {
    opened = resolve;
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('open', opened, { once: true });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Chrome debugging connection closed'));
    pending.clear();
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  return {
    ready,
    send,
    evaluate,
    close: () => socket.close()
  };
}

async function waitFor(client, expression, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function clickVisible(client, selector) {
  const clicked = await client.evaluate(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(candidate => candidate.getClientRects().length > 0);
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find visible control: ${selector}`);
}

async function resetPage(client, theme, viewport, options = {}) {
  const backupAnchor = options.backupDue ? Date.now() - 14 * 24 * 60 * 60 * 1000 : Date.now();
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width < 901
  });
  await client.send('Page.navigate', { url: distHtml });
  await waitFor(client, 'document.readyState === "complete"', 'the bundled app to load');
  await client.evaluate(`(() => {
    const key = 'flashdecks.v1';
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    state.onboarding = Object.assign({}, state.onboarding, {
      completed: true,
      dailyMinutes: 10,
      goal: 'habit',
      startingTopic: 'soteriology',
      preferredTime: 'anytime'
    });
    state.settings = Object.assign({}, state.settings, {
      theme: ${JSON.stringify(theme)},
      showDraftDevotionals: true
    });
    state.backupReminder = { anchorAt: ${backupAnchor}, cardsStudied: 0 };
    state.pausedSession = null;
    localStorage.setItem(key, JSON.stringify(state));
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
  })()`);
  await client.send('Page.navigate', { url: distHtml });
  await waitFor(client, 'document.readyState === "complete"', 'the seeded app to reload');
  await waitFor(client, 'document.querySelector("#app .desktop-shell, #app .home-view")', 'the app shell');
  await waitFor(client, 'document.querySelector("#app h1")', 'the Home screen');
  await sleep(300);
}

async function capture(client, name) {
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved ${name}.png`);
}

async function showPractice(client) {
  await clickVisible(client, '[data-act="nav-tab"][data-tab="practice"]');
  await waitFor(client, 'document.querySelector("main h1")?.textContent.includes("Practice")', 'the Practice view');
  for (const prefix of ['Lesson 1 ·', 'Lesson 3 ·']) {
    const selected = await client.evaluate(`(() => {
      const tile = [...document.querySelectorAll('.practice-cover-tile[data-act="practice-cover"]')]
        .find(element => element.textContent.trim().startsWith(${JSON.stringify(prefix)}));
      if (!tile) return false;
      tile.click();
      return true;
    })()`);
    if (!selected) throw new Error(`Could not select ${prefix} in Practice`);
  }
}

async function seedPracticeReferenceProgress(client) {
  const result = await client.evaluate(`(async () => {
    const request = indexedDB.open('cci-study-data', 1);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open screenshot storage'));
    });
    const read = db.transaction('state', 'readonly').objectStore('state').get('current');
    const raw = await new Promise((resolve, reject) => {
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error || new Error('Could not read screenshot state'));
    });
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!state || !Array.isArray(state.decks) || state.decks.length < 4) {
      db.close();
      return false;
    }
    state.progress = state.progress && typeof state.progress === 'object' ? state.progress : {};
    const percentages = [100, 70, 45, 20];
    const masteredCounts = [];
    state.decks.slice(0, 4).forEach((deck, index) => {
      const existing = state.progress[deck.id];
      const record = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing
        : { best: null, cards: {} };
      record.cards = record.cards && typeof record.cards === 'object' && !Array.isArray(record.cards) ? record.cards : {};
      const count = Math.round(deck.cards.length * percentages[index] / 100);
      masteredCounts.push(count);
      deck.cards.forEach((card, cardIndex) => {
        if (cardIndex < count) record.cards[card.id] = Object.assign({}, record.cards[card.id], { box: 2 });
      });
      state.progress[deck.id] = record;
    });
    const transaction = db.transaction('state', 'readwrite');
    transaction.objectStore('state').put(JSON.stringify(state), 'current');
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save screenshot progress'));
      transaction.onabort = () => reject(transaction.error || new Error('Screenshot progress write was aborted'));
    });
    db.close();
    return masteredCounts;
  })()`);
  if (!Array.isArray(result)) throw new Error('Could not seed isolated Practice reference progress');
  await client.send('Page.navigate', { url: distHtml });
  await waitFor(client, 'document.querySelector(".home-view")', 'the app after seeding Practice progress');
}

async function showJourney(client) {
  await clickVisible(client, '[data-act="nav-tab"][data-tab="journey"]');
  await waitFor(client, 'document.querySelector(".chapter-card-main-hit")', 'Journey chapters');
}

async function openFirstLesson(client) {
  await showJourney(client);
  await clickVisible(client, '.chapter-card-main-hit');
  await waitFor(client, 'document.querySelector(".chapter-view-header")', 'the lesson detail view');
}

async function startFirstLessonQuiz(client, questionCount = 10) {
  await openFirstLesson(client);
  await waitFor(client, 'document.querySelector(\'[data-act="setup"][data-mode="quiz"]\')', 'the chapter quiz action');
  await clickVisible(client, '[data-act="setup"][data-mode="quiz"]');
  await waitFor(client, 'document.querySelector("#s-len")', 'the quiz setup dialog');
  await client.evaluate(`(() => {
    const count = document.getElementById('s-len');
    if (count) count.value = ${questionCount};
    const start = document.querySelector('#modal [data-act="start"]');
    if (!start) throw new Error('Quiz start button is missing');
    start.click();
  })()`);
  await waitFor(client, 'document.querySelector(".quiz-session .coaching-question-text")', 'the Quiz view');
}

async function showQuiz(client) {
  await startFirstLessonQuiz(client, 20);
  for (let question = 0; question < 7; question++) {
    await clickVisible(client, '.quiz-session .opt[data-i="0"]');
    await clickVisible(client, '.quiz-session [data-act="next"]');
    await waitFor(client, 'document.querySelector(".quiz-session .coaching-question-text")', 'the next Quiz question');
  }
  await clickVisible(client, '.quiz-session .opt[data-i="1"]');
  await waitFor(client, 'document.querySelector(".quiz-session .coaching-bottom-sheet, .quiz-session .quiz-explanation-card")', 'the selected-answer feedback');
  if (await client.evaluate('window.innerWidth >= 901')) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 920,
      deviceScaleFactor: 1,
      mobile: false
    });
  }
}

async function showSessionComplete(client) {
  await startFirstLessonQuiz(client);
  for (let question = 0; question < 10; question++) {
    await clickVisible(client, '.quiz-session .opt[data-i="0"]');
    await clickVisible(client, '.quiz-session [data-act="next"]');
    if (question < 9) {
      await waitFor(client, 'document.querySelector(".quiz-session .coaching-question-text")', 'the next Quiz question');
    }
  }
  await waitFor(client, 'document.querySelector(".coaching-completion-screen")', 'the Session complete screen');
}

async function showDevotion(client) {
  await clickVisible(client, '[data-act="nav-tab"][data-tab="home"]');
  await waitFor(client, 'document.querySelector(".home-view")', 'Home before opening a devotional');
  if (await client.evaluate('window.innerWidth >= 901')) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1551,
      deviceScaleFactor: 1,
      mobile: false
    });
  }
  const referenceArticle = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('[data-act="open-devotional"]')]
      .find(element => element.textContent.includes('Grace That Sets You Free'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!referenceArticle) await clickVisible(client, '[data-act="open-devotional"]');
  await waitFor(client, 'document.querySelector(".devotional-view-shell .devotional-title")', 'the Devotion view');
  const expand = await client.evaluate(`(() => {
    const button = document.querySelector('.devotional-more-btn[aria-expanded="false"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (expand) await waitFor(client, 'document.querySelector(".devotional-more-btn[aria-expanded=\\\"true\\\"]")', 'the expanded devotional');
}

async function captureMatrix(client) {
  const scenes = [
    ['home', async () => {
      await waitFor(client, 'document.querySelector(".home-view")', 'the Home view');
    }],
    ['practice', async viewport => {
      if (viewport.name === 'desktop-1440') await seedPracticeReferenceProgress(client);
      await showPractice(client);
    }],
    ['quiz', () => showQuiz(client)],
    ['devotion', () => showDevotion(client)]
  ];

  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const [scene, prepare] of scenes) {
        await resetPage(client, theme, viewport);
        await prepare(viewport, theme);
        await sleep(200);
        const title = await client.evaluate(`(() => {
          const heading = document.querySelector(".quiz-question-text, .devotional-title, main h1, .home-view h1");
          return heading?.textContent.trim() || "";
        })()`);
        if (!title) throw new Error(`The ${scene} view has no visible heading`);
        await capture(client, `${scene}-${theme}-${viewport.name}`);
      }
    }
  }
}

async function captureSupplemental(client) {
  const desktop = viewports[0];
  await resetPage(client, 'light', { name: 'desktop-1440', width: 1440, height: 1500 }, { backupDue: true });
  await waitFor(client, 'document.querySelector(".desktop-backup-reminder")', 'the desktop backup reminder');
  await capture(client, 'home-light-desktop-1440-backup-banner');

  await resetPage(client, 'light', desktop);
  await showJourney(client);
  await capture(client, 'journey-light-desktop-1440');

  await openFirstLesson(client);
  await capture(client, 'lesson-detail-light-desktop-1440');
  await clickVisible(client, '.chapter-info-btn');
  await waitFor(client, 'document.querySelector("#chapter-info-title")', 'the lesson detail modal');
  await capture(client, 'lesson-detail-modal-light-desktop-1440');

  await resetPage(client, 'light', { name: 'desktop-1440', width: 1440, height: 900 });
  await showSessionComplete(client);
  await capture(client, 'session-complete-light-desktop-1440');
}

async function run() {
  if (!chromePath) throw new Error('Chrome not found; set CHROME_BIN to its executable path');
  fs.mkdirSync(outputDir, { recursive: true });

  const port = await availablePort();
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: 'ignore' });
  let client;

  try {
    await connectChrome(port);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(item => item.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target');
    client = createClient(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await captureMatrix(client);
    await captureSupplemental(client);

    console.log(`Captured ${viewports.length * themes.length * 4} matrix screenshots plus 5 supplemental screenshots in ${outputDir}`);
  } finally {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    if (client) {
      try {
        await client.send('Browser.close');
      } catch {}
      client.close();
    }
    await Promise.race([exited, sleep(2000)]);
    if (chrome.exitCode === null) chrome.kill();
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

run().catch(error => {
  console.error('Screenshot capture failed:', error);
  process.exitCode = 1;
});
