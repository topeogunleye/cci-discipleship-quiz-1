# Bible References — Verification Report

Scope: optional `BIBLE:` field added under `REF:` in all 12 decks; shown in the app as **Bible References** beneath **Reference**.

## Method
1. Parsed the 109 transcripts into timestamped segments and every question's `REF:` into lesson + timestamp window (±10 s; ±30 s when the REF says "approx").
2. Extracted Bible references from the window text (handles "First Samuel, chapter two, verse 10", "2Nd Corinthians 5:10", ranges and verse lists). Chapters beyond a book's real chapter count are rejected; single-chapter books ("Jude 24") are read as verses.
3. Cross-checked against the deck: question text, **correct answer** and explanation only (wrong options are ignored).
4. A deck-cited reference missing from the window was searched across the whole lesson transcript. If still absent, it was researched online.

## Labels in each `BIBLE:` line
- `Confirmed in lesson and deck:` — in the lesson transcript and named in the deck (deck wording used when it is more specific).
- `Also cited in lesson segment:` — cited in the transcript at the REF timestamp but not named in the deck. Relevance not guaranteed.
- `Added from online research:` — not found in the project materials; source link included.

## Coverage
| Deck | Questions | With BIBLE line | Confirmed | Lesson-only | Researched |
|---|---|---|---|---|---|
| 01-soteriology | 91 | 71 | 24 | 63 | 2 |
| 02-soteriology-ii | 93 | 81 | 28 | 62 | 4 |
| 03-predestination-and-trinity | 70 | 48 | 25 | 37 | 3 |
| 04-christology | 100 | 77 | 43 | 57 | 3 |
| 05-christian-conduct | 132 | 89 | 32 | 70 | 1 |
| 06-prayer | 123 | 55 | 16 | 39 | 1 |
| 07-bible-experience-i | 156 | 84 | 35 | 65 | 4 |
| 08-bible-experience-ii | 126 | 72 | 29 | 58 | 3 |
| 09-evangelism | 64 | 46 | 18 | 42 | 2 |
| 10-apologetics | 86 | 46 | 19 | 36 | 2 |
| 11-believers-authority-charisma | 100 | 51 | 21 | 32 | 2 |
| 12-church-history | 100 | 36 | 20 | 23 | 3 |
| **Total** | **1241** | **756** | 310 | 584 | 30 |

Questions with no BIBLE line have no Bible reference in their cited segment or deck text, or no usable `REF:`.

## Online research (added from outside the project)
| Reference | Source | Questions |
|---|---|---|
| 1 Corinthians 11:5 | https://www.esv.org/verses/1+Corinthians+11:5/ | 07-Q86, 07-Q88 |
| 1 John 4:1 | https://www.esv.org/verses/1%20John%204%3A1/ | 09-Q80 |
| 1 Peter 3:18–22 | https://www.esv.org/verses/1+Peter+3:18%E2%80%9322/ | 12-Q57, 12-Q99 |
| 2 Timothy 3:16 | https://www.blueletterbible.org/lexicon/g1882 | 07-Q49, 07-Q52 |
| Colossians 1:15–16 | https://biblia.com/bible/esv/colossians/1/15-16 | 02-Q41 |
| Exodus 32:1–14 | https://www.esv.org/verses/Exodus+32:1%E2%80%9314/ | 10-Q80 |
| Genesis 18:1–8 | https://esv.org/verses/Genesis+18:1%E2%80%938 | 12-Q63 |
| Hebrews 1:1 | https://www.esv.org/verses/Hebrews+1:1/ | 08-Q66 |
| Isaiah 40:3 | https://www.esv.org/Is40.3%3BMt3.3 | 09-Q62 |
| Isaiah 61:1–2; Luke 4:16–21 | https://biblia.com/bible/niv/luke/4/16-21 | 11-Q83 |
| John 1:1 | https://www.biblegateway.com/verse/en/John%201:1 | 03-Q63, 08-Q125 |
| John 1:29 | https://www.esv.org/verses/John+1:29/ | 10-Q67 |
| John 3:18–19 | https://www.esv.org/verses/John%203%3A18%E2%80%9319/ | 01-Q2, 01-Q40, 04-Q79 |
| John 8:58 | https://esv.org/verses/John+8:58 | 04-Q7 |
| Joshua 5:13–15 | https://www.esv.org/verses/Joshua%205:13-15/ | 04-Q5 |
| Jude 24 | https://www.biblegateway.com/verse/en/Jude%201:24 | 02-Q20, 02-Q74, 02-Q75 |
| Luke 24:25–27 | https://www.esv.org/verses/Luke%2024%3A25%E2%80%9327/ | 08-Q68 |
| Matthew 3:3 | https://www.esv.org/Is40.3%3BMt3.3 | 09-Q62 |
| Matthew 6:7 | https://www.esv.org/verses/Matthew+6:7 | 06-Q100 |
| Revelation 12:11 | https://www.esv.org/verses/Revelation+12:11/ | 11-Q58 |
| Romans 12:1 | https://www.esv.org/verses/Rom%2012%3A1/ | 05-Q19 |
| Romans 8:28 | https://bible.com/1/ROM.8.28 | 03-Q11, 03-Q44 |

Notes: Isaiah 61 is the passage Jesus read in Luke 4:16–21; the transcript quotes the Luke text without citing it. Luke 24:25–27 extends the verse the lesson cites (24:25).

## Hand review (sample of 44 lines, stratified across decks)
Found and fixed:
- Deck verse ranges shortened (`John 1:1–3` shown as `John 1:1; John 1:3`; `Revelation 1:17–18` as `1:17`) → deck wording now preferred when confirmed.
- "Isaiah, chapter 4, 48" misread as Isaiah 4 (6 questions) → dropped.
- Impossible chapters (`Hosea 111`, `Ruth 30:4`, `John 25:3`) → rejected by the chapter-count check.
- `Romans 16:16, 1` (next book's "1" read as a verse) and `Jude 24` read as chapter 24 → both fixed.
- Transcript "John 4:1" is 1 John 4:1 → corrected and sourced online.

Before fixes: about 3 of 44 sampled lines had factual errors (~7%) and about 2 had a lesson-only reference only loosely related to the question (e.g. a passing mention of Genesis 3).

### Re-review after fixes (fresh random sample of 30, seed 99)
- Factual errors (wrong verse, wrong book, impossible chapter, truncated range): **0 of 30**.
- Loosely related `Also cited in lesson segment:` entries: **3 of 30** (Section 9 Q79 Mormon destiny, Section 8 Q43 woman as first witness, Section 10 Q50 Megiddo mosaic with a tangential John 5:1). They are real citations from the cited timestamp window, but the speaker was not making that point for this question. They are labelled lesson-only so readers can discount them.
- Small sample: this is an indication, not a guarantee.

## Could not be verified / known limitations
- 2 Timothy 3:16: only "correction" (epanorthosis) confirmed (Blue Letter Bible lexicon G1882); the "reproof = conviction" claim is unverified.
- Spoken forms such as "Philippians 4, 6" or "Mark 2, 5, 7" stay chapter-level or are not read as verses; some verse detail is therefore missing.
- Lesson-only lists can include incidental references when the REF window is broad (e.g. Section 7 Q25).
- 7 questions have no usable `REF:` (6 in Section 12; Section 10 Q12), so no lesson-based check was possible.
- Section 9 Q80 (Ellen G. White) is cited to a Mormons lesson; some `REF:` lines still contain LMS filenames (both pre-existing).
- 1 Peter 3 "spirits in prison" is a disputed interpretation; the deck gives the speaker's reading.

## Previous follow-up snapshot — 2026-10-31

The earlier pass added 90 research-linked fields and reported 1,420 questions, 848 with `BIBLE:`, and 572 without. Those numbers are the pre-review snapshot and are superseded below.

## Re-review of the remaining questions — 2026-10-31

At audit start, the checked-out canonical deck snapshot contained 1,420 questions, of which 572 lacked a BIBLE: line. The review evaluated each question text, correct answer, explanation, REF: timestamp, and matching transcript window. It added a field only where a direct passage could be identified; historical facts, broad applications, and disputed interpretations were left unresolved when a citation would overstate the passage. This PR applies the reference additions to the latest main; the coverage table below was recalculated from that current manifest and includes newer main questions that already had BIBLE: fields.

### Current coverage

| Canonical deck | Questions | With BIBLE | Without BIBLE |
|---|---:|---:|---:|
| section-01-soteriology.txt | 91 | 89 | 2 |
| section-02-soteriology-ii.txt | 93 | 91 | 2 |
| section-03-predestination-and-trinity.txt | 74 | 71 | 3 |
| section-04-christology.txt | 100 | 92 | 8 |
| section-05-christian-conduct.txt | 132 | 111 | 21 |
| section-06-prayer.txt | 123 | 73 | 50 |
| section-07-bible-experience-i.txt | 156 | 107 | 49 |
| section-08-bible-experience-ii.txt | 126 | 85 | 41 |
| section-09-evangelism.txt | 241 | 98 | 143 |
| section-10-apologetics.txt | 90 | 56 | 34 |
| section-11-believers-authority-charisma.txt | 100 | 55 | 45 |
| section-12-church-history.txt | 100 | 36 | 64 |
| **Total** | **1426** | **964** | **462** |


### Fields added in this pass

Added **110** fields: **20** transcript-confirmed and **90** researched against ESV text at Bible Gateway, with a source URL in each researched field. Canonical decks and their `dist/decks` mirrors were updated together.

| Deck | New fields in this pass |
|---|---:|
| section-02-soteriology-ii.txt | 1 |
| section-03-predestination-and-trinity.txt | 4 |
| section-04-christology.txt | 15 |
| section-05-christian-conduct.txt | 22 |
| section-06-prayer.txt | 18 |
| section-07-bible-experience-i.txt | 23 |
| section-08-bible-experience-ii.txt | 13 |
| section-09-evangelism.txt | 4 |
| section-10-apologetics.txt | 6 |
| section-11-believers-authority-charisma.txt | 4 |
| **Total** | **110** |


### Transcript-confirmed references

`Also cited in lesson segment:` labels identify references confirmed from the corresponding transcript segment.

| Deck | Question IDs | Transcript-confirmed references |
|---|---|---|
| section-02-soteriology-ii.txt | Q76 | Romans 2:14 |
| section-03-predestination-and-trinity.txt | Q2, Q8, Q43 | 1 Samuel 23:9–14<br>1 Samuel 23:9–14<br>1 Samuel 23:9–14 |
| section-04-christology.txt | Q2, Q69, Q71, Q72, Q86 | Luke 24:25–27<br>Luke 24:25–27<br>Luke 24:25–27<br>Luke 24:25–27<br>Genesis 18:1–3; 19:1 |
| section-09-evangelism.txt | Q85, Q155, Q161, Q185 | Luke 10:25–37<br>Daniel 8:14<br>Acts 17:22<br>Genesis 15:1–6 |
| section-10-apologetics.txt | Q19, Q84, Q85 | Leviticus 16:8–10, 20–22<br>1 Samuel 15:7–9; Esther 3:1<br>Genesis 3:17–19 |
| section-11-believers-authority-charisma.txt | Q35, Q65, Q77, Q94 | Acts 19:13–16<br>Hebrews 12:24<br>2 Corinthians 2:10–11<br>Mark 11:22–24 |


### Research sources

Each row groups new researched references that share a source URL. The full reference and URL are also recorded beside each affected question in its `BIBLE:` field.

| Verified passage | Questions | Source URL |
|---|---|---|
| 1 Corinthians 10:4 | Section 08-bible-experience-ii-Q74 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%2010:4&version=ESV) |
| 1 Corinthians 15:45 | Section 04-christology-Q62 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%2015%3A45&version=ESV) |
| 1 Corinthians 15:8 | Section 10-apologetics-Q73 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%2015%3A8&version=ESV) |
| 1 Corinthians 16:20 | Section 08-bible-experience-ii-Q88 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%2016:20&version=ESV) |
| 1 Corinthians 2:8 | Section 07-bible-experience-i-Q98 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%202:8&version=ESV) |
| 1 Corinthians 6:12; 10:23 | Section 05-christian-conduct-Q132 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Corinthians%206%3A12%3B%2010%3A23&version=ESV) |
| 1 Corinthians 6:19 | Section 05-christian-conduct-Q55 | [Bible Gateway ESV](https://www.esv.org/1+Corinthians+6%3A19/) |
| 1 John 5:14–15 | Section 06-prayer-Q15 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20John%205%3A14-15&version=ESV) |
| 1 Peter 2:23 | Section 04-christology-Q50 | [Bible Gateway ESV](https://www.esv.org/1+Peter+2%3A23/) |
| 1 Thessalonians 4:13 | Section 04-christology-Q70 | [Bible Gateway ESV](https://www.esv.org/1+Thessalonians+4%3A13/) |
| 1 Thessalonians 5:26 | Section 08-bible-experience-ii-Q88 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Thessalonians%205:26&version=ESV) |
| 1 Timothy 3:15 | Section 08-bible-experience-ii-Q93 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Timothy%203:15&version=ESV) |
| 1 Timothy 3:6 | Section 05-christian-conduct-Q108 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Timothy%203%3A6&version=ESV) |
| 1 Timothy 4:8 | Section 05-christian-conduct-Q70, Section 06-prayer-Q45 | [Bible Gateway ESV](https://www.esv.org/1+Timothy+4%3A8/) |
| 1 Timothy 5:8 | Section 07-bible-experience-i-Q15 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=1%20Timothy%205:8&version=ESV) |
| 2 Corinthians 13:12 | Section 08-bible-experience-ii-Q88 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=2%20Corinthians%2013:12&version=ESV) |
| 2 Timothy 2:22 | Section 05-christian-conduct-Q119 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=2%20Timothy%202%3A22&version=ESV) |
| 2 Timothy 3:16 | Section 07-bible-experience-i-Q43, Section 07-bible-experience-i-Q54 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=2%20Timothy%203:16&version=ESV) |
| Acts 10 | Section 07-bible-experience-i-Q41, Section 08-bible-experience-ii-Q29, Section 08-bible-experience-ii-Q91 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Acts%2010&version=ESV) |
| Acts 17:30 | Section 07-bible-experience-i-Q75 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Acts%2017:30&version=ESV) |
| Acts 18:24–26 | Section 08-bible-experience-ii-Q52 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Acts%2018:24-26&version=ESV) |
| Acts 8:26–31 | Section 07-bible-experience-i-Q90, Section 08-bible-experience-ii-Q90 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Acts%208:26-31&version=ESV) |
| Acts 9:1–9 | Section 10-apologetics-Q73 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Acts%209%3A1-9&version=ESV) |
| Colossians 2:16–17 | Section 07-bible-experience-i-Q134 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Colossians%202:16-17&version=ESV) |
| Deuteronomy 6:5 | Section 04-christology-Q31, Section 04-christology-Q32 | [Bible Gateway ESV](https://www.esv.org/Deuteronomy+6%3A5/) |
| Deuteronomy 8:3 | Section 05-christian-conduct-Q14, Section 05-christian-conduct-Q74, Section 05-christian-conduct-Q76 | [Bible Gateway ESV](https://www.esv.org/Deuteronomy+8%3A3/) |
| Ephesians 1:17–18 | Section 05-christian-conduct-Q1, Section 05-christian-conduct-Q33 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Ephesians%201%3A17-18&version=ESV) |
| Ephesians 4:11–13 | Section 07-bible-experience-i-Q60 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Ephesians%204:11-13&version=ESV) |
| Ephesians 4:27 | Section 06-prayer-Q86 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Ephesians%204%3A27&version=ESV) |
| Ephesians 5:18 | Section 05-christian-conduct-Q75 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Ephesians%205%3A18&version=ESV) |
| Ephesians 5:22–24 | Section 07-bible-experience-i-Q85 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Ephesians%205:22-24&version=ESV) |
| Exodus 2:1–10 | Section 07-bible-experience-i-Q99 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Exodus%202:1-10&version=ESV) |
| Exodus 32:1–6 | Section 06-prayer-Q44 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Exodus%2032%3A1-6&version=ESV) |
| Galatians 4:6 | Section 06-prayer-Q38 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Galatians%204%3A6&version=ESV) |
| Galatians 5:16 | Section 05-christian-conduct-Q67, Section 05-christian-conduct-Q81 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Galatians%205%3A16&version=ESV) |
| Genesis 12:1–4 | Section 06-prayer-Q39 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Genesis%2012%3A1-4&version=ESV) |
| Genesis 1:1 | Section 07-bible-experience-i-Q51 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Genesis%201:1&version=ESV) |
| Genesis 25:29–34 | Section 05-christian-conduct-Q12, Section 05-christian-conduct-Q72 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Genesis%2025%3A29-34&version=ESV) |
| Genesis 2:2–3 | Section 07-bible-experience-i-Q139 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Genesis%202:2-3&version=ESV) |
| Genesis 50:20 | Section 07-bible-experience-i-Q40, Section 08-bible-experience-ii-Q26 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Genesis%2050:20&version=ESV) |
| Hebrews 10:4–14 | Section 07-bible-experience-i-Q150 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%2010:4-14&version=ESV) |
| Hebrews 13:1 | Section 07-bible-experience-i-Q89, Section 08-bible-experience-ii-Q89 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%2013:1&version=ESV) |
| Hebrews 2:14–18; 4:15 | Section 10-apologetics-Q29 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%202%3A14-18%3B%204%3A15&version=ESV) |
| Hebrews 4:15 | Section 04-christology-Q49, Section 06-prayer-Q73, Section 10-apologetics-Q65 | [Bible Gateway ESV](https://www.esv.org/Hebrews+4%3A15/) |
| Hebrews 4:16 | Section 06-prayer-Q9 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%204%3A16&version=ESV) |
| Hebrews 4:9–10 | Section 07-bible-experience-i-Q139 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%204:9-10&version=ESV) |
| Hebrews 9:11–14 | Section 07-bible-experience-i-Q134, Section 07-bible-experience-i-Q136, Section 07-bible-experience-i-Q150, Section 08-bible-experience-ii-Q70 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Hebrews%209:11-14&version=ESV) |
| Isaiah 53:10 | Section 07-bible-experience-i-Q145 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Isaiah%2053:10&version=ESV) |
| Isaiah 53:11 | Section 07-bible-experience-i-Q146 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Isaiah%2053:11&version=ESV) |
| Isaiah 53:4 | Section 07-bible-experience-i-Q143 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Isaiah%2053:4&version=ESV) |
| Isaiah 9:6 | Section 04-christology-Q8 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Isaiah%209%3A6&version=ESV) |
| James 1:13–15 | Section 05-christian-conduct-Q112 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=James%201%3A13-15&version=ESV) |
| James 1:14–15 | Section 05-christian-conduct-Q90 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=James%201%3A14-15&version=ESV) |
| James 1:2–4 | Section 05-christian-conduct-Q103, Section 05-christian-conduct-Q112 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=James%201%3A2-4&version=ESV) |
| John 10:7–9 | Section 08-bible-experience-ii-Q86 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=John%2010:7-9&version=ESV) |
| John 1:14 | Section 04-christology-Q8 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=John%201%3A14&version=ESV) |
| John 1:29 | Section 08-bible-experience-ii-Q70 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=John%201:29&version=ESV) |
| Joshua 10:12–14 | Section 07-bible-experience-i-Q107 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Joshua%2010:12-14&version=ESV) |
| Jude 20 | Section 06-prayer-Q119, Section 06-prayer-Q84 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Jude%201%3A20&version=ESV) |
| Luke 10:42 | Section 07-bible-experience-i-Q61 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Luke%2010:42&version=ESV) |
| Luke 14:26 | Section 08-bible-experience-ii-Q87 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Luke%2014:26&version=ESV) |
| Luke 18:1 | Section 06-prayer-Q80 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Luke%2018%3A1&version=ESV) |
| Luke 22:44 | Section 04-christology-Q13, Section 04-christology-Q48 | [Bible Gateway ESV](https://www.esv.org/Luke+22%3A44/) |
| Luke 22:53 | Section 06-prayer-Q104 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Luke%2022%3A53&version=ESV) |
| Matthew 10:37 | Section 08-bible-experience-ii-Q87 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%2010:37&version=ESV) |
| Matthew 16:13–16 | Section 04-christology-Q33 | [Bible Gateway ESV](https://www.esv.org/Matthew+16%3A13-16/) |
| Matthew 22:37 | Section 04-christology-Q31, Section 04-christology-Q32 | [Bible Gateway ESV](https://www.esv.org/Matthew+22%3A37/) |
| Matthew 26:36–44 | Section 06-prayer-Q122 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%2026%3A36-44&version=ESV) |
| Matthew 26:40–41 | Section 06-prayer-Q16, Section 06-prayer-Q72 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%2026%3A40-41&version=ESV) |
| Matthew 26:41 | Section 06-prayer-Q3, Section 06-prayer-Q80 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%2026%3A41&version=ESV) |
| Matthew 28:19–20 | Section 08-bible-experience-ii-Q91 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%2028:19-20&version=ESV) |
| Matthew 4:1–11 | Section 06-prayer-Q48 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%204%3A1-11&version=ESV) |
| Matthew 4:1–11 | Section 07-bible-experience-i-Q62 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%204:1-11&version=ESV) |
| Matthew 4:1–4; Matthew 4:4 | Section 05-christian-conduct-Q12, Section 05-christian-conduct-Q14, Section 05-christian-conduct-Q74, Section 05-christian-conduct-Q76 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Matthew%204%3A1-4&version=ESV) |
| Philippians 1:23 | Section 04-christology-Q70 | [Bible Gateway ESV](https://www.esv.org/Philippians+1%3A23/) |
| Philippians 2:12–13 | Section 05-christian-conduct-Q58 | [Bible Gateway ESV](https://www.esv.org/Philippians+2%3A12-13/) |
| Philippians 4:2–3 | Section 08-bible-experience-ii-Q59 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Philippians%204:2-3&version=ESV) |
| Proverbs 23:20–21 | Section 05-christian-conduct-Q89 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Proverbs%2023%3A20-21&version=ESV) |
| Revelation 4:8–11 | Section 06-prayer-Q107 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Revelation%204%3A8-11&version=ESV) |
| Romans 16:16 | Section 07-bible-experience-i-Q89, Section 08-bible-experience-ii-Q88, Section 08-bible-experience-ii-Q89 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Romans%2016:16&version=ESV) |
| Romans 16:1–7 | Section 08-bible-experience-ii-Q59 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Romans%2016:1-7&version=ESV) |
| Romans 3:4 | Section 03-predestination-and-trinity-Q56 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Romans%203%3A4&version=ESV) |
| Romans 6:2 | Section 05-christian-conduct-Q34 | [Bible Gateway ESV](https://www.esv.org/Romans+6%3A2/) |
| Romans 8:11 | Section 05-christian-conduct-Q66 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Romans%208%3A11&version=ESV) |
| Romans 8:15 | Section 06-prayer-Q38 | [Bible Gateway ESV](https://www.biblegateway.com/passage/?search=Romans%208%3A15&version=ESV) |


### Questions left unresolved

The IDs below are the current questions still lacking `BIBLE:`. IDs in a row share the stated reason. No-`REF:` questions are listed explicitly because a transcript-window check could not be performed.

| Deck | Unresolved question IDs | Why no BIBLE field was added |
|---|---|---|
| section-01-soteriology.txt | Q36 | The lesson critiques the inherited-sin/virgin-birth argument but gives no direct passage resolving the proposed biological transmission through Mary. |
| section-01-soteriology.txt | Q71 | The razor-blade image is a general pastoral metaphor; the REF segment does not identify a passage that directly supports the two extremes. |
| section-02-soteriology-ii.txt | Q67 | The answer is a pastoral explanation about social conditioning and assurance; the transcript does not ground that cause in a specific passage. |
| section-02-soteriology-ii.txt | Q93 | The fate of children and people unable to hear the gospel is presented as a disputed theological opinion; no sufficiently direct, uncontested text settles it. |
| section-03-predestination-and-trinity.txt | Q31, Q55 | These ask for interpretive method or a response to logical objections; no single passage directly establishes the stated method or resolves the analogy. |
| section-03-predestination-and-trinity.txt | Q58 | The lesson’s identification of certain “angel of the Lord” appearances with the Son is an interpretive claim; the relevant narratives do not conclusively settle that identity. |
| section-04-christology.txt | Q45, Q46 | These are historical claims about Athanasius, Arius, and Nicaea; a Bible passage cannot verify the historical event. |
| section-04-christology.txt | Q53, Q54, Q55 | These ask about technical formulations of the Trinity/Christ’s natures and natural analogies; no single directly supporting passage establishes the wording without overclaiming. |
| section-04-christology.txt | Q85, Q87 | The transcript’s pre-incarnate-Christ and “two Yahwehs” readings are disputed interpretations. The cited narratives are relevant but do not conclusively establish those readings. |
| section-04-christology.txt | Q90 | This is a contextual-interpretation caution rather than a specific biblical claim; no passage directly states the rule in the question. |
| section-05-christian-conduct.txt | Q35 | The assertion that a Christian cannot have a demon is doctrinally disputed; the cited reasoning does not provide a passage that directly and conclusively establishes it. |
| section-05-christian-conduct.txt | Q82, Q83, Q84 | These questions rely on survey statistics and historical estimates, not biblical claims. |
| section-05-christian-conduct.txt | Q22, Q69, Q71, Q73, Q80, Q88, Q91, Q92, Q93, Q94, Q99, Q100, Q107, Q109, Q117, Q118, Q131 | These are personal illustrations, habits, or practical applications; their matched transcript windows supplied no direct verse supporting the specific answer. |
| section-06-prayer.txt | Q40 | Genesis 12:8 records an altar and worship at Bethel, but does not say the altar was built to secure God’s next instructions; that inference was left uncited. |
| section-06-prayer.txt | Q4, Q13, Q17, Q18, Q21, Q22, Q23, Q26, Q27, Q28, Q30, Q31, Q41, Q46, Q47, Q51, Q52, Q53, Q54, Q55, Q56, Q57, Q61, Q63, Q64, Q65, Q66, Q71, Q76, Q77, Q78, Q79, Q81, Q82, Q93, Q94, Q95, Q96, Q105, Q106, Q111, Q112, Q113, Q114, Q115, Q116, Q120, Q121, Q123 | These describe prayer habits, analogies, or personal spiritual practice; the matched transcript windows did not give a specific passage that directly supports the answer. |
| section-07-bible-experience-i.txt | Q87 | The application of 1 Corinthians 11 to the veil/head covering is disputed; the passage is the debate’s source but does not settle the cultural interpretation conclusively. |
| section-07-bible-experience-i.txt | Q138 | The Joshua/Jesus-name comparison and promised-land typology are interpretive/etymological claims; no direct passage establishes the full analogy. |
| section-07-bible-experience-i.txt | Q2, Q4, Q5, Q6, Q8, Q10, Q14, Q24, Q31, Q32, Q33, Q34, Q39, Q42, Q44, Q45, Q46, Q47, Q48, Q50, Q53, Q55, Q56, Q57, Q58, Q59, Q64, Q65, Q66, Q67, Q72, Q73, Q74, Q76, Q77, Q78, Q79, Q84, Q96, Q97, Q102, Q103, Q106, Q115, Q121, Q128, Q149 | These concern interpretation methods, language, church history, or general theological claims; no directly supporting passage was identified in the matched REF segment. |
| section-08-bible-experience-ii.txt | Q11 | How God relates to Pharaoh’s wickedness is a contested interpretation; the transcript’s framing is not conclusively established by a single direct passage. |
| section-08-bible-experience-ii.txt | Q54 | The meaning and application of “silence” in 1 Corinthians 14 / 1 Timothy 2 are disputed; no BIBLE field was added as though one reading were conclusive. |
| section-08-bible-experience-ii.txt | Q75 | The sequence mapping the Red Sea, Sinai, Spirit reception, and discipleship is a typological framework; the cited narrative does not state that full mapping directly. |
| section-08-bible-experience-ii.txt | Q2, Q5, Q7, Q8, Q14, Q15, Q16, Q24, Q25, Q34, Q35, Q36, Q60, Q92, Q94, Q95, Q96, Q97, Q98, Q99, Q100, Q101, Q102, Q103, Q104, Q107, Q108, Q109, Q110, Q111, Q115, Q116, Q117, Q118, Q122, Q123, Q124, Q126 | These are historical, methodological, or pastoral claims; the corresponding transcript segment did not identify a sufficiently direct passage. |
| section-09-evangelism.txt | Q238 | The Sabbath question is a contested theological application. Genesis and Colossians are relevant, but they do not settle the obligation question without adopting a disputed interpretation. |
| section-09-evangelism.txt | Q256 | The question of African traditional deities’ existence is theological and interpretive; 1 Corinthians 10 is relevant to idolatry but does not establish the specific ontology conclusively. |
| section-09-evangelism.txt | Q1, Q7, Q10, Q17, Q20, Q30, Q50, Q52, Q54, Q55, Q56, Q60, Q66, Q69, Q71, Q72, Q75, Q77, Q82, Q83, Q86, Q87, Q90, Q91, Q92, Q93, Q94, Q95, Q96, Q97, Q98, Q100, Q101, Q102, Q103, Q106, Q107, Q108, Q109, Q110, Q111, Q112, Q113, Q114, Q115, Q116, Q117, Q118, Q119, Q120, Q121, Q122, Q124, Q125, Q129, Q130, Q132, Q136, Q137, Q138, Q140, Q144, Q145, Q147, Q148, Q150, Q156, Q157, Q159, Q160, Q162, Q163, Q164, Q165, Q167, Q168, Q170, Q171, Q172, Q173, Q174, Q175, Q176, Q177, Q178, Q179, Q180, Q181, Q183, Q184, Q186, Q188, Q189, Q191, Q192, Q193, Q194, Q197, Q198, Q199, Q200, Q201, Q202, Q205, Q206, Q207, Q208, Q209, Q210, Q211, Q212, Q213, Q214, Q215, Q217, Q218, Q219, Q221, Q222, Q223, Q226, Q227, Q228, Q236, Q237, Q239, Q243, Q244, Q245, Q246, Q247, Q248, Q249, Q250, Q251, Q252, Q253, Q254, Q255, Q257, Q258 | These describe religious history, denominational positions, statistics, or evangelism practice; no specific passage directly supports the answer in the matched REF segment. |
| section-10-apologetics.txt | Q72 | The proposed medical cause of death by crucifixion is a historical/medical explanation not stated directly by a biblical text. |
| section-10-apologetics.txt | Q1, Q3, Q7, Q12, Q13, Q14, Q15, Q17, Q20, Q22, Q25, Q26, Q28, Q34, Q35, Q36, Q40, Q47, Q51, Q52, Q53, Q54, Q56, Q59, Q61, Q62, Q63, Q64, Q71, Q75, Q76, Q82, Q83 | These concern historical evidence, apologetic methods, or disputed theological claims; no directly supporting biblical passage was identified for the specific answer. |
| section-11-believers-authority-charisma.txt | Q33 | The claim that believers’ presence prevents total demonic destruction of the earth is a speculative theological application; no directly supporting passage was verified. |
| section-11-believers-authority-charisma.txt | Q3, Q5, Q6, Q8, Q9, Q10, Q11, Q12, Q13, Q15, Q17, Q18, Q19, Q21, Q26, Q30, Q32, Q34, Q37, Q38, Q42, Q45, Q47, Q49, Q57, Q59, Q60, Q64, Q67, Q76, Q78, Q80, Q84, Q85, Q87, Q88, Q89, Q90, Q91, Q95, Q96, Q98, Q99, Q100 | These are anecdotes or broad claims about spiritual authority and deliverance; the timestamped lesson passage did not supply an uncontested direct reference. |
| section-12-church-history.txt | Q2, Q4, Q9, Q17, Q20, Q25 | These questions have no usable REF or matching lesson transcript. They ask historical/doctrinal descriptions, and no direct passage is provided in the question text. |
| section-12-church-history.txt | Q1, Q8, Q10, Q12, Q13, Q14, Q15, Q22, Q23, Q24, Q26, Q27, Q29, Q33, Q34, Q35, Q36, Q37, Q38, Q39, Q40, Q41, Q42, Q43, Q45, Q46, Q47, Q48, Q50, Q51, Q53, Q55, Q56, Q58, Q60, Q64, Q68, Q69, Q70, Q74, Q75, Q76, Q77, Q78, Q80, Q81, Q82, Q83, Q84, Q85, Q86, Q88, Q89, Q95, Q96, Q97, Q98, Q100 | These are historical or denominational claims, or theological interpretations not settled by one direct passage; no sufficiently direct verse was verified. |


The unresolved total is **462**. The six no-`REF:` questions are Section 12 Q2, Q4, Q9, Q17, Q20, and Q25. No question or answer wording was changed.
