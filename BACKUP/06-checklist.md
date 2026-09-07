# 06 · Backup Checklist — What's Included, What's Missing

## ✅ Fully captured in this backup

| Item                                         | Where                                         | Notes                                                        |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Backend Python source (routes, services, models, core) | `/app/backend/`                       | Push to GitHub. `.env` excluded via `.gitignore`.            |
| Backend dependencies                         | `backend/requirements.txt` (130 pkgs)         | Reproducible via `pip install -r`.                           |
| Frontend Expo/RN source                      | `/app/frontend/app/`, `/app/frontend/src/`, `/app/frontend/assets/` | Push to GitHub. `.env` + `node_modules` excluded. |
| Frontend dependencies                        | `frontend/package.json` + `yarn.lock`         | Both committed. Reproducible via `yarn install`.             |
| Native patches                               | `frontend/patches/expo-updates+29.0.20.patch` | Applied automatically at install (`patch-package`).         |
| Expo config                                  | `frontend/app.config.js`                      | Bundle IDs, plugins, permissions all captured.               |
| Firebase Android config                      | `frontend/google-services.json`               | Currently in the repo; safe by Firebase design.              |
| Product Requirements + session log           | `memory/PRD.md`                               | Full history of every phase (v1 → v3.3).                     |
| Testing history                              | `test_result.md`                              | 685 lines of main↔testing_agent state.                      |
| MongoDB snapshot (native BSON)               | `BACKUP/mongo-dump/test_database/`            | 8.5 MB, 38 collections, restore via `mongorestore`.         |
| MongoDB snapshot (portable JSON)             | `BACKUP/mongo-json/`                          | 11 MB, one `.json` per collection, `mongoimport`-friendly.  |
| Env-var contract (placeholders only)         | `BACKUP/backend.env.example` + `BACKUP/frontend.env.example` | No real values.                              |
| Integration inventory                        | `BACKUP/03-integrations-and-secrets.md`       | Every third-party service + how to back up its credential.  |
| Domain/Expo/EAS config snapshot              | `BACKUP/04-domain-eas-build.md`               | Bundle IDs, permissions, iOS/Android build settings.        |
| Restore playbook                             | `BACKUP/05-restore-instructions.md`           | Cold-start-from-GitHub instructions.                        |

## ⚠️ Excluded from this backup on purpose (do NOT commit)

| Item                                         | Where it lives                             | How to back up                                              |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `backend/.env` real values                   | Running container                          | Copy from Emergent dashboard → env vars → paste into 1Password using `backend.env.example` as the shape. |
| `frontend/.env` real values                  | Running container                          | Same — paste into 1Password using `frontend.env.example` as the shape. |
| `backend/secrets/AuthKey_KGNZBJ85K4.p8`      | Container (`/app/backend/secrets/`)        | Download via Emergent files browser, store in 1Password as attachment. Also re-downloadable from Apple Developer Portal only at initial key creation — if it was lost, revoke + regenerate (requires app rebuild). |
| `memory/test_credentials.md` (preview passwords) | `/app/memory/`                         | Rotate any of these credentials on production, then keep the rotated values in 1Password. |

## ❌ Not accessible from this container — must be requested / snapshotted separately

| Item                                         | Source                                     | What to do                                                  |
| -------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| **Production MongoDB backup**                | Emergent-managed production DB (if you've Published) | Ask Emergent Support: "Please provide a recent `mongodump` of the production MongoDB for project `stompin-ground-yuma`, or connection details so I can pull one myself." |
| **iOS Distribution Certificate (.p12) + private key** | EAS credentials store              | Ask Emergent Support: "Please export the iOS Distribution Certificate + private key for slug `stompin-ground-yuma`." |
| **iOS Provisioning Profile**                 | EAS credentials store                      | Same request, add "and the corresponding provisioning profile". |
| **Android Upload Keystore (.jks)**           | EAS credentials store                      | Ask Emergent Support: "Please export the Android upload keystore, its password, and the key alias for package `com.stompinyuma.app`." |
| **APNs Auth Key (.p8) for push**             | Uploaded to Firebase Console               | Log in to Firebase → Project Settings → Cloud Messaging. If missing, generate a new one at Apple Developer Portal → Keys with "Apple Push Notifications service" checked. |
| **APNs Key ID (10-char)**                    | Firebase Cloud Messaging tab OR Apple Dev Portal → Keys → your key | Copy the string.                          |
| **App Store Connect API Key (.p8)** (only if using auto-submit) | Emergent EAS store               | Ask Emergent Support: "Please export the App Store Connect API key we're using for automated submissions." |
| **Google Play Service Account JSON** (only if using auto-submit) | Emergent EAS store             | Ask Emergent Support: "Please export the Google Play service-account JSON we're using for automated submissions." |
| **`GoogleService-Info.plist` (Firebase iOS)** | Not present in repo yet                   | Add iOS app to your Firebase project → download plist → place at `frontend/GoogleService-Info.plist`. |
| **DNS zone snapshot for `stompingroundyuma.org`** | Whichever registrar hosts your DNS    | Log in to that registrar's panel, export the zone file OR screenshot every record. |
| **`EMERGENT_PUSH_KEY`, `EMERGENT_LLM_KEY`, `EMERGENT_AUTH_SESSION_URL` real values** | Emergent env-var injection | These are re-injected on every Publish. If you leave Emergent, replace with direct FCM API key / OpenAI / Anthropic keys and update the code that reads these variables. |
| **`stompin-app.zip` (191 MB, Aug 15 2026)**  | `/app/stompin-app.zip`                     | An older snapshot from before the June 2026 work. Safe to ignore or download-and-archive as a historical artifact. |

## 📌 Explicit template — what to say to Emergent Support

Copy-paste this and adapt the bracketed bits:

> Hi Emergent Support,
>
> I'm preparing a full backup of my project **stompin-ground-yuma** (slug in
> `app.config.js`) for my private GitHub. Could you please:
>
> 1. Export or provide read access to the **production MongoDB** for this project,
>    or a recent `mongodump` snapshot of it. (I already have the preview-side
>    DB.)
>
> 2. Export the **EAS-managed credentials** for this project:
>    - iOS Distribution Certificate `.p12` + private key
>    - iOS Provisioning Profile for bundle ID `com.emergent.stompinyumaapp.uyr5zg`
>    - APNs Auth Key `.p8` + Key ID
>    - Android Upload Keystore `.jks` + password + key alias for package
>      `com.stompinyuma.app`
>    - App Store Connect API key (if used for automated submissions)
>    - Google Play service-account JSON (if used for automated submissions)
>
> 3. Confirm the current status of **managed EAS Update / OTA** for this project.
>    `updates.enabled` is currently `false` in `app.config.js` — is managed OTA
>    now available, and if so what `updates.url` and `extra.eas.projectId`
>    values should I use?
>
> 4. Share the current values of the **auto-injected env vars** for the
>    production environment: `EMERGENT_PUSH_KEY`, `EMERGENT_LLM_KEY`,
>    `EMERGENT_AUTH_SESSION_URL`. (I want a copy in my password manager so I
>    can recreate the environment if I ever migrate off Emergent.)
>
> Thanks — happy to answer any authentication or ownership questions on this
> project.

## 🎯 What to do NEXT (recommended order)

1. **Right now, in the container**: `cd /app && du -sh BACKUP/` and confirm the folder is ~20 MB. Zip it up:
   ```bash
   cd /app
   zip -r stompin-backup-june-2026.zip BACKUP/
   ```
   Then download via Emergent's file browser.

2. **Extend `/app/.gitignore`** with the block from `01-source-code.md`, then push the code to GitHub (follow that same doc's step-by-step).

3. **Copy real secret values** from Emergent dashboard env-vars into your password manager, using `backend.env.example` and `frontend.env.example` as the field list.

4. **Download `AuthKey_KGNZBJ85K4.p8`** and store it as a 1Password attachment.

5. **Contact Emergent Support** using the template above.

6. **Snapshot your DNS** at your registrar.

7. **Rotate `INSTRUCTOR_CODE`** if you're worried the preview value leaked to anyone in this transition.

8. When you're ready, follow `05-restore-instructions.md` to bring the app up on your new infrastructure.

## Paused work (unrelated but worth noting)

The previous conversation turn was mid-way through configuring SEO / canonical /
sitemap infrastructure for `www.stompingroundyuma.org`. I paused per your
instruction and pivoted to this backup task. When you're ready to resume that
work, the plan is still valid and no partial code changes were merged. Reference:
the `ask_human_response` messages in the conversation transcript.
