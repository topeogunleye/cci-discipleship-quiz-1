'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const positioning = source.slice(source.indexOf('  function positionBiblePreview('), source.indexOf('  function updateBiblePreviewText('));
const repositioning = source.slice(source.indexOf('  function repositionActiveBiblePreview('), source.indexOf('  function openBiblePreview('));

function harness({ width = 360, height = 640, controls = [], visual } = {}) {
  const content = {};
  let reads = 0;
  let closes = 0;
  const preview = {
    style: {},
    contains: target => target === content,
    getBoundingClientRect() {
      reads++;
      return { height: Math.min(1200, parseFloat(this.style.maxHeight)) };
    }
  };
  const link = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 20, right: 160, top: 180, bottom: 200 })
  };
  const api = vm.runInNewContext(positioning + repositioning + '\n({positionBiblePreview, repositionActiveBiblePreview})', {
    activeBiblePreview: { preview, link },
    closeBiblePreview() { closes++; },
    document: {
      documentElement: { clientWidth: width },
      querySelectorAll: () => controls.map(rect => ({ getBoundingClientRect: () => rect }))
    },
    window: { innerHeight: height, visualViewport: visual, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) }
  });
  return { api, preview, link, content, reads: () => reads, closes: () => closes };
}

test('scrolling inside a Bible preview does not move or resize its scroll container', () => {
  const h = harness();
  h.api.positionBiblePreview(h.link, h.preview);
  const before = { ...h.preview.style };
  const reads = h.reads();
  h.api.repositionActiveBiblePreview({ type: 'scroll', target: h.content });
  assert.equal(h.reads(), reads);
  assert.deepEqual(h.preview.style, before);
  h.api.repositionActiveBiblePreview({ type: 'scroll', target: {} });
  assert.ok(h.reads() > reads, 'page scrolling must still reposition the preview');
});

test('short mobile screens retain a usable preview when study controls leave only tiny gaps', () => {
  const h = harness({ height: 320, controls: [{ left: 0, right: 360, top: 90, bottom: 260, width: 360, height: 170 }] });
  h.api.positionBiblePreview(h.link, h.preview);
  assert.equal(h.preview.style.maxHeight, '296px');
  assert.equal(h.preview.style.top, '12px');
  assert.equal(h.closes(), 0);
});

test('a usable free region still keeps the preview clear of study controls', () => {
  const h = harness({ controls: [{ left: 0, right: 360, top: 510, bottom: 640, width: 360, height: 130 }] });
  h.api.positionBiblePreview(h.link, h.preview);
  assert.ok(parseFloat(h.preview.style.top) + parseFloat(h.preview.style.maxHeight) <= 502);
  assert.ok(parseFloat(h.preview.style.maxHeight) >= 280);
});

test('preview follows visible viewport offsets and size after mobile toolbar or orientation changes', () => {
  const visual = { offsetLeft: 6, offsetTop: 40, width: 320, height: 340 };
  const h = harness({ visual });
  h.api.repositionActiveBiblePreview({ type: 'resize', target: visual });
  assert.equal(h.preview.style.width, '296px');
  assert.ok(parseFloat(h.preview.style.top) >= 52);
  assert.ok(parseFloat(h.preview.style.top) + parseFloat(h.preview.style.maxHeight) <= 368);
  visual.height = 280;
  h.api.repositionActiveBiblePreview({ type: 'scroll', target: visual });
  assert.ok(parseFloat(h.preview.style.top) + parseFloat(h.preview.style.maxHeight) <= 308);
});
