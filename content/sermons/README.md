# Adding a Sunday sermon

A sermon is three things. No code changes are needed.

1. **An entry in `content/sermons.json`** (copy the sample and change it):
   - `id`: lowercase letters, numbers and hyphens, e.g. `2026-11-01-the-good-shepherd`
   - `title`, `speaker`, `date` (`YYYY-MM-DD`), `scripture`, optional `series`, `subtitle`, `scriptureText`
   - `body`: the written devotional version, a list of paragraphs (about 2 to 5 minutes of reading)
   - optional `reflection` and `step`
   - `readMinutes`, `gradient` (`deck-grad-1` to `deck-grad-12`)
   - `status`: `"draft"` while you check it, `"published"` when members should see it
   - `deckFile`: the name of the quiz file below
   - `audio`: `{ "url": "https://...", "durationSec": 2700, "sizeBytes": 25000000 }`
2. **A quiz deck** at `content/sermons/<deckFile>`, in the same format as the discipleship decks (`DECK:` line, then `Q1.` ... with `ANSWER:`, `EXPLANATION:`, `REF:`, `BIBLE:`). Aim for 5 or more questions.
3. **The recording**, uploaded to your own storage or web server as a mono MP3 (about 64 kbps is plenty for speech, roughly 0.5 MB per minute). Paste its `https://` link into `audio.url`.

Your audio host must allow:
- **Byte ranges** (so members can seek). Most hosts do by default.
- **CORS** for your app's address (so "Download for offline" works in the browser). Streaming works without it.

Then run `npm run validate:sermons` and `npm test`, set `status` to `published`, and deploy.

Members only download recordings when they tap "Download" on a sermon. Recordings are never bundled or cached automatically.
