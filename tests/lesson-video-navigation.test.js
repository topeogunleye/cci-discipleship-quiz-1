'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('tablet watching has a side panel and recording navigation is not duplicated', () => {
  const desktopStart = css.lastIndexOf('@media (min-width: 1024px) {');
  const desktop = css.slice(desktopStart, css.indexOf('@media (min-width: 1280px) {', desktopStart));
  assert.match(desktop, /grid-template-columns: minmax\(0,1fr\) minmax\(280px,30%\)/);
  assert.match(css, /\.lesson-video-main > \.lesson-video-side[^}]*grid-column: 2/);
  assert.doesNotMatch(css, /lesson-video-navigation--(?:top|below)/, 'no hidden duplicate controls');
});

test('video lesson navigation retains visible keyboard focus styling', () => {
  assert.match(css, /\.lesson-video-page button:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});
