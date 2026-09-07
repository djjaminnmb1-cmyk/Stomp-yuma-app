# 05 · Cold-Start Restore Playbook

Follow top to bottom to rebuild the app on new infrastructure from your
GitHub repo + this backup folder.

## Prerequisites on the new machine

- Python **3.11+**
- Node **20 LTS** (or 22)
- Yarn **1.22.x** (matches the `packageManager` pin in `frontend/package.json`)
- MongoDB **6.0+** (Community Edition is fine)
- `mongorestore` (from `mongodb-database-tools`)
- macOS or Linux (Windows works but paths differ)

## Step 1 — Clone the repo

```bash
git clone git@github.com:<you>/<repo>.git stompin-ground-yuma
cd stompin-ground-yuma
```

## Step 2 — Restore secrets

Retrieve from your password manager and copy into place. **Never** paste any of
these into a chat window or a public gist.

```bash
# 2a. Backend .env
cp BACKUP/backend.env.example backend/.env
$EDITOR backend/.env
# Fill placeholders: MONGO_URL, DB_NAME, JWT_SECRET, INSTRUCTOR_CODE,
# INSTRUCTOR_EMAILS, STEP_SHEET_EDITOR_EMAILS, SMTP_*, APP_PUBLIC_URL,
# APPLE_TEAM_ID / KEY_ID / CLIENT_ID / AUDIENCES / PRIVATE_KEY_PATH,
# COPPERKNOB_API_KEY, BOOTSTEPPER_API_KEY, EMERGENT_LLM_KEY (if you have one).

# 2b. Frontend .env
cp BACKUP/frontend.env.example frontend/.env
$EDITOR frontend/.env
# EXPO_PUBLIC_BACKEND_URL is the important one. On a fresh dev machine,
# set to http://localhost:8001 (or whatever port your backend listens on).

# 2c. Apple .p8 (Sign in with Apple)
mkdir -p backend/secrets
cp /path/to/your/1Password-backup/AuthKey_KGNZBJ85K4.p8 backend/secrets/
chmod 600 backend/secrets/AuthKey_KGNZBJ85K4.p8

# 2d. Firebase Android config (if using push)
# Already in the repo at frontend/google-services.json.
# Optional: replace with a fresh copy from Firebase Console if the project moves.
```

## Step 3 — Install dependencies

```bash
# Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Frontend (from repo root)
cd ../frontend
yarn install    # applies patches/expo-updates+29.0.20.patch via postinstall
```

## Step 4 — Restore MongoDB

```bash
# Start MongoDB if it isn't running (Linux example):
sudo systemctl start mongod

# Restore the snapshot from BACKUP/mongo-dump/
mongorestore --uri "mongodb://localhost:27017" \
             --db "$(grep ^DB_NAME backend/.env | cut -d= -f2)" \
             BACKUP/mongo-dump/test_database/

# Sanity check
mongosh --eval "use $(grep ^DB_NAME backend/.env | cut -d= -f2); db.getCollectionNames().length"
# Expected: 38
```

If you want to drop the `dances_backup_YYYYMMDD_HHMMSS` clones after restore
(they were safety snapshots from the Sep 3 sync — safe to remove):

```bash
mongosh --eval "
  db = db.getSiblingDB('$(grep ^DB_NAME backend/.env | cut -d= -f2)');
  db.getCollectionNames()
    .filter(n => n.startsWith('dances_backup_'))
    .forEach(n => db[n].drop());
"
```

## Step 5 — Run backend + frontend

```bash
# Terminal 1 — backend
cd backend
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — frontend
cd frontend
yarn expo start --port 3000
```

Open `http://localhost:3000` (or scan the QR with Expo Go on your phone).

## Step 6 — Verify

Log in with one of the seeded admin accounts (see the `memory/test_credentials.md`
you kept **outside** the repo, or your rotated production admin credentials).

Manual smoke test:

- Login screen renders (8 languages picker appears if `age_gate_ack_at` is unset).
- `GET /api/legal/privacy` returns HTML.
- `GET /api/dances` returns 1,000+ dance records.
- Admin badge appears in Profile.
- Practice Mode metronome + BPM slider work.
- One dance detail page loads with metadata + YouTube link.

## Step 7 — Publish / build

If you're staying on Emergent:
- Push code changes to GitHub, use Emergent's **Publish** button to redeploy.
- Emergent handles EAS builds when you request them from the dashboard.

If you're moving off Emergent:
- Create your own Expo account: https://expo.dev
- `eas login` and `eas init` — this generates a real `extra.eas.projectId` in
  `app.config.js`.
- Configure EAS build profiles (`eas.json`) with your Apple + Google credentials
  (imported from what you requested in `04-domain-eas-build.md`).
- `eas build --platform ios` and `eas build --platform android`.
- Submit to stores with `eas submit`.

## Troubleshooting

- **`patch-package` fails on install**: The Kotlin patch targets exactly
  `expo-updates@29.0.20`. If the version bumped, regenerate the patch:
  ```bash
  cd frontend
  vim node_modules/expo-updates/expo-updates-plugin/build.gradle.kts   # change 2.0.21 → 2.1.20
  yarn patch-package expo-updates
  ```
- **iOS build fails at Apple Sign-In verification**: Check that
  `APPLE_AUDIENCES` includes `host.exp.Exponent` if you're testing in Expo Go.
- **CJK glyphs not rendering on Android emulator**: The emulator ships with
  Roboto only; on real devices Noto Sans CJK is bundled. This affects the
  emulator only — the store-installed app renders correctly.
- **Metro can't find `/app/frontend`**: You cloned to a different path. Adjust
  `METRO_CACHE_ROOT` in `frontend/.env` to your actual absolute path (must be quoted).
