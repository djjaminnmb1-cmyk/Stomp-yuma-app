# 02 · Database Inventory + Restore

## What's in the container right now

- **MongoDB name**: `test_database` (yes, literally — this is a preview environment).
- **Host**: `mongodb://localhost:27017` (in-container MongoDB, no auth).
- **Size**: 8.24 MB data / 5.36 MB storage.
- **Collections**: 38.
- **Total documents**: 13,057.

**⚠️ This is PREVIEW / TEST data**, not production. See the "Preview vs. production"
section below. It is safe to restore this snapshot to a fresh dev environment. If
this data is what your Yuma community has been using in preview, then yes it also
represents real user records — treat it as such.

## Where the snapshot lives in this backup

Two formats (pick one, or keep both):

| Format         | Path                                | Restore command                                                                         | When to use                                                     |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Native BSON    | `BACKUP/mongo-dump/test_database/`  | `mongorestore --db <target> BACKUP/mongo-dump/test_database/`                          | Recommended. Preserves types (ObjectId, dates, Binary) exactly. |
| JSON export    | `BACKUP/mongo-json/*.json`          | `mongoimport --db <target> --collection <name> --file <name>.json --type json --jsonArray` (see caveat) | Human-readable. Portable to non-MongoDB tools.                  |

**JSON caveat**: `mongo-json/*.json` uses BSON extended JSON (via `bson.json_util`).
`mongoimport` can consume it, but if you're migrating to a non-Mongo store you may
need to post-process `{"$oid": "..."}`, `{"$date": "..."}` sentinels.

## Preview vs. production — how to tell

Question: "Is this a live production DB with real end users, or a dev snapshot?"

**Signals in this snapshot:**

- `DB_NAME` is literally `test_database` — Emergent's preview default. Production
  environments usually override to a stable name like `stompinyuma`.
- **78 users** total. If your real Yuma community has hundreds, this is preview.
- Admin credentials in `memory/test_credentials.md` are the preview seed
  (`admin@stompinground.com` / rotated 24-char random). Production would have
  reset that.
- 5 duplicate `dances_backup_YYYYMMDD_HHMMSS` collections from the Sep 3 2026
  library sync. These are safety snapshots, not user data — drop after restore.

**How to check for a separate production DB:**

If you deployed via **Publish** in the Emergent dashboard, Emergent provisions
a separate managed MongoDB for production. That DB is **NOT reachable from
this preview container** — its connection string is stored in the production
deploy's env vars. To back up production, either:

1. Ask Emergent Support to provide the production `MONGO_URL` (see
   `03-integrations-and-secrets.md` for the exact ask), OR
2. Use the Emergent production console to run `mongodump` there and download
   the output.

Do not restore this preview snapshot **over** a production DB — you'd overwrite
real user data.

## Per-collection breakdown (what each holds)

Counts are from this preview snapshot. Ordered by document count desc:

| Collection                          | Docs  | What it holds                                                                                       | Contains PII? |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------- | ------------- |
| `dance_sync_log`                    | 5,683 | Every write the monthly CopperKnob/BootStepper sync made (audit trail).                             | No            |
| `dances`                            | 1,165 | Line-dance library (name, choreographer, song, artist, BPM, difficulty, YouTube URL, refs).         | No            |
| `dances_backup_20260903_*` (×5)     | ~1165 each | Timestamped snapshots taken before the Sep 3 library sync. Safe to drop after restore.        | No            |
| `dance_drift_flags`                 | 104   | Admin queue: fields that differ from upstream but weren't auto-applied.                             | No            |
| `users`                             | 78    | Accounts (email, hashed password, name, apple_sub, preferred_language, is_admin, is_instructor).    | **Yes**       |
| `activity_events`                   | 38    | Social feed rows (dance completions, badges earned, streak milestones).                             | Some (names)  |
| `tracking`                          | 37    | Per-user dance status + rating + notes.                                                             | Some          |
| `user_badges`                       | 27    | Which badges each user earned + when.                                                               | Some          |
| `practice_daily` + `practice_sessions` | 44 | Practice-Mode analytics rollups + raw sessions.                                                     | Some          |
| `follows`                           | 14    | Follower/followee graph.                                                                            | Some          |
| `geocode_cache`                     | 9     | Cached Nominatim lookups for event addresses.                                                       | No            |
| `feed_reactions`                    | 7     | Emoji reactions on feed events.                                                                     | Some          |
| `feed_reports`                      | 6     | Users reporting other users' feed posts (moderation queue).                                         | **Yes**       |
| `feedback`                          | 6     | User bug reports / feedback (with diagnostics headers).                                             | **Yes**       |
| `suggestions`                       | 6     | "Suggest a dance" submissions from dancers to their picked instructor.                              | Some          |
| `classes`                           | 2     | Weekly class metadata + flyer image (base64 in doc).                                                | No            |
| `events`                            | 2     | Instructor-created workshops / socials.                                                             | Address       |
| `instructor_messages`               | 2     | Chat-lounge messages between instructors + admins.                                                  | Yes           |
| `leaderboard_prizes`                | 2     | Prize catalog for seasonal leaderboards.                                                            | No            |
| `dance_sync_status` / `drift_scan_status` | 1 each | Scheduler state (last run timestamp, current pass id).                                        | No            |
| 17 more collections at 0 docs each  | 0     | Empty preview-side (rsvps, chat_mentions, blocks, sessions, sent_reminders, etc.).                  | —             |

## Restoring on a fresh MongoDB

### From `mongo-dump/` (BSON — preferred)

```bash
# Assuming a target Mongo at mongodb://localhost:27017
mongorestore --uri "mongodb://localhost:27017" \
             --db stompinyuma \
             /path/to/BACKUP/mongo-dump/test_database/

# Verify:
mongosh "mongodb://localhost:27017/stompinyuma" --eval 'db.getCollectionNames().length'
# → 38
```

Rename `--db stompinyuma` to whatever you want the restored DB called. Match this
to your new `DB_NAME` env var.

### From `mongo-json/` (JSON — if BSON tools unavailable)

```bash
for f in /path/to/BACKUP/mongo-json/*.json; do
  coll=$(basename "$f" .json)
  [ "$coll" = "_manifest" ] && continue
  mongoimport --uri "mongodb://localhost:27017/stompinyuma" \
              --collection "$coll" \
              --file "$f" \
              --jsonArray
done
```

## What Emergent's managed MongoDB does automatically

- **Backups**: The preview container Mongo does **not** auto-snapshot to
  external storage. This backup you're reading is your only snapshot until
  you run `mongodump` again.
- **Production Mongo**: If you Published the app, the deploy pipeline may or
  may not have provisioned point-in-time backups. **Ask Emergent Support**
  what their backup cadence is for your production tier and whether you can
  request a recent snapshot.
