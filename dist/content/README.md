# Offline Devotionals

`devotionals.json` is bundled with the app and precached by the service worker. It is an offline, read-only content file; readers’ state is saved locally in the existing app store and included in user backups.

## Article schema

Each article has these fields:

- `id`: stable, unique slug.
- `title`, `subtitle`: short reader-facing copy.
- `scripture`: references copied exactly from the related lesson deck’s `BIBLE:` field; it is optional when a deck has no suitable verified reference.
- `scriptureText`: optional quoted translation text. Use only public-domain KJV or WEB text unless the project has written permission/licensing for another translation. Record the translation and applicable licence in `sources`.
- `body`: an array of short paragraph strings; 150–250 words total per starter article.
- `reflection`: one open-ended question grounded in the source lesson.
- `step`: one modest, optional action grounded in that lesson.
- `lessonId`: exact existing deck ID used by “Study this lesson”.
- `readMinutes`: positive integer estimate.
- `gradient`: one of the project’s deck gradient classes (`deck-grad-1` … `deck-grad-12`) following `decks/manifest.json` order.
- `status`: `draft` or `reviewed`.
- `sources`: an array identifying the source deck and exact `BIBLE:` references used. Include translation/licence provenance when `scriptureText` is present.

## Draft and review gate

All starter articles enter the repository with `status: "draft"`. The app hides drafts by default. A learner can opt into a clearly labelled local preview in **Settings → Content → Preview devotional drafts**; this toggle does not publish or change the article status. Before an article may be presented as reviewed/released content, a discipleship leader must verify its alignment with the lesson, references, wording, and any Scripture quotation. Only after that review may the content maintainer change its status to `reviewed` in `devotionals.json` and document the review in the project’s normal review process. Never describe an unreviewed draft as church-approved teaching.

## Authoring and maintenance

Use only the lesson’s existing deck text and verified `BIBLE:` references as the basis for an article. Do not add doctrinal claims, Scripture quotations, named-author attributions, or references that cannot be verified from those materials. Do not edit deck files while authoring devotionals. Keep the JSON valid UTF-8; validate IDs, exact `lessonId`s, source references, status, and 150–250-word body length in tests. After content changes, run `npm run build` (or `npm run sync` when native assets matter), then the test suite. The service worker precaches this file so reviewed content and opted-in drafts can be read offline.
