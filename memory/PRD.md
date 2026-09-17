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
