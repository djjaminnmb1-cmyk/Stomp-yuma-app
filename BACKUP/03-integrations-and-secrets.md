# 03 · Integrations, Env Vars, and Secret-Handling

This document lists every external service the app talks to, what env var
carries its credential, and where to store the actual secret value.

**No real secret values are written to this file, to GitHub, or to any doc
in this backup.** The scrubbed placeholder-only templates are:

- `BACKUP/backend.env.example`
- `BACKUP/frontend.env.example`

The **live values** for every key below are in the running container's
`/app/backend/.env` and `/app/frontend/.env`. Copy them out via the
Emergent dashboard's env-var viewer (Publish → Manage env vars) into
your password manager. Never paste them into GitHub, chat, or a public
gist.

---

## Backend `/app/backend/.env` — full contract

| Key                                    | Origin / how to obtain                                                                                                | Notes                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `MONGO_URL`                            | Currently `mongodb://localhost:27017` (in-container). For a real deploy: MongoDB Atlas or Emergent-managed Mongo.     | Whole connection string, credentials included. Never commit.                                   |
| `DB_NAME`                              | Currently `test_database`. Production should be `stompinyuma` (or similar).                                           | Change the value; the code reads it from env.                                                  |
| `JWT_SECRET`                           | Random 64+ char secret. Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"`.                     | Rotating this logs everyone out (all JWTs become invalid). Do that on suspected leak.          |
| `EMERGENT_PUSH_KEY`                    | **Managed by Emergent**. Populated automatically on Publish.                                                          | Do NOT set locally. Placeholder in dev, replaced at deploy.                                    |
| `EMERGENT_LLM_KEY`                     | **Managed by Emergent**. The universal LLM key (OpenAI / Anthropic / Gemini via `emergentintegrations`).              | Add balance via Profile → Manage plan → Universal Key.                                         |
| `EMERGENT_AUTH_SESSION_URL`            | **Managed by Emergent**. Google OAuth session endpoint.                                                               | Set by Emergent's Google Auth integration.                                                     |
| `INSTRUCTOR_EMAILS`                    | Comma-separated list. Currently `erinboroughs@gmail.com,luvtowork247@yahoo.com`.                                      | Adds these accounts to the instructor role on first-create.                                    |
| `STEP_SHEET_EDITOR_EMAILS`             | Comma-separated list of emails allowed to edit dance step sheets.                                                     | Extends `require_admin_or_editor` role.                                                        |
| `INSTRUCTOR_CODE`                      | Shared secret typed on the "I am an instructor" toggle. Currently `lineup4life`.                                      | Rotate freely; no user impact beyond needing to re-share with instructors.                     |
| `SMTP_HOST`                            | Your SMTP host (e.g. `smtp.gmail.com`, `smtp.postmarkapp.com`).                                                       | Used by password-reset email flow.                                                             |
| `SMTP_PORT`                            | Usually `587`.                                                                                                        |                                                                                                |
| `SMTP_USERNAME`                        | SMTP auth username.                                                                                                   |                                                                                                |
| `SMTP_PASSWORD`                        | SMTP app password.                                                                                                    | Prefer an app-specific / scoped password, not your personal mail login.                        |
| `SMTP_FROM`                            | "From" email address for password-reset mail.                                                                         |                                                                                                |
| `APP_PUBLIC_URL`                       | Public URL of the deployed app. Currently the preview host. Update on deploy.                                         | Used to build reset links inside emails.                                                       |
| `PRIVACY_POLICY_URL`                   | Defaults to `${APP_PUBLIC_URL}/api/legal/privacy` if unset.                                                            | Only override if you host the policy elsewhere.                                                |
| `SEED_PW_ERINBOROUGHS_GMAIL_COM`       | One-time seed password. Only applied on FIRST user creation (post-SEC-001 fix).                                       | After Erin logs in and rotates, this env var is ignored forever.                               |
| `SEED_PW_ADMIN_STOMPINGROUND_COM`      | Same — one-time seed for the generic admin account.                                                                   |                                                                                                |
| `APPLE_AUDIENCES`                      | `com.emergent.stompinyumaapp.uyr5zg,host.exp.Exponent`.                                                              | The bundle IDs Apple issues sign-in tokens for. Include Expo Go's `host.exp.Exponent` for QA. |
| `APPLE_TEAM_ID`                        | 10-char string from Apple Developer → Membership.                                                                     | Currently `5RVKA62THW`.                                                                        |
| `APPLE_KEY_ID`                         | 10-char string, matches `AuthKey_<KEY_ID>.p8` filename.                                                              | Currently `KGNZBJ85K4`.                                                                        |
| `APPLE_CLIENT_ID`                      | Bundle ID used for Sign in with Apple. Same as iOS bundle: `com.emergent.stompinyumaapp.uyr5zg`.                     |                                                                                                |
| `APPLE_PRIVATE_KEY_PATH`               | Absolute path to the `.p8` file. Currently `/app/backend/secrets/AuthKey_KGNZBJ85K4.p8`.                              | Prefer `APPLE_PRIVATE_KEY_PEM_B64` for prod (env-only, no file).                              |
| `COPPERKNOB_API_KEY`                   | Request from CopperKnob (https://api.copperknob.co.uk).                                                              | Optional — the app degrades gracefully without it, but external search stops working.          |
| `BOOTSTEPPER_API_KEY`                  | Request from BootStepper (https://api.bootstepper.com).                                                              | Optional — same graceful-degrade behaviour.                                                    |

## Frontend `/app/frontend/.env` — full contract

| Key                              | Origin                                                                    | Notes                                                                              |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `EXPO_PACKAGER_PROXY_URL`        | Managed by Emergent preview.                                              | **PROTECTED — do not edit.**                                                       |
| `EXPO_PACKAGER_HOSTNAME`         | Managed by Emergent preview.                                              | **PROTECTED — do not edit.**                                                       |
| `EXPO_TUNNEL_SUBDOMAIN`          | Managed by Emergent preview.                                              | **PROTECTED — do not edit.**                                                       |
| `EXPO_USE_FAST_RESOLVER`         | Metro perf flag. Keep as-is.                                              |                                                                                    |
| `METRO_CACHE_ROOT`               | `/app/frontend/.metro-cache` (must be quoted because it starts with `/`). |                                                                                    |
| `EXPO_PUBLIC_BACKEND_URL`        | Backend origin the app talks to (e.g. `https://www.stompingroundyuma.org` on production).                        | Anything prefixed `EXPO_PUBLIC_` gets bundled INTO the JS. Assume users can read it. |
| `EXPO_PUBLIC_GOOGLE_AUTH_URL`    | Emergent-managed Google sign-in entry URL.                                | Assume users can read it. Managed by Emergent.                                     |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Optional override.                                                        | Falls back to `${BACKEND_URL}/api/legal/privacy`.                                  |

**Rule of thumb**: `EXPO_PUBLIC_*` is baked into the mobile bundle. Never put secrets there.
Any secret the app needs at runtime must be reached via a backend API call.

---

## Third-party integrations (grouped)

### Auth

- **Emergent-managed Google Auth**
  - Runtime: `EMERGENT_AUTH_SESSION_URL` (backend) + `EXPO_PUBLIC_GOOGLE_AUTH_URL` (frontend).
  - Ownership: Emergent. Nothing to back up on your side. If you migrate off Emergent,
    swap to a self-managed OAuth (e.g. NextAuth, Firebase Auth) and update the backend
    session-exchange helper (`services/emergent_auth.py` if present).

- **Sign in with Apple**
  - Runtime: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_AUDIENCES`,
    `APPLE_PRIVATE_KEY_PATH` (or `APPLE_PRIVATE_KEY_PEM_B64`).
  - Ownership: **You**, via Apple Developer Portal.
  - Where to back up:
    - `.p8` file: `/app/backend/secrets/AuthKey_KGNZBJ85K4.p8` — download it, store in
      1Password / Bitwarden. Also re-downloadable from Apple Developer Portal → Keys
      → your key (but ONLY at initial creation; if you missed the download, you must
      revoke and generate a new one, which requires an app rebuild).
    - Team ID / Key ID / Client ID: back up in a note; also discoverable in Apple Dev Portal.
  - Rotation: Apple keys don't expire. Revoke via Developer Portal → Keys if leaked.

- **Email/password (JWT)**
  - Runtime: `JWT_SECRET`.
  - Ownership: You. Generate randomly, back up in password manager.

### Push notifications

- **Emergent-managed push (Firebase Cloud Messaging under the hood)**
  - Runtime: `EMERGENT_PUSH_KEY` (backend, injected on Publish).
  - Frontend: `frontend/google-services.json` (Firebase Android config — currently committed).
  - Ownership: You own the Firebase project, Emergent owns the push proxy service.
  - What's still missing for iOS push:
    - `frontend/GoogleService-Info.plist` — download from Firebase Console after
      adding an iOS app to the project.
    - APNs Auth Key (`.p8`) — NEW key (separate from Sign-in-with-Apple), created
      in Apple Dev Portal → Keys with "Apple Push Notifications service" checked.
    - APNs Key ID (10-char) — shown once at creation.
    - Team ID — `5RVKA62THW` (same as Sign-in-with-Apple).
    - Upload the .p8 + Key ID + Team ID to Firebase Console → Project Settings →
      Cloud Messaging → Apple app configuration.
  - After that, remove the `Platform.OS === "ios"` early-return in
    `frontend/src/lib/push.ts` and add `expo.ios.googleServicesFile` to
    `app.config.js`.

### LLM / AI

- **Emergent universal LLM key** (`EMERGENT_LLM_KEY`)
  - Runtime: Backend only. Never reaches frontend.
  - Works for: Claude sonnet/haiku/opus text, Gemini text + Nano Banana images,
    OpenAI text + `gpt-image-1` + Whisper, Sora 2 video, OpenAI TTS.
  - Not applicable: Stripe, fal.ai, audio models outside the list above.
  - Ownership: Emergent. Balance managed via Profile → Manage plan → Universal Key.
  - **Backup action**: None — nothing to back up. If you migrate, swap in direct
    OpenAI/Anthropic keys and change the emergentintegrations calls.

### Dance directory APIs

- **CopperKnob** (`COPPERKNOB_API_KEY`)
  - Runtime: Backend only.
  - Ownership: CopperKnob (https://copperknob.co.uk). Request via their API contact.
  - Backup: The key itself lives in `.env`; save it in your password manager.
  - Rate limits + attribution: honoured by `services/copperknob.py` + retry-with-backoff.

- **BootStepper** (`BOOTSTEPPER_API_KEY`)
  - Runtime: Backend only.
  - Ownership: BootStepper. Request via `AT7G23KS2GJHR8CRR43JJ9N` provisioning contact.
  - Same shape as CopperKnob.

### Music preview

- **iTunes Search API** — public, no key required. Proxied through backend
  `/api/song-preview` to avoid CORS/firewall issues. Nothing to back up.

### Geocoding

- **OpenStreetMap Nominatim** — public, no key required. Contact email in
  `services/geocoding.py` for User-Agent compliance. Backup: whatever email
  you set; can be changed freely.

### Email (password reset)

- **Any SMTP provider** (Gmail app-password, Postmark, SendGrid, Resend, AWS SES).
  Runtime: `SMTP_*` env vars. Backup: password-manager entry for the SMTP account.

### iOS-specific

- **App Store Connect API key** — used by EAS to auto-submit to App Store Connect
  (if you set it up). Managed inside Emergent's EAS integration; see
  `04-domain-eas-build.md` for the exact ask.

- **iOS Distribution Certificate (`.p12`)** — managed inside EAS build. See
  `04-domain-eas-build.md`.

- **iOS Provisioning Profile** — auto-generated by EAS. See `04-domain-eas-build.md`.

### Android-specific

- **Android Upload Keystore (`.jks`)** — managed inside EAS build. See
  `04-domain-eas-build.md`.

- **Firebase Android** — `frontend/google-services.json` (currently in repo).

---

## Password / secret storage recommendations

1. **1Password / Bitwarden / iCloud Keychain** (with 2FA on the vault) for:
   - `JWT_SECRET`
   - All `SMTP_*` values
   - `INSTRUCTOR_CODE`
   - `SEED_PW_*` (only historical — no longer applied on boot)
   - `COPPERKNOB_API_KEY`, `BOOTSTEPPER_API_KEY`
   - Apple `.p8` file (as an attachment)
   - Firebase project owner credentials
   - App Store Connect team credentials

2. **Emergent dashboard env-var viewer** as the primary runtime source of truth
   for `EMERGENT_*` and `EXPO_PACKAGER_*` values. These are re-injected on every
   deploy — you don't need to back them up locally as long as you retain access
   to the Emergent project.

3. **GitHub Actions Secrets** (if you set up CI later) for anything the pipeline
   needs at build time. Store the same values as in 1Password, keep both in sync.

**Never** commit `.env` files, `.p8` / `.p12` / `.jks` / `.pem` files, or any
password/API-key to the git repo. The `.gitignore` block in `01-source-code.md`
enforces this.
