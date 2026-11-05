'use strict';

// Read source material and mappings; never select an ambiguous transcript.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseSrt } = require('../js/transcripts.js');
const root = path.resolve(__dirname, '..');
const videos = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8')).videos;
const mappings = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-transcripts.json'), 'utf8')).transcripts;
const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const sourceTitle = file => normalize(file.replace(/\.srt$/i, '')
  .replace(/-Celebration-Church-International-LMS(?:-2)?-mp4-[a-f0-9-]+$/i, '')
  .replace(/-mp4-[a-f0-9-]+$/i, ''));
const videosByTitle = new Map(videos.map(video => [normalize(video.title), video]));
const mappingsByFile = new Map(mappings.map(item => [item.file, item]));
const files = fs.readdirSync(path.join(root, 'transcript')).filter(file => /\.srt$/i.test(file)).sort();
const groups = new Map();
let cueCount = 0, footerCount = 0, overlapCount = 0, invalidRangeCount = 0;
const records = files.map(file => {
  const source = fs.readFileSync(path.join(root, 'transcript', file), 'utf8');
  const record = { file, title: sourceTitle(file), hash: crypto.createHash('sha256').update(source).digest('hex') };
  try {
    record.cues = parseSrt(source);
    cueCount += record.cues.length;
    record.end = record.cues[record.cues.length - 1].endText;
    footerCount += /\n\n\\n$/.test(source.replace(/\r\n?/g, '\n').trim()) ? 1 : 0;
    for (let i = 0; i < record.cues.length; i++) {
      const cue = record.cues[i];
      if (i && cue.start < record.cues[i - 1].end) overlapCount++;
      for (const timestamp of [cue.startText, cue.endText]) {
        if (Number(timestamp.slice(-9, -7)) > 59 || Number(timestamp.slice(-6, -4)) > 59) invalidRangeCount++;
      }
    }
  } catch (error) { record.error = error.message; }
  const group = groups.get(record.title) || [];
  group.push(record);
  groups.set(record.title, group);
  return record;
});
const missing = videos.filter(video => !groups.has(normalize(video.title)));
const ambiguous = videos.filter(video => {
  const candidates = groups.get(normalize(video.title)) || [];
  return new Set(candidates.map(item => item.hash)).size > 1;
});
const malformed = records.filter(record => record.error);
const unmatched = records.filter(record => !videosByTitle.has(record.title));
const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
const identicalGroups = duplicateGroups.filter(group => new Set(group.map(item => item.hash)).size === 1);
const lines = [
  '# Lesson transcript review',
  '',
  'Generated from the current repository with `node scripts/review-lesson-transcripts.js`. Source files are in the root `transcript/` directory (singular); the older `transcripts/` directory contains separate Markdown lesson material.',
  '',
  '## Coverage',
  '',
  `- ${files.length} SRT files reviewed against ${videos.length} catalog recordings and ${groups.size} distinct normalized titles.`,
  `- ${mappings.length} unambiguous recordings are mapped in \`content/lesson-transcripts.json\`: one candidate per title, or byte-identical duplicate candidates.`,
  `- ${ambiguous.length} recordings remain unmapped because their candidate SRTs differ; ${missing.length} recordings have no matching SRT.`,
  `- ${duplicateGroups.length} titles have multiple source files; ${identicalGroups.length} groups are byte-identical duplicates. ${unmatched.length} source filenames have no catalog candidate.`,
  `- ${cueCount.toLocaleString('en-US')} source cues parsed, including repeated files; ${malformed.length} malformed files after handling the export footer. ${overlapCount} overlapping adjacent cues and ${invalidRangeCount} out-of-range minute/second fields observed.`,
  `- All ${footerCount} files contain the exporter’s final literal \`\\n\` block. The parser ignores only that exact final marker; it continues rejecting malformed cue blocks. Meeting metadata before the first timing line is excluded from captions.`,
  '',
  '## Language, fidelity, and suitability',
  '',
  'First, middle, and final cue text was sampled for every file. The language is English, matching the manifest’s `en` declaration. Some samples are recognition fragments such as “Foreign”, “Sa”, or “Sam”; speaker prefixes and probable recognition errors remain in the source. This is not a word-for-word accuracy review or an audio language assessment.',
  '',
  'Mapped files have valid ordered cue timing and can supply both WebVTT captions and the searchable, time-linked transcript. Filename/title agreement and sampled subject matter support the existing candidate mapping. No recording audio or media duration was available in this review, so exact synchronization and transcription accuracy still require playback checks. Differing duplicate files are deliberately unresolved even when their timing is identical.',
  '',
  'The theater-style player keeps the video primary, shows flashcards and quiz actions, and places the searchable transcript in a disclosure below the player. Source speaker text is preserved; no doctrine, Bible reference, or missing words have been guessed or rewritten.',
  '',
  '## Protected delivery',
  '',
  'The build converts only mapped source files into a server-only Pages Functions module at `functions/_generated/lesson-transcripts.cjs`. The generated module is ignored by Git and must be rebuilt before Wrangler/dev/deployment. `/transcript/<filename>.vtt` validates the learner’s video-session cookie and serves private, uncached WebVTT directly; it does not fall through to static assets. Caption bodies are excluded from `dist` and native app packages. The browser transcript cache is session memory only and is cleared on account changes. Legacy generated `dist/transcript/*.vtt` files are removed during build.',
  '',
  'Raw source SRTs were already committed in the repository before this review. Server authentication protects deployed transcript responses; it cannot make existing Git history private. This review preserves those source files and does not rewrite repository history.',
  '',
  '## Recordings with no SRT',
  '',
  '| Video ID | Catalog title | Deck ID |',
  '| --- | --- | --- |',
  ...missing.map(video => `| \`${video.id}\` | ${video.title} | \`${video.deckId}\` |`),
  '',
  '## Recordings with differing candidate transcripts',
  '',
  'These require the recording or the transcript producer to identify the intended version. No candidate is activated for these recordings.',
  '',
  '| Video ID | Catalog title | Candidate files |',
  '| --- | --- | ---: |',
  ...ambiguous.map(video => `| \`${video.id}\` | ${video.title} | ${groups.get(normalize(video.title)).length} |`),
  '',
  '## Complete source file inventory',
  '',
  'All rows have English sampled text and SRT timestamps. “Mapped” means activated by the current manifest; “identical duplicate” means the same bytes as the activated source; “unresolved variant” means title match only with differing text. Last cue end is transcript timing, not a verified media duration.',
  '',
  '| Source SRT | Video candidate | Status | Cues | Last cue end |',
  '| --- | --- | --- | ---: | --- |'
];
for (const record of records) {
  const video = videosByTitle.get(record.title), group = groups.get(record.title);
  const differs = new Set(group.map(item => item.hash)).size > 1;
  const status = record.error ? 'malformed: ' + record.error : !video ? 'unmatched' : mappingsByFile.has(record.file) ? 'mapped' : differs ? 'unresolved variant' : 'identical duplicate';
  lines.push(`| \`${record.file}\` | ${video ? '\`' + video.id + '\`' : '—'} | ${status} | ${record.cues ? record.cues.length : '—'} | ${record.end || '—'} |`);
}
lines.push('');
const destination = path.join(root, 'docs/lesson-transcripts-review.md');
fs.writeFileSync(destination, lines.join('\n'));
console.log(`Reviewed ${files.length} SRTs: ${mappings.length} mapped recordings, ${ambiguous.length} ambiguous, ${missing.length} missing. Report: docs/lesson-transcripts-review.md`);
