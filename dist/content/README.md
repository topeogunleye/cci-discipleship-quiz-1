# Devotional Content Guide

This directory contains offline, bundled devotional content for the CCI Discipleship Study App.

## Schema: `content/devotionals.json`

Each entry in `content/devotionals.json` is a JSON object with the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier (e.g. `devotional-soteriology`). |
| `title` | `string` | Article title (engaging, doctrinal, inspiring). |
| `subtitle` | `string` | Short explanatory subtitle. |
| `scripture` | `string` | Primary scripture reference (e.g. `Ephesians 2:8-9`). |
| `scriptureText` | `string` | Optional full text of the scripture. Must be public domain (KJV or WEB only) unless a licence is explicitly supplied. |
| `body` | `string[]` | Array of paragraphs containing the devotional content (150–250 words total). |
| `reflection` | `string` | Thoughtful question or reflection prompt for the believer. |
| `step` | `string` | Concrete, actionable step for today. |
| `lessonId` | `string` | Matching deck ID from `decks/manifest.json` (e.g. `d-discipleship-experience-section-1-soteriology`). |
| `readMinutes` | `number` | Estimated read time in minutes (typically 2). |
| `gradient` | `string` | Gradient CSS class (e.g. `deck-grad-1` through `deck-grad-12`). |
| `status` | `"draft" \| "reviewed"` | Publication status. Production builds hide `draft` articles by default. |
| `sources` | `string[]` | Array of scripture citations and lesson reference points. |

## Review & Approval Rule

- **Draft gating:** All newly authored articles must start with `status: "draft"`.
- **Leader review:** An article may only be promoted to `status: "reviewed"` after explicit review and approval by CCI leadership.
- **Production display:** In production builds, draft articles are hidden unless the user explicitly enables "Show Draft Devotionals" in **Settings > Content**.

## Scripture Licence Rule

- Only public-domain Bible translations (such as the King James Version [KJV] or World English Bible [WEB]) may be included in `scriptureText` without separate licensing documentation.
- When referencing modern copyright-protected translations, provide the citation in `scripture` and `sources` without quoting long verbatim passages in `scriptureText`.

## How to Author and Add New Articles

1. **Root in Existing Lessons:** Write devotionals derived directly from the discipleship curriculum lessons and verified Scripture references from the deck.
2. **Word Count:** Ensure the `body` paragraph array contains between 150 and 250 words total.
3. **Tone & Doctrine:** Maintain a coaching, uplifting, and doctrinally sound voice rooted in grace and the finished work of Christ.
4. **Validation:** Run `npm test` to verify JSON syntax, schema conformance, and draft filtering behavior.
