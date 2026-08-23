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
