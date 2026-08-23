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
