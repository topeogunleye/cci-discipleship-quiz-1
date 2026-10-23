const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test('white text meets WCAG AA contrast across all deck gradient stops', () => {
  const gradients = [...styles.matchAll(/--deck-grad-(\d+):\s*(linear-gradient\([^;]*\));/g)];
  assert.equal(gradients.length, 12, 'Expected one gradient token for each deck');

  for (const [, deck, gradient] of gradients) {
    const stops = gradient.match(/#[\da-f]{6}/gi) || [];
    assert.equal(stops.length, 2, `Deck ${deck} must define two gradient stops`);
    for (const stop of stops) {
      assert.ok(
        contrastRatio('#FFFFFF', stop) >= 4.5,
        `White text contrast on deck ${deck} gradient stop ${stop} must be at least 4.5:1`
      );
    }
  }
});

test('sunrise gradient text uses dark ink with WCAG AA contrast', () => {
  const gradient = styles.match(/--grad-hero-sunrise:\s*linear-gradient\([^;]*\);/);
  assert.ok(gradient, 'Expected the sunrise hero gradient token');
  const stops = gradient[0].match(/#[\da-f]{6}/gi) || [];
  assert.equal(stops.length, 2, 'The sunrise gradient must define two stops');
  for (const stop of stops) {
    assert.ok(
      contrastRatio('#241126', stop) >= 4.5,
      `Dark text contrast on sunrise gradient stop ${stop} must be at least 4.5:1`
    );
  }

  for (const selector of [
    /\.hero-today\s*\{[^}]*color:\s*#241126;/,
    /\.hero-today \.hero-meta,[\s\S]*?\.hero-card-desc\s*\{\s*color:\s*#241126;/,
    /\.picker-tile-all\s*\{[^}]*color:\s*#241126;/,
    /\.picker-tile-all \.picker-tile-title\s*\{[^}]*color:\s*#241126;/,
    /\.streak-hero-card\s*\{[^}]*color:\s*#241126;/,
    /\.desktop-featured-devotion\s*\{[^}]*color:\s*#241126;/
  ]) {
    assert.match(styles, selector, `Expected accessible sunrise text styling matching ${selector}`);
  }
});

test('dark desktop feedback and the active navigation item retain accessible contrast', () => {
  const requiredTokens = [
    '--desktop-quiz-correct-bg: #14402C;',
    '--desktop-quiz-correct-color: #5FD39A;',
    '--desktop-quiz-wrong-bg: #4A1830;',
    '--desktop-quiz-wrong-color: #FF8FAB;',
    '--desktop-reflection-bg: #2D2A70;',
    '--desktop-step-bg: #14402C;'
  ];
  for (const token of requiredTokens) assert.ok(styles.includes(token), `Missing ${token}`);

  assert.ok(contrastRatio('#5FD39A', '#14402C') >= 4.5, 'Dark correct state must meet WCAG AA');
  assert.ok(contrastRatio('#FF8FAB', '#4A1830') >= 4.5, 'Dark incorrect state must meet WCAG AA');
  assert.ok(contrastRatio('#B5173A', '#FFFFFF') >= 4.5, 'Active navigation text must meet WCAG AA');
  assert.match(styles, /\.desktop-sidebar \.desktop-nav-item\.active,[\s\S]*?background: #FFFFFF;/);
});
