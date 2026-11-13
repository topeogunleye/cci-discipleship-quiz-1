'use strict';

// Read source material and mappings; never select an ambiguous transcript.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseSrt } = require('../js/transcripts.js');
const { compileLessonTranscripts } = require('./lesson-transcripts.js');
const root = path.resolve(__dirname, '..');
const videos = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-videos.json'), 'utf8')).videos;
const mappings = JSON.parse(fs.readFileSync(path.join(root, 'content/lesson-transcripts.json'), 'utf8')).transcripts;
// Validate every explicit selection and its duplicate evidence before updating
// the report. This compiles in memory only and never selects new mappings.
compileLessonTranscripts(root);
const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const sourceTitle = file => normalize(file.replace(/\.srt$/i, '')
  .replace(/-Celebration-Church-International-LMS(?:-2)?-mp4-[a-f0-9-]+$/i, '')
  .replace(/-mp4-[a-f0-9-]+$/i, ''));
const videosByTitle = new Map(videos.map(video => [normalize(video.title), video]));
const mappingsByFile = new Map(mappings.map(item => [item.file, item]));
const mappingsByVideo = new Map(mappings.map(item => [item.videoId, item]));
const files = fs.readdirSync(path.join(root, 'transcript')).filter(file => /\.srt$/i.test(file)).sort();
const groups = new Map();
let cueCount = 0, footerCount = 0, overlapCount = 0, invalidRangeCount = 0;
const records = files.map(file => {
  const source = fs.readFileSync(path.join(root, 'transcript', file), 'utf8');
  const record = { file, title: sourceTitle(file), hash: crypto.createHash('sha256').update(source).digest('hex'), selectionHash: crypto.createHash('sha256').update(source.replace(/\r\n?/g, '\n')).digest('hex') };
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
const differingCandidates = videos.filter(video => {
  const candidates = groups.get(normalize(video.title)) || [];
  return new Set(candidates.map(item => item.hash)).size > 1;
});
const unresolved = differingCandidates.filter(video => !mappingsByVideo.has(video.id));
const recordsByFile = new Map(records.map(record => [record.file, record]));
const confirmedMappings = mappings.filter(item => item.selection && item.selection.basis === 'user-confirmed');
const metadataMappings = mappings.filter(item => item.selection && item.selection.basis === 'metadata-only-duplicates');
for (const item of confirmedMappings) {
  const source = recordsByFile.get(item.file);
  if (!source || source.error || source.selectionHash !== item.selection.sourceSha256) {
    throw new Error(`User-confirmed transcript source does not match its recorded SHA-256: ${item.file}`);
  }
}
function compareCuePayload(left, right) {
  let textDifferences = 0, timingDifferences = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index], b = right[index];
    if (!a || !b || a.text !== b.text) textDifferences++;
    if (!a || !b || a.start !== b.start || a.end !== b.end) timingDifferences++;
  }
  return { textDifferences, timingDifferences };
}
const malformed = records.filter(record => record.error);
const unmatched = records.filter(record => !videosByTitle.has(record.title));
const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
const identicalGroups = duplicateGroups.filter(group => new Set(group.map(item => item.hash)).size === 1);
const mappedPrefixCounts = mappings.map(item => recordsByFile.get(item.file).cues.reduce((count, cue) => count + (cue.text.match(/^[\t ]*Speaker[\t ]*\d+[\t ]*:[\t ]*/gim) || []).length, 0));
const presentationPrefixCount = mappedPrefixCounts.reduce((count, value) => count + value, 0);
const lines = [
  '# Lesson transcript review',
  '',
  'Generated from the current repository with `node scripts/review-lesson-transcripts.js`. Source files are in the root `transcript/` directory (singular); the older `transcripts/` directory contains separate Markdown lesson material.',
  '',
  '## Coverage',
  '',
  `- ${files.length} SRT files reviewed against ${videos.length} catalog recordings and ${groups.size} distinct normalized titles.`,
  `- ${mappings.length} recordings are mapped in \`content/lesson-transcripts.json\`: ${mappings.length - confirmedMappings.length - metadataMappings.length} unambiguous recordings, ${metadataMappings.length} metadata-only duplicate selections, and ${confirmedMappings.length} explicit user-confirmed wording selection. Unambiguous means one candidate per title, or byte-identical duplicate candidates.`,
  `- ${differingCandidates.length} recordings have differing candidate SRTs; ${differingCandidates.length - unresolved.length} have explicit selections and ${unresolved.length} remain unmapped. ${missing.length} recordings have no matching timed SRT.`,
  `- ${duplicateGroups.length} titles have multiple source files; ${identicalGroups.length} groups are byte-identical duplicates. ${unmatched.length} source filenames have no catalog candidate.`,
  `- ${cueCount.toLocaleString('en-US')} source cues parsed, including repeated files; ${malformed.length} malformed files after handling the export footer. ${overlapCount} overlapping adjacent cues and ${invalidRangeCount} out-of-range minute/second fields observed.`,
  `- ${footerCount} of ${files.length} files contain the exporter’s final literal \`\\n\` block. The parser ignores only that exact final marker; it continues rejecting malformed cue blocks. Meeting metadata before the first timing line is excluded from captions.`,
  `- Presentation removes ${presentationPrefixCount.toLocaleString('en-US')} generic numbered speaker prefixes across ${mappedPrefixCounts.filter(count => count > 0).length} mapped recordings. Raw SRT text remains unchanged; source review and duplicate comparisons still use the original cues.`,
  '',
  '## Language, fidelity, and suitability',
  '',
  'First, middle, and final cue text was sampled for every file. The language is English, matching the manifest’s `en` declaration. Some samples are recognition fragments such as “Foreign”, “Sa”, or “Sam”; speaker prefixes and probable recognition errors remain in the source. This is not a word-for-word accuracy review or an audio language assessment.',
  '',
  'Mapped files have valid ordered cue timing and can supply both WebVTT captions and the searchable, time-linked transcript. Filename/title agreement and sampled subject matter support the unambiguous mappings; explicitly enabled metadata-only duplicates and the user-confirmed wording selection are recorded separately below. For metadata-only duplicates, the build verifies that all differences are confined to exporter metadata before the first cue; all spoken text and timestamps must match. No recording audio or media duration was available to this repository review, so exact synchronization and transcription accuracy still require playback checks. Matching timing alone does not resolve differing spoken text.',
  '',
  'The theater-style player keeps the video primary, shows flashcards and quiz actions, and places the searchable transcript in a disclosure below the player. Generated captions and browser transcript presentation remove only generic numbered speaker prefixes at the start of cue lines. Spoken mentions, real names, punctuation, cue order, and timestamps are preserved. Original SRTs and raw parsing retain source labels for review; no doctrine, Bible reference, or missing words have been guessed or rewritten.',
  '',
  '## Protected delivery',
  '',
  'The build converts only mapped source files into a server-only Pages Functions module at `functions/_generated/lesson-transcripts.cjs`. The generated module is ignored by Git and must be rebuilt before Wrangler/dev/deployment. `/transcript/<filename>.vtt` validates the learner’s video-session cookie and serves private, uncached WebVTT directly; it does not fall through to static assets. Caption bodies are excluded from `dist` and native app packages. The browser transcript cache is session memory only and is cleared on account changes. Legacy generated `dist/transcript/*.vtt` files are removed during build.',
  '',
  'Raw source SRTs are repository source material, excluded from published build assets. Existing source files may also appear in Git history. Server authentication protects deployed transcript responses; it cannot make existing Git history private. This review preserves all source files as supplied and does not rewrite repository history.',
  '',
  '## User-confirmed selections',
  '',
  'These selections apply only to the exact manifest filename and source hash. Selection fingerprints use UTF-8 text with line endings normalized to LF so Git checkout conventions do not change approval; inventory duplicate checks still compare original source bytes. They do not activate any other candidate or establish measured audio synchronization.',
  ''
];
for (const item of confirmedMappings) {
  const source = recordsByFile.get(item.file);
  lines.push(`### \`${item.videoId}\``, '',
    `- Selected source: \`${item.file}\`.`,
    `- SHA-256: \`${item.selection.sourceSha256}\`.`,
    `- Confirmation: ${item.selection.note}`,
    `- ${source.cues.length} timed cues, from ${source.cues[0].startText} to ${source.end}.`,
    '- Other candidates remain unselected:');
  for (const candidate of groups.get(source.title)) {
    if (candidate.file === source.file) continue;
    const comparison = compareCuePayload(source.cues, candidate.cues || []);
    const samePayload = !comparison.textDifferences && !comparison.timingDifferences;
    lines.push(`  - \`${candidate.file}\`: ${samePayload ? `the same ${source.cues.length} timed cue payloads (timestamps and text), but different raw source bytes` : `${comparison.textDifferences} cue text differences and ${comparison.timingDifferences} timing differences`}; not mapped.`);
  }
  lines.push('');
}
lines.push(
  '## Metadata-only duplicate selections',
  '',
  'The user authorized enabling these recordings after comparison showed identical cue text and timestamps. Only the pre-cue exporter metadata differs. One deterministic source is mapped per recording; all alternatives are listed in the manifest and checked at build time. Original SRT files remain unchanged.',
  '',
  '| Video ID | Selected source | Equivalent alternatives |',
  '| --- | --- | ---: |',
  ...metadataMappings.map(item => `| \`${item.videoId}\` | \`${item.file}\` | ${item.selection.equivalentFiles.length} |`),
  ''
);
lines.push(
  '## Recordings with no SRT',
  '',
  ...(missing.length ? [
    '| Video ID | Catalog title | Deck ID |',
    '| --- | --- | --- |',
    ...missing.map(video => `| \`${video.id}\` | ${video.title} | \`${video.deckId}\` |`)
  ] : [`None. All ${videos.length} catalog recordings have an explicit timed transcript mapping.`]),
  '',
  '## Recordings with differing candidate transcripts',
  '',
  unresolved.length ? 'The following unresolved recordings require the recording or the transcript producer to identify the intended version. No candidate is activated for these recordings.' : `No unresolved candidate conflicts remain. Raw source differences are covered by the explicit wording selection or verified metadata-only selections above. ${missing.length ? `${missing.length} recordings with no timed source remain unmapped.` : 'Every catalog recording now has an explicit timed transcript mapping.'}`,
  '',
  '| Video ID | Catalog title | Candidate files |',
  '| --- | --- | ---: |',
  ...unresolved.map(video => `| \`${video.id}\` | ${video.title} | ${groups.get(normalize(video.title)).length} |`),
  '',
  '## Complete source file inventory',
  '',
  'All rows have English sampled text and SRT timestamps. “Mapped” means activated by the current manifest; user-confirmed selections are labeled explicitly. “Identical duplicate” means the same bytes as the activated source. Other candidates for a user-confirmed recording are unselected, even if their timed cue payloads match; “unresolved variant” means title match only for a recording with no selected source. Last cue end is transcript timing, not a verified media duration.',
  '',
  '| Source SRT | Video candidate | Status | Cues | Last cue end |',
  '| --- | --- | --- | ---: | --- |'
);
for (const record of records) {
  const video = videosByTitle.get(record.title), group = groups.get(record.title);
  const differs = new Set(group.map(item => item.hash)).size > 1;
  const directMapping = mappingsByFile.get(record.file), selectedMapping = video && mappingsByVideo.get(video.id);
  const status = record.error ? 'malformed: ' + record.error : !video ? 'unmatched' : directMapping ? (directMapping.selection ? (directMapping.selection.basis === 'metadata-only-duplicates' ? 'mapped — metadata equivalent' : 'mapped — user-confirmed') : 'mapped') : differs ? (selectedMapping ? (selectedMapping.selection && selectedMapping.selection.basis === 'metadata-only-duplicates' ? 'unselected metadata duplicate' : 'unselected variant') : 'unresolved variant') : 'identical duplicate';
  lines.push(`| \`${record.file}\` | ${video ? '\`' + video.id + '\`' : '—'} | ${status} | ${record.cues ? record.cues.length : '—'} | ${record.end || '—'} |`);
}
lines.push('');
const destination = path.join(root, 'docs/lesson-transcripts-review.md');
fs.writeFileSync(destination, lines.join('\n'));
console.log(`Reviewed ${files.length} SRTs: ${mappings.length} mapped recordings (${confirmedMappings.length} user-confirmed), ${differingCandidates.length} differing-candidate groups, ${unresolved.length} unresolved, ${missing.length} missing. Report: docs/lesson-transcripts-review.md`);
