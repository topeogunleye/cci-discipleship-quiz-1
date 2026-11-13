**CCI discipleship app — QA and repair handoff**

Prepared 5 November 2026 (Africa/Lagos). This report records completed checks and a proposed continuation plan. The proposed fixes and runtime checks have not been performed.

**Current status**

The requested Cloudflare Pages preview was not deployed because the exact target commit fails the repository build. No preview URL or deployment ID exists for this QA attempt. No live application checks can be marked as passing.

- Repository: https://github.com/topeogunleye/cci-discipleship-quiz-1
- Audited commit: `3e9cd56356153ab5d729346a9d870ec4bca20fd4`
- Existing Cloudflare Pages project: `cci-discipleship-quiz`
- Production branch: `main`
- Local QA branch created: `codex/qa-3e9cd563-20261105`, pointing to the audited commit. It was not pushed and will not automatically exist on the work computer.
- No application source changes, production configuration changes, deployment uploads, or learner-data operations were performed by this QA task. The supplied dedicated test email was not used because deployment was blocked.
- The shared working checkout changed during the audit. Findings below use the exact commit's Git blobs and an isolated source export, excluding those uncommitted changes.

**Highest-priority defect: transcript conversion prevents the build**

`npm ci` completed successfully. `npm run build` exited with code 1 under both Node 24.17.0 and Node 22.23.4. Node 22 matches the major version configured in `.github/workflows/pages-deployment.yml`.

The first reported failure was:

```text
Error: Transcript cue 100 has no valid timing line.
    at js/transcripts.js:20
    at scripts/build.js:80
```

The explicit manifest's first mapping is `section-02-assurance`, referencing:

```text
transcript/ASSURANCE-Celebration-Church-International-LMS-mp4-c4c9cbaa-7d12.srt
```

Line 398 is a standalone literal `\n` marker: a backslash character followed by the letter n. It is not an actual newline. The parser treats the final block as another cue, finds no timing line, and throws.

The issue affects every one of the 83 mapped SRT files. An independent inventory also found the terminal marker in all 125 source SRTs. The build stops at Assurance, so removing only that file's marker would leave the broader issue unresolved.

Relevant files at the audited commit:

- `content/lesson-transcripts.json:5` — first explicit mapping.
- `js/transcripts.js:20` — error when a cue block has no timing line.
- `scripts/build.js:80` — conversion of each mapped source to VTT.
- `.github/workflows/pages-deployment.yml` — CI Node version and build/deployment process.

The committed `dist/` already contains 83 syntactically parseable VTT files. That does not demonstrate that the configured build succeeds or that captions match the videos. No deployment was attempted using those pre-existing files or the failed build's partial output.

**Reproduce at work**

Use a clean checkout and Node 22. Preserve any existing local work before changing branches.

```powershell
git switch -c codex/fix-transcript-build 3e9cd56356153ab5d729346a9d870ec4bca20fd4
npm ci
npm run build
```

Expected result at the original commit: exit code 1 with the cue-100 error above. No Supabase credentials or Cloudflare deployment are needed to reproduce this conversion failure. The deploy workflow's `npm run sync` invokes the same failing build step.

**Suggested fix and acceptance criteria**

Choose an explicit policy for the exporter artifact: normalize the known terminal marker in source preparation, or handle that exact trailing marker in parsing. Do not broadly discard malformed cue blocks merely to make the build pass.

1. Add a regression case using the exact terminal literal-marker shape found in the committed SRTs. Verify the selected policy handles it without deleting valid cue text or changing timestamps.
2. Preserve existing malformed-cue validation. Include a genuinely malformed timing block to ensure the fix does not silently accept arbitrary invalid input.
3. Convert all 83 explicitly mapped sources successfully and parse their generated VTTs. Inspect the remaining source inventory for the same artifact.
4. Preserve the 83 explicit mappings. Keep unresolved videos unmapped until their source correspondence is independently verified.
5. From a clean checkout of the corrected commit under Node 22, run `npm ci`, `npm run build`, and `npm test`. Then complete the existing deployment workflow's preparation steps, including `npm run sync` and `node scripts/build.js`. These are future checks; this QA attempt did not run the full test suite.
6. Record the new full commit SHA. Fixing the source requires a new commit; it cannot change the immutable audited commit.

**Mapping audit results**

Structural consistency: **Pass**. This does not establish semantic video/transcript correspondence or synchronization.

| Inventory/check | Observed result |
|---|---|
| Video catalog | 109 unique video IDs and 109 unique R2 object keys |
| Deck references | All 109 reference the 12 canonical decks |
| Explicit transcript manifest | 83 unique video IDs and 83 unique source filenames |
| Mapped source availability | All mapped source files and video IDs exist |
| Manifest agreement | Source, committed `dist/content`, and `dist/index.html` inline fallbacks agree |
| Committed VTT inventory | Exactly 83; none unlisted; all parse syntactically |
| Manifest bypasses | No catalog transcript/caption URL overrides found |
| Unresolved videos | 26 remain unmapped: 18 ambiguous and 8 lacking matching timed-source inventory |

The eight without matching timed-source inventory are Justification; Original Sin; Repentance; Those Who Never Heard the Gospel; Jesus Son of God I; School of Prayer I, V, and VII.

The 18 ambiguous videos are Theodicy IV; How to Cast Out Demons I–IV; Manifesting the Presence of God I–III; Power in the Blood I–IV; Who Are You I–II; Predestination I–II; and Trinity I–II. Each has multiple nonidentical candidate sources. No match was inferred. The unresolved counts agree with the repository's test expectations; actual R2 object availability and content were not verified.

**Cloudflare access and Preview configuration**

The Cloudflare project API returned HTTP 200, and local Wrangler authorization included Pages write access. The existing project uses direct uploads and has `dist` configured as its output directory; no Git source integration was returned by the project API.

Preview configuration entries were verified:

| Setting | Observed state |
|---|---|
| R2 binding | `LESSON_VIDEOS` points to `cci-lesson-videos` |
| Supabase URL | `SUPABASE_URL` is present and has the expected URL format |
| Supabase public key | `SUPABASE_PUBLISHABLE_KEY` is present as an encrypted secret; its value was not exposed or validated |
| Alternate key | `SUPABASE_ANON_KEY` is absent; the publishable-key alternative is configured |

No missing Preview setting was identified in preflight. Actual Supabase authentication and R2 access remain unverified. Cloudflare credentials from the home computer must not be copied into this report, chat, or Git. At work, use normal authorized Cloudflare access to the existing account/project.

After the corrected commit builds, deploy it using a separate non-production QA branch identifier and the existing project's Preview environment. The installed Wrangler CLI supports this command shape:

```powershell
$qaCommit = git rev-parse HEAD
npx wrangler pages deploy dist --project-name cci-discipleship-quiz --branch codex/qa-transcript-fix --commit-hash $qaCommit
```

Use the corrected source checkout and successfully generated output. Confirm the returned deployment metadata says Preview and records the intended commit. Record the exact server-returned public URL and deployment ID; do not construct or guess the deployment URL. Verify that the public URL is reachable before testing.

Before sign-up, check `GET /api/auth/config` on that preview: require HTTP 200 with `configured: true`. Do not copy its key value into reports. If it returns 503, inspect the active Preview deployment's Supabase URL/key settings and redeploy after correcting Preview only. Keep the R2 bucket private. Do not change production configuration or copy production learner data.

**Runtime QA status and continuation checklist**

All six runtime areas below are **Not tested** because no preview was deployed. These are pending checks, not observed failures. Use only the dedicated test account; arrange email confirmation if the configured Supabase project requires it.

| Area | Steps to perform and evidence to record |
|---|---|
| 1. Sign-up and sign-in | Inspect labels; submit with keyboard/Enter; exercise empty fields and password validation; observe loading and backend errors; retry and verify email preservation and password clearing; capture visible focus. Record the actual response and UI behavior without credentials. |
| 2. Gated lesson access | Open a specific lesson while signed out, sign in, and verify that exact lesson is restored. Sign out; verify video/transcript access is blocked again. Record the lesson ID and observed destination. |
| 3. Video and captions | Start a real lesson video and observe advancing playback time. Enable captions and compare their timing to audible speech at multiple positions, including after seeking. Record the lesson and playback positions. |
| 4. Transcript and activities | Search for a word present in the transcript and inspect relevance. Select a timestamp and compare the resulting playback time. Open Flashcards and Take quiz; verify both use the intended lesson/deck. |
| 5. Mobile and accessibility | Test a narrow viewport, such as 375 × 812. Check horizontal overflow, usable controls, keyboard order, and visible focus on account forms and the lesson interface. Record viewport size and evidence. |
| 6. Transcript privacy/cache | Request a mapped `.vtt` in a clean unauthenticated session and record the actual HTTP status; the audited middleware intends 401. Authenticate and verify 200 with valid VTT and `Cache-Control: private, no-store`. Sign out and repeat. Repeat with a service worker already installed and verify a previously successful private response is not returned from stale cache. Record status, relevant headers, and whether the response came from network or cache; redact cookies/tokens. |

For every completed check, report Pass, Fail, or Not tested; exact steps; concise observable evidence; and whether any limitation comes from application behavior or environment setup. Do not treat source inspection, passing unit tests, or parseable VTTs as proof of live playback, synchronization, or privacy.

**Resume point**

Fix and commit the terminal-marker handling; build and validate that new commit; deploy it to Preview; record the exact reachable URL and deployment identity; then complete the runtime checklist. Current preview URL: none. Current deployment ID: none. Highest-priority issue: the confirmed transcript conversion build failure. No Cloudflare configuration change is currently indicated by the available evidence.
