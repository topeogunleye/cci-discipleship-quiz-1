(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCITranscripts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMING = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/;

  function toMilliseconds(hours, minutes, seconds, milliseconds) {
    return (((Number(hours) * 60) + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(milliseconds);
  }

  function parseTimedBlocks(source, separator) {
    var text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!text) throw new Error('Transcript is empty.');
    var blocks = text.split(/\n{2,}/), previousStart = -1;
    // The uploaded SRT exporter appends a literal backslash-n as its own block.
    // Ignore only that exact final marker; malformed cues must still fail.
    if (separator === ',' && blocks[blocks.length - 1].trim() === '\\n') blocks.pop();
    if (!blocks.length) throw new Error('Transcript is empty.');
    return blocks.map(function (block, index) {
      var lines = block.split('\n');
      var timingIndex = lines.findIndex(function (line) { return TIMING.test(line); });
      if (timingIndex < 0) throw new Error('Transcript cue ' + (index + 1) + ' has no valid timing line.');
      var timing = lines[timingIndex].match(TIMING);
      var start = toMilliseconds(timing[1], timing[2], timing[3], timing[4]);
      var end = toMilliseconds(timing[5], timing[6], timing[7], timing[8]);
      var cueText = lines.slice(timingIndex + 1).join('\n').trim();
      if (start >= end) throw new Error('Transcript cue ' + (index + 1) + ' has invalid timing.');
      if (start < previousStart) throw new Error('Transcript cues are not in time order.');
      if (!cueText) throw new Error('Transcript cue ' + (index + 1) + ' has no text.');
      previousStart = start;
      return {
        start: start,
        end: end,
        startText: timing[1] + ':' + timing[2] + ':' + timing[3] + '.' + timing[4],
        endText: timing[5] + ':' + timing[6] + ':' + timing[7] + '.' + timing[8],
        text: cueText,
        separator: separator
      };
    });
  }

  function parseSrt(source) {
    return parseTimedBlocks(source, ',');
  }

  function presentationCues(cues) {
    return cues.map(function (cue, index) {
      var text = cue.text.split('\n').map(function (line) {
        var cleaned = line.replace(/^(?:[\t ]*Speaker[\t ]*\d+[\t ]*:[\t ]*)+/i, '');
        // A label on its own line has no spoken content. Remove only that line,
        // keeping other lines and every cue's original timing intact.
        return cleaned !== line && !cleaned.trim() ? null : cleaned;
      }).filter(function (line) { return line !== null; }).join('\n').trim();
      if (!text) throw new Error('Transcript cue ' + (index + 1) + ' has no spoken text after removing a speaker label.');
      return Object.assign({}, cue, { text: text });
    });
  }

  function toWebVtt(source) {
    var cues = presentationCues(parseSrt(source));
    return 'WEBVTT\n\n' + cues.map(function (cue) {
      return cue.startText + ' --> ' + cue.endText + '\n' + cue.text;
    }).join('\n\n') + '\n';
  }

  function parseWebVtt(source) {
    var text = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^WEBVTT[^\n]*\n+/, '').trim();
    if (!text) throw new Error('Transcript is empty.');
    return presentationCues(parseTimedBlocks(text, '.'));
  }

  return { parseSrt: parseSrt, toWebVtt: toWebVtt, parseWebVtt: parseWebVtt };
});
