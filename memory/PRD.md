# Stompin' Ground Yuma — Line Dance App PRD

## Overview
Mobile app (Expo React Native) for **Stompin' Ground Yuma**, a Yuma, AZ country line-dance venue. Users of all ages can browse a curated line-dance library, save dances to a wishlist, mark them as completed, and add personal notes and ratings. Admins can add new dances.

## Personas
- **Dancer** — anyone (all ages). Wants to find and track line dances.
- **Admin** — venue owner. Can add/edit dances.

## Core Features (v1 — DONE)
- **Auth**: Email/password (JWT) + Google login (Emergent-managed).
- **Home**: Welcome hero (cowboy boots + Yuma), venue info, quick access to library, "Fresh on the Floor" preview.
- **Dance Library**: Search + filter chips (All / Beginner / Improver / Intermediate / Advanced). ~40 seeded dances with name, choreographer, song, artist, BPM, count, YouTube tutorial link, difficulty badge.
- **Dance Detail**: Hero, all metadata, "Watch Tutorial on YouTube" button, star rating (1-5), personal notes, sticky bottom CTA "Wishlist" / "Mark Completed".
- **My Dances**: Segmented tabs Completed / Wishlist with counts, per-dance rating + notes preview.
- **Profile**: Avatar, stats (Completed / Wishlist / Avg ★), admin badge, "Add New Dance" (admins only), sign out.

## Tech
- Backend: FastAPI + Motor (MongoDB), JWT via PyJWT, bcrypt, Emergent Google Auth via httpx.
- Frontend: Expo SDK 54, expo-router, expo-image, expo-linear-gradient, @expo/vector-icons, expo-secure-store, expo-web-browser, expo-linking.

## API surface
- `POST /api/auth/register|login|google-session|logout`, `GET /api/auth/me`
- `GET /api/dances`, `GET /api/dances/{id}`, `POST/PUT/DELETE /api/dances` (admin)
- `GET /api/tracking/me`, `POST /api/tracking/{dance_id}`, `DELETE /api/tracking/{dance_id}`
- `GET /api/venue`

## Data Models
- `users` (email unique, user_id unique, is_admin, password_hash, auth_provider)
- `user_sessions` (session_token, user_id, expires_at TTL)
- `dances` (id, name, choreographer, song, artist, difficulty, bpm, count, youtube_url)
- `tracking` (user_id + dance_id unique, status, rating 0-5, notes, updated_at)

## Business Enhancement Idea
Add an "Upcoming Classes" section on Home so the venue can drive attendance to real-world sessions — turns the app into a lead-gen tool for the business, not just a reference tool.

## Phase 1 Gamification (v1.6 — DONE)
- **Badges / Achievements**: 12 badges across 5 categories (milestone, streak, class, practice, variety). Auto-awarded on every write-side action (tracking completion, practice-log, class attendance). Persisted in `db.user_badges` (unique index user_id+badge_id).
- **Practice Streak**: Daily UTC-day-boundary streak (current + longest). Bumped only by completion or practice-log (not by attendance). Auto-expires on read if user misses >1 day.
- **Celebration**: Newly-earned badges cascade over the Celebrate screen fireworks in staggered animated cards (react-native-reanimated).
- **UI**: Full `/achievements` screen (12-badge grid grouped by category), Home streak card + unseen-badges CTA, Profile achievements section with badge showcase.
- **New endpoints**: `GET /api/badges`, `GET /api/streak`, `POST /api/badges/mark-seen`.

## Phase 2 Practice Enhancements (v1.7 — DONE)
- **Tempo Presets**: One-tap 75% / 90% / 100% / 110% snap buttons in Practice Mode. Snap the metronome + song-preview to a fraction of the dance's stored BPM. Active preset is highlighted in brand red.
- **Loop A/B Sections**: In Practice Mode, capture "A" and "B" markers as you play. When Loop is enabled, playback auto-seeks back to A the instant it reaches B. Live progress bar shows current position + colored A (blue) / B (yellow) pins.
- **30-Day Practice History**: New per-day rollup collection (`practice_daily`, upsert-keyed by user_id+day) driven by every practice-log call. New endpoint `GET /api/practice-history?days=N`. Profile screen renders a SVG bar-chart sparkline via new `PracticeHistoryChart` component + a 3-stat row (total sessions / days active / peak day).



## Phase 3 Social (v1.8 — DONE)
- **Follows**: `follows` collection (unique index follower_id+following_id), endpoints `POST /api/follows/{target_id}`, `DELETE /api/follows/{target_id}`, `GET /api/follows/{me|user_id}/{followers|following}`.
- **Activity Feed**: `activity_events` collection (indexed by user_id + created_at) with event_types `dance_completed`, `badge_earned`, `streak_milestone`. Endpoint `GET /api/feed?limit=N`.
- **Discovery**: `/follows` screen with tabs Find/Followers/Following and search. Profile toggle `show_in_activity_feed` respects opt-out.
- **UI**: Home tab shows a 3-event Community Activity preview; `/feed` full feed page; per-user `/users/[id]` mini-profile with Follow button.

## Phase 4 Instructor Event Search (v1.9 — DONE)
- **Backend**: New `/api/events/{search,types,mine,geocode}` endpoints + full CRUD. Geocoding proxied to Nominatim (`services/geocoding.py`). Events stored with GeoJSON `location: {type: "Point", coordinates: [lng, lat]}` + `2dsphere` MongoDB index for radius searches. Instructor-only writes; owner + admin-only edits.
- **Filters**: free-text `q`, event `type` (workshop/social/class/private_party), `level` (all 7 skill tiers), date window (upcoming / next-30 / past / any), location (GPS via `expo-location` OR by city substring), radius chips (10/25/50/100/250 mi), include-classes toggle.
- **UI**: New `/events` route with search bar, location strip, radius pill row, filters bottom sheet. Home tab now has a "Find Events Near You" CTA (`home-events-cta`). Instructors see a + button on `/events` to create; owner + admin get edit/delete on detail. Non-authenticated users get a friendly sign-in gate.
- **Permissions**: `expo-location` plugin added to `app.json` with iOS `NSLocationWhenInUseUsageDescription` and Android `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION`. Follows the app-wide permissions contract (check → prompt → openSettings fallback).
- **Endpoints**: `GET /api/events/search`, `GET /api/events/types`, `GET /api/events/mine`, `GET /api/events/{id}`, `POST /api/events`, `PATCH /api/events/{id}`, `DELETE /api/events/{id}`, `POST /api/events/geocode`.

## Phase 5 Social Reactions + Legal Groundwork (v2.0 — DONE)
- **Feed Reactions**: New `feed_reactions` collection (unique on user_id+event_id+kind). Endpoints `GET /api/feed/reaction-kinds`, `POST/DELETE /api/feed/{id}/reactions/{kind}`. Kinds = high_five 🙌, clap 👏, yeehaw 🤠, heart ❤️. `_hydrate_events` now returns `reactions:{counts, mine}` per event.
- **UI**: `FeedReactionsBar.tsx` — optimistic-update chips + "+" picker with 4 emoji. Feed cards restructured so tapping a reaction chip does NOT navigate into the dance/user.
- **Legal / Compliance package**:
  - Expanded `/privacy` — added location, event addresses, LLM providers, CCPA, GDPR, DMCA takedown sections.
  - New `/terms` — full ToS (dance activity risk, UGC, third-party events, DMCA, governing law).
  - New `/community-guidelines` — house rules for feed / reactions / chat.
  - `/auth` register screen now shows real Terms + Privacy + dance-activity acknowledgement (was just filler text).
  - `/feed` shows a "Be kind — Community Guidelines" link before the pull-to-refresh footer.
  - `/events` list + `/events/[id]` (non-owner view) show a third-party host disclaimer.
  - Profile Legal section — Terms, Privacy, Community Guidelines rows.

## Phase 6 Trust & Safety (v2.1 — DONE)
- **Age Gate Modal**: `AgeGateModal.tsx` mounted at app root. Uses AsyncStorage key `age_gate_ack_at`. Two-step flow: "I'm 13 or older" persists the ack, "I'm under 13" shows a "Ask a grown-up" message with a Back button. Terms + Privacy links inline. Won't re-prompt after confirmation.
- **Instructor Verification Badge**: `InstructorBadge.tsx` (xs/sm/md sizes). Small brand-blue circle with white checkmark next to instructor names on the feed (`feed-instructor-{id}`), event detail hero (`event-instructor-badge`), and public user profile (`profile-instructor-badge`). Backend hydrates `user.is_instructor` in `/api/feed`.
- **Report a Post**: New `feed_reports` collection with unique index on (reporter_id, event_id). Long-press ≥450ms on a feed card body opens `ReportFeedSheet.tsx` with 6 reasons (harassment, hate_speech, spam, impersonation, sexual_content, other) + optional 600-char note. Endpoints: `GET /api/feed/report-reasons`, `POST /api/feed/{id}/report`, `GET /api/admin/feed/reports` (admin-only, newest-first with reporter+reported names hydrated). Users cannot report their own posts. `purge_user` also cleans up both `reporter_id` and `reported_user_id` reports on account deletion.

## Phase 7 Sign in with Apple (v2.2 — DONE)
- **Backend**: New `services/apple_auth.py` verifies Apple identity tokens against Apple's JWKS (12h in-memory cache, per-kid public key lookup). Endpoint `POST /api/auth/apple` accepts `{identity_token, full_name?, email?}`, verifies iss/aud/exp/signature, looks up user by `apple_sub` (fast path) then by `email` (legacy linking), or creates a new user with `provider="apple"`. Returns the same `{token, user, is_new_user}` shape as the existing email/password + Google flows so the client uses one code path.
- **Private-relay support**: Users who tap "Hide My Email" get an `@privaterelay.appleid.com` alias saved as their profile email. Users with NO email in the token get a synthetic `apple:{sub}` email plus `email_is_synthetic=true` flag so password-reset UI can hide itself later.
- **Legacy linking**: If an existing email/password or Google user signs in with Apple using the same email, we attach `apple_sub` to their doc so subsequent Apple sign-ins hit the fast path.
- **DB**: `users.apple_sub` is now a sparse unique index — email/Google users are unaffected.
- **Env**: `APPLE_AUDIENCES="com.emergent.stompinyumaapp.uyr5zg,host.exp.Exponent"` in `backend/.env`.
- **Frontend**: `AppleSignInButton.tsx` renders the native `AppleAuthenticationButton` (App Store required) above the Google button on `/auth`. Gated by `Platform.OS === "ios"` + `isAvailableAsync()` so Android + web hide it cleanly. Cancel is silent; errors surface via the existing form error banner.
- **iOS config**: `app.json` sets `expo.ios.usesAppleSignIn = true`; `expo-apple-authentication@8.0.8` added to package.json.
- **Testing**: 14/14 pytest cases pass (`/app/backend/tests/test_apple_auth.py`) — JWKS mocked in-process so the real Apple endpoint is never hit. Playbook + manual test matrix at `/app/auth_testing.md`.
- **User action required before iOS testing**: Enable "Sign in with Apple" capability for App ID `com.emergent.stompinyumaapp.uyr5zg` in the Apple Developer portal, then trigger a fresh iOS build via the Emergent deploy panel.

## Phase 8 Calendar & Time Pickers on Event Form (v2.3 — DONE)
- **Frontend**: New reusable `DateTimeField.tsx` (`mode="date"|"time"`) replaces the plain YYYY-MM-DD / HH:MM text inputs on the New/Edit Event form.
  - iOS: opens the picker inside a bottom-sheet Modal with Cancel/Done buttons; draft state only commits on Done.
  - Android: fires the native dialog on tap; commits on `set`.
  - Web preview: falls back to browser `<input type="date|time">` with an icon overlay so it still feels native.
- Icons + display formatting (e.g. "Sat, Sep 14, 2026" and "7:30 PM") make the tap targets feel human, but the persisted value stays in the strict `YYYY-MM-DD` / `HH:MM` format the backend already validates, so no server changes required.
- Package: `@react-native-community/datetimepicker@8.4.4` installed via `yarn expo install`.

## Phase 9 Admin Moderation, Apple Linking & Multi-day Events (v2.4 — DONE)

### Admin Moderation Queue (new)
- **Screen**: `/app/admin/reports.tsx` — status-tabbed queue (Open / Actioned / Resolved / Dismissed / All) with pull-to-refresh. Auto-redirects non-admins to `(tabs)`.
- **Backend**: New `PATCH /api/admin/feed/reports/{report_id}` (report_id is composite `reporter_id:event_id`) sets status + resolution_note + resolved_by + resolved_at. New `DELETE /api/admin/feed/events/{event_id}` removes a flagged post + its reactions, leaves the report row intact for audit with `event_exists=false`.
- **GET /api/admin/feed/reports** now hydrates each row with `report_id`, `event_exists`, and a human `event_snippet` ("Completed a dance", "Earned a badge", etc.) so admins can decide without opening the app.
- **Profile entry**: New "SGY Admin → Feed Moderation Queue" row, admin-only.

### Link My Apple (new)
- **Backend**: `POST /api/auth/apple/link` verifies token via existing Apple JWKS pipeline and attaches `apple_sub` to the caller. Refuses with 409 if that Apple ID is already tied to another user. `POST /api/auth/apple/unlink` clears it — but refuses (400) when the caller has no password AND no non-synthetic email (would lock them out).
- **User serializer**: `UserOut` now surfaces `apple_sub` (as the string `"apple"` when linked; empty otherwise — we don't leak the raw sub) and `email_is_synthetic`.
- **Profile UI**: New `SignInMethodsSection.tsx` shows Email / Google / Apple rows with Connected pills and a native "Link Apple" button (iOS-only, gated by `isAvailableAsync`). Unlink is a small red link that confirms first.

### Multi-day Events (new)
- **Schema**: `EventIn.end_date` optional (YYYY-MM-DD). Stored on event doc; empty means single-day.
- **Search**: `date_from`/`date_to` now uses an OVERLAP filter (`$expr` + `$cond` on `end_date`) so a two-day workshop still shows up on Day 2 when the user queries "today".
- **Form**: `EventForm` now has an "End date (optional — for multi-day events)" `DateTimeField` and validates that end_date ≥ start_date.
- **Display**: `EventCard` collapses to "Fri, Sep 14 – 15" (same month) or "Fri, Sep 14 – Oct 2" (different month). Event detail hero reads "September 14 – 15, 2026".

### Tests
- New `test_backlog_features.py` (21 tests) + regression suites (`test_events.py`, `test_feed_reports.py`, `test_apple_auth.py`) → 63/63 backend tests pass.
- Playwright pass: admin flow works for Erin, Jamin gets redirected, fresh user gets 403 on admin endpoints.

## Phase 10 Home Reorder, Pick Main Instructor & Weekly Recap (v2.5 — DONE)

### Home Tab Reorder
- **Home CTAs** now flow: Streak + Weekly Recap → Achievements → Browse Dances → Community Activity → Recently Practiced → Boot Scoot Board → Find Events → Recent Class Recap → Suggest a Dance → About the Venue.
- **Redundant "example dances"** removed from the home hero — the poster carries the community values now.

### Pick Main Instructor
- **DB**: New `users.main_instructor_id` field. Every dancer chooses one instructor whose inbox receives their Suggest-a-Dance submissions.
- **Backend**: New router `routes/instructors.py` with `GET /api/instructors` (directory of `is_instructor` OR `is_admin` users), `PATCH /api/auth/me/main-instructor` (sets the caller's main instructor), and `DELETE /api/auth/me/main-instructor` (clears it). Instructor identity is enforced server-side.
- **Suggestions router**: `SuggestionIn.target_instructor_id` optional. Server falls back to caller's persisted `main_instructor_id`, or empty string (admin firehose) as a last resort. Persists `target_instructor_name` too for audit.
- **New endpoint**: `GET /api/suggestions/for-instructor` returns the suggestions routed to the calling instructor (any instructor or admin can call it).
- **Frontend**: `PickInstructorSheet.tsx` — bottom sheet with live search by name/city, visible verification checkmarks, tap-to-pick with confirm + saving spinner. Reused from Home (first-tap on Suggest a Dance if not picked yet) and Profile (dedicated "Main instructor · {Name} — tap to change" row).
- **Suggest screen**: header now reads "Suggest to {FirstName}" with a swap-icon at top-right to change instructors mid-session. Empty state prompts users to pick one before submitting. Success alert also personalises: "{FirstName} will review your idea soon."
- **Home CTA**: "Suggest a Dance" card also personalises to "Suggest a Dance for {FirstName}" once picked; before picking it reads "Pick your main instructor and send them your ideas."

### Weekly Recap Card
- **Backend**: New `GET /api/weekly-recap` — merges Practice-Mode opens (`practice_daily`) and completions (`tracking.updated_at`, `status="completed"`) across the current Monday→Sunday window. Returns `{days[], practices, completions, total, days_active, best_day}`.
- **Frontend**: `WeeklyRecapCard.tsx` on Home renders directly under the Streak card. Sunday shows a "🎉 Weekly Recap" celebration tone; Mon–Sat shows "This week so far". Includes 3-stat row (Practices · Completed · Best day) and Mon–Sun activity dots highlighting today. Card is hidden entirely when the user has 0 activity this week — no zero-shame states.

## Phase 11 Multi-Instructor Pick + Auto-Follow (v2.6 — DONE)

### Multi-Instructor Selection
- **DB**: `users.instructor_ids: string[]` — full list of instructors the dancer has "adopted". `main_instructor_id` remains as the Primary (drives Suggest-a-Dance routing) and is always included in the list when set.
- **Backend**: New `PUT /api/auth/me/instructors` — atomic body `{instructor_ids, main_instructor_id?, follow?}`. Validates each id is a real instructor/admin (silently drops bad ids), resolves Primary via explicit → existing → first-picked → cleared, upserts follow rows when `follow=true`, and returns `{ok, user (hydrated), new_follows}`.
- **Legacy `PATCH /api/auth/me/main-instructor`** now also `$addToSet` the target into `instructor_ids` so the single-pick and multi-pick paths stay in sync.

### Auto-Follow on Save
- Save operation optionally upserts a row in `db.follows` for every selected instructor (delegates to `services.social.follow` so it uses the canonical `followee_id` field and unique index — idempotent). Toast surfaces the net-new follow count.

### Frontend
- **`PickInstructorSheet.tsx`** rewritten as a multi-select bottom sheet with checkboxes, star-to-promote-Primary, sticky Cancel / "Save N picks" footer, and a "Follow when I save" toggle (default on).
- **Profile row**: renamed "Main instructor" → "My instructors" with dynamic subtitle "Primary: {Name} · +N more".

## Phase 12 Reactions v2 — Sound + Reactor Names + Pack Refresh (v2.7 — DONE)

### Reaction Pack Refresh
- **Swap**: 👏 (`clap`) → 🕺 (`dancer`). Current pack: `high_five` (🙌), `dancer` (🕺), `yeehaw` (🤠), `heart` (❤️). Legacy `clap` rows still render but are refused for new inserts.

### Reactor Names (long-press)
- **Backend**: `GET /api/feed/{event_id}/reactors?kind=&limit=` returns `{event_id, kind, reactors:[{user_id, name, picture, is_instructor, kind, emoji, created_at}], count}`.
- **Frontend**: Long-press (350ms) on any chip opens `ReactorsSheet.tsx`; long-press the "+" shows all reactors. Instructor checkmarks inline.

### Click Sound (silent-mode friendly)
- New `useTapSound()` hook wraps `expo-audio` with a bundled 50ms WAV click (`assets/sounds/reaction-tap.wav`, 4.3KB) + `expo-haptics.selectionAsync()` on non-web.
- `setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" })` so the ping plays over the silent switch without ducking Practice Mode audio.


## Phase 13 OTA Updates via expo-updates (v2.8 — SCAFFOLD ONLY, gated behind Emergent support)

### Why
User hit the "installed native build doesn't pick up new code" problem after Republishing. OTA would let any JavaScript / assets / config change roll out to already-installed compatible builds without waiting for App Store review.

### Current reality (2026-06)
Emergent Support confirmed via `support_agent`: **managed OTA / EAS Update is not a documented self-serve feature** on the platform today. The `REPLACE_WITH_EAS_PROJECT_ID` placeholders were never substituted at Publish time, so every OTA check was silently failing.

### What ships today
- `updates.enabled = false` in `app.json` (no more silent errors); `updates.url` and `extra.eas.projectId` placeholders removed.
- `useOTAUpdates` gated on `OTA_ENABLED = false` — every call short-circuits to `"up-to-date"` and every effect is a no-op.
- `UpdateBanner` renders `null` when the feature flag is off.
- Profile → old `CheckForUpdatesRow` replaced with `CurrentVersionRow` that shows the running app version + copy "Updates arrive with new App Store / Play Store releases."
- `expo-updates` package + `useOTAUpdates` hook kept in the tree so re-enabling is a 3-line flip once Emergent gives us managed OTA.

### Follow-up
- Email drafted at `/app/memory/emergent_support_email_ota.md` — user to send to `support@emergent.sh` requesting managed OTA + real `updates.url` + `extra.eas.projectId`.
- Once Emergent replies: flip `OTA_ENABLED = true` in the hook, plug the real IDs into `app.json`, restore `CheckForUpdatesRow` on Profile, redeploy.


## Phase 14 Version-Pin on Bug Reports + Silent OTA (v2.9 — DONE)

### Version-Pin on Bug Reports
- **`src/lib/diagnostics.ts`** collects `{app_version, build_number, sdk_version, runtime_version, ota_update_id, ota_channel, ota_is_embedded, platform, os_version}` from `expo-constants` + `expo-updates` + `Platform`, memoised per app-run.
- **Every** API request now auto-tags via the `X-Client-…` header set injected into the shared `req()` in `src/api/client.ts`.
- **`core/diagnostics.py::client_diagnostics`** FastAPI dependency extracts those headers.
- **`services/social.report_event`** persists diagnostics onto every new moderation report; older rows are untouched.
- **New router `routes/feedback.py`**:
  - `POST /api/feedback` — authenticated dancer sends `{message, category, screen?, context?}` and the server stamps `diagnostics` from the request headers.
  - `GET /api/admin/feedback?status=&category=&limit=` — admin list with per-status counts.
  - `PATCH /api/admin/feedback/{id}` — admin sets status (open/in_progress/resolved/wontfix) + private admin note.
- **`app/feedback.tsx`** — user-facing screen with category pills, message textarea, and a visible "Auto-attached to help us investigate" diagnostics footer so nothing feels sneaky.
- **`app/admin/feedback.tsx`** — status-tab list + detail sheet showing full diagnostics (channel, update id, runtime, platform) and Open/In progress/Resolved/Won't fix quick-actions with admin-only notes.
- **Profile rows**: `Send Feedback` for dancers, `User Feedback` under SGY Admin for admins.

### Silent OTA
- **`useOTAUpdates`** now inspects the newly-downloaded manifest's `extra.otaUpdate.silent` flag. Also probes `extra.expoClient.extra.otaUpdate.silent` and `metadata.otaUpdate.silent` for broader manifest shapes.
- Silent updates → status flips to `"silent-ready"`, banner does NOT render, install happens on next natural cold-start.
- Regular updates → banner appears with "Reload" CTA (unchanged behaviour).
- **Admin flow to publish silent hotfix**:
  1. Edit `app.json.extra.otaUpdate = { silent: true, reason: "typo fix" }`.
  2. Run `eas update --branch production --message "silent hotfix"`.
  3. Revert `app.json` before the next non-silent update.
- Because each OTA bundles its own `app.json`, the flag travels with the specific update and doesn't leak into future releases.


## Phase 18 BootStepper API Integration + Brand Polish (v3.3 — DONE)

### Why
Companion to Phase 17 (CopperKnob). Users hitting a wall in our own ~1,200-dance library needed a second external directory to widen the search. BootStepper's TOU + rate-limits are similar to CopperKnob's: metadata is fine, mirroring the raw stepsheet content isn't, and every surface must attribute + link back. Directory rules were strict: a **single local dance may carry BOTH `copperknob_ref` AND `bootstepper_ref` simultaneously** — the two integrations must never overwrite each other's fields.

### Backend
- **`services/bootstepper.py`** — the ONLY module that talks to `api.bootstepper.com`. Auth via `X-BootStepper-API-Key` env var. 10s timeout, 50-result hard cap, small in-process cache (60s search / 15min popular / 15min id) capped at 256 entries. `is_configured()` gate + graceful outage handling (never 500s). Normalises BootStepper's `danceChoreographers[0]` / `danceSongs[0]` shape into a stable dict mirroring CopperKnob's contract (so the UI can treat the two providers interchangeably where useful). **NEVER passes `includeStepSheet=true`** — we have no licence to persist third-party stepsheet content.
- **`routes/bootstepper.py`** — six routes:
  - `GET  /api/bootstepper/search?q=&limit=` — auth-required (any dancer). 2-char minimum, up to 50 results.
  - `GET  /api/bootstepper/popular?limit=` — BootStepper has no formal "popular" list; we approximate with `sortBy=videoCount desc`.
  - `GET  /api/bootstepper/dances/{id}` — single record + our match status (plus `has_copperknob_ref` / `has_bootstepper_ref` hint flags).
  - `POST /api/dances/from-bootstepper` — **admin-or-editor only**. Creates a new library listing pre-filled from a BootStepper id. Draft-by-default. Refuses on duplicate (409). Never touches CopperKnob fields.
  - `POST /api/dances/{dance_id}/link-bootstepper` — **admin-or-editor only**. Attaches a `bootstepper_ref` to an existing dance. Never touches CopperKnob refs/URLs or any other stored fields. Refuses if another dance already claims the id (409).
  - `GET  /api/dances/{dance_id}/bootstepper-compare` — **admin-or-editor only**. Field-by-field diff. Read-only.
- **Sticky-guard on `PUT /api/dances/{id}`** — extended `update_dance` in `routes/dances.py` so that when a client PUTs without including `copperknob_ref`/`copperknob_url`/`bootstepper_ref`/`bootstepper_url`, the existing stored values are preserved (Pydantic's default of `""` no longer wipes them out). This was a latent bug that would have surfaced the moment any client edited a dance without echoing its provider refs back — now defensively preserved.
- **Schema** — added `bootstepper_ref: Optional[str]` to `DanceIn`. Nullable so all pre-existing dances validate unchanged. Serializer emits `bootstepper_ref` on every dance response alongside `copperknob_ref`.

### Frontend
- **`src/api/client.ts`** — 6 new methods (`bootstepperSearch`, `bootstepperPopular`, `bootstepperById`, `createDanceFromBootStepper`, `linkBootStepper`, `compareBootStepper`). New `BootStepperResult` type + `bootstepper_ref` on `Dance` type.
- **Shared UI**
  - `src/components/BootStepperResultCard.tsx` — Result card + attribution footer, blue-purple provider pill (visually distinct from CopperKnob's copper pill). Handles the "Already in Library · also on CopperKnob" combined-provider badge.
  - `src/components/BootStepperLinkSheet.tsx` — Admin-only sheet, mirrors CopperKnobLinkSheet.
  - `src/components/BootStepperCompareSheet.tsx` — Admin-only diff sheet. Explicitly echoes `copperknob_ref`/`copperknob_url` back on the PUT so nothing on the CopperKnob side ever gets clobbered.
- **Screens**
  - `app/bootstepper/search.tsx` — 350ms debounced search, deep-linkable via `?q=`.
  - `app/bootstepper/popular.tsx` — Popular list (sortBy=videoCount desc).
  - `app/bootstepper/import.tsx` — Admin review-and-save (pre-filled, editable, publish toggle default off). When the dance is already in the library it bounces to the local detail page with a hint about linking BootStepper alongside CopperKnob.
- **Integrations into existing surfaces**
  - **`(tabs)/library.tsx`** — footer + empty-state now show BOTH CopperKnob and BootStepper CTAs side-by-side (Search + Popular for each).
  - **`dance/[id].tsx`** — admin row now shows CopperKnob AND BootStepper "Link" / "Check data" buttons in parallel. A single dance can end up with both providers linked.

### Attribution + ownership
- Every screen showing BootStepper content displays "Dance information provided by BootStepper" and links to `bootstepper.com`.
- Choreographer name preserved unmodified on import and never hidden. Country of choreographer surfaced (BootStepper is stronger on this than CopperKnob).
- Import screen footnote: SGY does not claim ownership of third-party choreography or step-by-step instructions; the full stepsheet + tutorial videos remain on BootStepper.

### Security
- `BOOTSTEPPER_API_KEY` ONLY in `/app/backend/.env`. No route echoes it. No log or error response includes it.
- Admin write routes gated server-side with `require_admin_or_editor`.

### Brand polish
- **Login screen (`app/auth.tsx`)** — bespoke portrait hero image (`assets/images/login-hero.jpg`, 254KB) with the SGY printed logo baked in. App-name overlay "Stompin' Ground / DANCE SOCIAL HQ" pinned to the very top of the hero in the sunset-sky area — deliberately positioned so it never occludes the printed logo circle.
- **Rye display font** — bundled `assets/fonts/Rye-Regular.ttf` (SIL OFL 1.1). Loaded once at app-start via `useIconFonts` (which already handles font loading). Applied to the login hero title/subtitle so the app-name typography matches the Wild-West lettering inside the printed logo.
- **Home page overflow fixes** — section headers ("Fresh on the Floor", "Community Activity") now use `flex: 1 + numberOfLines={1}` on the title so "See all" always fits on-row. "Recently Practiced" header rebuilt as a flex row where the title row expands and "Pick up where you left off" hint sticks to the right at natural width.

### Production env vars pending (unchanged from Phase 17)
Same list as Phase 17 — user still needs to add `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY_PEM_B64`, `APPLE_AUDIENCES`, `COPPERKNOB_API_KEY`, plus now `BOOTSTEPPER_API_KEY=<REDACTED>` to the prod environment via the Emergent dashboard and click Publish.



## Phase 17 CopperKnob API Integration (v3.2 — DONE)

### Why
Two dance-directory resource sites dominate the line-dance world: CopperKnob (larger, official API) and BootStepper. Users hitting a wall in our own ~1,200-dance library needed a way to widen the search without us bloating the DB with 200,000+ third-party rows. Admins needed a way to *grow* the directory by ingesting selected records under proper attribution.

CopperKnob's TOU is strict: **API returns metadata only**, we're forbidden from mirroring stepsheet content, and every surface must attribute + link back.

### Backend
- **`services/copperknob.py`** — the ONLY module that talks to `api.copperknob.co.uk`. Bearer auth via `COPPERKNOB_API_KEY` env var. 10s timeout, ES256 client_secret style errors normalised, small in-process cache (60s search / 15min popular / 15min ref) capped at 256 entries. `is_configured()` gate + graceful outage handling (never 500s).
- **`routes/copperknob.py`** — six routes:
  - `GET  /api/copperknob/search?q=&type=` — auth-required (any dancer). `type` ∈ {all, title, music, choreographer}, 2-char minimum, up to 50 results.
  - `GET  /api/copperknob/popular` — top 99 CopperKnob stepsheets.
  - `GET  /api/copperknob/stepsheets/{ref}` — single record + our match status.
  - `POST /api/dances/from-copperknob` — **admin-or-editor only**. Creates a new library listing pre-filled from a ref. Draft-by-default (`is_published: false`) so nothing goes live without an explicit publish toggle. Refuses on duplicate (409). Never copies stepsheet content — the API doesn't provide any.
  - `POST /api/dances/{dance_id}/link-copperknob` — **admin-or-editor only**. Attaches a `copperknob_ref` to an existing dance. Never touches other fields. Refuses if another dance already claims the ref (409 with `existing_dance_id`).
  - `GET  /api/dances/{dance_id}/copperknob-compare` — **admin-or-editor only**. Field-by-field diff (`name`, `choreographer`, `song`, `artist`, `difficulty`, `count`, `copperknob_url`). Read-only — writing is done via the existing `PUT /api/dances/{id}` from the review sheet.

- **Duplicate detection** (`_match_existing_dance`) — preferred → weakest:
  1. Same stored `copperknob_ref`
  2. Same ref inferred from a stored `copperknob_url`
  3. Case-insensitive `name` + `choreographer` both match

- **Schema** — added `copperknob_ref: Optional[str]` to `DanceIn`. Nullable so all 1,162 pre-existing dances validate unchanged. Serializer emits `copperknob_ref` on every dance response.

### Frontend
- **`src/api/client.ts`** — 6 new methods: `copperknobSearch`, `copperknobPopular`, `copperknobByRef`, `createDanceFromCopperKnob`, `linkCopperKnob`, `compareCopperKnob`. Added `CopperKnobResult` type + `copperknob_ref` on `Dance` type.
- **Shared UI**
  - `src/components/CopperKnobResultCard.tsx` — Result card + attribution footer. **Regular users** see "View on CopperKnob" always, plus "View Dance" when already in library. **Admins/editors** additionally see "+ Add to Library" when NOT already in library.
  - `src/components/CopperKnobLinkSheet.tsx` — Admin-only sheet for attaching a ref to an existing dance (never overwrites other fields).
  - `src/components/CopperKnobCompareSheet.tsx` — Admin-only field-by-field diff with per-field pick-or-keep toggles. Nothing is written until Apply.
- **Screens**
  - `app/copperknob/search.tsx` — Search screen with 350ms debounce, type filter chips, deep-linkable via `?q=`.
  - `app/copperknob/popular.tsx` — Popular-on-CopperKnob discovery.
  - `app/copperknob/import.tsx` — Admin review-and-save (pre-filled, editable, publish toggle default off).
- **Integrations into existing surfaces**
  - **`(tabs)/library.tsx`** — footer under any non-empty result list: "Can't find it? Search CopperKnob / Popular on CopperKnob". Empty-state gets a bold primary CTA carrying the user's current query.
  - **`dance/[id].tsx`** — for admins/editors, a new admin-only row under the External Resources block: "Link CopperKnob record" (when no ref) or "Check CopperKnob data" (when ref set). Both open the corresponding modal sheet.

### Attribution + ownership
- Every screen showing CopperKnob content displays "Dance information provided by CopperKnob" and links to `copperknob.co.uk` (footer).
- Choreographer name is preserved unmodified on import and never hidden.
- Import screen carries an explicit footnote: SGY does not claim ownership of third-party choreography or stepsheets; the full step-by-step instructions remain on CopperKnob.

### Security
- API key ONLY lives in `/app/backend/.env` as `COPPERKNOB_API_KEY`.
- No route echoes the key. No log or error response includes it (verified).
- Frontend never sees or handles the key — every CopperKnob call is proxied through our backend.
- Admin write routes gated server-side with `require_admin_or_editor`; regular users get 403.

### Rate-limit / outage handling
- Client-side 350ms debounce on the search input.
- 2-character minimum query length before hitting the network.
- Server-side in-memory cache dedupes identical searches within the TTL.
- `services.copperknob.CopperKnobError` is always converted to a user-friendly message; our own library keeps functioning regardless of CopperKnob availability.


## Phase 16 App Store Readiness Hardening (v3.1 — DONE, 1 pending env var)

### Why
Ran the `expo-appstore-readiness-review` skill: 1 hard blocker + 5 warnings for iOS submission. This phase closes all of them.

### Backend
- **`services/apple_revoke.py`** — new module: Apple REST integration for Sign in with Apple:
  - `build_client_secret()` mints a fresh ES256-signed JWT per call, capped at 5 min lifetime.
  - `exchange_code_for_refresh_token(auth_code)` calls Apple's `/auth/token` (grant_type=authorization_code) on first native sign-in to obtain a long-lived refresh_token, which we persist on the user doc.
  - `revoke_refresh_token(refresh_token)` posts to Apple's `/auth/revoke` on account deletion. Idempotent (already-revoked → treated as success). Best-effort — failure logged but never blocks the local delete.
  - `is_configured()` gates the whole flow — when env vars are missing, deletion still proceeds cleanly (Apple's server-to-server "consent revoked" webhook is the fallback).
  - Env var contract: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY_PEM` / `_PEM_B64` / `_PATH` (loader tries in that order).
- **`routes/auth.py`** — `/auth/apple` + `/auth/apple/link` now accept `authorization_code`; on first receipt they exchange it for a refresh_token and persist it. `DELETE /auth/me` invokes `revoke_refresh_token` before deleting the user row.
- **`models/schemas.py`** — `AppleSignInIn.authorization_code` (optional, backward-compat).
- **`.p8` file** stored at `/app/backend/secrets/AuthKey_KGNZBJ85K4.p8` with a `.gitignore` so it never gets committed.

### Frontend
- **`AppleSignInButton`** + **`SignInMethodsSection`** — capture `credential.authorizationCode` from `expo-apple-authentication` and forward to the backend.
- **`src/api/client.ts`** — `appleSignIn` and `linkApple` accept a new optional `authorization_code` param.

### Other App Store fixes
- **`ErrorBoundary`** (`src/components/ErrorBoundary.tsx`) — root-level React error boundary wraps the entire app in `_layout.tsx`. Any render error now shows a friendly "Something went wrong — Reload" screen instead of crashing to home (Apple 2.1 pre-emptive).
- **`app.json` cleanup**:
  - `name` = `Stompin' Ground Yuma` (was `frontend`)
  - `slug` = `stompin-ground-yuma`
  - `ios.infoPlist.CFBundleDisplayName` = `Stompin' Yuma` (fits home-screen label)
  - Removed unused `NSCameraUsageDescription` (no camera SDK is imported anywhere).
  - Added `ios.config.usesNonExemptEncryption: false` so App Store Connect no longer prompts for compliance on every build.
- **`extra.privacyPolicyUrl`** — left as preview URL (only working URL); needs a permanent hosted URL for App Store Connect submission (documented in `/app/memory/PRD.md`).

### Blocked on
- **`APPLE_TEAM_ID` env var** — Team ID from developer.apple.com/account → Membership. Without it, `is_configured()` stays False and revoke calls no-op. **Everything else works.** Delete flow still fully deletes the local user record.


## Phase 15 User Blocking (v3.0 — DONE)

### Why
Chat + activity feed are shared spaces. Users need a mutual "make them go away" affordance so a single bad actor can't dominate the room or harass individuals. Reporting (existing feature) is for admins; blocking is for the user themselves.

### Backend
- **`db.user_blocks`** collection — `{blocker_id, blocked_id, blocked_email, blocked_name, created_at}` with unique `(blocker_id, blocked_id)` index + secondary indexes on both sides for the "hidden from me" query.
- **`services/blocks.py`** — canonical block store:
  - `hidden_user_ids(viewer_id)` returns the MUTUAL union (users I blocked ∪ users who blocked me). Every downstream filter (chat, feed, reactors) calls this one function.
  - `block_user()` is idempotent and auto-mutually-unfollows so the follow graph doesn't stay stale.
  - `purge_user()` wired into account-deletion so blocks don't outlive either party.
- **Routes** (`routes/blocks.py`):
  - `POST /api/blocks` `{user_id? | email?}` → 201 idempotent.
  - `GET /api/blocks` → hydrated list with fresh name/picture (falls back to denormalised snapshot if account was deleted).
  - `DELETE /api/blocks/{blocked_user_id}` → 200 idempotent (unblocking a not-blocked user also returns ok).
- **`routes/chat.py`** `list_chat` — over-fetches by a small margin then filters out `hidden_user_ids`, keeping the page near ``limit`` even in a spammy blocked-poster case.
- **`services/social.py`**:
  - `get_feed` — drops events authored by anyone in `hidden_user_ids` (never applies to the viewer themselves so you always see your own activity).
  - `list_reactors` gained a `viewer_id` kwarg + `routes/social.py` passes it in, so the "who reacted" long-press sheet also respects blocks.

### Frontend
- **`src/hooks/useBlockUser.ts`** — reusable `confirmBlock({user_id, email, name, onBlocked})`. Fires a native Alert (2-step confirm), calls the API, then invokes `onBlocked` for optimistic UI hiding. Handles self-block guard.
- **Chat bubble long-press** (`app/(tabs)/instructor.tsx` `ChatView`) — long-press someone else's message → Block user confirm. Own bubbles ignore long-press.
- **Feed card long-press** (`src/components/FeedEventCard.tsx`) — replaced direct report sheet open with an ActionSheet: `Report this post` / `Block user` / `Cancel`. Blocking a user hides the card immediately (`setHidden(true)`) and future feed loads skip them entirely.
- **`app/blocked-users.tsx`** — new management screen (reached from Profile → "Blocked users"): avatar + name + email + Unblock pill. Empty state explains what blocking does in plain English. Pull-to-refresh.
- **Profile row** (`app/(tabs)/profile.tsx`) — new "Blocked users" entry under Community Guidelines with subtitle "Manage who you've muted in chat and feed".
- **`src/api/client.ts`** — three new methods: `blockUser`, `listBlocks`, `unblockUser`.


## Phase 14 Version-Pin on Bug Reports + Silent OTA (v2.9 — DONE)



### Reaction Pack Refresh
- **Swap**: 👏 (`clap`) → 🕺 (`dancer`) to lean into the line-dance vibe. Current pack is now `high_five` (🙌), `dancer` (🕺), `yeehaw` (🤠), `heart` (❤️).
- **Legacy**: `clap` kept as read/remove-only for any historical rows so nothing disappears mid-session. `POST /api/feed/{id}/reactions/clap` now returns 400 (can't add new claps); `DELETE` still works so a user can retire an old chip.

### Reactor Names (long-press)
- **Backend**: New `GET /api/feed/{event_id}/reactors?kind=&limit=` returns `{event_id, kind, reactors:[{user_id, name, picture, is_instructor, kind, emoji, created_at}], count}`.
- **Frontend**: Long-press (350 ms) on ANY chip opens `ReactorsSheet.tsx` filtered to that kind; long-press on the "+" button shows every reactor across kinds. Sheet header renders "🕺 Dance! · Erin, Jamin and 3 others reacted." Instructor badges show inline.

### Click Sound (silent-mode friendly)
- New `useTapSound()` hook wraps `expo-audio`'s `useAudioPlayer` with a bundled 50 ms WAV click (`/assets/sounds/reaction-tap.wav`, 4.3 KB) + `expo-haptics.selectionAsync()` on non-web.
- `setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" })` runs on hook mount so the ping plays over Practice Mode audio without ducking it, and still fires when the ringer switch is off.
- Wired into every reaction toggle in `FeedReactionsBar`.


### Multi-Instructor Selection
- **DB**: `users.instructor_ids: string[]` — full list of instructors the dancer has "adopted". `main_instructor_id` remains as the Primary (drives Suggest-a-Dance routing) and is always included in the list when set.
- **Backend**: New `PUT /api/auth/me/instructors` — atomic body `{instructor_ids, main_instructor_id?, follow?}`. Validates each id is a real instructor/admin (silently drops bad ids), resolves Primary via explicit → existing → first-picked → cleared, upserts follow rows when `follow=true`, and returns `{ok, user (hydrated), new_follows}`.
- **Legacy `PATCH /api/auth/me/main-instructor`** now also `$addToSet` the target into `instructor_ids` so the single-pick and multi-pick paths stay in sync.

### Auto-Follow on Save
- Save operation optionally upserts a row in `db.follows` for every selected instructor (idempotent — never removes existing follows). Toast surfaces the net-new follow count.

### Frontend
- **`PickInstructorSheet.tsx`** rewritten as a multi-select bottom sheet:
  - Each row has a checkbox for selection and a star icon for setting Primary. Selected rows highlight brand-red; the Primary row highlights brand-tertiary + shows a "⭐ PRIMARY" pill.
  - Header shows "N picked · Primary set" + a "Follow when I save" toggle (default on).
  - Sticky footer with Cancel + "Save N picks" primary CTA.
  - Draft state resets from the freshly-loaded user every time the sheet re-opens — no stale selections leak between sessions.
- **Profile row**: renamed "Main instructor" → "My instructors" with dynamic subtitle "Primary: {Name} · +N more" (falls back to "Tap to pick who receives your suggestions").
- **Home / Suggest**: unchanged copy — the Primary pick is what personalises the CTA and header.


### Home Tab Reorder
- **Home CTAs** now flow: Streak + Weekly Recap → Achievements → Browse Dances → Community Activity → Recently Practiced → Boot Scoot Board → Find Events → Recent Class Recap → Suggest a Dance → About the Venue.
- **Redundant "example dances"** removed from the home hero — the poster carries the community values now.

### Pick Main Instructor
- **DB**: New `users.main_instructor_id` field. Every dancer chooses one instructor whose inbox receives their Suggest-a-Dance submissions.
- **Backend**: New router `routes/instructors.py` with `GET /api/instructors` (directory of `is_instructor` OR `is_admin` users), `PATCH /api/auth/me/main-instructor` (sets the caller's main instructor), and `DELETE /api/auth/me/main-instructor` (clears it). Instructor identity is enforced server-side.
- **Suggestions router**: `SuggestionIn.target_instructor_id` optional. Server falls back to caller's persisted `main_instructor_id`, or empty string (admin firehose) as a last resort. Persists `target_instructor_name` too for audit.
- **New endpoint**: `GET /api/suggestions/for-instructor` returns the suggestions routed to the calling instructor (any instructor or admin can call it).
- **Frontend**: `PickInstructorSheet.tsx` — bottom sheet with live search by name/city, visible verification checkmarks, tap-to-pick with confirm + saving spinner. Reused from Home (first-tap on Suggest a Dance if not picked yet) and Profile (dedicated "Main instructor · {Name} — tap to change" row).
- **Suggest screen**: header now reads "Suggest to {FirstName}" with a swap-icon at top-right to change instructors mid-session. Empty state prompts users to pick one before submitting. Success alert also personalises: "{FirstName} will review your idea soon."
- **Home CTA**: "Suggest a Dance" card also personalises to "Suggest a Dance for {FirstName}" once picked; before picking it reads "Pick your main instructor and send them your ideas."

### Weekly Recap Card
- **Backend**: New `GET /api/weekly-recap` — merges Practice-Mode opens (`practice_daily`) and completions (`tracking.updated_at`, `status="completed"`) across the current Mon→Sun window. Returns `{days[], practices, completions, total, days_active, best_day}`.
- **Frontend**: `WeeklyRecapCard.tsx` on Home renders directly under the Streak card. Sunday shows a "🎉 Weekly Recap" celebration tone; Mon–Sat shows "This week so far". Includes 3-stat row (Practices · Completed · Best day) and Mon–Sun activity dots highlighting today. Hidden entirely when the user has 0 activity this week — no zero-shame states.



## Phase 19 Merged External Search + Batch Import UI Wiring (v3.2 — DONE)

### Unified Search Entry Point
- **Library screen** (`app/(tabs)/library.tsx`) — replaced the two split "Search CopperKnob / Search BootStepper" primary CTAs (footer + empty-state) with a **single unified** "Search CopperKnob + BootStepper" button that routes to `/external-search`. Provider-specific search links are demoted to smaller fallback pills ("Or search a single directory") so power users still have per-provider access when needed.
- Old `/copperknob/*` and `/bootstepper/*` routes retained as safety fallbacks per user request.

### Merged External Search screen (`/external-search/index.tsx`)
- One query fans out to CopperKnob + BootStepper server-side (in parallel via `asyncio.gather`).
- Results merged by title + choreographer surname; each merged card carries **both** provider chips + provider outage banner if one API fails.
- Debounced input (350 ms), `Already in Library` badges for de-dup transparency.
- Admin-only **Select** button in the header → tap-to-toggle batch mode.

### Batch Import Preview (`/external-search/batch.tsx`)
- Dry-run via `POST /api/dances/bulk-preview-external` — categorises entries into **Ready / Already in Library / Error** with per-row title, choreographer, and level.
- `Publish immediately` toggle (default OFF = drafts).
- `Check all` / `Uncheck all` bulk pick, sticky bottom action bar with "Import N".
- Commit via `POST /api/dances/bulk-from-external`. Success view lists per-row status + deep-links into each newly-created dance detail.
- Max 50 imports per batch (server-enforced).

### Test coverage
- `testing_agent` iteration 27 — all 5 frontend integration scenarios passed (100%): Library CTA wiring, merged search rendering, batch mode selection, batch preview + import flow, regression check on remaining fallback routes.

## Phase 20 — Community + Ops (v3.3 — DONE)

### 1. Login Title Polish
- Rye-font "Stompin' Ground" is now a masked linear gradient
  (cream → warm gold → pumpkin amber → saloon amber). Ultra-soft
  charcoal glow behind, twin amber stars flanking, three-pip
  divider above the "DANCE SOCIAL HQ" subtitle. Uses
  `@react-native-masked-view/masked-view` over `expo-linear-gradient`.

### 2. Follow Choreographers
- Backend: ``choreographer_follows`` collection (unique on
  ``user_id + choreographer_key``), ``choreographer_notifications``
  ledger (idempotent per user+dance). 5 endpoints under
  ``/api/choreographers``.
- Fan-out on publish (create, update-publish flip, single-import,
  bulk-import) sends push via ``send_push`` — dead-letter safe.
- Frontend: ``/choreographers`` list (Following + Discover tabs +
  search), ``/choreographers/[name]`` detail, reusable
  ``ChoreographerFollowButton`` on Dance Detail + rows.

### 3. Auto-Hide Reported Posts
- ``ReportFeedSheet`` accepts ``reportedUser`` + shows "Also block
  this user?" Switch (default OFF). On submit, chains a
  ``blockUser`` call; report always succeeds first. Native alert
  reads "Report sent · user blocked". ``FeedEventCard`` wires
  ``onBlocked`` so the card hides locally.

### 4. @Mentions in Instructor Chat
- Backend: ``chat_mentions`` collection (unique on
  ``mentioned_user_id + message_id + mentioner_id``). Chat post
  parses ``@name`` tokens, resolves via iExact then unique-prefix
  match on ``users.name`` (skips ambiguity), inserts ledger rows,
  fires pushes. New endpoints: ``GET /chat/mentions/me`` +
  ``POST /chat/mentions/mark-seen``.
- Frontend: ``MentionAutocomplete`` on the instructor chat composer
  (200ms debounced ``/users/search``), ``/mentions`` recipient
  screen (auto-marks-seen on visit), Profile row with unread pill.

### 5. Refresh Recommendations (nightly drift scanner)
- Backend: ``dance_drift_flags`` collection.
  ``services/refresh_recommendations.py`` scans upstream metadata for
  every dance carrying a CopperKnob or BootStepper ref, diffs against
  local metadata, upserts flag rows. Rate-limited ``~1 req/sec``,
  60 per source per pass, so a full sweep spans multiple nights.
- APScheduler: daily job (first run 5min after boot).
- Admin routes: list / counts / rerun / seen / dismiss under
  ``/api/admin/refresh-recommendations`` (admin-only).
- Frontend: ``/admin/refresh-recommendations`` screen with
  Unreviewed/All tabs, per-row Review + Dismiss actions, Rerun scan
  button, Profile admin row with unseen pill.

### Ops fix
- ``services/startup.py`` refactored: new-feature ``ensure_indexes``
  calls moved into their own try/except blocks so a legacy index
  conflict (e.g. the pre-existing ``event_id_1`` unique index) can
  no longer skip the follow-graph / mention / drift-scan setups.
- Added ``deduplicate_existing_rows`` helper to
  ``services/choreographer_follows.py`` — runs on boot to keep the
  oldest row for each ``(user_id, choreographer_key)`` pair before
  the unique index is created.



## Session (Sep 3 2026) — Full Dance Library Sync

**User request**: Run a full sweep of the existing 1,163 dances to verify
and correct information (choreographers, music, bpm, etc.) against the
BootStepper and CopperKnob APIs. Auto-fix high-confidence (>95%) matches
and flag ambiguous ones for admin review, and set up as a monthly
automatic check.

### What shipped

1. **`services/dance_library_sync.py` — production-hardened**
   - Composite confidence: title 0.55 + choreographer 0.35 + walls 0.10
   - `auto_applied` when composite ≥ 0.85; `flagged_for_review` when
     0.70 ≤ composite < 0.85; `unmatched` when composite < 0.70.
   - **Name-change safety gate**: a name is auto-applied ONLY when
     both composite ≥ 0.95 AND raw title-similarity ≥ 0.85. Prevents
     identity swaps like "The Galway Girl" → "2 Galway Girls" (which
     score composite 0.905 but title 0.828 → correctly deferred).
   - Cosmetic-suffix suppression: choreographer country/year tags
     (e.g. `Sue Lipscomb (USA)`), title language tags (`(fr)`, `(zh)`),
     and count wall-missing diffs (`32 count, 4 wall` vs `32`) are all
     recognised as equivalent, no false-positive flags.
   - Every mutation writes `dance_sync_log` (immutable audit trail
     with `changed_fields`, `deferred_fields`, `proposed_fields`,
     `confidence`, `title_ratio`, `upstream_ref`).
   - Every review-worthy diff upserts `dance_drift_flags` (surfaced
     in the existing Admin → Refresh Recommendations screen).

2. **`scripts/full_verify_and_sync.py`** — one-shot orchestrator
   used to seed the database. Snapshots the whole `dances` collection
   into a timestamped backup collection BEFORE writing anything, so
   admins can roll back if an unexpected diff sneaks through.

3. **Monthly recurring check** — registered in
   `services/scheduler.py` as `dance_library_monthly_sync` at 30-day
   interval (first tick 30 days after boot).

4. **Rate-limit resilience** — both `services/copperknob.py` and
   `services/bootstepper.py` now retry on 429 / 503 with exponential
   backoff (1s → 2s → 4s, honouring `Retry-After` header). The
   monthly sweep will no longer be truncated when upstream throttles.

### Results after the initial sweep

- 1,163 dances processed against both providers
- **~1,000 field-level auto-corrections** applied (song, artist,
  choreographer suffix normalisation, count, difficulty)
- **98–313 flags** queued for admin review (final count depends on
  upstream availability — rate-limit retries cover future runs)
- **Zero destructive title changes** — every proposed rename gets
  admin review through `/admin/refresh-recommendations`.

### Files touched

- `services/dance_library_sync.py` (tightened diff / confidence
  logic, audit-trail enrichment)
- `services/copperknob.py`, `services/bootstepper.py`
  (429 retry-with-backoff)
- `services/scheduler.py` (already registered monthly sync)
- `scripts/full_verify_and_sync.py` (already existed, used as-is)



## Session (June 2026) — Security Audit Remediation

Full read-only audit run via `security_audit_agent`. Three findings
were fixed; 23/23 regression tests passed via `testing_agent`.

### SEC-001 (CRITICAL) — Admin password self-restore & weak defaults
- **Root cause**: `services/startup.py::_seed_account` force-reset any
  existing `password_hash` back to `SEED_PW_*` on every boot. Combined
  with a weak default (`Admin123!` for `admin@stompinground.com`), an
  operator who rotated the password in-app would silently lose the
  rotation after the next restart.
- **Fix**: seed logic now only writes `password_hash` when the account
  has no hash (first-create only). `SEED_PW_*` env vars are advisory
  for fresh installs — they never overwrite existing hashes.
- **Rotation**: `admin@stompinground.com` rotated from `Admin123!` to
  a 24-char strong random value. Erin's + Jamin's passwords preserved
  (already reasonable + owner needs continuity).
- **Log hygiene**: removed the plaintext-password log line in
  `_seed_account`. Boot logs are now safe to share.
- **Verified**: (a) old password 401s, (b) new password 200s + JWT
  works, (c) a user-rotated hash survives a restart, (d) pwd_ver bump
  invalidates old JWTs.

### SEC-002 (MEDIUM) — ReDoS in `/api/instructors` search
- **Root cause**: `routes/instructors.py` passed raw `q` and `city`
  into `{"$regex": ...}`.
- **Fix**: wrapped both with `re.escape(...)` (same pattern as
  `routes/dances.py`, `services/social.py`, `services/events.py`).
- **Verified**: pathological pattern `(a+)++$` returns 200 in ~12ms
  instead of pinning a worker; normal search unaffected.

### SEC-003 (MEDIUM) — Identity-field auto-apply defense
- **Root cause**: `services/dance_library_sync.py` auto-applied
  `choreographer` at composite ≥ 0.85, meaning a compromised upstream
  could rewrite the dance's identity.
- **Fix**: extended `_demote_low_confidence_name_changes` to demote
  BOTH `name` AND `choreographer` to review-only unless composite ≥
  0.95 AND title_ratio ≥ 0.85. Other fields (song, artist, count,
  difficulty) still auto-apply at composite ≥ 0.85 — those are polish,
  not identity.

### P3 hygiene — apple_unlink precedence
- Parenthesised the `or` / `and` guard in `routes/auth.py::apple_unlink`
  so short-circuit evaluation can no longer bypass the synthetic-email
  check for accounts with no password.



## Session (June 2026) — Android Deployment Fix

**Symptom**: EAS Android app-bundle build failed at
`:expo-updates-gradle-plugin:compileKotlin` with
"Could not find kotlin-build-tools-impl-2.0.21.jar" (and the whole
Kotlin 2.0.21 dep tree) in the EAS Maven mirror.

### Root cause
Every patch of `expo-updates@29.0.x` pins `kotlin("jvm") version("2.0.21")`
in its Gradle plugin, but the EAS build cache
(`http://maven.production.caches.eas-build.internal/artifactory/libs-release/`)
only mirrors Kotlin `2.1.20`. Other Expo/RN plugins (which use `2.1.20`)
compiled fine in the same build — so the fix is to bring
`expo-updates` in line with them.

### Fix — patch-package
Because all 29.0.x patches use `2.0.21`, downgrading isn't an option.
Instead, patched the plugin in-place:

- Added `patch-package@8.0.1` + `postinstall-postinstall@2.1.0` as
  devDependencies in `frontend/package.json`
- Added `"postinstall": "patch-package"` to the npm scripts
- Committed `patches/expo-updates+29.0.20.patch` — a 1-line diff that
  rewrites the plugin's Kotlin version from `2.0.21` → `2.1.20`
- Verified reproducibility: after a simulated fresh install, running
  `npx patch-package` restores the fix cleanly.

### Deployment-agent blockers also resolved

- **`services/startup.py`**: removed the `deduplicate_existing_rows()`
  call from the boot path. The unique
  `(user_id, choreographer_key)` index prevents new duplicates; the
  cleanup function remains available for manual admin invocation but
  the boot path no longer touches DB records.
- **`services/refresh_recommendations.py::_upsert_flag`**: converted
  the `delete_one(...)` on cleared drift to a SOFT-CLEAR
  (`differs_count=0` + `cleared_at`). `list_flags()` / `counts()`
  now filter cleared rows out so the admin UX is identical.
- **`frontend/eas.json`**: deleted. Emergent's deployment pipeline
  supplies its own managed EAS configuration.

### Env-file quoting

Deployment validator requires values starting with `/` to be quoted.
Fixed:

- `frontend/.env` — `METRO_CACHE_ROOT="/app/frontend/.metro-cache"`
- `backend/.env` — `APPLE_PRIVATE_KEY_PATH="/app/backend/secrets/AuthKey_KGNZBJ85K4.p8"`

Both parsed correctly by `python-dotenv` and Expo's env resolver
(quotes are stripped; leading `/` is preserved).

### Final deployment-agent verdict

- ✅ `expo_release_build_ok`: true
- ✅ `env_files_malformed`: false
- ✅ `destructive_db_startup_confirmed`: false
- ✅ `eas_json_absent`: true
- ✅ `compilation_passed`: true

Remaining non-blocking WARN/INFO items (user action):
- `frontend/app.json` privacy-policy URL still points at preview
  domain — needs a permanent production URL before store review
- iOS push registration disabled — needs `GoogleService-Info.plist`
  under `frontend/` + `expo.ios.googleServicesFile` in `app.json`



## Session (June 2026) — Stable Privacy URL + iOS Push Audit

### Privacy policy — moved to a stable backend endpoint

**Why**: App Store / Play review require a public, permanent privacy
URL. Serving from the Metro-bundled Expo web route was brittle (blank
page on cold-start) and the preview domain flagged as ephemeral.

**Fix**:

1. New backend route `backend/routes/legal.py` mounts
   `GET /api/legal/privacy` returning a fully self-contained HTML
   page (no external CSS/CDN). Cache-Control: public, max-age=3600.
2. Converted `frontend/app.json` → `frontend/app.config.js` so the
   URL can be derived from env vars at build time.
3. `privacyPolicyUrl` now resolves as
   `${EXPO_PUBLIC_BACKEND_URL}/api/legal/privacy` — inherits the
   production domain automatically when the deploy pipeline sets
   `EXPO_PUBLIC_BACKEND_URL`. Both preview and production land on the
   SAME backend page.
4. Kept `expo.extra.privacyPolicyUrl` for backward-compat with any
   component reading `Constants.expoConfig.extra.privacyPolicyUrl`.

### iOS push notifications — Firebase requirements documented

Confirmed: Emergent-managed push uses Firebase Cloud Messaging (FCM).
On iOS FCM proxies through Apple's APNs — so BOTH Firebase config
and Apple credentials are required.

**Currently in place**:

- `frontend/google-services.json` — Firebase Android config ✅
- `expo-notifications` plugin — installed ✅
- `expo.android.googleServicesFile` — wired ✅

**What the operator still owes for iOS push** (documented in the
finish summary — not blockers for Android launch):

1. `frontend/GoogleService-Info.plist` — Firebase iOS config (add an
   iOS app to the existing Firebase project, download)
2. APNs authentication key (.p8) — NEW key with "Apple Push
   Notifications service" checkbox, downloaded from Apple Developer
   Portal → Keys. Different from the existing Sign-in-with-Apple key
   (`AuthKey_KGNZBJ85K4.p8`).
3. APNs Key ID (10-char) — shown once during key creation
4. Team ID — `5RVKA62THW` (already known)
5. "Push Notifications" capability enabled on App ID
   `com.emergent.stompinyumaapp.uyr5zg`
6. Upload (2)+(3)+(4) to Firebase Console → Project Settings →
   Cloud Messaging → Apple app configuration

Once (1) is in the repo, we:
- Add `expo.ios.googleServicesFile` to `app.config.js`
- Remove the `Platform.OS === "ios"` early-return in
  `frontend/src/lib/push.ts`



## Session (June 2026) — App-wide Localization (EN/ES/FR)

**User request**: Localize the app in English, Spanish and French. Show a
one-time "Choose your language" picker on first open, and RE-PROMPT if the
device language changes. Push notifications, emails and the privacy policy
must also be translated.

### What shipped

1. **`src/i18n/translations.ts`** — ~200 keys per locale (EN/ES/FR) covering:
   - Onboarding language picker + Age Gate
   - All 5 tabs (`_layout.tsx`, home, library, my-dances, instructor, profile)
   - Auth screen (including split-and-render legal footer)
   - Welcome / greeting screen
   - Common CTAs (Save, Cancel, Follow, Search, See all, etc.)
   - Modals (delete account, instructor unlock, code entry)
   - Sub-components (mentions, admin drift row, current version row)

2. **`src/i18n/index.ts`** — the runtime:
   - `bootstrapI18n()` loads the persisted override, resolves system default
     via `expo-localization`.
   - `toRuntimeString()` rewrites authoring-time `{name}` → i18n-js's
     `%{name}` at nest time so translations.ts stays human-friendly.
   - `tRaw(key)` returns the un-rewritten source string for
     split-and-render call sites (legal footer, delete-confirm label).
   - **Device-language change detection**: bootstrap snapshots the OS's
     ordered locale-tag list and, if it changed since the last boot AND
     the user hadn't pinned a manual override, clears the "picker was
     shown" flag so the LanguagePickerModal re-prompts on the next launch.
     Users who explicitly picked a language are NEVER re-prompted.
   - `useTranslation()` hook returns `{t, tRaw, locale, override, setLocale, hydrated, deviceLocale}` —
     backed by `useSyncExternalStore` so every subscriber re-renders once
     per locale change.

3. **`src/components/LanguagePickerModal.tsx`** — one-time overlay with 3
   options (English • System default / Español / Français) + Continue.
   Persists both the locale choice AND a `picker_shown_at` marker.

4. **`src/components/AgeGateModal.tsx`** — fully translated hero, body copy,
   both CTAs and inline legal footer using `tRaw` for token splits.

5. **Verified end-to-end** via testing_agent (iteration 36):
   - Age Gate + Auth footer + Delete confirm modal render cleanly in EN/ES/FR
     (no `[missing "%..."]` fragments).
   - Home / Library / Profile / Instructor tabs all localize on locale
     change.
   - Placeholder interpolation stable across screens (e.g. "Salut, Erin !",
     "Suggérer une danse à Jamin").

### iOS Push question — answered inline for the operator

- **Emergent push uses Firebase (FCM)**. On iOS FCM proxies through APNs, so
  you still need Apple credentials on top of Firebase.
- **Missing for iOS push**: `frontend/GoogleService-Info.plist` (from
  Firebase console → add iOS app to project), a NEW APNs Auth Key `.p8`
  (Apple Developer Portal → Keys → "+", tick "Apple Push Notifications
  service"), the corresponding 10-char Key ID, and the "Push Notifications"
  capability on App ID `com.emergent.stompinyumaapp.uyr5zg`.
- Team ID is `5RVKA62THW` (already known from Sign-in-with-Apple).
- Once you drop `GoogleService-Info.plist` into `frontend/`, we add
  `expo.ios.googleServicesFile` to `app.config.js` and remove the
  `Platform.OS === "ios"` early-return in `frontend/src/lib/push.ts`.


## Session (June 2026) — Localization: +5 Languages (DE/NL/KO/zh-Hans/zh-Hant)

**User request**: Extend the existing localization system (EN/ES/FR) with
German, Dutch, Korean, Simplified Chinese and Traditional Chinese. Preserve
existing translations, ensure CJK fonts render on both platforms, do not
translate user-generated content, brand names or external dance sheets, and
do not change push credentials or submit store releases.

### What shipped

1. **`src/i18n/translations.ts`** — full ~315-key catalogs added for each
   new locale, ordered EN → ES → FR → DE → NL → KO → zh-Hans → zh-Hant. All
   locales share the same key set (verified line-count parity), which means
   any accidentally-missing key transparently falls back to English via the
   existing i18n-js `enableFallback` setting.
   - **CJK-quote fix**: initial machine-drafted zh-Hans strings embedded
     raw ASCII `"` characters inside double-quoted values on 4 lines
     (2655 / 2670 / 2715 / 3021), which broke Metro's TypeScript parser.
     Replaced with proper CJK corner-brackets 「 」 (U+300C / U+300D) —
     the canonical inline-quote pair in Simplified & Traditional Chinese
     typography, and free from JavaScript-string escaping ambiguity.
   - **`LOCALES_NEEDING_NATIVE_REVIEW`** array flags ko / zh-Hans / zh-Hant
     as machine-drafted and pending a native-speaker review pass. Not used
     at runtime — surfaced only for a QA report.
   - **CJK-font note** at the top of the file: React Native falls back to
     the OS's system font family whenever a glyph isn't found in the
     current typeface. On iOS that's PingFang SC/TC; on Android it's Noto
     Sans CJK. Both ship with the OS since ~2015. Only the login-hero
     `Rye` display font — which we treat as brand and never translate —
     is scoped to Latin-only surfaces, so it doesn't bottleneck CJK.

2. **`src/i18n/index.ts`** — added `zh-Hans` / `zh-Hant` awareness on top of
   the existing 3-language runtime:
   - `deviceLocale()` inspects `getLocales()` results and maps `zh-Hant`
     script / regions `TW / HK / MO` to `zh-Hant`; anything else with base
     `zh` (including `zh-CN` and bare `zh`) resolves to `zh-Hans`.
   - `NESTED_TRANSLATIONS` registers all 8 locales for i18n-js.
   - Bare `SUPPORTED_LOCALES` extended to `["en","es","fr","de","nl","ko","zh-Hans","zh-Hant"]`
     so the settings / picker screens pick up the new options automatically
     (they iterate the array — no hardcoded language list anywhere in the
     UI).

3. **Backend `core/i18n.py`** — `SUPPORTED_LANGUAGES` tuple extended with
   the 5 new codes. Push-notification and email templates were previously
   added for each locale (see phase 1 EN/ES/FR baseline); the 5 new locales
   now share the same template set with translated bodies. Fallback to `en`
   via `_normalise_lang()` remains the safety net for any missing template.
   - `PATCH /api/auth/me/language` accepts the new canonical codes; anything
     else is rejected 400 (matches the existing behaviour, no schema drift).

### Verification

- ✅ Metro Bundler restarts cleanly.
- ✅ TypeScript compilation of `translations.ts` in isolation is
  error-free (`npx tsc --noEmit --skipLibCheck ...`).
- ✅ Screenshot pass on the LanguagePickerModal shows all 8 languages
  rendered with proper glyphs (English, Español, Français, Deutsch,
  Nederlands, 한국어, 简体中文, 繁體中文).
- ✅ End-to-end tap-through on each new language triggers a live UI swap:
  age-gate, login CTAs, legal disclaimer footer all re-render in the
  chosen language on first tap.
- ✅ German long-word layout (`Datenschutzerklärung`, `Altersprüfung`)
  wraps cleanly on 390px width; no overflow.
- ✅ zh-Hans and zh-Hant render side-by-side without character-mixing —
  Simplified shows 登录 / 账号 / 隐私 while Traditional shows
  登入 / 帳號 / 隱私權, confirming the split.

### Non-goals honoured
- User-generated content (dance titles, choreographer names, chat, event
  descriptions) intentionally left untranslated.
- External resource links (CopperKnob / BootStepper) continue to open in
  their upstream language — attribution copy is what we translate, the
  linked content is theirs.
- No changes to push credentials, Firebase config, Apple keys, or store
  release configuration. `google-services.json` untouched.



## Session (June 2026) — Full Backup Package Prepared

**User request**: A complete, downloadable backup of the whole app —
source, DB, integrations, EAS/domain config, restore instructions, and a
checklist of what's missing.

### What shipped (read-only artifacts under `/app/BACKUP/`)

- `README.md` + 6 numbered markdown docs (source code / DB / secrets /
  domain-EAS / restore playbook / checklist).
- `mongo-dump/test_database/` — native `mongodump` (BSON+metadata,
  8.5 MB, 38 collections, 13,057 docs).
- `mongo-json/` — portable JSON export of every collection
  (one file per collection + `_manifest.json`).
- `backend.env.example` + `frontend.env.example` — placeholder-only
  env templates for GitHub. No real secret values anywhere in the
  folder, PRD, or chat.
- `gitignore.recommended` — ready-to-drop-in `.gitignore` covering
  `.env`, signing keys, `node_modules`, `stompin-app.zip`, and the
  PII-containing `mongo-*` folders.
- `inventory/` — machine-generated `source-tree.txt`,
  `frontend-deps.txt` (52 prod + 5 dev), `backend-requirements.txt`
  (130 pkgs), `mongo-manifest.txt`.
- `stompin-backup-june-2026.zip` — 4 MB rolled-up zip of the whole
  `BACKUP/` folder for one-click download.

### What was explicitly EXCLUDED (per user request)

- Real values of `.env` keys (JWT_SECRET, SMTP_PASSWORD, INSTRUCTOR_CODE,
  COPPERKNOB_API_KEY, BOOTSTEPPER_API_KEY, EMERGENT_LLM_KEY, etc.).
- `AuthKey_KGNZBJ85K4.p8` binary.
- `memory/test_credentials.md` preview passwords.

The `03-integrations-and-secrets.md` doc lists each key with a description
of where to obtain the real value + how to store it. The `06-checklist.md`
doc has a copy-pasteable email template for what to request from Emergent
Support (production MongoDB, EAS credentials, APNs key, App Store Connect
API key, Google Play service account, managed-OTA status).

### What the user still needs to do themselves

1. Push the `/app/` tree to their private GitHub (after extending
   `/app/.gitignore` with the recommended block).
2. Copy live `.env` values from the Emergent dashboard into their
   password manager.
3. Download the Apple `.p8` and store as a 1Password attachment.
4. Request from Emergent Support: production DB dump, EAS credentials,
   OTA status.
5. Snapshot their DNS zone at whichever registrar hosts
   `stompingroundyuma.org`.

### Live app not touched

All services (backend, expo, mongodb, nginx-code-proxy, webhook-crond)
still `RUNNING` on the same PIDs. No files were modified outside `/app/BACKUP/`
and `/app/memory/PRD.md`.

### Paused work

The SEO / canonical / sitemap / redirects task requested earlier is
paused. Full plan is captured in the previous `ask_human` and user
response — resume by continuing that thread; no partial code changes
were merged.



## Session (June 2026) — Chat Post Notifications + Landscape Orientation

**User request**: Two additive features:

1. Give users an option to get a push notification when someone posts
   in the instructor chat (not just @mentions).
2. Add an orientation mode so users can turn their phones sideways and
   type / view the full app in landscape.

### Feature 1 — Chat post notifications

- **Category**: New `chat_alerts` added to
  `services/notification_prefs.py::ALL_CATEGORIES` (6 categories total
  now). Defaults to True (opt-out, matching every other category).
- **Model**: `NotificationPrefsIn.chat_alerts: Optional[bool]` added in
  `routes/notification_prefs.py`.
- **Service**: New `services/chat_notifications.py::fan_out_chat_post`
  handles the fan-out with these rules (in order):
  1. Pool = every user with `is_instructor=True` OR `is_admin=True`.
  2. Exclude the poster themselves — never self-notify.
  3. Exclude anyone the poster has blocked (or who has blocked them) —
     mirrors chat-list visibility so blocked users don't resurface
     through a push.
  4. Exclude anyone already fanned-out by `fan_out_mentions` for this
     message (via the `already_notified` param) — a single
     `@Erin nice one!` never buzzes Erin twice.
  5. Exclude anyone with `notification_prefs.chat_alerts=False` —
     shared `filter_recipients` helper.
- **Wiring**: `routes/chat.py::post_chat` now calls
  `fan_out_mentions` → captures the mentioned user_ids → then calls
  `fan_out_chat_post(already_notified=mentioned)`. Both are best-effort
  (any push flake is swallowed so the POST always returns 200 with the
  fresh doc).
- **i18n**: New push templates `push.chat_message.title` +
  `push.chat_message.body` added in all 8 languages inside
  `core/i18n.py`. Body is a 100-char preview.
- **Frontend**: `NotificationPrefs` type in `src/api/client.ts` extended
  with `chat_alerts: boolean`. New toggle row in
  `app/settings/notifications.tsx` labelled "New chat messages",
  positioned right below "Chat mentions" with a
  `chatbubbles` icon, subtitle "…turn off to only hear about @mentions".

### Feature 2 — Landscape orientation

- **Config**: `frontend/app.config.js` `orientation` changed from
  `"portrait"` to `"default"`. Lets the OS pick the natural
  orientation — portrait stays primary, but rotating the device
  triggers a proper landscape reflow (bigger keyboard, more chat
  history visible, roomier dance-library grid on tablets).
- **No per-screen work needed**: the root layout already wraps
  everything in `SafeAreaProvider` + `KeyboardProvider` +
  `GestureHandlerRootView`, so notches, keyboards, and gestures
  handle rotation without additional code.
- **Requires native rebuild to take full effect** on physical
  devices — the `orientation` field is baked in at build time via
  Expo config-plugins. Web preview responds to viewport resize
  immediately (verified via 844×390 screenshot).

### Also fixed en-route

- Pre-existing SyntaxError in `core/i18n.py` line 155 (German
  `push.new_dance.body`) — string contained an unescaped ASCII `"`
  inside a double-quoted value, causing the backend to fail to
  boot after this restart. Replaced the closing `"` with the
  proper German closing quote `"` (U+201C). Same failure mode we
  fixed in `frontend/src/i18n/translations.ts` during the
  language-expansion phase.

### Testing

- `testing_agent` iteration confirmed all 9 backend scenarios
  passed:
  1. `chat_alerts` in categories + prefs, default True
  2. PATCH round-trip persists
  3. PATCH preserves other categories
  4. PATCH ignores unknown keys
  5. Non-instructor user can read/toggle their own `chat_alerts`
  6. `POST /chat/messages` returns 200 (no 500 on placeholder push key)
  7. Mention flow still returns `mentioned_user_ids`
  8. `fan_out_chat_post` excludes poster + muted users + already-notified
  9. `app.config.js` orientation = `"default"` confirmed
- New pytest file at `backend/tests/test_chat_alerts_and_orientation.py`.
- JUnit report at `test_reports/pytest/chat_alerts_orientation.xml`.

### Non-goals honoured

- No push credentials touched.
- No changes to Firebase / Apple / EAS config.
- No changes to language-selection or existing i18n behavior.
- Regular dancers (not instructors) do NOT receive chat-room push
  notifications — they can't see the room, so no need.



## Session (June 2026) — Choreographer Follow Bug + 4 Chat Features

### 🐛 P0 Bug fix — choreographer follow flow was silently returning zero dances for 71% of names

**User report**: "Some choreographers' dances not showing when trying to
follow them; very few choreographers in the follow list."

**Root cause**: The `list_choreographers`, `get_choreographer_detail`,
and `notify_followers_of_new_dance` code paths each used a DIFFERENT
normalisation algorithm:

- Discover aggregate: MongoDB `$toLower + $trim` on the raw
  `choreographer` field → **preserved punctuation**.
- Follow / detail API: Python `re.sub(r'[^a-z0-9]+', ' ', …)` →
  **stripped all non-alphanumeric characters**.

For any name with punctuation (dots, dashes, parens, apostrophes,
semicolons), the two keys disagreed. A DB scan showed **552 of 774
choreographers (71%)** were affected — including every "Firstname
(country) — month year" entry the CopperKnob/BootStepper sync creates,
which is dominant in the catalogue. Users could see the choreographer
card, tap to view dances → **zero results**. They could follow →
**never receive a push** on new dances because the fan-out uses the
strict key.

**Second complaint** ("very few choreographers"): The Discover screen
called `listChoreographers({ limit: 80 })` against a library of 774,
and the search box only filtered those 80 client-side.

### Fix (single source of truth)

- **New persistent field on every dance doc**: `choreographer_key` —
  the strict, alphanumeric-only, whitespace-collapsed form of
  `choreographer`. Injected at every write site via a new
  `services/choreographer_follows.py::inject_choreographer_key(dance)`
  helper.
- **Boot-time backfill**: `backfill_choreographer_keys()` walks every
  dance doc missing / stale `choreographer_key` and stamps the correct
  value. Idempotent — a no-op after the first successful run. Wired
  into `services/startup.py` right after `ensure_indexes`.
- **New indexed lookup**: `(choreographer_key, is_published)` compound
  index means detail lookups are now an indexed find, not an
  aggregation pipeline.
- **Refactored aggregates** in `list_choreographers` and `my_follows`
  to group by the persistent field (no more `$addFields` normalisation
  at query time).
- **Write sites patched** to stamp the key on insert / update:
  - `routes/dances.py` (POST /dances, PUT /dances/{id}, POST
    /dances/restore-by-name, POST /dances/import)
  - `routes/copperknob.py` (POST /copperknob/import)
  - `routes/bootstepper.py` (POST /bootstepper/import)
  - `routes/bulk_import.py` (POST /admin/library/import-batch)
  - `services/startup.py` (seed inserts)
  - `services/dance_library_sync.py` (auto-applied sync writes only when
    the `choreographer` field itself changed)
- **Route-level cap bumped** from 200 → 500 in
  `GET /api/choreographers` so the discover screen can render the whole
  library.
- **Frontend `app/choreographers/index.tsx`** now passes `q` to the
  backend + `limit=500`, with a 250 ms debounce on keystroke. Any of
  the 775 choreographers is now findable by name.

### Live verification against the preview DB (June 2026 snapshot)

- Backfill wrote 1,163 rows on first boot (all published dances with a
  choreographer). 2 unpublished test dances left alone.
- `GET /api/choreographers/A.T.%20Kinson` → 1 dance (was 0).
- `GET /api/choreographers/Adrian%20Lefebour%20(AUS)%20-%20September%202025`
  → 2 dances (was 0).
- `GET /api/choreographers?q=fowler&limit=500` → 15 matched (was 0
  before the search box hit the server).
- Follow → my_follows → correct dance_count + latest_dance_name.

### 🎁 Then — 4 chat features on top of the base

(Coming next in this session — this section will be filled in as each
feature ships.)


### ✅ 4 chat features shipped this session

**1. Read Receipts (`services/chat_reads.py`)**

- New `chat_reads` collection: one row per user, `{user_id, last_read_at, updated_at}`.
- `mark_read(user_id)` uses `$max` so a background poll can't rewind a fresh UI stamp (monotonic).
- `read_state_for_room()` returns every instructor+admin's current pointer, joined with `name` + `picture` — one round-trip per chat poll.
- Endpoints: `GET /api/chat/reads`, `POST /api/chat/mark-read` (both instructor-only).
- Frontend renders tiny 16×16 avatar rows under each message showing readers whose `last_read_at >= created_at` (excluding the message author). Deep-computed once per message list via `useMemo` — no O(m×r) scan on every FlatList row.
- Account-deletion cascade: `services/chat_reads.purge_user(uid)` wired into `routes/auth.py::delete_me`.

**2. Quiet Hours (`services/notification_prefs.py`)**

- New sub-doc on `notification_prefs`: `{enabled, start_hour, end_hour, tz_offset_minutes}`.
- `_in_quiet_window()` wraps past midnight cleanly — `start=22, end=7` correctly covers `22:00-23:59 + 00:00-06:59`.
- Only silences `chat_alerts` + `mention_alerts` — class reminders / event alerts / choreographer drops stay live (they carry time-sensitive info).
- `filter_recipients()` consults BOTH the mute flag AND the quiet-hours window when the category is chat/mention.
- Frontend Settings → Notifications now has a "Quiet hours" section with a Switch + two "-/+" hour pickers (long-press = ±3 hours for faster dial-in). First enable stamps the caller's `-new Date().getTimezoneOffset()` so "10 pm" always means the user's 10 pm.
- Route: `PATCH /users/me/notification-prefs` accepts partial `quiet_hours` — field-by-field merge, so a client toggling just `enabled` doesn't have to re-send start/end/tz.

**3. Chat Reactions (`services/chat_reactions.py`)**

- New `chat_reactions` collection with unique compound index `(user_id, message_id, kind)` — a user can add MULTIPLE emojis to the same message but never the same one twice.
- `toggle()` = insert if missing / delete if present, idempotent under network retry.
- `summarize_for_messages(ids, viewer_id)` aggregates in one round-trip and returns `{msg_id: {counts: {"👍": 3, "🎉": 1}, mine: ["🎉"]}}`.
- `GET /api/chat/messages` piggy-backs the summary onto each doc (empty buckets are omitted for payload size).
- Endpoint: `POST /api/chat/messages/{id}/reactions {kind: "👍"}` — honours blocks (a blocked user's messages 404 for the caller, so no reaction sneak-through).
- Delete cascade: `services/chat_reactions.purge_message(id)` wired into `DELETE /chat/messages/{id}`. Account-deletion also cascades.
- Frontend: long-press any bubble → floating emoji strip (👍 ❤️ 🎉 😂 🙌 🔥). Own emoji chips glow in `brandTertiary + 38` alpha to signal "yours". Also preserved the pre-existing Block-user safety flow inside the same modal for others' bubbles.

**4. Landscape Chat Split (`frontend/app/(tabs)/instructor.tsx`)**

- `useWindowDimensions()` derives `isLandscape = win.width > win.height && win.width >= 640`.
- When landscape, the chat renders as a two-column `flexDirection: "row"` layout — message list on the left, composer + MentionAutocomplete on the right.
- 640px cutoff means older/rotated iPhones stay in single-column (composer feels more comfortable on narrow rotated devices); iPads and larger phones get the split.

### Testing (via testing_agent, iteration 38)

- 22/22 tests passed. New pytest suite at `backend/tests/test_choreographer_and_chat_features.py`.
- Verified: choreographer-fix DB state (1161/1161 populated); punctuated names return non-empty dances; server-side search; landscape split by inspection; monotonic mark-read; wrap-past-midnight quiet window; reaction toggle+cascade; account-deletion cascade for both chat_reads and chat_reactions.
- Zero regressions on the existing chat / @mention / notification-prefs / dance-write flows.


## Session (June 2026) — Chat Threads + Rich Link Previews

### 1️⃣ Chat Threads (iMessage-style inline reply)

- **Schema**: `instructor_messages` gained an optional `parent_id`
  field.  **We do NOT persist a `parent` snapshot** — the snippet is
  re-hydrated at read time from the live parent doc, so a later edit
  or delete of the parent is reflected instantly across every reply.
- **POST `/api/chat/messages`** accepts optional `parent_id`. If the
  parent doesn't exist OR its author is blocked by the caller
  (or vice-versa), the link is silently dropped — the reply still
  saves as a standalone message so the poster's typing is never
  lost.  The immediate POST response carries a `parent` snippet so
  the composer's optimistic-append UI can render the strip without
  a follow-up GET.
- **GET `/api/chat/messages`** batch-hydrates every reply in a
  single Mongo `find({"id": {"$in": parent_ids}})` and attaches a
  120-char truncated `parent` = `{id, user_id, user_name, message}`
  snippet.  Missing parents (deleted upstream) leave the reply
  without a `parent` field — client renders it as standalone.  A
  defensive `d.pop("parent", None)` up-front strips any legacy
  persisted snippet from pre-fix rows on first read.
- **Startup migration**: idempotent one-shot
  `updateMany({parent: {$exists: true}}, {$unset: {parent: 1}})`
  scrubs any legacy persisted snippet.  A no-op after the first
  successful run.
- **Frontend UI**:
  - Long-press bubble → picker now includes a **Reply** row (above
    Block, since Reply is the more common action).
  - Composer shows a "Replying to X: …" pill with a dismiss X.
  - Reply bubble renders a compact parent-strip above itself; tap
    scrolls to the parent (silent no-op if the parent scrolled off
    the loaded window).
- **Contract preserved**: `/api/chat/messages` still returns a
  plain array — no breaking shape change.

### 2️⃣ Rich Link Previews

- **New service `services/link_previews.py`** — resolves URLs
  pasted in chat into compact cards.  Deliberately narrow supported
  set:
  - **YouTube** (`youtube.com/watch`, `youtu.be/`, `youtube.com/shorts/`,
    `youtube.com/embed/`) — hits the public oEmbed endpoint, no key
    needed.  Title, channel name, `i.ytimg.com` `hqdefault.jpg`
    thumbnail.
  - **BootStepper** (`bootstepper.com/dance/…`) — uses existing
    `BOOTSTEPPER_API_KEY`; skipped gracefully when unconfigured.
  - **CopperKnob** (`copperknob.co.uk/stepsheet/…`) — same via
    `COPPERKNOB_API_KEY`.
- **Extractor**: conservative regex, up to **3 URLs per message**
  cap, trailing punctuation stripped so
  `see https://youtu.be/abc.` still resolves.
- **Cache**: new `link_previews` collection with unique
  `canonical` URL index.  7-day TTL check on read.  Tracking
  params (`utm_*`, `si`, `feature`, `fbclid`, `gclid`) are stripped
  only from the canonical cache key — the ORIGINAL user URL
  (query string included) is preserved on the returned preview
  so a `?t=42` YouTube timestamp still opens at the right spot.
- **POST-time resolution**: fan-out via `asyncio.gather` so a
  message with 3 links stays snappy.  Cache hit brings the second
  post of the same URL from ~500 ms to ~50 ms.
- **GET-time backfill**: legacy messages without `link_previews`
  are re-resolved on next read (cheap short-circuit skips messages
  with no `://` in the body).  Fetches are stored back onto the
  doc so the next poll skips the work.
- **Frontend UI**:
  - New `LinkPreviewCard` component renders below the bubble body:
    64×64 thumbnail (or coloured icon fallback for BootStepper /
    CopperKnob), title, subtitle (channel / choreographer),
    optional meta line ("60 BPM · Improver · 32 count").
  - Tap opens the URL in the system browser via
    `Linking.openURL`.
  - Cards align with the bubble (right for own messages, left for
    others') and cap at `maxWidth: 82%`.

### Testing (via testing_agent, iterations 39 → 40)

- **Iteration 39**: 19/21 pytest cases passed on first run.  Found
  one real bug — persisted-then-stale parent snippet — with a
  precise one-line fix suggestion.
- **Iteration 40**: 21/21 pass after applying the fix and adding
  the defensive read-time pop + startup migration.  Confirmed
  regressions all green: post/list/delete/mark-read/reactions/
  link-previews-cache-hit/blocked-parent-drop-link/chat-alerts
  fan-out.
- YouTube oEmbed was reachable throughout — no rate-limit skips.
- Test file: `/app/backend/tests/test_chat_threads_and_link_previews.py`.



---

## 2026-06 · User-Submitted Dances (Pending Approval Queue)

### Product intent
Let any authenticated dancer suggest a CopperKnob or BootStepper listing
for the SGY library without giving them write access. Admins moderate
in a lightweight queue. Metadata-only — never step-sheet content (Terms
compliant with both providers).

### Constraints (confirmed with user 2026-06)
- Sources allowed: **CopperKnob** and **BootStepper** only.
- No step-sheet content is stored — metadata only, matching the
  existing admin-only import flow.
- **Daily limit: 5 non-rejected submissions per user, per UTC day.**
- **Duplicates rejected** early: same source+ref that is already
  pending/approved in the queue OR already in the dance library.
- Approval creates a real `dances` row with `is_published=true` and
  credits the submitter as `created_by` (submitter's name appears on
  the dance card in the library).
- Rejected submissions do NOT consume the daily quota.

### Backend
- New module `/app/backend/routes/pending_dances.py`:
  - `GET  /api/pending-dances/quota` — used/limit/remaining/resets_at
  - `POST /api/pending-dances/submit` — body `{source, ref}` → 200 /
    409 already_pending / 409 already_in_library / 429 daily_limit_reached
  - `GET  /api/pending-dances/mine` — user's own submissions
  - `GET  /api/admin/pending-dances?status=pending|approved|rejected|all`
    — admin list with `pending_count` for the tab badge
  - `POST /api/admin/pending-dances/{id}/approve` — creates a real dance
  - `POST /api/admin/pending-dances/{id}/reject` — body `{reason}`
- Auth: user endpoints use `get_current_user`; admin endpoints use
  `require_admin_or_editor` (admin + step-sheet editors).
- Approval re-fetches upstream metadata (never trusts client / stale
  queue row) and reuses `services.dance_dedupe.find_duplicate` for
  the last-chance library dedupe check.

### Collection: `pending_dances`
```
{
  id: "pd_XXXXXXXXXXXX",
  user_id, user_email, user_name,
  source: "copperknob" | "bootstepper",
  ref: "AB1234",
  title, choreographer, choreographer_country, song, artist,
  music, level, count, wall, url,
  status: "pending" | "approved" | "rejected",
  submitted_at, reviewed_at?, reviewed_by?, reviewed_by_name?,
  rejection_reason?, approved_dance_id?,
}
```

### Frontend
- **`RequestAddToLibraryButton`** replaces the previous "admins only"
  gap on CopperKnob & BootStepper result cards for regular users.
  Renders one of: request / submitting / pending / in-library /
  rejected / limit-reached.
- **`PendingSubmissionsProvider`** hydrates the current user's
  submissions once per session so every card knows its status
  without re-fetching. Optimistic write on submit.
- **`/admin/pending-dances`** screen: tab filter (Pending has the
  red badge count) → per-row Approve / Reject actions with a
  rejection-reason modal (500 char cap, surfaced to the user).
- Profile → SGY Admin section adds a new "Pending Dances" row.
- Translations added for all 8 locales (~40 keys × 8 = 320 lines).

### Testing
- 19/19 backend tests PASS
  (`/app/backend/tests/test_pending_dances.py` — auth guards,
  quota, duplicates, daily limit, approve → real dance created
  with submitter credit, reject → status + reason persisted,
  regression sanity for existing CK/BS/dances routes).
- Frontend smoke tested: admin queue renders with 10 pending
  items from test seed data and shows the tab badge.

### Known trade-offs / follow-ups
- Approved dances are published immediately (per spec). If the
  team ever wants a "review-before-publish" second step they'd
  change the `is_published=True` line in `admin_approve`.
- No email / push notification to the submitter yet when their
  submission is approved or rejected — could be added by piping
  the reviewed row through the existing chat/notification
  services.

---

## 24. Apple App Review 1.2 UGC re-review package — 2026-06-24

### Background
Apple rejected build under Guideline 1.2 – Safety – User-Generated Content.
This section documents the full response package delivered back to Apple.

### What shipped this pass
- **Serializer fix** (`backend/core/serialize.py`) — `user_to_out` now
  echoes `accepted_terms_version`, `accepted_terms_at`, `is_suspended`,
  `suspend_until`, `is_banned`, `moderation_reason`. This closes a
  redirect-loop bug where a freshly-accepted-terms user would bounce
  back to `/terms-accept` on the next `/api/auth/me`.
- **Public profile ⋯ menu** (`frontend/app/users/[id].tsx`) — every
  non-self profile now has an "⋯" header button that opens a native
  action sheet with Report user / Block user (destructive) / Cancel.
  Uses the shared `ReportContentSheet` + `useBlockUser` hook. Closes
  the "reachable in ≤ 2 taps" requirement for profile-level UGC.
- **Reviewer seed script** (`backend/scripts/seed_apple_review.py`)
  — idempotent, creates:
  1. `reviewer@stompinground.com` / `<password from App Store Connect Notes; SEC-001>` (dancer,
     instructor-flagged, `accepted_terms_version` **set to a stale
     value** so Demo 1B trips the gate).
  2. `adminreview@stompinground.com` / `<password from App Store Connect Notes; SEC-001>` (admin,
     terms up-to-date so Demo 4 lands directly on the queue).
  3. `samplecontent@stompinground.com` (never signs in — used as
     the author of a pinned demo chat message the reviewer can
     long-press).
- **Reviewer Notes doc** (`/app/APPLE_REVIEW_NOTES.md`) — copy-paste
  block for App Store Connect + step-by-step demo script for the
  physical-device dry-run.

### Testing
- 32/32 UGC compliance tests PASS (`backend/tests/test_ugc_compliance.py`).
- Test file updated: `test_suspend_and_unsuspend_flow` and `test_ban_flow`
  now assert login-time 403 (stronger security than the previous
  /me-time 403 assertion).
- Frontend visually verified: Terms Gate loop bug fixed
  (reviewer account signs in → gate appears → ticks checkbox →
  home screen loads without bouncing back).

### Follow-ups
- Alert.alert strings in the profile ⋯ menu are hardcoded English
  right now — should be localized into the 7 non-English locales
  in the next translations pass.
- Push notification to the reporter when their report is actioned
  (Apple doesn't require this but it improves the SLA feedback loop).


---

## 25. Tab bar safe-area regression — 2026-09-20

### What Went Wrong
Even after the first safe-area pass, the user's tester reported tabs
still being clipped under the phone taskbar on iPhone SE, iPhone Pro,
Android gesture nav, AND Android 3-button nav — i.e. every device
category. The root causes were two subtle bugs:

1. **`useSafeAreaInsets()` returned 0 briefly on cold boot**, because
   `SafeAreaProvider` was mounted without `initialMetrics`. On the
   very first render the tab layout picked up `insets.bottom = 0`
   and rendered a too-short tab bar. Subsequent re-renders had the
   correct inset but the height was already committed.

2. **`Android edgeToEdgeEnabled: true`** in `app.config.js` means the
   app draws BEHIND the translucent system nav bar. When the tab
   bar's `paddingBottom` wasn't AT LEAST the nav-bar height, the
   icons sat under it.

### Fix
- `_layout.tsx`: `<SafeAreaProvider initialMetrics={initialWindowMetrics}>`
  so the very first paint has correct insets from the RN native side.
- `(tabs)/_layout.tsx`: kept explicit `height + paddingBottom` but
  introduced platform-aware minimums (12pt Android, 6pt iOS, 4pt web)
  as a floor for any edge case where insets briefly return 0.
- Content area is now a stable 60pt + `insets.bottom`, up from the
  earlier 56 + floored-inset which was too tight for tall labels on
  compact iOS devices.
- Removed the redundant `Platform.OS === "ios" ? 8 : 12` ternary in
  favour of the more granular Android/iOS/web floor.

### Verification
- Web viewport 390×844: all 5 tab labels legible (Home / Dances / My
  Dances / Instructor / Profile).
- Ready for real-device verification post-publish.


## Solo-Choreographer Library + Co-Choreographers (June 2026)

### Motivation
Dancers were tapping choreographer names in the library and landing on
composite rows like "Shane McKeever; Rachael McEnaney-White" — one
library entry per credit STRING rather than per PERSON. Not the way
choreographer directories normally work, and it fragmented the follow
graph too (following "Shane" wouldn't catch dances credited to
"Shane; Rachael" and vice-versa).

### Design
- The library only surfaces **main / solo choreographers**. The first
  parsed name in the credit string is the main; everyone else is a
  **co-choreographer** and never gets a library row.
- The dance detail page renders a new **Co-Choreographers** section
  (chips) below the main artist. Tapping a chip opens a small popup
  listing every LOCAL dance where that person appears — as main OR
  co — so their catalogue stays discoverable without polluting the
  library.

### Parser (`services/choreographer_follows.split_choreographers`)
Case-insensitive splitters, single-pass:
`&`, `+`, `/`, `,`, `;`, ` and `, ` feat.`, ` featuring `, ` ft.`, ` ft `.
Never splits on hyphens, dots, or parentheses (so `Rachael McEnaney-White`,
`A.T. Kinson`, `Adrian Lefebour (AUS)` stay as single names).
Dedupes case-insensitively while preserving first-occurrence casing.

### Write path
Every dance write site (POST /api/dances, PUT /api/dances/{id},
BootStepper import, CopperKnob import, dance_library_sync, seed loader)
routes through `inject_choreographer_key(dance)` which:
1. Parses the raw ``choreographer`` string into (main, [co...])
2. If the caller passed an explicit ``co_choreographers`` list (only
   BootStepper does; its API exposes ``danceChoreographers[]``
   structurally), trusts that verbatim.
3. Writes back: ``choreographer=main``, ``co_choreographers=[...]``,
   ``choreographer_key=normalise(main)``.

Boot-time backfill (`backfill_choreographer_keys`) idempotently
re-runs on every startup so legacy rows converge.

### Endpoints
- ``GET /api/co-choreographers/{name:path}/dances?limit=50``
  — auth-required, returns every dance where the person appears as
  main OR co, newest first. Powers the popup.
- ``GET /api/dances?q=...`` — now also matches on the
  ``co_choreographers`` array so a search for a co-only name still
  finds the dance.
- Existing ``GET /api/choreographers?q=...`` unchanged; groups on
  ``choreographer_key`` which is now main-only, so co-only people
  are naturally excluded from the library.

### Frontend
- New component `src/components/CoChoreographersSection.tsx` — chips
  + modal popup. Uses ``api.listCoChoreographerDances``. Localised
  keys ``dance.co_choreographers.*`` across all 8 supported locales.
- No changes to the existing choreographers/index or detail pages —
  they keep working exactly as before because the grouping key is
  unchanged.



## Session (June 2026) — SEC-001 Test-File Credential Cleanup (follow-up)

Follow-up to the SEC-001 mass credential refactor. The initial scrub
rotated prod passwords and introduced `backend/tests/_creds.py` as the
single source for seed-account passwords (read from `backend/.env`),
but a handful of test files still held stale references.

### What was fixed
- **`test_version_pin.py`** — the `TestListFeedback::test_403_non_admin`
  test logged in as `luvtowork247@yahoo.com` and expected a 403; but
  that account was promoted to admin during the June rotation, so the
  endpoint now returns 200 for Jamin. The fixture was changed to
  **register a brand-new regular user** (with `accepted_terms_version`)
  per test module, so the 403 assertion is now meaningful again.
  Standalone run: 16/16 passing.
- **`test_instructor_features.py`** — removed hard-coded
  `ADMIN_PASS = "Admin123!"` and the override to the non-existent
  `stompingroundyuma@gmail.com` email. Now reads `ADMIN_EMAIL` +
  `ADMIN_PASSWORD` directly from `_creds`. Standalone: 13 passed + 4
  pre-existing errors (unrelated — `terms_not_accepted`).
- **`test_certificate_and_clamps.py`** — removed hard-coded
  `"Admin123!"` for the generic-admin login test; now imports from
  `_creds` via `GENERIC_ADMIN`. Standalone: 21/21 passing (was 3
  passed + 15 errors before).
- **`test_gamification.py` / `test_practice_history.py`** — removed
  `ADMIN_PASSWORD = "Admin123!"` module constants; now imported from
  `_creds`.
- **`test_phase3_social.py`** — the `admin` fixture called
  `login_user("admin@stompinground.com", "Admin123!")` directly; now
  uses `ADMIN_EMAIL` + `ADMIN_PASSWORD` from `_creds`.
- **`test_new_features.py` / `test_refactor_regression.py`** — the
  module-level `GEN_ADMIN_PASSWORD = "Admin123!"` was replaced with
  an aliased import `ADMIN_PASSWORD as GEN_ADMIN_PASSWORD`. Erin
  stays as the suite's primary admin via `ADMIN_EMAIL = ERIN_EMAIL`
  so the existing assertions still read the right email.

### What was intentionally left
- `test_sec_audit_regression.py::ADMIN_OLD_PW = "Admin123!"` — this
  is a positive-security assertion that the rotated password rejects
  the OLD value with a 401. Keeping the literal here is part of the
  test contract.

### Net test-suite impact (before → after)
- `test_version_pin.py`: 2 → 16 passing (+14)
- `test_instructor_features.py`: 5 → 13 passing (+8)
- `test_certificate_and_clamps.py`: 3 → 21 passing (+18)
- `test_phase3_social.py`: 5 → 8 passing (+3)
- `test_new_features.py`: 10 → 27 passing (+17)
- `test_refactor_regression.py`: 24 → 42 passing (+18)
- `test_solo_choreographer_library.py`: 30/30 still green (unchanged)
- `test_sec_audit_regression.py`: 21/23 (2 pre-existing
  `terms_not_accepted` failures unrelated to credentials)

Net: **+78 more tests passing** across the suite after this cleanup
with no regressions attributable to the credential refactor.


## Session (June 2026) — Notifications 2.0

Added five new push-notification trigger points on top of the existing
Emergent-managed push stack. The infra was already fully wired (Android
``google-services.json`` in place, Firebase relay via EMERGENT_PUSH_KEY,
`send_push_localised` helper, 6 original pref categories). This session
only added NEW triggers + a lightweight admin "pin" screen.

### New admin notifications ("member requests")
* **Pending-dance submission** — `routes/pending_dances.py::submit_pending`
  now calls ``services.admin_notifications.notify_admins_of_pending_dance``
  right after the insert. Deeplinks admins to ``/admin/pending-dances``.
* **Self-serve instructor grant** — both the signup instructor_code
  path and ``POST /auth/set-instructor`` fire
  ``notify_admins_of_instructor_grant`` on success so admins can audit
  the promotion from the admin panel.

### New user-facing broadcasts
* **New dance in the library** — any newly published dance (direct
  create, publish toggle, CSV bulk-import with publish_all, pending-
  dance approval) also fires ``services.library_broadcast.broadcast_new_dance``
  to every opted-in user, skipping choreographer-followers who already
  got the targeted push.
* **New class scheduled** — ``routes/classes.py::create_class`` fires
  ``broadcast_new_class`` after the existing follower-only
  ``notify_followers_of_new_class``.
* **Admin announcements** — new ``services/announcements.py`` + routes
  ``POST /api/admin/announcements`` (admin creates+broadcasts),
  ``GET  /api/announcements`` (any signed-in user reads the feed),
  ``DELETE /api/admin/announcements/{id}`` (admin retracts a mistake).

### New notification_prefs categories
Added to ``ALL_CATEGORIES`` + ``NotificationPrefsIn``:
* ``admin_requests`` — admin-only; pending-dance + instructor-grant.
* ``announcements``  — admin pin fan-out to every user.
* ``library_updates`` — any new dance / class library-wide.

All three default to True (opt-out, not opt-in — matches the existing
contract). Chat triggers already covered via ``chat_alerts`` /
``mention_alerts`` — the existing ``fan_out_chat_post`` ships
"any new message" and the ``@mention`` fan-out was already wired.

### Frontend
* `/settings/notifications` — adds the three new toggle rows; the
  ``admin_requests`` row only renders for ``user.is_admin``.
* `/announcements` — read-only feed of recent admin pins; this is the
  deeplink target of the ``push.announcement`` push.
* `/admin/announcements` — admin composer + history; shows a trash
  icon per row for retraction.
* `app/(tabs)/profile.tsx` — added two rows (Announcements for all
  users, Admin · Send announcement for admins).
* `src/api/client.ts` — new `Announcement` type + `listAnnouncements`
  / `createAnnouncement` / `deleteAnnouncement` wrappers.
* `src/i18n/translations.ts` — 4 new UI keys localised to 8 languages.
* `core/i18n.py` — 10 new push keys (5 titles + 5 bodies) × 8 locales
  = 80 new string entries.

### Testing
`backend/tests/test_push_notifications_expansion.py` — 23 tests,
23/23 passing on a clean backend. Covers:
* 6 pref-roundtrip tests (defaults, PATCH merge, no cross-leak)
* 10 announcement CRUD tests (admin-only, 403 non-admin, 422 invalid,
  404 unknown id)
* 2 pending-dance trigger regression tests
* 2 instructor-grant trigger regression tests
* 3 library-broadcast trigger regression tests

### Build / platform caveat
Push notifications only fire on NATIVE builds — they do NOT work in
Expo Go or the web preview. The user has `google-services.json` in
place for Android. iOS requires `GoogleService-Info.plist` which the
user is still waiting on from Emergent Support. Until then, Android
APK builds fire pushes; iOS builds are a no-op.

### Data model additions
* `announcements` collection — one row per admin pin.
* `library_broadcasts` collection — idempotency ledger, unique on
  `(user_id, entity_type, entity_id)`. Prevents double-pushing the
  same user when a dance / class is re-published.
* `users.notification_prefs.{admin_requests,announcements,library_updates}`
  — three new boolean subdoc keys, default True.

### Known limitation
The Emergent push relay is a black-box external service with the dev
`EMERGENT_PUSH_KEY=placeholder` — none of the backend tests assert the
user's phone actually buzzes. They only verify DB side-effects, response
shapes, and that fan-out helpers never raise. Real end-to-end push
testing happens post-deploy on a physical Android device with a real
`EMERGENT_PUSH_KEY` set by the Emergent build pipeline.



## Session (June 2026) — Notifications 2.1

Shipped three stacked features in one pass: Dance Of The Day,
Notification Center, and Announcement Scheduling.

### A. Dance Of The Day (`/dance-of-the-day`)
`services/dance_of_the_day.py` picks ONE dance per user per day:

1. **Cached**: if we already picked for ``(user_id, today)``, return
   the cached row (same selection on refresh — no mid-day flipping).
2. **Unpracticed-first**: filter published dances to those the user
   has NOT practiced (``practice_sessions.dance_id`` set subtract),
   then pick deterministically via ``sha1(user_id|day) mod len(pool)``.
3. **Caught-up fallback**: if the user has practiced the entire
   library (🎉), rotate through ALL published dances using the same
   deterministic hash. Hero shows a "Caught up — fresh rotation" tag.

Routes
* `GET /api/dance-of-the-day` — returns `{dance, source}` where source
  is `cached | unpracticed | caught_up`.

Collections
* `dance_of_the_day` — one row per `(user_id, day)` cache. Natural
  tomorrow-overwrites-today behavior via upsert.

Frontend
* `src/components/DanceOfTheDayCard.tsx` — hero card at top of home.
  Difficulty-coloured pill, optional BPM pill, Practice CTA → routes
  to `/dance/{id}`. Hides itself when the library is empty or the
  user is signed out.

### B. Notification Center (`/notifications`)
`services/notification_feed.py` persists one row per recipient per
push, plus some in-app events that never fire a push.

Row shape::
    { id, user_id, kind, title, body, deeplink, metadata,
      created_at, read_at }

Kinds covered
* `announcement`, `library_new_dance`, `library_new_class`,
  `admin_pending_dance`, `admin_instructor_grant`, `chat_mention`,
  `chat_message`, `new_dance`, `new_class`, `new_event`,
  `class_reminder`
* **In-app only (no push)**: `new_follower`, `event_rsvp` — ping the
  user you follow / the event creator so dancers see social events
  in their feed without their phone buzzing.

Routes
* `GET    /api/notifications?limit=50&before=<iso>` — keyset-paginated
* `GET    /api/notifications/unread-count` — tiny badge query
* `POST   /api/notifications/{id}/read` — flip one row
* `POST   /api/notifications/read-all` — flip everything
* `DELETE /api/notifications/{id}` — delete one row

Retention
* 90-day sweep via `services.scheduler.purge_expired` (daily job).
* Account-deletion also purges the user's rows.

Frontend
* `/notifications` — FlatList, 50-row pages, pull-to-refresh,
  mark-all-read, long-press-to-delete. Kind-coded Ionicon per row,
  unread dot, relative-time stamp.
* Home hero bell (top-right of poster) with unread badge. Refreshed
  on every Home focus via `getUnreadNotificationCount`.
* `profile.tsx` — added "Notifications" row.

### C. Announcement Scheduling
`services/announcements.py` extended with `scheduled_for` (optional
ISO datetime). Behavior:

* `scheduled_for = None`  → broadcast now (backward-compat).
* `scheduled_for > now`   → insert as draft, scheduler fires later.
* `scheduled_for ≤ now`   → create_and_broadcast fires immediately
  (backdated schedules don't wait for the minute tick).

Scheduler
* `services.scheduler.start_scheduler` registers
  `broadcast_pending_announcements` as a 60s interval job. Each tick
  claims pending rows via `broadcasted_at: None` → stamp pattern so
  concurrent ticks never double-fire.

Routes
* `POST   /api/admin/announcements` — now accepts `scheduled_for`
* `PATCH  /api/admin/announcements/{id}` — edit a scheduled draft
  (400 if already broadcast — "delete + recreate" instead)
* `GET    /api/admin/announcements/scheduled` — admin-only pending list
* Users-facing `GET /api/announcements` filters on `broadcasted_at`
  so dancers never see scheduled drafts.

Frontend
* `/admin/announcements` — "Send now" / "Schedule for later"
  segmented control, native `DateTimePicker` for date + time, past-
  time inline warning, scheduled section with edit (pencil) and
  cancel (×) buttons. Edit flow reuses the composer with a "Save
  changes" / "Cancel edit" footer.

### Tests
`backend/tests/test_notifications_v2.py` — 21/21 passing.
* 4 Dance Of The Day tests (shape, auth, stability within day,
  per-user independence).
* 8 Notification Center tests (auth, feed log on announcement,
  newest-first ordering, mark-single-read, mark-all-read, delete,
  404 on unknown id, cross-user scope enforcement).
* 9 Scheduling tests (future schedule hides from user feed, admin-
  only scheduled list, PATCH edit flow, 400 on already-sent patch,
  404 unknown id, delete-scheduled, backdated-schedule-fires-now,
  422 invalid-scheduled-for format).

Full combined run: `test_notifications_v2 + test_push_notifications_expansion +
test_version_pin` = **60/60 passing**.

### i18n
* `src/i18n/translations.ts` — 3 new home keys
  (`home.dance_of_the_day`, `home.practice_now`, `home.dotd_caught_up`)
  localised to all 8 languages.
* `src/api/client.ts` — new `NotificationEvent`, `DanceOfTheDay`
  types + 8 new API wrappers (list / unread / read / read-all /
  delete / get-DOTD / list-scheduled / update-announcement).



## Session (June 2026) — DOTD Streak + Audience Picker

Two companion features that extend Notifications 2.1:

### A. DOTD Streak

Dancers earn a "Daily Devotee" badge for opening today's featured
Dance Of The Day three days in a row — specifically **from the hero
card on Home**. A seven-day run unlocks "Weekly Devotee". Both badges
are plugged into the existing `badges.py` catalog via a new
`"dotd_streak"` category so the generic `evaluate_badges()` pipeline
awards them automatically.

Backend
* `services/dotd_streak.py` — new module. `record_open(user_id,
  dance_id)` validates the submitted id matches today's DOTD pick
  (prevents stale clients from spoofing streaks), upserts a per-day
  row into `dotd_opens`, and bumps `users.dotd_streak_current` /
  `users.dotd_streak_longest`. Also triggers `evaluate_badges()` so
  the hero celebration can land in the same response.
* `services/badges.py` — added `BadgeDef("dotd_daily_devotee", ...)`
  requirement=3 and `BadgeDef("dotd_weekly_devotee", ...)`
  requirement=7, plus a new `"dotd_streak"` branch in `_progress_for`
  mirroring the existing `"streak"` branch but reading the DOTD
  counters.
* `routes/dance_of_the_day.py` — new `GET /streak` and `POST /open`
  endpoints alongside the original `GET /dance-of-the-day`.
* `services/startup.py` + `routes/auth.py` — DOTD index on first
  boot; account-delete purges `dotd_opens` + unsets the streak fields.

Frontend
* `components/DanceOfTheDayCard.tsx` — hero card now fetches both
  DOTD + streak in parallel on mount, calls `recordDotdOpen` on tap
  BEFORE navigating (so the next focus reads the bumped value), and
  shows a flame pill: lit orange when today's done, dim grey with
  a `·` suffix as a nudge otherwise. Newly-earned badges pop in an
  `Alert.alert` with the title + description.
* `src/api/client.ts` — 2 new types (`DotdStreak`, `DotdOpenResponse`)
  + 2 new API wrappers (`getDotdStreak`, `recordDotdOpen`).

### B. Admin Audience Picker

Announcements can now target a subset of dancers instead of the
entire userbase. Three audience modes with combinable filters:

1. **Everyone** (default) — full fan-out.
2. **Instructor's followers** — multi-select instructor picker.
3. **Difficulty tier** — multi-select chips using the dancer's
   **most-practiced difficulty in the last 30 days**.

The two custom filters are intersected server-side — "Erin's
followers AT Beginner tier" reaches only dancers who match BOTH.

Backend
* `services/difficulty_tier.py` — new module. `tier_for_user()` and
  `user_ids_matching_tiers()` run a single-pass Mongo aggregate over
  `practice_sessions` → `dances.difficulty` to resolve each user's
  current tier (grouped by count, sorted desc). 30-day lookback.
* `services/announcements.py`:
  - New `_normalize_audience()` that canonicalises the payload shape
    (`{scope: "everyone"|"custom", instructor_user_ids, difficulty_tiers}`).
  - New `_resolve_audience()` resolver — base pool from instructor
    follower graph (`db.follows.followee_id ∈ picks`) or all users,
    then intersect with `user_ids_matching_tiers` when a tier filter
    is set.
  - `_broadcast_now()` now routes through `_resolve_audience` so
    tier/instructor-scoped pins only fan out to the matching pool.
  - `create_and_broadcast()` + `update_scheduled()` both accept an
    optional `audience` arg that persists on the announcement doc.
  - New `preview_audience()` returns `{count, sample_names: [..5..]}`.
* `routes/announcements.py`:
  - `AnnouncementIn` / `AnnouncementPatch` now accept `audience`.
  - `POST /admin/announcements/audience/preview` — dry-run count.
  - `GET  /admin/announcements/instructor-picker` — admin picker list.
  - `GET  /admin/announcements/difficulty-tiers` — static tier chips.

Frontend
* `components/AudiencePicker.tsx` — new reusable component. Three
  mode buttons (Everyone / Followers / Difficulty). Each custom
  mode shows its filter block, and if the admin has data in BOTH
  filters, both blocks stay visible (so combining is first-class).
  Debounced 500ms preview call renders "Will reach N dancers · e.g.
  Alice, Bob, Carol" below.
* `admin/announcements.tsx` — composer now holds an `audience`
  state object that:
  - Resets to `{scope: "everyone"}` on compose-fresh.
  - Restores from `ann.audience` when editing a scheduled draft
    (so pencil → save never silently widens the fan-out).
  - Flows into both `createAnnouncement` and `updateAnnouncement`.
  - Added an `AudienceTag` next to each scheduled + sent row's
    header so admins can see at a glance what the pin was scoped to
    ("Everyone" / "2 inst. · Beginner" / "Advanced").

### Tests
`backend/tests/test_dotd_streak_and_audience.py` — 19/19 passing.
* 6 DOTD endpoint tests (auth, default state, open bumps, wrong-
  id rejects, missing-id 400, same-day no-rebump).
* 2 DOTD badge award tests (seeds 3- and 7-day streaks via DB and
  verifies `evaluate_badges` returns the right ids).
* 2 Metadata endpoint tests (instructor-picker admin-only,
  difficulty-tiers admin-only + canonical tier list intact).
* 4 Audience preview tests (everyone count, custom-no-filters
  defaults to everyone count, tier filter narrows ≤ everyone,
  non-admin 403).
* 5 Full-cycle audience-on-announcement tests (create persists
  scope, PATCH round-trip, backward-compat default="everyone",
  tier filter actually narrows the recipient pool).

Full combined run with previous suites:
`test_dotd_streak_and_audience + test_notifications_v2 +
test_push_notifications_expansion + test_version_pin` = **79/79 passing**.

### Data model additions
* `dotd_opens` collection — one row per `(user_id, day)`, unique
  index on the pair. Fields: `dance_id`, `opens` (count), `first_open_at`,
  `last_open_at`. Pruned on account delete.
* `users` — three new optional fields: `dotd_streak_current`,
  `dotd_streak_longest`, `dotd_last_open_day`.
* `announcements.audience` — nested doc:
  `{scope, instructor_user_ids?, difficulty_tiers?}`. Nullable for
  backward-compat with pre-June rows (treated as `scope=everyone`).


---

## Follower push notifications now land in Notification Center + double-push fix — 2026-10-02

### Why
A follower who missed the OS banner for a new class/event had no way
to find it after the fact. The push helpers (`notify_followers_of_new_class` /
`notify_followers_of_new_event`) sent the push + wrote a dedupe ledger
row but never wrote a row into `notification_events`, so the bell-icon
Notification Center was blank for those events. Separately, the
class-create route always passed an empty `skip_user_ids` list to the
library-wide `broadcast_new_class`, meaning a follower who already got
the instructor push ALSO got the "A new class was added" library push —
double-buzz for the same class.

### What changed
Edits in `services/instructor_notifications.py` only (plus a plumbing
tweak in `routes/classes.py`):

* `notify_followers_of_new_class` and `notify_followers_of_new_event`
  now call `notification_feed.log_event(...)` after push, with kinds
  `new_class` / `new_event`. Metadata carries `entity_id` and
  `instructor_id`. Deeplinks target `/classes` and `/events/{event_id}`
  respectively.
* Both helpers now return `list[str]` of pushed user_ids (previously
  returned `int`). Return is backward-compat tolerated by the route
  which still falls through to the broadcast's own ledger dedupe when
  it receives a legacy int.
* `routes/classes.py` captures the returned list and forwards it as
  `skip_user_ids=follower_recipients` to `broadcast_new_class`,
  guaranteeing a single push per follower per class.

### Verification
* Smoke test: fresh follower user → picks Erin as instructor → Erin
  creates class + event → 1 feed row for each, 1 follower-push ledger
  row, 0 library-broadcast ledger rows.
* Live UI: Notification Center shows "New class from Jamin Brown —
  Thursday Night Line Dancing · 2026-10-03" at the top with the
  green school icon.
* Tests: `tests/test_instructor_notifications.py` grows from 7 → 10
  passing cases (new: `TestFeedCenterLogging` × 2 and
  `TestNoDoublePushDedupe` × 1). Also fixed a pre-existing bug in the
  test's `_mk_dancer` helper that was missing `accepted_terms_version`
  since the Apple UGC 1.2 rollout.

### Frontend
No change required. `app/notifications.tsx` already maps `new_class`
and `new_event` to the right icon/tint (school/green and flag/blue)
and routes any deeplink through `router.push`.

---

## Weekly Digest Email — Monday-morning unread recap — 2026-10-02

### Why
Dancers who travel, take a week off, or just skip notifications for a
busy stretch were quietly missing new classes and events from the
instructors they follow. OS push is great for in-the-moment, but has
no "catch up later" affordance. A Monday-morning digest email closes
that gap without adding a single new push.

### What it does
Every Monday at 08:00 America/Phoenix (15:00 UTC — Arizona skips DST
so this is stable year-round), the server scans every user with the
new `weekly_digest` pref ON and sends them one branded HTML email
summarising their UNREAD notifications from the past 7 days.

Four digest sections (same ordering as the Notification Center icons):
* 📚 **Classes** — `new_class`, `library_new_class`, `class_reminder`
* 🎉 **Events** — `new_event`
* 📣 **Announcements & Pins** — `announcement`
* 💬 **@Mentions** — `chat_mention`

Each section caps at 5 items; anything over shows "+N more in the app →"
linking back to the Notification Center. If a user has zero unread
items in the window, the email is skipped entirely (no spam).

### Safeguards
* **Opt-out** — pref default is True; dancers can mute in Settings.
* **Deliverability** — Apple private-relay accounts flagged
  `email_is_synthetic: True` are skipped (their `apple:<sub>` address
  isn't deliverable).
* **Idempotency** — one send per user per ISO week via a unique
  `(user_id, week_start)` ledger in `weekly_digest_sends`. A pod
  restart around the cron window is a no-op.
* **Account deletion** — the ledger is purged alongside the user.

### Admin tools
* `POST /api/admin/weekly-digest/preview` — fires a real email to the
  caller RIGHT NOW with `force=True`, bypassing all guards (useful
  for Erin to preview the look). Doesn't write a ledger row so the
  Monday sweep still fires.
* `POST /api/admin/weekly-digest/run-now` — manual trigger of the
  full sweep with normal guards, in case the cron missed its window.
* `GET  /api/admin/weekly-digest/status` — this week's send count,
  opted-in / opted-out totals, last send timestamp.

### Frontend
* `settings/notifications.tsx` — new row:
  "📧 Weekly email digest — Monday-morning recap of unread
  notifications so you never miss a new class, event, or @mention"
* `src/api/client.ts` — `weekly_digest: boolean` added to
  `NotificationPrefs` type.

### Email template
Mobile-first HTML with inline styles for maximum client support
(Gmail / Apple Mail / Outlook):
* Red→orange gradient brand header.
* Personal greeting and unread count.
* Section cards with emoji headers, title + body + relative time
  per item, truncation tail link.
* Red "Open the Notification Center" CTA button.
* Settings-change link in the footer.
* Plain-text alternative part for text-only clients.

### Tests
`tests/test_weekly_digest.py` — **15 cases**, all passing. Combined
with the sibling notification suites (`test_instructor_notifications`,
`test_notifications_v2`, `test_dotd_streak_and_audience`) — **65/65
pass**.

### Data model additions
* `weekly_digest` added to `notification_prefs` sub-doc (bool,
  default True).
* New collection `weekly_digest_sends` — one row per
  `(user_id, week_start)` with `sent_at` + `item_count`. Unique index
  guards against double-sends.

---

## iOS Push Notifications — CORRECTION (2026-10-02)

Earlier handoff notes claimed iOS pushes were blocked pending the user
providing a `GoogleService-Info.plist`. That was **wrong** — the app
is wired to **Emergent-managed push notifications**, not self-managed
Firebase. The user does NOT need to provide any iOS Firebase config
file.

### How Emergent-managed push actually works
* Backend uses `core/push_service.py` which POSTs to Emergent's relay
  (`/api/v1/push/trigger`) with the `EMERGENT_PUSH_KEY` from
  `backend/.env`.
* In preview/dev `EMERGENT_PUSH_KEY` is a placeholder → relay returns
  401 → backend logs "skipping push" and the request succeeds anyway
  (push is best-effort).
* On **Publish → Build**, Emergent swaps the real key in automatically
  and provisions APNs + FCM credentials on their side.
* `frontend/google-services.json` already exists (688 bytes) for
  Android. **No iOS plist is needed.**

### What this means for testing
* Expo Go: pushes will NEVER deliver (sandbox limitation).
* Preview URL: pushes won't deliver (placeholder key).
* **TestFlight / Play Store build** after Publish: pushes land
  normally on real devices.

Nothing to do code-wise. The "P1 blocked" item from previous handoff
is dismissed.

---

## Chat Reply Push + In-App Notification — 2026-10-02

### Why
Chat already supported threaded replies (`parent_id` on each message,
the frontend already sends it when the "Reply to X" picker is used),
but when someone replied to your message, nothing told YOU. Threads
died silently if you weren't currently looking at the chat tab.

### What it does
When any user hits Reply on another user's chat message and posts:
* The **original poster** of the parent message gets a push
  (localised to their language) with title "`<sender>` replied to
  your message" and the first 100 chars of the reply as the body.
* The push lands with `kind: "chat_reply"` and includes the parent
  message id so the client can deep-link into the thread.
* A `chat_reply` row is written to the **Notification Center** so
  the alert survives beyond the OS banner. The row shows a red
  reply-arrow icon.

### Smart dedupe cascade
Exactly ONE notification per recipient per message. Priority order:
1. **@mention wins** — if the reply tags `@Erin`, only
   `chat_mention` fires (not also `chat_reply`).
2. **Reply wins** — the parent author gets `chat_reply`, not the
   general "someone posted" `chat_message`.
3. **General fan-out** — every other eligible chat-room member
   gets `chat_message` (if they haven't opted out).

### Edge cases handled
* **Self-reply** — no notification (don't buzz yourself).
* **Deleted / unknown parent** — no notification.
* **Mutual block** — never pings across the block wall.
* **Pref muted** — `notification_prefs.mention_alerts = false`
  mutes replies too (replies are "someone talking to you", same
  bucket as @mentions).
* **Quiet hours** — replies respect the quiet window because
  `mention_alerts` is in the quiet-hours category list.

### Weekly digest integration
`chat_reply` rows are included in the Monday-morning digest email
under the 💬 @Mentions section (same bucket as `chat_mention`).

### i18n push copy
Full translations for all 8 supported locales:
EN, ES, FR, DE, NL, KO, zh-Hans, zh-Hant.

### Tests
`tests/test_chat_replies.py` — 6/6 passing.
Combined notification suites: 71/71 passing.

### Data model
No schema changes. Reuses existing `parent_id` field on
`instructor_messages`. New notification kind `chat_reply` added to
`notification_feed.KNOWN_KINDS` and to `weekly_digest._SECTION_FOR_KIND`.

---

## Apple App Review accounts REMOVED — 2026-10-02

### Why
Apple approved the build. The three seeded reviewer accounts are no
longer needed on live infrastructure:
* `reviewer@stompinground.com` (regular dancer, terms-gate demo)
* `adminreview@stompinground.com` (admin moderator, moderation queue demo)
* `samplecontent@stompinground.com` (author of the seeded demo message)

Leaving them in place was both a privacy signal (strange accounts in
every chat room, leaderboard, etc.) and a mild attack surface
(known-email + rotated-password combo that could be fished).

### What changed
* **Backend auto-seed disabled** — `services/startup.py::run_startup()`:
  the `seed_apple_review_accounts()` import + call are commented out
  with a clear note on how to re-enable for a future re-review.
* **Seed files kept dormant** — `services/apple_review_seed.py` and
  `scripts/seed_apple_review.py` remain on disk, as do the three
  `SEED_PW_*` env vars in `backend/.env`. Un-commenting the two
  lines in `startup.py` is enough to bring the seed back if Apple
  requests another review.
* **DB purged** — new script `scripts/purge_apple_review_seeds.py`
  mirrors the full `delete_my_account` sweep (sessions, tracking,
  attendance, chat messages/reactions/reads/mentions, follow
  graph, choreographer follows, instructor notification ledger,
  library broadcast ledger, notification feed, DOTD streak,
  weekly digest ledger, badges, practice logs, event RSVPs,
  authored content anonymisation). Idempotent — safe to re-run.
* **test_credentials.md updated** — the reviewer section is replaced
  with a "REMOVED 2026-10-02" block that records the previously-used
  emails and the re-enable procedure.

### Verification
* All 3 target emails return `401` on `/api/auth/login` post-purge.
* Zero rows remain for the 3 emails after a backend restart (the
  commented-out seed does not re-create them).
* 3 other admins (Erin, Admin, Jamin) remain in the DB — the
  last-admin guard is not tripped.
* Zero references to `reviewer@stompinground`, `adminreview@`, or
  `samplecontent@` remain in the pytest suite.
* 71/71 notification tests still pass after the change.

### Re-enable procedure (if needed)
1. Uncomment the two lines in
   `backend/services/startup.py::run_startup()`.
2. Restart backend. Accounts + demo chat message re-seed from
   `SEED_PW_*` env vars in `backend/.env` on next boot.

---

## Followed-Instructor Hub on Home — 2026-10-05

### Why
Dancers already pick their favorite instructors via "My instructors"
(stored in `users.instructor_ids`), but Home's Weekly Recap, Boot
Scoot Board, and Browse Dances all surface community-wide activity.
There was no path from Home → "what's my instructor doing this
week?" without hopping to the Classes tab or the Events screen.

### What it does
New `FollowedInstructorHub` card renders directly below the Dance of
the Day. It lists up to 4 upcoming classes + events authored by
instructors the signed-in dancer follows, sorted chronologically.

Each row shows:
* CLASS or EVENT pill (brand tertiary vs. brand secondary)
* Title (session_label for classes, name for events)
* Metadata chain: instructor name · time · venue · dance count
* Relative date label (Today / Tomorrow / "Thu, Oct 8")
* Chevron → deep-links to `/classes` or `/events/{id}`

Below the rows, a "+N more" link appears when more than 4 upcoming
items exist, routing to the Instructor tab.

### Hidden states (no dead card)
* Signed-out users.
* Dancers following nobody (`has_follows=false`).
* Dancers whose follows have nothing upcoming.

### Backend
New `routes/followed_instructors.py` with
`GET /api/followed-instructors/upcoming?limit=10`:
* Reads `users.instructor_ids` for the authenticated user.
* Pulls upcoming classes (`date >= today`) matching those IDs.
* Pulls PUBLISHED upcoming events matching those IDs
  (`is_published=True`).
* Merges + normalises into a unified `{kind, id, title, date,
  start_time, venue_name, city, dance_count, deeplink, ...}` shape.
* Sorts `(date asc, start_time asc)` — classes before timed events
  on the same day.
* Returns `{items, total, has_follows, today}` with `total`
  reflecting pre-truncation count so the client can show "+N more".

### Frontend
* `src/components/FollowedInstructorHub.tsx` — the card component,
  wrapped in a `useFocusEffect` so new classes/events appear
  without a relaunch.
* `src/api/client.ts` — new `getFollowedUpcoming` wrapper +
  `FollowedUpcomingItem` + `FollowedUpcomingResponse` types.
* `app/(tabs)/index.tsx` — card inserted right after `<DanceOfTheDayCard />`,
  before the Hello/Weekly Recap section.
* `src/i18n/translations.ts` — ~10 new keys per locale across all 8
  supported languages (EN, ES, FR, DE, NL, KO, zh-Hans, zh-Hant).

### Tests
`tests/test_followed_instructor_hub.py` — **9/9 passing**:
auth-required, no-follows empty payload, followed class visible,
published event visible, draft event hidden, past class hidden,
chronological sort, limit cap with total unchanged, cross-user
isolation.

Combined notification + hub suites: **80/80 passing**.

### Live verification
Screenshot confirms Erin's Home now shows the hub with 3 real
upcoming items from Jamin (whom she follows): Thursday Night Line
Dancing (CLASS, Tomorrow), Beginner Boot-Scootin' Workshop (EVENT,
Wed Oct 7 · 19:00 · Yuma Civic Center), Friday Night Dance Social
(CLASS, Thu Oct 8 · 2 dances).

### Data model
No schema changes. Reuses existing `users.instructor_ids`,
`db.classes`, `db.events`.

---

## Security Audit — SEC-001 + SEC-002 Fixes — 2026-10-05

### Audit outcome
Read-only security audit returned **CONDITIONAL PASS** — no P0/P1
vulnerabilities. Two P2 (medium) findings worth fixing before launch
plus three P3 nits.

### SEC-001 (P2) — Moderation blind spot — FIXED
**Finding**: A troll could block every admin via `POST /blocks` and
their abusive chat messages would disappear from the admins' live
`/chat/messages` view, weakening proactive moderation. Reactive
moderation (reports + remove) still worked.

**Fix**: `routes/chat.py::list_chat` now skips the mutual-block
filter when the viewer is admin (`instructor.get("is_admin")`).
Non-admin viewers still have their block preference respected
everywhere. Personal block preferences still apply to admins
across the rest of the app (profile views, DMs, mentions).

**Verified**:
* Smoke test: Jamin blocks the admin, admin posts a chat, admin
  still sees the message (while non-admin does not).
* New regression suite `tests/test_sec001_moderation_blind_spot.py`
  — 2 cases: admin-sees-canary-from-blocker, nonadmin-still-hidden.
  Both pass.
* Full affected suite 82/82 passing.

### SEC-002 (P2) — `.env` not git-ignored — FIXED
**Finding**: `backend/.env` (holding SMTP password, JWT signing
secret, seed passwords) was NOT covered by any `.gitignore` rule.
One careless `git add .` would publish production secrets to
history. No present leak (file was untracked), but latent risk.

**Fix**: Added comprehensive env-ignore rules to `/app/.gitignore`:
```
.env
.env.*
!.env.example
!.env.sample
backend/.env
backend/.env.*
frontend/.env
frontend/.env.*
*.env
!*.env.example
!*.env.sample
```
`.env.example` / `.env.sample` templates stay trackable.

**Verified**: `git check-ignore backend/.env` → "backend/.env"
(now ignored). `git check-ignore frontend/.env` → ignored.
`.env.example` would NOT be ignored (safe for sharing templates).

### Collateral fix — stray mutual block in dev DB — CLEANED
During the SEC-001 smoke test, a block row was created between
Jamin and Erin and Jamin and the admin account before cleanup
could run. This caused the chat_replies notification tests to
start failing because `fan_out_mentions` + `fan_out_chat_reply`
respect mutual blocks. Purged 2 stray `user_blocks` rows; all
notification tests now pass again.

### P3 items (deferred — can be addressed later)
- **Email service logs recipient PII** (`core/email_service.py:65,70`):
  logs full email address on SENT/FAILED lines. Secrets/tokens are
  already redacted. Minor PII hygiene fix (hash/truncate email).
- **Starlette 0.37.2**: predates the 0.40 multipart-DoS fix.
  Reachability not proven exploitable. Bump on next deps refresh.
- **JWT 30-day expiry**: documented as 7-day in notes but code uses
  30. Confirmed no exploit path; doc the policy update.

### Review coverage
Backend `auth.py` (brute-force, enumeration, last-admin, pwd_ver
rotation), every `/api/admin/*` route (Depends chain), chat IDOR,
weekly digest XSS/cross-user, NoSQL injection via `$regex` / `$in`,
secrets handling, seed scripts, test credentials, frontend token
storage. All CLEAN beyond the two P2s above.

---

## Simplify completion celebration — 2026-10-05

### UX problem (from design review)
On the dance-completion celebration screen (`/celebrate`):
1. The newly-earned badge card floated at `top: 26%` of the screen,
   covering the "You danced …" headline.
2. The headline + "N dances completed" + milestone label all competed
   for visual weight — three large-ish lines fighting the eye.
3. No fast path to pick a NEXT dance; users had to dismiss back
   through dance detail and reopen the Library tab.

### Fix
`frontend/app/celebrate.tsx` + `frontend/src/components/BadgeUnlockedOverlay.tsx`:

1. **ONE clear headline**: `You completed ${danceName}!`
   (previous: `You danced ${danceName}`). Falls back to
   `You completed a dance!` when `danceName` is missing.
2. **Compact single-line secondary**: milestone label when available
   (e.g. "5 dances strong — you're finding your groove!") else
   `Dance #N` else default encouragement. Replaces the old
   `count` + `milestone` double-stack (two competing large-ish
   lines).
3. **Badge rendered BELOW the headline, in flex-flow**:
   added `inline` prop to `BadgeUnlockedOverlay`. When `inline`,
   the component skips its `position: absolute, top: 26%` wrap
   and participates in normal flex-column layout so the parent
   places it under the headline, never over it. Default
   behaviour (`inline={false}`) remains backward-compat for any
   future callers that want the floating overlay.
4. **New "Choose your next dance" button**: adds a tap-to-Library
   action next to Certificate / Share, so completers can roll
   straight into the next practice. Uses `musical-notes` icon,
   routes to `/(tabs)/library`.
5. **Orbit polish**: shifted logo orbit center from 62% → 72% of
   screen height and shrank radius 130 → 110 so the one-time
   logo flourish never visits the headline band.
6. **Web rendering robustness**: shared value `t` initialises at
   `1` on web (end-state) with the entry animation disabled.
   Reanimated's `withDelay` adapter on web occasionally fails to
   fire, which would leave the hero stuck at opacity 0. Native
   path is unchanged (still animates 0 → 1 with the delay/scale
   polish).

### What stayed
* Fireworks overlay (shows achievement moment).
* Orbiting-logo flourish on first load.
* Certificate download with theme picker.
* Platform-native share sheet / web clipboard fallback.
* Auto-dismiss timer (9s / 14s with badges).
* Tap-anywhere-to-dismiss affordance.

### Verified
* Screenshot: hero shows "NICE WORK!" eyebrow → "You completed
  Dance With Me!" headline (big serif, white, two lines on
  narrow phones) → compact orange milestone subtitle → clean
  gap → button row at bottom (Share your win · Choose your
  next dance · Done ✓). No overlap, no competing big text.
* Lint: ✅ no issues
* Backend suite regressions: 32/32 still passing.

---

## Thank-you toast after Share + Streak Save nudge — 2026-10-08

### 1. Gratitude toast after Share Your Win
Problem: tapping Share Your Win on `/celebrate` opened the system share
sheet (or clipboard on web) but left the dancer wondering if anything
happened once they returned to the app.

Fix in `app/celebrate.tsx::handleShare`:
* Track whether the share actually REACHED the OS sheet or clipboard
  (`shared = res?.action !== Share.dismissedAction` on native;
  `shared = true` on successful nav.share / clipboard write).
* After a successful share AND only after it, call
  `toast.success("Thanks for spreading the word! 🎉", {duration: 2600})`
  via the existing `useToast()` from `src/context/toast-context.tsx`.
* User-cancels (`AbortError` on web, `dismissedAction` on native)
  stay silent — no fake gratitude for people who closed the sheet.
* Toast provider has a NOOP fallback context, so the call is safe
  even in test harnesses where the provider isn't mounted.

### 2. Streak Save nudge on Home
Problem: dancers who missed a day lost their streak silently because
the server only reconciles the counter on the NEXT open. No in-app
hint ever said "you have one more day to save it."

Backend (`services/dotd_streak.py::get_streak`):
* Return shape now includes `last_day`, `at_risk`, `grace_days`.
* `at_risk = True` iff `current >= 1 AND today_done == False AND
  last_day == yesterday` — the single calendar day where opening
  today's DOTD would still preserve the streak.
* `grace_days` is 1 on the at-risk day, 0 otherwise.
* `record_open` returns the updated streak which now carries the new
  fields automatically — no caller change needed.

Frontend:
* New type fields `last_day?`, `at_risk?`, `grace_days?` on
  `DotdStreak` in `src/api/client.ts`.
* New component `src/components/StreakSaveCard.tsx` — renders
  ONLY when the backend flags `at_risk=true`. Uses the DOTD-matching
  flame orange (`#D9502A`) in a warm ember-tinted panel, with a
  "Open today's dance" CTA that deep-links to the DOTD's dance
  detail page (where the practice flow credits the streak).
* Inserted on Home between `<DanceOfTheDayCard />` and
  `<FollowedInstructorHub />` — right under the DOTD it protects.
* Full i18n: 3 new keys per locale across all 8 supported languages
  (EN/ES/FR/DE/NL/KO/zh-Hans/zh-Hant).
* `useFocusEffect` refresh so the card disappears instantly after
  the dancer opens the DOTD from elsewhere.

### Tests
`tests/test_dotd_streak_and_audience.py` grows from 19 → 22 cases:
* `test_streak_at_risk_true_when_last_open_was_yesterday`
* `test_streak_at_risk_false_when_last_open_was_today`
* `test_streak_at_risk_false_when_last_open_was_two_days_ago`
All 22 pass. Combined 7-suite run: **85/85 passing** (SEC-001 +
followed-hub + chat_replies + weekly_digest + instructor_notifications
+ notifications_v2 + dotd_streak_and_audience).

### Verified live
Screenshot at `/` with Erin's `last_day = yesterday` simulated: Home
shows the DOTD card at top (with 🔥 5 flame pill) and the Streak Save
card directly beneath — orange flame icon, "5-day streak at…" title,
"One dance keeps y…" body, orange "Open today's dance →" CTA button.
Clean, matches the DOTD's visual language, no overlap.

### Data model
No schema changes. Reuses existing `users.dotd_streak_current`,
`dotd_streak_longest`, `dotd_last_open_day`.

## Instructor Dances: Drafts / Published split — 2026-10-12
- Instructor → Dances list now defaults to **Drafts** (unpublished only). Publishing a dance removes it from the list instantly + success toast.
- "Drafts (N)" / "Published (N)" toggle chips (testIDs `instr-view-drafts`, `instr-view-published`); Published view lists all live dances (own + taught) with Unpublish for own dances (info toast, returns to Drafts).
- Empty states: "All caught up — no drafts waiting to be published" / "No published dances yet." (i18n keys added for all 8 locales).
- Frontend-only change (`app/(tabs)/instructor.tsx`, `src/i18n/translations.ts`). Tested: iteration_46 — all pass.
