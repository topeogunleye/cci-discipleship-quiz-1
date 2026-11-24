'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('video navigation defaults to below-player controls and keeps the desktop copy hidden', () => {
  assert.match(css, /\.lesson-video-navigation--top\s*\{\s*display:\s*none\s*\}/);
  assert.match(css, /\.lesson-video-navigation--below\s*\{\s*display:\s*flex\s*\}/);
  assert.match(css, /\.lesson-video-navigation--below\s*\{\s*display:\s*grid\s*\}/);
  assert.match(css, /\.lesson-video-topbar-right\s*\{[^}]*grid-column:\s*2;\s*grid-row:\s*2/);
  const mobileStart = css.lastIndexOf('@media(max-width:700px){.lesson-video-navigation');
  assert.notEqual(mobileStart, -1, 'the mobile grid breakpoint should remain present');
  const mobileRules = css.slice(mobileStart, css.indexOf('\n', mobileStart));
  assert.match(mobileRules, /\.lesson-video-navigation--top\{display:none\}/, 'the mobile grid rule must not reveal the desktop copy');
});

test('video navigation switches placements at the 1280px boundary', () => {
  const start = css.indexOf('@media(min-width:1280px){');
  assert.notEqual(start, -1, 'the desktop layout should begin at 1280px');
  const desktopRules = css.slice(start, css.indexOf('\n', start));
  assert.match(desktopRules, /\.lesson-video-navigation--top\{display:flex/);
  assert.match(desktopRules, /\.lesson-video-navigation--below\{display:none\}/);
  assert.match(desktopRules, /\.lesson-video-navigation--top \.lesson-video-nav-button\{[^}]*min-height:48px/);
  assert.match(desktopRules, /\.lesson-video-top-title\{position:absolute/);
});

test('video lesson navigation retains visible keyboard focus styling', () => {
  assert.match(css, /\.lesson-video-page button:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});
