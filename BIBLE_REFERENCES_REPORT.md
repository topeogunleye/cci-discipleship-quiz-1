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
