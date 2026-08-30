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
Same list as Phase 17 — user still needs to add `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY_PEM_B64`, `APPLE_AUDIENCES`, `COPPERKNOB_API_KEY`, plus now `BOOTSTEPPER_API_KEY=AT7G23KS2GJHR8CRR43JJ9N` to the prod environment via the Emergent dashboard and click Publish.



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
