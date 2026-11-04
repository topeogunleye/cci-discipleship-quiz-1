# Accounts, progress sync, and private lesson videos

CCI Study remains usable without an account. Guest progress is stored in a separate local profile. A signed-in learner gets a local profile keyed to their Supabase user ID, and can explicitly merge the guest profile into that account from **Settings → Account & Sync**. Signing out returns to the guest profile; it does not erase either profile.

Progress is written locally first. When online, the app merges progress for the 12 canonical CCI study decks: card attempts, best quiz scores, daily completion counts, and streak dates. Custom deck content and progress remain local because syncing user-created deck content requires a separate sharing decision. The app uses authenticated Supabase RPCs. The database compares a version number before each write; if another device updated the account first, the app reads the new version, merges both sides against the last shared snapshot, and retries. Per-device counters make those retries idempotent, and guest-import receipts are stored in the same versioned cloud snapshot so repeating an import does not add the same attempts twice. Only the authenticated user can call the RPCs. The browser uses the Supabase publishable/anon key; no service-role key belongs in this app.

Lesson recordings remain in the private R2 bucket. The client catalog contains only R2 object keys. Pages Functions validate the Supabase access token, set an HttpOnly video-session cookie, and stream R2 objects with byte-range support. The bucket must stay private and must not receive a public domain. Signed-out guests can still study locally but cannot retrieve video bytes.

## One-time setup

1. Create a Supabase project and enable email/password sign-in and public self-registration. No CCI approval workflow is used. Disable email confirmation if newly registered learners must be able to watch immediately; if confirmation stays enabled, learners must confirm their email before signing in.
2. Apply `supabase/migrations/20261103000000_user_progress.sql` to the project. It creates an RLS-enabled progress table with no direct client table access and two authenticated RPCs.
3. In the Cloudflare Pages project `cci-discipleship-quiz`, keep the R2 bucket private and add an R2 binding named `LESSON_VIDEOS` pointing to `cci-lesson-videos`. `wrangler.toml` declares this binding for deploys and local Pages development.
4. Set Pages production and preview variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`). These values are read by the Pages Functions; the app receives only the public URL and publishable key from `/api/auth/config`.
5. Set `ALLOWED_APP_ORIGINS` to the exact origins of native app builds that call the Pages API from a different origin. Use the origins reported by the installed Capacitor WebViews, commonly `capacitor://localhost` for iOS and `http://localhost` for Android. Web app requests are same-origin. Separate values with commas.
6. Deploy the Pages project after setting the binding and variables. No video upload is required: the catalog already maps all 109 existing R2 objects to the canonical lesson deck IDs.

Do not put Supabase service-role keys, R2 credentials, upload tokens, passwords, or user access tokens in this repository, `.dev.vars` committed files, or chat. Supabase Auth access tokens are held by the Supabase client and copied only to a Secure, HttpOnly cookie through the session function. The video cookie expires after at most five minutes; the app refreshes it every four minutes and when the learner returns to the app. Sign-out clears it. The cookie and all video responses are marked no-store.

## Local development and checks

Use `npm run build` to create the browser bundle. To exercise Pages Functions, serve `dist/` with `npx wrangler pages dev dist` and configure local Supabase variables plus a local or remote R2 binding outside Git. A plain static server can run the guest study experience but does not provide Pages Functions, authentication, cloud sync, or video streaming.

Run `npm test` for the existing tests plus account partitioning, progress merge/CAS, private video authorization, byte ranges, and lesson-catalog checks. Live authentication and actual R2 playback still require the Cloudflare and Supabase dashboard configuration above.
