'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('navigation and sidebar use the approved independent breakpoints', () => {
  const desktopStart = css.lastIndexOf('@media (min-width: 1024px) {');
  const desktop = css.slice(desktopStart, css.indexOf('@media (min-width: 1280px) {', desktopStart));
  assert.match(desktop, /\.lesson-video-topbar > \.lesson-video-navigation/);
  assert.match(desktop, /grid-column: 2; grid-row: 2/);
  const sidebar = css.match(/@media \(min-width: 1280px\) \{\s*\.lesson-video-content\s*\{[^}]+\}/)?.[0] || '';
  assert.match(sidebar, /grid-template-columns: minmax\(0,1fr\) 340px/);
  assert.doesNotMatch(css, /lesson-video-navigation--(?:top|below)/, 'no hidden duplicate controls');
});

test('video lesson navigation retains visible keyboard focus styling', () => {
  assert.match(css, /\.lesson-video-page button:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});
