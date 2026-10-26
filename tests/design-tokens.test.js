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

test('hint and text tokens meet contrast targets in light and dark themes', () => {
  const darkHint = styles.match(/:root\[data-theme="dark"\]\s*\{[^}]*--faint:\s*(#[\da-f]{6});/i);
  assert.ok(darkHint, 'Expected the dark hint token');
  assert.ok(contrastRatio(darkHint[1], '#0F1013') >= 4.5, 'Dark hint text must meet WCAG AA on the page background');
  assert.ok(contrastRatio(darkHint[1], '#1A1C22') >= 4.5, 'Dark hint text must meet WCAG AA on the card surface');
  assert.ok(contrastRatio('#3F424D', '#F3F4F6') >= 4.5, 'Light body text must meet WCAG AA');
  assert.ok(contrastRatio('#F4F5F7', '#0F1013') >= 4.5, 'Dark body and large text must meet WCAG AA');
  assert.ok(contrastRatio('#F4F5F7', '#1A1C22') >= 3, 'Dark large text must meet WCAG AA');
});

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

test('sunrise gradient text uses white ink with WCAG AA contrast', () => {
  const gradient = styles.match(/--grad-hero-sunrise:\s*linear-gradient\([^;]*\);/);
  assert.ok(gradient, 'Expected the sunrise hero gradient token');
  const stops = gradient[0].match(/#[\da-f]{6}/gi) || [];
  assert.equal(stops.length, 2, 'The sunrise gradient must define two stops');
  for (const stop of stops) {
    assert.ok(
      contrastRatio('#FFFFFF', stop) >= 4.5,
      `White text contrast on crimson gradient stop ${stop} must be at least 4.5:1`
    );
  }
  assert.match(styles, /\.hero-today,[\s\S]*?\.picker-tile-all[\s\S]*?\{[^}]*color:\s*#FFFFFF/i, 'Expected white text on crimson hero surfaces');
});

test('dark desktop feedback and the active navigation item retain accessible contrast', () => {
  const requiredTokens = [
    '--desktop-quiz-correct-bg: #12402A;',
    '--desktop-quiz-correct-color: #6EE0A2;',
    '--desktop-quiz-wrong-bg: #4A1620;',
    '--desktop-quiz-wrong-color: #FF9AA6;',
    '--desktop-reflection-bg: #2A2D36;',
    '--desktop-step-bg: #12402A;'
  ];
  for (const token of requiredTokens) assert.ok(styles.includes(token), `Missing ${token}`);

  assert.ok(contrastRatio('#6EE0A2', '#12402A') >= 4.5, 'Dark correct state must meet WCAG AA');
  assert.ok(contrastRatio('#FF9AA6', '#4A1620') >= 4.5, 'Dark incorrect state must meet WCAG AA');
  assert.ok(contrastRatio('#FFFFFF', '#B5173A') >= 4.5, 'Active navigation text must meet WCAG AA');
  assert.ok(contrastRatio('#FFFFFF', '#167A3F') >= 4.5 && contrastRatio('#FFFFFF', '#178046') >= 4.5, 'Correct answer fill must meet WCAG AA with white text');
  assert.match(styles, /\.desktop-sidebar \.desktop-nav-item\.active,[\s\S]*?background: var\(--accent\)/);
});
