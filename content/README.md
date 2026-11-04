# Devotional Content Guide

This directory contains offline, bundled devotional content for the CCI Discipleship Study App.

## Optional lesson videos: `content/lesson-videos.json`

This catalog connects a CCI lesson deck to one or more direct video files. It is empty until approved lesson video URLs are supplied.

Each entry in `videos` may contain:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable unique ID for the recording. |
| `deckId` | `string` | Matching deck ID, such as `d-discipleship-experience-section-1-soteriology`. |
| `title` | `string` | Recording or lesson title. |
| `videoUrl` | `string` | Direct HTTPS video file URL (MP4/WebM), or a same-origin URL. |
| `posterUrl` | `string` | Optional image URL for the video poster. |
| `captionsUrl` | `string` | Optional WebVTT caption file URL. |
| `captionsLanguage` | `string` | Optional BCP 47 language code for captions (defaults to `en`). |
| `captionsLabel` | `string` | Optional captions menu label (defaults to `English`). |

Example:

```json
{
  "schemaVersion": 1,
  "videos": [
    {
      "id": "soteriology-introduction",
      "deckId": "d-discipleship-experience-section-1-soteriology",
      "title": "Soteriology: Introduction",
      "videoUrl": "https://media.example.org/soteriology-introduction.mp4",
      "captionsUrl": "https://media.example.org/soteriology-introduction.en.vtt",
      "captionsLanguage": "en",
      "captionsLabel": "English"
    }
  ]
}
```

Use public or otherwise authorized direct media URLs. Do not put API keys, signed credentials, or private tokens in this checked-in file. YouTube/Vimeo watch-page URLs are not direct video files and are not supported by the native video player.

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
