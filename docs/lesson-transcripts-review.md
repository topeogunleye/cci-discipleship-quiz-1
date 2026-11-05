# Lesson transcript review

Generated from the current repository with `node scripts/review-lesson-transcripts.js`. Source files are in the root `transcript/` directory (singular); the older `transcripts/` directory contains separate Markdown lesson material.

## Coverage

- 125 SRT files reviewed against 109 catalog recordings and 101 distinct normalized titles.
- 101 recordings are mapped in `content/lesson-transcripts.json`: 83 unambiguous recordings, 17 metadata-only duplicate selections, and 1 explicit user-confirmed wording selection. Unambiguous means one candidate per title, or byte-identical duplicate candidates.
- 18 recordings have differing candidate SRTs; 18 have explicit selections and 0 remain unmapped. 8 recordings have no matching timed SRT.
- 20 titles have multiple source files; 2 groups are byte-identical duplicates. 0 source filenames have no catalog candidate.
- 26,660 source cues parsed, including repeated files; 0 malformed files after handling the export footer. 0 overlapping adjacent cues and 0 out-of-range minute/second fields observed.
- All 125 files contain the exporter’s final literal `\n` block. The parser ignores only that exact final marker; it continues rejecting malformed cue blocks. Meeting metadata before the first timing line is excluded from captions.

## Language, fidelity, and suitability

First, middle, and final cue text was sampled for every file. The language is English, matching the manifest’s `en` declaration. Some samples are recognition fragments such as “Foreign”, “Sa”, or “Sam”; speaker prefixes and probable recognition errors remain in the source. This is not a word-for-word accuracy review or an audio language assessment.

Mapped files have valid ordered cue timing and can supply both WebVTT captions and the searchable, time-linked transcript. Filename/title agreement and sampled subject matter support the unambiguous mappings; explicitly enabled metadata-only duplicates and the user-confirmed wording selection are recorded separately below. For metadata-only duplicates, the build verifies that all differences are confined to exporter metadata before the first cue; all spoken text and timestamps must match. No recording audio or media duration was available to this repository review, so exact synchronization and transcription accuracy still require playback checks. Matching timing alone does not resolve differing spoken text.

The theater-style player keeps the video primary, shows flashcards and quiz actions, and places the searchable transcript in a disclosure below the player. Source speaker text is preserved; no doctrine, Bible reference, or missing words have been guessed or rewritten.

## Protected delivery

The build converts only mapped source files into a server-only Pages Functions module at `functions/_generated/lesson-transcripts.cjs`. The generated module is ignored by Git and must be rebuilt before Wrangler/dev/deployment. `/transcript/<filename>.vtt` validates the learner’s video-session cookie and serves private, uncached WebVTT directly; it does not fall through to static assets. Caption bodies are excluded from `dist` and native app packages. The browser transcript cache is session memory only and is cleared on account changes. Legacy generated `dist/transcript/*.vtt` files are removed during build.

Raw source SRTs were already committed in the repository before this review. Server authentication protects deployed transcript responses; it cannot make existing Git history private. This review preserves those source files and does not rewrite repository history.

## User-confirmed selections

These selections apply only to the exact manifest filename and source hash. Selection fingerprints use UTF-8 text with line endings normalized to LF so Git checkout conventions do not change approval; inventory duplicate checks still compare original source bytes. They do not activate any other candidate or establish measured audio synchronization.

### `section-03-predestination-ii`

- Selected source: `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-a3c50da1-fa0b.srt`.
- SHA-256: `46d50c1c21e6e8e2cee1d1065400e2321d08191464002ecb8b2455dec9943f76`.
- Confirmation: User confirmed the PREDESTINATION II recording and original predestinated wording. The d07b009e-8526 source has identical timed cues; 657ce7bb-69c2 replaces that wording in six cues. Playback synchronization remains unverified.
- 310 timed cues, from 00:00:17.360 to 00:19:59.480.
- Other candidates remain unselected:
  - `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-657ce7bb-69c2.srt`: 6 cue text differences and 0 timing differences; not mapped.
  - `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-d07b009e-8526.srt`: the same 310 timed cue payloads (timestamps and text), but different raw source bytes; not mapped.

## Metadata-only duplicate selections

The user authorized enabling these recordings after comparison showed identical cue text and timestamps. Only the pre-cue exporter metadata differs. One deterministic source is mapped per recording; all alternatives are listed in the manifest and checked at build time. Original SRT files remain unchanged.

| Video ID | Selected source | Equivalent alternatives |
| --- | --- | ---: |
| `section-10-theodicy-iv` | `THEODICY-IV-Celebration-Church-International-LMS-mp4-4eb4a648-baa8.srt` | 1 |
| `section-11-how-to-cast-out-demons-i` | `HOW-TO-CAST-OUT-DEMONS-I-Celebration-Church-International-LMS-mp4-314ab7e9-3369.srt` | 1 |
| `section-11-how-to-cast-out-demons-ii` | `HOW-TO-CAST-OUT-DEMONS-II-Celebration-Church-International-LMS-mp4-ba1e7645-0e63.srt` | 1 |
| `section-11-how-to-cast-out-demons-iii` | `HOW-TO-CAST-OUT-DEMONS-III-Celebration-Church-International-LMS-mp4-28f4611f-4d5d.srt` | 1 |
| `section-11-how-to-cast-out-demons-iv` | `HOW-TO-CAST-OUT-DEMONS-IV-Celebration-Church-International-LMS-mp4-954a9c44-38c8.srt` | 1 |
| `section-11-manifesting-the-presence-of-god-i` | `MANIFESTING-THE-PRESENCE-OF-GOD-I-Celebration-Church-International-LMS-mp4-4d3a3d43-9c76.srt` | 1 |
| `section-11-manifesting-the-presence-of-god-ii` | `MANIFESTING-THE-PRESENCE-OF-GOD-II-Celebration-Church-International-LMS-mp4-28b86953-f576.srt` | 1 |
| `section-11-manifesting-the-presence-of-god-iii` | `MANIFESTING-THE-PRESENCE-OF-GOD-III-Celebration-Church-International-LMS-mp4-3df91cd7-0d62.srt` | 1 |
| `section-11-power-in-the-blood-i` | `POWER-IN-THE-BLOOD-I-Celebration-Church-International-LMS-mp4-829ff16d-4124.srt` | 1 |
| `section-11-power-in-the-blood-ii` | `POWER-IN-THE-BLOOD-II-Celebration-Church-International-LMS-mp4-c5692393-9e74.srt` | 1 |
| `section-11-power-in-the-blood-iii` | `POWER-IN-THE-BLOOD-III-Celebration-Church-International-LMS-mp4-6752449c-fc8c.srt` | 1 |
| `section-11-power-in-the-blood-iv` | `POWER-IN-THE-BLOOD-IV-Celebration-Church-International-LMS-mp4-278c703b-a17f.srt` | 1 |
| `section-11-who-are-you-i` | `WHO-ARE-YOU-I-Celebration-Church-International-LMS-mp4-901157b0-d59d.srt` | 1 |
| `section-11-who-are-you-ii` | `WHO-ARE-YOU-II-Celebration-Church-International-LMS-mp4-184ae1c7-72e1.srt` | 1 |
| `section-03-predestination-i` | `PREDESTINATION-I-Celebration-Church-International-LMS-mp4-22f4d580-a66a.srt` | 2 |
| `section-03-trinity-i` | `TRINITY-I-Celebration-Church-International-LMS-mp4-30387173-b5d6.srt` | 2 |
| `section-03-trinity-ii` | `TRINITY-II-Celebration-Church-International-LMS-mp4-477a16c1-0736.srt` | 2 |

## Recordings with no SRT

| Video ID | Catalog title | Deck ID |
| --- | --- | --- |
| `section-01-justification` | JUSTIFICATION | `d-discipleship-experience-section-1-soteriology` |
| `section-01-original-sin` | ORIGINAL SIN | `d-discipleship-experience-section-1-soteriology` |
| `section-01-repentance` | REPENTANCE | `d-discipleship-experience-section-1-soteriology` |
| `section-02-those-who-never-heard-the-gospel` | THOSE WHO NEVER HEARD THE GOSPEL | `d-discipleship-experience-section-2-soteriology-ii` |
| `section-04-jesus-son-of-god-i` | JESUS- SON OF GOD I | `d-discipleship-experience-section-4-christology` |
| `section-06-school-of-prayer-i` | SCHOOL OF PRAYER I | `d-discipleship-experience-section-6-prayer` |
| `section-06-school-of-prayer-v` | SCHOOL OF PRAYER V | `d-discipleship-experience-section-6-prayer` |
| `section-06-school-of-prayer-vii` | SCHOOL OF PRAYER VII | `d-discipleship-experience-section-6-prayer` |

## Recordings with differing candidate transcripts

No unresolved candidate conflicts remain. Raw source differences are covered by the explicit wording selection or verified metadata-only selections above. The eight recordings with no timed source remain unmapped.

| Video ID | Catalog title | Candidate files |
| --- | --- | ---: |

## Complete source file inventory

All rows have English sampled text and SRT timestamps. “Mapped” means activated by the current manifest; user-confirmed selections are labeled explicitly. “Identical duplicate” means the same bytes as the activated source. Other candidates for a user-confirmed recording are unselected, even if their timed cue payloads match; “unresolved variant” means title match only for a recording with no selected source. Last cue end is transcript timing, not a verified media duration.

| Source SRT | Video candidate | Status | Cues | Last cue end |
| --- | --- | --- | ---: | --- |
| `ASSURANCE-Celebration-Church-International-LMS-mp4-c4c9cbaa-7d12.srt` | `section-02-assurance` | mapped | 99 | 00:10:40.010 |
| `ATONEMENT-Celebration-Church-International-LMS-mp4-1fad5329-5635.srt` | `section-02-atonement` | mapped | 130 | 00:11:03.570 |
| `BAPTISM-I-Celebration-Church-International-LMS-mp4-ed7d8fa1-1638.srt` | `section-12-baptism-i` | mapped | 160 | 00:14:55.020 |
| `BAPTISM-II-Celebration-Church-International-LMS-mp4-fc63312d-8343.srt` | `section-12-baptism-ii` | mapped | 175 | 00:14:46.380 |
| `BAPTISM-III-Celebration-Church-International-LMS-mp4-24e86be8-5f58.srt` | `section-12-baptism-iii` | mapped | 231 | 00:21:07.630 |
| `BAPTISM-IV-mp4-818629a9-bf84.srt` | `section-12-baptism-iv` | mapped | 209 | 00:14:48.780 |
| `BAPTISM-V-Celebration-Church-International-LMS-mp4-44a77ea2-75ce.srt` | `section-12-baptism-v` | mapped | 216 | 00:17:04.670 |
| `BORN-AGAIN-Celebration-Church-International-LMS-mp4-7dd4dce4-abb0.srt` | `section-01-born-again` | mapped | 172 | 00:14:02.830 |
| `CAN-I-UNDERSTAND-THE-BIBLE-ON-MY-OWN-Celebration-Church-International-LMS-mp4-1219fa89-efd3.srt` | `section-08-can-i-understand-the-bible-on-my-own` | mapped | 141 | 00:11:55.370 |
| `DID-JESUS-RISE-FROM-THE-DEAD-I-Celebration-Church-International-LMS-mp4-330b27f6-1b9b.srt` | `section-10-did-jesus-rise-from-the-dead-i` | mapped | 205 | 00:14:19.570 |
| `DID-JESUS-RISE-FROM-THE-DEAD-II-Celebration-Church-International-LMS-mp4-4a5cadaf-bf77.srt` | `section-10-did-jesus-rise-from-the-dead-ii` | mapped | 132 | 00:11:50.920 |
| `DID-JESUS-RISE-FROM-THE-DEAD-III-Celebration-Church-International-LMS-mp4-da7ea97e-8859.srt` | `section-10-did-jesus-rise-from-the-dead-iii` | mapped | 211 | 00:14:30.800 |
| `DID-JESUS-RISE-FROM-THE-DEAD-IV-Celebration-Church-International-LMS-mp4-fa4e5e8c-0e71.srt` | `section-10-did-jesus-rise-from-the-dead-iv` | mapped | 140 | 00:12:09.470 |
| `DID-JESUS-RISE-FROM-THE-DEAD-V-Celebration-Church-International-LMS-mp4-4d9378d0-ef04.srt` | `section-10-did-jesus-rise-from-the-dead-v` | mapped | 151 | 00:11:45.750 |
| `DID-OLD-TESTAMENT-AUTHORS-KNOW-JESUS-Celebration-Church-International-LMS-mp4-29abaa32-5676.srt` | `section-08-did-old-testament-authors-know-jesus` | mapped | 145 | 00:12:41.510 |
| `EARLY-CHURCH-I-Celebration-Church-International-LMS-mp4-7788f328-798d.srt` | `section-12-early-church-i` | mapped | 39 | 00:06:02.320 |
| `EARLY-CHURCH-II-Celebration-Church-International-LMS-mp4-163915c8-bd02.srt` | `section-12-early-church-ii` | mapped | 89 | 00:10:13.570 |
| `EARLY-CHURCH-III-Celebration-Church-International-LMS-mp4-ce420dd9-76a3.srt` | `section-12-early-church-iii` | mapped | 90 | 00:11:48.090 |
| `EARLY-CHURCH-IV-Celebration-Church-International-LMS-mp4-7622a59b-cc61.srt` | `section-12-early-church-iv` | mapped | 67 | 00:08:50.540 |
| `HAVING-A-BIBLICAL-WORLDVIEW-I-Celebration-Church-International-LMS-mp4-d2175463-b532.srt` | `section-07-having-a-biblical-worldview-i` | mapped | 177 | 00:15:00.850 |
| `HAVING-A-BIBLICAL-WORLDVIEW-II-Celebration-Church-International-LMS-mp4-4be6c40c-6901.srt` | `section-07-having-a-biblical-worldview-ii` | mapped | 242 | 00:17:08.569 |
| `HERMENEUTICS-PART-1-I-Celebration-Church-International-LMS-mp4-b41aac19-ee85.srt` | `section-07-hermeneutics-part-1-i` | mapped | 268 | 00:21:18.500 |
| `HERMENEUTICS-PART-1-II-Celebration-Church-International-LMS-mp4-29730ae7-a9f6.srt` | `section-07-hermeneutics-part-1-ii` | mapped | 258 | 00:20:31.310 |
| `HERMENEUTICS-PART-2-I-Celebration-Church-International-LMS-mp4-651086fe-5403.srt` | `section-07-hermeneutics-part-2-i` | mapped | 216 | 00:18:53.010 |
| `HERMENEUTICS-PART-2-II-Celebration-Church-International-LMS-mp4-d82a4dac-8c15.srt` | `section-07-hermeneutics-part-2-ii` | mapped | 268 | 00:20:01.960 |
| `HOW-TO-ATTRACT-ANGELS-I-Celebration-Church-International-LMS-mp4-bedf2a07-3aa9.srt` | `section-12-how-to-attract-angels-i` | mapped | 243 | 00:14:35.520 |
| `HOW-TO-ATTRACT-ANGELS-II-Celebration-Church-International-LMS-mp4-708fc80b-b60a.srt` | `section-12-how-to-attract-angels-ii` | mapped | 271 | 00:17:08.410 |
| `HOW-TO-ATTRACT-ANGELS-III-Celebration-Church-International-LMS-mp4-d67f1bfb-c803.srt` | `section-12-how-to-attract-angels-iii` | mapped | 201 | 00:14:44.650 |
| `HOW-TO-ATTRACT-ANGELS-IV-Celebration-Church-International-LMS-mp4-c10a7d64-eb78.srt` | `section-12-how-to-attract-angels-iv` | mapped | 206 | 00:15:56.300 |
| `HOW-TO-ATTRACT-ANGELS-V-Celebration-Church-International-LMS-mp4-0a763915-531c.srt` | `section-12-how-to-attract-angels-v` | mapped | 231 | 00:13:52.200 |
| `HOW-TO-CAST-OUT-DEMONS-I-Celebration-Church-International-LMS-mp4-314ab7e9-3369.srt` | `section-11-how-to-cast-out-demons-i` | mapped — metadata equivalent | 224 | 00:17:22.020 |
| `HOW-TO-CAST-OUT-DEMONS-I-Celebration-Church-International-LMS-mp4-4bc6185e-33e5.srt` | `section-11-how-to-cast-out-demons-i` | unselected metadata duplicate | 224 | 00:17:22.020 |
| `HOW-TO-CAST-OUT-DEMONS-II-Celebration-Church-International-LMS-mp4-ba1e7645-0e63.srt` | `section-11-how-to-cast-out-demons-ii` | mapped — metadata equivalent | 263 | 00:17:11.099 |
| `HOW-TO-CAST-OUT-DEMONS-II-Celebration-Church-International-LMS-mp4-f29c0c02-64be.srt` | `section-11-how-to-cast-out-demons-ii` | unselected metadata duplicate | 263 | 00:17:11.099 |
| `HOW-TO-CAST-OUT-DEMONS-III-Celebration-Church-International-LMS-mp4-28f4611f-4d5d.srt` | `section-11-how-to-cast-out-demons-iii` | mapped — metadata equivalent | 267 | 00:17:11.079 |
| `HOW-TO-CAST-OUT-DEMONS-III-Celebration-Church-International-LMS-mp4-55fb636c-237a.srt` | `section-11-how-to-cast-out-demons-iii` | unselected metadata duplicate | 267 | 00:17:11.079 |
| `HOW-TO-CAST-OUT-DEMONS-IV-Celebration-Church-International-LMS-mp4-954a9c44-38c8.srt` | `section-11-how-to-cast-out-demons-iv` | mapped — metadata equivalent | 254 | 00:16:39.860 |
| `HOW-TO-CAST-OUT-DEMONS-IV-Celebration-Church-International-LMS-mp4-b80c9b08-93b1.srt` | `section-11-how-to-cast-out-demons-iv` | unselected metadata duplicate | 254 | 00:16:39.860 |
| `HOW-TO-EVANGELIZE-Celebration-Church-International-LMS-mp4-67299763-6dd0.srt` | `section-09-how-to-evangelize` | mapped | 177 | 00:12:22.150 |
| `HOW-TO-EVANGELIZE-Celebration-Church-International-LMS-mp4-dd09bfe9-f2f5.srt` | `section-09-how-to-evangelize` | identical duplicate | 177 | 00:12:22.150 |
| `HOW-TO-OVERCOME-HABITS-I-Celebration-Church-International-LMS-mp4-045c5f3c-0096.srt` | `section-05-how-to-overcome-habits-i` | mapped | 168 | 00:12:33.720 |
| `HOW-TO-OVERCOME-HABITS-II-Celebration-Church-International-LMS-mp4-c0a8da03-7891.srt` | `section-05-how-to-overcome-habits-ii` | mapped | 142 | 00:10:39.440 |
| `HOW-TO-OVERCOME-HABITS-III-Celebration-Church-International-LMS-mp4-bb91efbe-0f13.srt` | `section-05-how-to-overcome-habits-iii` | mapped | 109 | 00:09:09.960 |
| `HOW-TO-OVERCOME-HABITS-IV-Celebration-Church-International-LMS-mp4-126cac17-7c06.srt` | `section-05-how-to-overcome-habits-iv` | mapped | 97 | 00:07:21.350 |
| `INTRODUCTION-TO-BIBLICAL-INTERPRETATION-I-Celebration-Church-International-LMS-mp4-c030f81b-a312.srt` | `section-07-introduction-to-biblical-interpretation-i` | mapped | 224 | 00:19:36.140 |
| `INTRODUCTION-TO-BIBLICAL-INTERPRETATION-II-Celebration-Church-International-LMS-mp4-618eeb3d-268c.srt` | `section-07-introduction-to-biblical-interpretation-ii` | mapped | 285 | 00:20:36.840 |
| `INTRODUCTION-TO-BIBLICAL-INTERPRETATION-III-Celebration-Church-International-LMS-mp4-5374423b-3b76.srt` | `section-07-introduction-to-biblical-interpretation-iii` | mapped | 267 | 00:20:29.440 |
| `IS-THE-BIBLE-TRUE-I-Celebration-Church-International-LMS-2-mp4-bbf25c43-592c.srt` | `section-10-is-the-bible-true-i` | mapped | 139 | 00:12:08.360 |
| `IS-THE-BIBLE-TRUE-II-Celebration-Church-International-LMS-2-mp4-ed0e5ec8-bcf4.srt` | `section-10-is-the-bible-true-ii` | mapped | 64 | 00:07:12.070 |
| `IS-THERE-A-GOD-I-Celebration-Church-International-LMS-mp4-7cdaaebe-c291.srt` | `section-10-is-there-a-god-i` | mapped | 219 | 00:14:37.770 |
| `IS-THERE-A-GOD-II-Celebration-Church-International-LMS-mp4-d8ad3be5-8a9f.srt` | `section-10-is-there-a-god-ii` | mapped | 197 | 00:12:14.970 |
| `IS-THERE-A-GOD-III-Celebration-Church-International-LMS-mp4-9754626b-d005.srt` | `section-10-is-there-a-god-iii` | mapped | 262 | 00:18:10.720 |
| `JEHOVA-S-WITNESS-I-Celebration-Church-International-LMS-mp4-1cdf39df-cb3f.srt` | `section-09-jehova-s-witness-i` | mapped | 197 | 00:14:58.690 |
| `JEHOVA-S-WITNESS-II-Celebration-Church-International-LMS-mp4-9f9c22be-1140.srt` | `section-09-jehova-s-witness-ii` | mapped | 175 | 00:13:06.880 |
| `JEHOVA-S-WITNESS-III-Celebration-Church-International-LMS-mp4-a2438e5b-7e38.srt` | `section-09-jehova-s-witness-iii` | mapped | 198 | 00:12:12.510 |
| `JEHOVA-S-WITNESS-IV-Celebration-Church-International-LMS-mp4-a6917780-ee91.srt` | `section-09-jehova-s-witness-iv` | mapped | 142 | 00:14:32.540 |
| `JESUS-AND-WOMEN-Celebration-Church-International-LMS-mp4-ebfefe21-ba9d.srt` | `section-08-jesus-and-women` | mapped | 309 | 00:26:24.280 |
| `JESUS-SON-OF-GOD-II-Celebration-Church-International-LMS-mp4-49fb331f-663b.srt` | `section-04-jesus-son-of-god-ii` | mapped | 251 | 00:16:27.550 |
| `JESUS-SON-OF-GOD-III-Celebration-Church-International-LMS-mp4-cba1b32b-4979.srt` | `section-04-jesus-son-of-god-iii` | mapped | 384 | 00:26:46.230 |
| `JESUS-SON-OF-MAN-I-Celebration-Church-International-LMS-mp4-2396254d-d48e.srt` | `section-04-jesus-son-of-man-i` | mapped | 260 | 00:19:50.850 |
| `JESUS-SON-OF-MAN-II-Celebration-Church-International-LMS-mp4-479ecdd2-faaa.srt` | `section-04-jesus-son-of-man-ii` | mapped | 235 | 00:18:33.780 |
| `JESUS-SON-OF-MAN-III-Celebration-Church-International-LMS-mp4-f44337f0-2be1.srt` | `section-04-jesus-son-of-man-iii` | mapped | 327 | 00:20:54.780 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-I-Celebration-Church-International-LMS-mp4-4d3a3d43-9c76.srt` | `section-11-manifesting-the-presence-of-god-i` | mapped — metadata equivalent | 238 | 00:14:17.580 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-I-Celebration-Church-International-LMS-mp4-d2866eed-367e.srt` | `section-11-manifesting-the-presence-of-god-i` | unselected metadata duplicate | 238 | 00:14:17.580 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-II-Celebration-Church-International-LMS-mp4-28b86953-f576.srt` | `section-11-manifesting-the-presence-of-god-ii` | mapped — metadata equivalent | 240 | 00:11:51.470 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-II-Celebration-Church-International-LMS-mp4-9fc45592-126d.srt` | `section-11-manifesting-the-presence-of-god-ii` | unselected metadata duplicate | 240 | 00:11:51.470 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-III-Celebration-Church-International-LMS-mp4-3df91cd7-0d62.srt` | `section-11-manifesting-the-presence-of-god-iii` | mapped — metadata equivalent | 298 | 00:15:37.890 |
| `MANIFESTING-THE-PRESENCE-OF-GOD-III-Celebration-Church-International-LMS-mp4-bf96613e-6939.srt` | `section-11-manifesting-the-presence-of-god-iii` | unselected metadata duplicate | 298 | 00:15:37.890 |
| `MORMONS-I-Celebration-Church-International-LMS-mp4-7360eeb0-9b37.srt` | `section-09-mormons-i` | mapped | 137 | 00:13:42.430 |
| `MORMONS-II-Celebration-Church-International-LMS-mp4-4c19b7c5-ef89.srt` | `section-09-mormons-ii` | mapped | 175 | 00:16:45.010 |
| `MORMONS-III-Celebration-Church-International-LMS-mp4-ac37abb9-e418.srt` | `section-09-mormons-iii` | mapped | 181 | 00:15:33.150 |
| `MUSLIMS-I-Celebration-Church-International-LMS-mp4-85df8809-fb9c.srt` | `section-09-muslims-i` | mapped | 200 | 00:14:49.070 |
| `MUSLIMS-II-Celebration-Church-International-LMS-mp4-a329bf71-2743.srt` | `section-09-muslims-ii` | mapped | 215 | 00:15:01.430 |
| `MUSLIMS-III-Celebration-Church-International-LMS-mp4-2b25299b-112b.srt` | `section-09-muslims-iii` | mapped | 200 | 00:17:00.850 |
| `NEW-AGE-SPIRITUALITY-I-Celebration-Church-International-LMS-mp4-81af7a7a-1ad2.srt` | `section-09-new-age-spirituality-i` | mapped | 201 | 00:14:59.920 |
| `NEW-AGE-SPIRITUALITY-II-Celebration-Church-International-LMS-mp4-673f15b7-69a0.srt` | `section-09-new-age-spirituality-ii` | mapped | 206 | 00:14:33.510 |
| `NEW-AGE-SPIRITUALITY-III-Celebration-Church-International-LMS-mp4-210301f4-56c9.srt` | `section-09-new-age-spirituality-iii` | mapped | 170 | 00:14:55.550 |
| `NEW-AGE-SPIRITUALITY-IV-Celebration-Church-International-LMS-mp4-15f4dbf8-f76a.srt` | `section-09-new-age-spirituality-iv` | mapped | 207 | 00:15:04.440 |
| `NEW-AGE-SPIRITUALITY-V-Celebration-Church-International-LMS-mp4-e465e282-2081.srt` | `section-09-new-age-spirituality-v` | mapped | 191 | 00:14:55.580 |
| `NEW-AGE-SPIRITUALITY-VI-Celebration-Church-International-LMS-mp4-0b1e56bf-aca0.srt` | `section-09-new-age-spirituality-vi` | mapped | 242 | 00:16:27.160 |
| `POWER-IN-THE-BLOOD-I-Celebration-Church-International-LMS-mp4-829ff16d-4124.srt` | `section-11-power-in-the-blood-i` | mapped — metadata equivalent | 224 | 00:15:28.630 |
| `POWER-IN-THE-BLOOD-I-Celebration-Church-International-LMS-mp4-b49d4288-cfaa.srt` | `section-11-power-in-the-blood-i` | unselected metadata duplicate | 224 | 00:15:28.630 |
| `POWER-IN-THE-BLOOD-II-Celebration-Church-International-LMS-mp4-c5692393-9e74.srt` | `section-11-power-in-the-blood-ii` | mapped — metadata equivalent | 202 | 00:12:44.230 |
| `POWER-IN-THE-BLOOD-II-Celebration-Church-International-LMS-mp4-c63f0fa8-bbeb.srt` | `section-11-power-in-the-blood-ii` | unselected metadata duplicate | 202 | 00:12:44.230 |
| `POWER-IN-THE-BLOOD-III-Celebration-Church-International-LMS-mp4-6752449c-fc8c.srt` | `section-11-power-in-the-blood-iii` | mapped — metadata equivalent | 188 | 00:13:10.930 |
| `POWER-IN-THE-BLOOD-III-Celebration-Church-International-LMS-mp4-e27f7473-85c3.srt` | `section-11-power-in-the-blood-iii` | unselected metadata duplicate | 188 | 00:13:10.930 |
| `POWER-IN-THE-BLOOD-IV-Celebration-Church-International-LMS-mp4-278c703b-a17f.srt` | `section-11-power-in-the-blood-iv` | mapped — metadata equivalent | 239 | 00:18:37.720 |
| `POWER-IN-THE-BLOOD-IV-Celebration-Church-International-LMS-mp4-95e11f65-df59.srt` | `section-11-power-in-the-blood-iv` | unselected metadata duplicate | 239 | 00:18:37.720 |
| `PREDESTINATION-I-Celebration-Church-International-LMS-mp4-22f4d580-a66a.srt` | `section-03-predestination-i` | mapped — metadata equivalent | 106 | 00:07:46.930 |
| `PREDESTINATION-I-Celebration-Church-International-LMS-mp4-61ba1872-d440.srt` | `section-03-predestination-i` | unselected metadata duplicate | 106 | 00:07:46.930 |
| `PREDESTINATION-I-Celebration-Church-International-LMS-mp4-db404d8d-9e1a.srt` | `section-03-predestination-i` | unselected metadata duplicate | 106 | 00:07:46.930 |
| `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-657ce7bb-69c2.srt` | `section-03-predestination-ii` | unselected variant | 310 | 00:19:59.480 |
| `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-a3c50da1-fa0b.srt` | `section-03-predestination-ii` | mapped — user-confirmed | 310 | 00:19:59.480 |
| `PREDESTINATION-II-Celebration-Church-International-LMS-mp4-d07b009e-8526.srt` | `section-03-predestination-ii` | unselected variant | 310 | 00:19:59.480 |
| `PROPITIATION-Celebration-Church-International-LMS-mp4-2825ab6a-b73a.srt` | `section-02-propitiation` | mapped | 51 | 00:04:08.600 |
| `REDEMPTION-Celebration-Church-International-LMS-mp4-8e23c3a3-bda8.srt` | `section-02-redemption` | mapped | 151 | 00:12:15.420 |
| `RIGHTEOUSNESS-Celebration-Church-International-LMS-mp4-294daf9a-f8d5.srt` | `section-01-righteousness` | mapped | 90 | 00:07:15.310 |
| `SCHOOL-OF-PRAYER-II-Celebration-Church-International-LMS-mp4-1d17b178-cdb9.srt` | `section-06-school-of-prayer-ii` | mapped | 116 | 00:09:06.930 |
| `SCHOOL-OF-PRAYER-III-Celebration-Church-International-LMS-mp4-806ee5c9-4957.srt` | `section-06-school-of-prayer-iii` | mapped | 240 | 00:17:17.020 |
| `SCHOOL-OF-PRAYER-IV-Celebration-Church-International-LMS-mp4-6e69307a-fcd2.srt` | `section-06-school-of-prayer-iv` | mapped | 229 | 00:14:12.080 |
| `SCHOOL-OF-PRAYER-IX-Celebration-Church-International-LMS-mp4-cb3f619a-146f.srt` | `section-06-school-of-prayer-ix` | mapped | 104 | 00:08:10.520 |
| `SCHOOL-OF-PRAYER-VI-Celebration-Church-International-LMS-mp4-70de37a0-cd01.srt` | `section-06-school-of-prayer-vi` | mapped | 140 | 00:11:22.210 |
| `SCHOOL-OF-PRAYER-VIII-Celebration-Church-International-LMS-mp4-f49e763c-468b.srt` | `section-06-school-of-prayer-viii` | mapped | 95 | 00:07:41.530 |
| `SCHOOL-OF-PRAYER-X-Celebration-Church-International-LMS-mp4-9a679d6f-1ffb.srt` | `section-06-school-of-prayer-x` | mapped | 172 | 00:12:39.810 |
| `THAT-OLD-MAN-Celebration-Church-International-LMS-mp4-58c24242-1809.srt` | `section-05-that-old-man` | mapped | 833 | 00:59:46.540 |
| `THE-INSPIRATION-OF-SCRIPTURES-Celebration-Church-International-LMS-mp4-1ddda619-d193.srt` | `section-08-the-inspiration-of-scriptures` | mapped | 551 | 00:37:34.300 |
| `THEODICY-I-Celebration-Church-International-LMS-2-mp4-38d60132-4dae.srt` | `section-10-theodicy-i` | mapped | 229 | 00:15:49.640 |
| `THEODICY-II-Celebration-Church-International-LMS-mp4-da6f0dfa-71ec.srt` | `section-10-theodicy-ii` | mapped | 217 | 00:11:50.050 |
| `THEODICY-II-Celebration-Church-International-LMS-mp4-dda0c87d-fdc4.srt` | `section-10-theodicy-ii` | identical duplicate | 217 | 00:11:50.050 |
| `THEODICY-III-Celebration-Church-International-LMS-mp4-872a4ffc-a1fa.srt` | `section-10-theodicy-iii` | mapped | 244 | 00:13:46.550 |
| `THEODICY-IV-Celebration-Church-International-LMS-mp4-4eb4a648-baa8.srt` | `section-10-theodicy-iv` | mapped — metadata equivalent | 343 | 00:19:18.180 |
| `THEODICY-IV-Celebration-Church-International-LMS-mp4-52a78e8d-7d7e.srt` | `section-10-theodicy-iv` | unselected metadata duplicate | 343 | 00:19:18.180 |
| `TRINITY-I-Celebration-Church-International-LMS-mp4-30387173-b5d6.srt` | `section-03-trinity-i` | mapped — metadata equivalent | 269 | 00:18:49.660 |
| `TRINITY-I-Celebration-Church-International-LMS-mp4-b6989801-f9bd.srt` | `section-03-trinity-i` | unselected metadata duplicate | 269 | 00:18:49.660 |
| `TRINITY-I-Celebration-Church-International-LMS-mp4-da1c5a6e-a450.srt` | `section-03-trinity-i` | unselected metadata duplicate | 269 | 00:18:49.660 |
| `TRINITY-II-Celebration-Church-International-LMS-mp4-477a16c1-0736.srt` | `section-03-trinity-ii` | mapped — metadata equivalent | 185 | 00:14:37.480 |
| `TRINITY-II-Celebration-Church-International-LMS-mp4-6b0d06c1-a6bf.srt` | `section-03-trinity-ii` | unselected metadata duplicate | 185 | 00:14:37.480 |
| `TRINITY-II-Celebration-Church-International-LMS-mp4-84d84205-00ae.srt` | `section-03-trinity-ii` | unselected metadata duplicate | 185 | 00:14:37.480 |
| `TRINITY-III-Celebration-Church-International-LMS-mp4-cc7ddb32-f446.srt` | `section-03-trinity-iii` | mapped | 72 | 00:08:31.590 |
| `WHO-ARE-YOU-I-Celebration-Church-International-LMS-mp4-901157b0-d59d.srt` | `section-11-who-are-you-i` | mapped — metadata equivalent | 277 | 00:13:44.380 |
| `WHO-ARE-YOU-I-Celebration-Church-International-LMS-mp4-d8b74844-4316.srt` | `section-11-who-are-you-i` | unselected metadata duplicate | 277 | 00:13:44.380 |
| `WHO-ARE-YOU-II-Celebration-Church-International-LMS-mp4-184ae1c7-72e1.srt` | `section-11-who-are-you-ii` | mapped — metadata equivalent | 220 | 00:09:52.540 |
| `WHO-ARE-YOU-II-Celebration-Church-International-LMS-mp4-82209d34-3bf8.srt` | `section-11-who-are-you-ii` | unselected metadata duplicate | 220 | 00:09:52.540 |
| `WHO-ARE-YOU-III-Celebration-Church-International-LMS-mp4-f79a5a7c-d28e.srt` | `section-11-who-are-you-iii` | mapped | 377 | 00:19:58.810 |
| `WHO-ARE-YOU-IV-Celebration-Church-International-LMS-mp4-9fbb7e5e-7646.srt` | `section-11-who-are-you-iv` | mapped | 255 | 00:15:01.250 |
