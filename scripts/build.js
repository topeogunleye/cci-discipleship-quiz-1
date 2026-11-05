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
const lessonVideosJson = JSON.stringify(JSON.parse(read('content/lesson-videos.json'))).replace(/</g, '\\u003c');
const lessonTranscriptsJson = JSON.stringify(JSON.parse(read('content/lesson-transcripts.json'))).replace(/</g, '\\u003c');
let html = read('index.html');

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Build input is missing ${search}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

function normalizeTextFile(file) {
  const content = fs.readFileSync(file, 'utf8').replace(/[ \t]+$/gm, '');
  fs.writeFileSync(file, content);
}

function normalizeTextFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) normalizeTextFiles(file);
    else if (/\.(?:m?js|css)$/i.test(entry.name)) normalizeTextFile(file);
  }
}

normalizeTextFile(path.join(root, 'js/supabase.bundle.js'));

html = replaceOnce(html, '<link rel="stylesheet" href="style.css">', `<style>\n${read('style.css')}\n</style>`);
html = replaceOnce(html, '<script type="application/json" id="starter-fallback">""</script>', `<script type="application/json" id="starter-fallback">${inlineJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="devotionals-fallback">[]</script>', `<script type="application/json" id="devotionals-fallback">${devotionalsJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="sermons-fallback">{"schemaVersion":1,"sermons":[]}</script>', `<script type="application/json" id="sermons-fallback">${sermonsJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="lesson-videos-fallback">{"schemaVersion":1,"videos":[]}</script>', `<script type="application/json" id="lesson-videos-fallback">${lessonVideosJson}</script>`);
html = replaceOnce(html, '<script type="application/json" id="lesson-transcripts-fallback">{"schemaVersion":1,"transcripts":[]}</script>', `<script type="application/json" id="lesson-transcripts-fallback">${lessonTranscriptsJson}</script>`);
html = replaceOnce(html, '<script src="js/native-bridge.bundle.js"></script>', `<script>\n${read('js/native-bridge.bundle.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/progress-sync.js"></script>', `<script>\n${read('js/progress-sync.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/account.js"></script>', `<script>\n${read('js/account.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/parser.js"></script>', `<script>\n${read('js/parser.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/study.js"></script>', `<script>\n${read('js/study.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/storage.js"></script>', `<script>\n${read('js/storage.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/mobile-study.js"></script>', `<script>\n${read('js/mobile-study.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/transcripts.js"></script>', `<script>\n${read('js/transcripts.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/sermons.js"></script>', `<script>\n${read('js/sermons.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/sermons-ui.js"></script>', `<script>\n${read('js/sermons-ui.js')}\n</script>`);
html = replaceOnce(html, '<script src="js/app.js"></script>', `<script>\n${read('js/app.js')}\n</script>`);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), html);
for (const file of ['manifest.webmanifest', 'service-worker.js', 'offline.html', 'favicon.ico', 'style.css']) {
  fs.copyFileSync(path.join(root, file), path.join(outputDir, file));
}
for (const directory of ['decks', 'icons', 'content', 'js']) {
  fs.cpSync(path.join(root, directory), path.join(outputDir, directory), { recursive: true });
}
const { toWebVtt } = require('../js/transcripts.js');
const transcriptManifest = JSON.parse(read('content/lesson-transcripts.json'));
const videoCatalog = JSON.parse(read('content/lesson-videos.json'));
const videoIds = new Set(videoCatalog.videos.map(video => video.id));
const mappedVideos = new Set();
const mappedFiles = new Set();
for (const item of transcriptManifest.transcripts) {
  if (!videoIds.has(item.videoId) || mappedVideos.has(item.videoId)) throw new Error(`Invalid or duplicate transcript video mapping: ${item.videoId}`);
  if (typeof item.file !== 'string' || path.basename(item.file) !== item.file || !/^[A-Za-z0-9._-]+\.srt$/i.test(item.file) || mappedFiles.has(item.file)) {
    throw new Error(`Invalid or duplicate transcript filename: ${item.file}`);
  }
  const source = path.join(root, 'transcript', item.file);
  const destination = path.join(outputDir, 'transcript', item.file.replace(/\.srt$/i, '.vtt'));
  if (!fs.existsSync(source)) throw new Error(`Mapped transcript is missing: ${item.file}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, toWebVtt(fs.readFileSync(source, 'utf8')));
  mappedVideos.add(item.videoId);
  mappedFiles.add(item.file);
}
normalizeTextFile(path.join(outputDir, 'style.css'));
normalizeTextFiles(path.join(outputDir, 'js'));
console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes)`);
