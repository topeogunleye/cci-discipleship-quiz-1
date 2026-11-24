const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const catalog = require('../content/lesson-videos.json').videos;

test('reordering preserves every original video field and section assignment', () => {
  const originalFields = catalog.map(({ group, ...video }) => video).sort((a, b) => a.id.localeCompare(b.id));
  const canonical = JSON.stringify(originalFields.map(video => Object.fromEntries(Object.entries(video).sort(([a], [b]) => a.localeCompare(b)))));
  assert.equal(crypto.createHash('sha256').update(canonical).digest('hex'), '9fc8c662b872b4553649edd83edf756cb8400103e53f2e45ca6e0e623f7a0547');
  assert.equal(new Set(catalog.map(video => video.group).filter(Boolean)).size, 18);
});

test('group headings preserve global video indices, active selection and escaping', () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const helper = source.slice(source.indexOf('  function lessonVideoGroups('), source.indexOf('  function cardMatchesVideo('));
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const render = vm.runInNewContext(helper + ';lessonVideoGroups', { esc });
  const videos = [{ title: 'One', group: 'First & next' }, { title: 'Two', group: 'First & next' }, { title: '<Three>', group: 'Last' }];
  const html = render(videos, 2);
  assert.equal((html.match(/<h3/g) || []).length, 2);
  assert.deepEqual([...html.matchAll(/data-index="(\d+)"/g)].map(match => Number(match[1])), [0, 1, 2]);
  assert.match(html, /data-index="2" aria-current="true"/);
  assert.match(html, /First &amp; next/);
  assert.match(html, /3\. &lt;Three&gt;/);
  assert.equal((html.match(/<details /g) || []).length, 2);
  assert.equal((html.match(/class="lesson-video-group" open/g) || []).length, 1);
  assert.match(html, /<details class="lesson-video-group" open><summary><h3>Last/);
  assert.match(html, /lesson-video-current-label">Current/);
  assert.doesNotMatch(render(videos.map(({ title }) => ({ title })), 0), /<h3|lesson-video-group/);
});

test('catalog follows the approved order in all twelve sections', () => {
  const expected = {
  "Soteriology": [
    "section-01-original-sin",
    "section-01-born-again",
    "section-01-repentance",
    "section-01-righteousness",
    "section-01-justification"
  ],
  "Soteriology II": [
    "section-02-propitiation",
    "section-02-redemption",
    "section-02-atonement",
    "section-02-assurance",
    "section-02-those-who-never-heard-the-gospel"
  ],
  "Predestination & Trinity": [
    "section-03-trinity-i",
    "section-03-trinity-ii",
    "section-03-trinity-iii",
    "section-03-predestination-i",
    "section-03-predestination-ii"
  ],
  "Christology": [
    "section-04-jesus-son-of-god-i",
    "section-04-jesus-son-of-god-ii",
    "section-04-jesus-son-of-god-iii",
    "section-04-jesus-son-of-man-i",
    "section-04-jesus-son-of-man-ii",
    "section-04-jesus-son-of-man-iii"
  ],
  "Christian Conduct": [
    "section-05-that-old-man",
    "section-05-how-to-overcome-habits-i",
    "section-05-how-to-overcome-habits-ii",
    "section-05-how-to-overcome-habits-iii",
    "section-05-how-to-overcome-habits-iv"
  ],
  "Prayer": [
    "section-06-school-of-prayer-i",
    "section-06-school-of-prayer-ii",
    "section-06-school-of-prayer-iii",
    "section-06-school-of-prayer-iv",
    "section-06-school-of-prayer-ix",
    "section-06-school-of-prayer-v",
    "section-06-school-of-prayer-vi",
    "section-06-school-of-prayer-vii",
    "section-06-school-of-prayer-viii",
    "section-06-school-of-prayer-x"
  ],
  "Bible Experience I": [
    "section-07-having-a-biblical-worldview-i",
    "section-07-having-a-biblical-worldview-ii",
    "section-07-introduction-to-biblical-interpretation-i",
    "section-07-introduction-to-biblical-interpretation-ii",
    "section-07-introduction-to-biblical-interpretation-iii",
    "section-07-hermeneutics-part-1-i",
    "section-07-hermeneutics-part-1-ii",
    "section-07-hermeneutics-part-2-i",
    "section-07-hermeneutics-part-2-ii"
  ],
  "Bible Experience II": [
    "section-08-the-inspiration-of-scriptures",
    "section-08-can-i-understand-the-bible-on-my-own",
    "section-08-did-old-testament-authors-know-jesus",
    "section-08-jesus-and-women"
  ],
  "Evangelism": [
    "section-09-how-to-evangelize",
    "section-09-muslims-i",
    "section-09-muslims-ii",
    "section-09-muslims-iii",
    "section-09-jehova-s-witness-i",
    "section-09-jehova-s-witness-ii",
    "section-09-jehova-s-witness-iii",
    "section-09-jehova-s-witness-iv",
    "section-09-new-age-spirituality-i",
    "section-09-new-age-spirituality-ii",
    "section-09-new-age-spirituality-iii",
    "section-09-new-age-spirituality-iv",
    "section-09-new-age-spirituality-v",
    "section-09-new-age-spirituality-vi",
    "section-09-mormons-i",
    "section-09-mormons-ii",
    "section-09-mormons-iii"
  ],
  "Apologetics": [
    "section-10-is-there-a-god-i",
    "section-10-is-there-a-god-ii",
    "section-10-is-there-a-god-iii",
    "section-10-did-jesus-rise-from-the-dead-i",
    "section-10-did-jesus-rise-from-the-dead-ii",
    "section-10-did-jesus-rise-from-the-dead-iii",
    "section-10-did-jesus-rise-from-the-dead-iv",
    "section-10-did-jesus-rise-from-the-dead-v",
    "section-10-is-the-bible-true-i",
    "section-10-is-the-bible-true-ii",
    "section-10-theodicy-i",
    "section-10-theodicy-ii",
    "section-10-theodicy-iii",
    "section-10-theodicy-iv"
  ],
  "Believers' Authority/Charisma": [
    "section-11-who-are-you-i",
    "section-11-who-are-you-ii",
    "section-11-who-are-you-iii",
    "section-11-who-are-you-iv",
    "section-11-power-in-the-blood-i",
    "section-11-power-in-the-blood-ii",
    "section-11-power-in-the-blood-iii",
    "section-11-power-in-the-blood-iv",
    "section-11-how-to-cast-out-demons-i",
    "section-11-how-to-cast-out-demons-ii",
    "section-11-how-to-cast-out-demons-iii",
    "section-11-how-to-cast-out-demons-iv",
    "section-11-manifesting-the-presence-of-god-i",
    "section-11-manifesting-the-presence-of-god-ii",
    "section-11-manifesting-the-presence-of-god-iii"
  ],
  "Church History": [
    "section-12-how-to-attract-angels-i",
    "section-12-how-to-attract-angels-ii",
    "section-12-how-to-attract-angels-iii",
    "section-12-how-to-attract-angels-iv",
    "section-12-how-to-attract-angels-v",
    "section-12-early-church-i",
    "section-12-early-church-ii",
    "section-12-early-church-iii",
    "section-12-early-church-iv",
    "section-12-baptism-i",
    "section-12-baptism-ii",
    "section-12-baptism-iii",
    "section-12-baptism-iv",
    "section-12-baptism-v"
  ]
};
  Object.values(expected).forEach(ids => {
    const deckId = catalog.find(video => video.id === ids[0]).deckId;
    assert.deepEqual(catalog.filter(video => video.deckId === deckId).map(video => video.id), ids);
  });
});

test('Christology has the two source groups, with three recordings each', () => {
  const videos = catalog.filter(video => video.id.startsWith('section-04-'));
  assert.deepEqual(videos.map(video => video.group), [
    ...Array(3).fill('Christology – Jesus: Son of God'),
    ...Array(3).fill('Christology – Jesus: Son of Man')
  ]);
});
