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
