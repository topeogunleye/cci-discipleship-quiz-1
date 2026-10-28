'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'dist');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('decks/manifest.json'));
const deckText = manifest.map(file => read(path.join('decks', file)).trimEnd()).join('\n\n');
const inlineJson = JSON.stringify(deckText).replace(/</g, '\\u003c');
const devotionalsJson = JSON.stringify(JSON.parse(read('content/devotionals.json'))).replace(/</g, '\\u003c');
const sermonsJson = JSON.stringify(JSON.parse(read('content/sermons.json'))).replace(/</g, '\\u003c');
let html = read('index.html');

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Build input is missing ${search}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

html = replaceOnce(html, '<link rel="stylesheet" href="style.css">', `<style>\n${read('style.css')}\n</style>`);
html = replaceOnce(html, '<script type="application/json" id="starter-fallback">""</script>', `<script type="application/json" id="starter-fallback">${inlineJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="devotionals-fallback">[]</script>', `<script type="application/json" id="devotionals-fallback">${devotionalsJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="sermons-fallback">{"schemaVersion":1,"sermons":[]}</script>', `<script type="application/json" id="sermons-fallback">${sermonsJson}</script>`);
html = replaceOnce(html, '<script src="js/native-bridge.bundle.js"></script>', `<script>\n${read('js/native-bridge.bundle.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/parser.js"></script>', `<script>\n${read('js/parser.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/study.js"></script>', `<script>\n${read('js/study.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/storage.js"></script>', `<script>\n${read('js/storage.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/mobile-study.js"></script>', `<script>\n${read('js/mobile-study.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/sermons.js"></script>', `<script>\n${read('js/sermons.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/sermons-ui.js"></script>', `<script>\n${read('js/sermons-ui.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/app.js"></script>', `<script>\n${read('js/app.js')}\n</script>`);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), html);
for (const file of ['manifest.webmanifest', 'service-worker.js', 'offline.html', 'favicon.ico']) {
  fs.copyFileSync(path.join(root, file), path.join(outputDir, file));
}
for (const directory of ['decks', 'icons', 'content']) {
  fs.cpSync(path.join(root, directory), path.join(outputDir, directory), { recursive: true });
}
console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes)`);
