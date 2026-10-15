/* Deck parser: text -> {decks, errors, warnings}. Also serializes decks back to the same format. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var LETTERS = ['A', 'B', 'C', 'D'];
  var RE_DECK = /^DECK:\s*(.*)$/i;
  var RE_Q = /^(Q)?(\d+)\s*[.)]\s*(.*)$/i;
  var RE_Q_STRICT = /^Q\d+\s*[.)]\s/i;
  var RE_OPT = /^([A-Ha-h])\s*[.)]\s*(.*)$/;
  var RE_ANS = /^ANSWER\s*:\s*(.*)$/i;
  var RE_EXPLANATION = /^EXPLANATION\s*:\s*(.*)$/i;
  var RE_REF = /^REF\s*:\s*(.*)$/i;

  function parseDecks(text, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    var lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    var sections = [], cur = null;

    lines.forEach(function (raw, i) {
      var line = raw.replace(/\s+$/, '');
      var m = RE_DECK.exec(line.trim());
      if (m) {
        cur = { title: m[1].trim(), startLine: i + 1, lines: [] };
        if (!cur.title) {
          cur.title = 'Untitled deck';
          errors.push({ deck: cur.title, line: i + 1, message: 'DECK title is empty (line ' + (i + 1) + ')' });
        }
        sections.push(cur);
      } else if (line.trim()) {
        if (!cur) {
          cur = { title: opts.fallbackTitle || 'Untitled deck', startLine: 1, lines: [], implicit: true };
          sections.push(cur);
          warnings.push({ deck: cur.title, line: i + 1, message: 'No "DECK:" line at the top; using the title "' + cur.title + '"' });
        }
        cur.lines.push({ n: i + 1, t: line });
      } else if (cur) {
        cur.lines.push({ n: i + 1, t: '' });
      }
    });

    if (!sections.length) errors.push({ deck: '', line: 0, message: 'No content found. The file needs a "DECK: <title>" line followed by questions.' });

    var bare = 0;
    var decks = sections.map(function (sec) {
      var blocks = splitBlocks(sec.lines);
      var questions = [], seen = {};
      blocks.forEach(function (b) {
        var r = parseBlock(b, sec.title);
        r.errors.forEach(function (e) { errors.push(e); });
        r.warnings.forEach(function (w) { warnings.push(w); });
        if (!r.q) return;
        if (r.bare) bare++;
        var id = 'q' + r.num;
        if (seen[id]) {
          warnings.push({ deck: sec.title, line: b.start, message: 'Q' + r.num + ' appears more than once in "' + sec.title + '"; the repeat was kept' });
          id = id + '-' + (++seen[id]);
        } else seen[id] = 1;
        r.q.id = id;
        questions.push(r.q);
      });
      if (!questions.length) warnings.push({ deck: sec.title, line: sec.startLine, message: 'Deck "' + sec.title + '" has no readable questions' });
      return { title: sec.title, questions: questions };
    });

    if (bare) warnings.push({ deck: '', line: 0, message: bare + ' question' + (bare === 1 ? '' : 's') + ' start with "N." instead of "Q<n>." (accepted; export writes "Q<n>.")' });
    return { decks: decks, errors: errors, warnings: warnings };
  }

  // Blocks are separated by blank lines; a "Q<n>." line also starts a new block if the blank line is missing.
  function splitBlocks(lines) {
    var blocks = [], b = null;
    lines.forEach(function (l) {
      if (!l.t.trim()) { b = null; return; }
      if (b && RE_Q_STRICT.test(l.t) && b.lines.some(function (x) { return RE_ANS.test(x.t) || RE_OPT.test(x.t); })) b = null;
      if (!b) { b = { start: l.n, lines: [] }; blocks.push(b); }
      b.lines.push(l);
    });
    return blocks;
  }

  function parseBlock(b, deck) {
    var errors = [], warnings = [], first = b.lines[0];
    var m = RE_Q.exec(first.t.trim());
    if (!m) {
      errors.push({ deck: deck, line: first.n, message: 'Unreadable block at line ' + first.n + ': does not start with "Q<n>." — "' + clip(first.t) + '"' });
      return { errors: errors, warnings: warnings };
    }
    var num = parseInt(m[2], 10), label = 'Q' + num, bare = !m[1];
    var qText = [m[3]], opts = {}, order = [], curOpt = null, answerRaw = null, answerLine = 0, explanation = '', ref = '', extra = [], phase = 'q';

    b.lines.slice(1).forEach(function (l) {
      var t = l.t.trim(), a = RE_ANS.exec(t), o = RE_OPT.exec(t);
      if (phase === 'done') {
        var e = RE_EXPLANATION.exec(t), r = RE_REF.exec(t);
        if (e) { explanation = e[1].trim(); return; }
        if (r) { ref = r[1].trim(); return; }
        extra.push(l.n); return;
      }
      if (a) { answerRaw = a[1].trim(); answerLine = l.n; phase = 'done'; curOpt = null; return; }
      if (o && (phase === 'o' || o[1].toUpperCase() === 'A')) {
        var L = o[1].toUpperCase();
        phase = 'o';
        if (opts[L] !== undefined) errors.push({ deck: deck, line: l.n, message: label + ' has option ' + L + ' twice (line ' + l.n + ')' });
        opts[L] = o[2].trim(); order.push(L); curOpt = L; return;
      }
      if (phase === 'q') qText.push(t); else if (curOpt) opts[curOpt] += ' ' + t;
    });

    var question = qText.join(' ').replace(/\s+/g, ' ').trim();
    var loc = ' (line ' + first.n + ', deck "' + deck + '")';
    var bad = false;
    if (!question) { errors.push({ deck: deck, line: first.n, message: label + ' has no question text' + loc }); bad = true; }
    var missing = LETTERS.filter(function (L) { return opts[L] === undefined; });
    var have = LETTERS.length - missing.length;
    if (missing.length) {
      errors.push({ deck: deck, line: first.n, message: label + ' has only ' + have + ' option' + (have === 1 ? '' : 's') + ' (missing ' + missing.join(', ') + ')' + loc });
      bad = true;
    }
    order.forEach(function (L) { if (LETTERS.indexOf(L) < 0) { errors.push({ deck: deck, line: first.n, message: label + ' has option ' + L + '; only A–D are supported' + loc }); bad = true; } });
    LETTERS.forEach(function (L) { if (opts[L] !== undefined && !opts[L]) { errors.push({ deck: deck, line: first.n, message: label + ' option ' + L + ' is empty' + loc }); bad = true; } });
    var ans = null;
    if (answerRaw === null) { errors.push({ deck: deck, line: first.n, message: label + ' is missing ANSWER' + loc }); bad = true; }
    else {
      var am = /^([A-Da-d])\.?$/.exec(answerRaw);
      if (!am) { errors.push({ deck: deck, line: answerLine, message: label + ' has an invalid ANSWER "' + clip(answerRaw) + '" (use A, B, C or D) (line ' + answerLine + ')' }); bad = true; }
      else ans = am[1].toUpperCase();
    }
    if (extra.length) warnings.push({ deck: deck, line: extra[0], message: label + ' has extra text after ANSWER (line ' + extra[0] + '); ignored' });
    if (bad) return { errors: errors, warnings: warnings };
    return { q: { id: '', question: question, options: LETTERS.map(function (L) { return opts[L]; }), answer: ans, explanation: explanation, ref: ref }, num: num, bare: bare, errors: errors, warnings: warnings };
  }

  function clip(s) { s = String(s).trim(); return s.length > 60 ? s.slice(0, 57) + '…' : s; }

  function flat(s) { return String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim(); }

  function serializeDeck(deck) {
    var out = ['DECK: ' + flat(deck.title), ''];
    deck.cards = deck.cards || deck.questions || [];
    deck.cards.forEach(function (c, i) {
      out.push('Q' + (i + 1) + '. ' + flat(c.question));
      LETTERS.forEach(function (L, k) { out.push(L + '. ' + flat(c.options[k])); });
      out.push('ANSWER: ' + c.answer);
      if (flat(c.explanation)) out.push('EXPLANATION: ' + flat(c.explanation));
      if (flat(c.ref)) out.push('REF: ' + flat(c.ref));
      out.push('');
    });
    return out.join('\n');
  }

  function serializeDecks(list) { return list.map(serializeDeck).join('\n').replace(/\n+$/, '\n'); }

  return { parseDecks: parseDecks, serializeDeck: serializeDeck, serializeDecks: serializeDecks, LETTERS: LETTERS };
});
