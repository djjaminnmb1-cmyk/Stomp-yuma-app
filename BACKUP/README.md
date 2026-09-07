# Stompin' Ground Yuma — Full Backup Package

Generated: **June 2026** (Emergent preview container snapshot)

This folder contains everything you need to (a) get the code into your
private GitHub repository, (b) restore the database on a new server,
and (c) hand the mobile-app build over to a fresh Expo / EAS account.

Nothing in this folder modifies your running preview app. All contents
are **read-only artifacts** produced from the current container state.

---

## What's in this folder

| Path                                       | What                                            | Contains secrets? |
| ------------------------------------------ | ----------------------------------------------- | ----------------- |
| `README.md`                                | This top-level guide                            | No                |
| `01-source-code.md`                        | Source code inventory + GitHub push steps       | No                |
| `02-database.md`                           | Live vs. preview data explanation + restore     | No                |
| `03-integrations-and-secrets.md`           | Every 3rd-party service + credential contract   | No                |
| `04-domain-eas-build.md`                   | Bundle IDs, Apple, Firebase, EAS project config | No                |
| `05-restore-instructions.md`               | Cold-start-from-GitHub playbook                 | No                |
| `06-checklist.md`                          | ✅ / ❌ table of what's captured vs. still owed  | No                |
| `backend.env.example`                      | Placeholder-only env template for the backend   | No (placeholders) |
| `frontend.env.example`                     | Placeholder-only env template for the frontend  | No (placeholders) |
| `mongo-dump/test_database/`                | Native BSON `mongodump` (recommended restore)   | Contains USER DATA (see 02) |
| `mongo-json/`                              | JSON export of every collection (portable)      | Contains USER DATA (see 02) |
| `mongo-json/_manifest.json`                | Per-collection document counts                  | No                |
| `inventory/`                               | Machine-generated code-tree + package lists     | No                |

**⚠️ The `mongo-*` folders contain real user records (emails, hashed passwords, dance history).**
Treat them as personal data. **Do NOT push them to GitHub.** The `.gitignore` this backup
suggests already excludes them.

---

## The 4 things I could NOT do from this container

Read `03-integrations-and-secrets.md` and `06-checklist.md` for the full detail. Short version:

1. **Real API-key values** (JWT_SECRET, SMTP_PASSWORD, INSTRUCTOR_CODE, CopperKnob / BootStepper keys,
   Emergent LLM & Push keys). These live in `/app/backend/.env` on the running server. You must
   copy them out yourself using the platform's env-var viewer (Emergent dashboard) — I've deliberately
   NOT dumped their values here. `03-integrations-and-secrets.md` tells you exactly which keys and
   where to look.

2. **Apple `.p8` private key** (`AuthKey_KGNZBJ85K4.p8`). Present at
   `/app/backend/secrets/AuthKey_KGNZBJ85K4.p8` (257 bytes). This is your Apple Sign-In signing
   material. Download it via the Emergent files browser or SFTP and store it in a password
   manager or `.p8` vault. **Never commit it.**

3. **iOS build signing** (`.p12` distribution certificate, provisioning profiles, App Store Connect
   API key). These are managed inside your Emergent → EAS build pipeline, not stored as loose files
   in the container. See `04-domain-eas-build.md` for what to request from Emergent Support.

4. **DNS / domain-registrar records** for `stompingroundyuma.org`. Whichever provider hosts your
   DNS (Cloudflare, Namecheap, Google Domains, etc.) is the source of truth for A / AAAA / CNAME /
   MX / TXT records. See `04-domain-eas-build.md` for what to snapshot.

---

## Suggested restore order

1. **Push code to GitHub** first (see `01-source-code.md`). This gets a versioned baseline.
2. **Copy secret env values** from the Emergent dashboard into your password manager
   using `backend.env.example` and `frontend.env.example` as the shape.
3. **Download** `mongo-dump/` and `backend/secrets/AuthKey_KGNZBJ85K4.p8` locally,
   store in secure storage (1Password / Bitwarden / iCloud Drive with 2FA — NOT public cloud).
4. **When ready to restore**, follow `05-restore-instructions.md`.

Good luck!
