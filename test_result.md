#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Stompin' Ground Yuma — extend the existing EN/ES/FR localization system with
  German, Dutch, Korean, Simplified Chinese and Traditional Chinese. Preserve
  existing translations, honour CJK fonts, do not translate user-generated
  content or external dance sheets, and do not change push credentials or
  submit store releases. Then run a security audit (originally requested
  before the localization task).

frontend:
  - task: "Practice Mode: wood-block metronome with countdown + BPM slider"
    implemented: true
    working: true
    file: "frontend/src/components/PracticeModePanel.tsx, frontend/src/hooks/useMetronome.ts, frontend/src/lib/song-preview.ts, frontend/app/dance/[id].tsx, frontend/assets/sounds/wood-block.wav"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Built a drift-corrected metronome (Date.now()-anchored setTimeout chain) with these
          verified behaviours on web via screenshot test:
            • Practice Mode button opens a full-screen modal from the dance detail.
            • Countdown-in ticks 3 → 2 → 1 → GO! at the selected BPM before regular play.
            • Phrase indicator (8 pips) highlights the current beat in the 8-count phrase.
            • Pulse-ring reanimated animation flashes on every tick, bigger on beat 1.
            • BPM slider 60-200 with nudge buttons (±1 / ±5) and "Use dance BPM" reset chip.
            • Wood-block WAV (bundled at assets/sounds/wood-block.wav, ~10KB) served by Metro
              (verified HTTP 200 on web). expo-audio configured with playsInSilentMode:true.
            • Silent-mode toggle (visual-only) for public settings.
            • Sticky Start/Stop button; timer counts elapsed seconds.
            • Haptic feedback fires on the downbeat on iOS/Android (no-op on web).
          Full flow tested with screenshots showing countdown "2", "3", running "BEAT 3 · 00:03".
      - working: true
        agent: "main"
        comment: |
          UPGRADE — actual song now plays at the shown BPM.
            • New helper `src/lib/song-preview.ts` hits iTunes Search API (free, no auth) for a
              30-second m4a preview of `song + artist`, falls back to song-only if needed,
              caches per-runtime.
            • Second `useAudioPlayer` for the song, `looping = true`, `shouldCorrectPitch = true`
              so slow/fast BPM don't chipmunk the vocals; uses `setPlaybackRate(rate, "high")`
              when available.
            • Playback rate = `bpm / danceBpm`, clamped 0.5-2.0×. Song card shows live
              "X% SPEED" that matches the BPM slider (e.g. 67 BPM on an 82 BPM song = 82% speed).
            • Song starts on the "GO!" downbeat after the wood-block countdown so timing
              stays aligned to the metronome click.
            • Song info card: album art, track name, artist, "iTunes preview" attribution,
              tap to toggle on/off.
            • Independent metronome mute toggle — either can be muted without affecting the
              other. Graceful fallback UI when a preview isn't found or the dance has no song.
          Verified end-to-end via screenshots on "A Bar Song (Tipsy)" (82 BPM, Shaboozey — remix
          matched by iTunes) and "Chattahoochee" (140 BPM, Alan Jackson). BPM changed to 67
          showed "82% SPEED" and the "Use dance BPM (82)" reset chip; toggling song off shows
          "Tap to play the song at this BPM"; toggling metronome off shows "Metronome muted".
      - working: true
        agent: "main"
        comment: |
          FIX — "iTunes can't find these tracks" on deployed environments.
          Root cause: some deployed / restricted browser networks blocked the direct
          `fetch('https://itunes.apple.com/search?...')` call from client-side JS. Now the
          lookup is proxied through our own backend:
            • Backend: added `GET /api/song-preview?song=…&artist=…` (server.py) that hits
              iTunes on behalf of the client, caches results in-process, falls back to a
              song-only query if `song + artist` misses, and returns 404 on true misses.
            • Frontend: `fetchSongPreview` now calls `${API_BASE}/song-preview` — same-origin
              from the browser's POV, so no more CORS/DNS/firewall issues.
            • Verified via network trace: browser now hits
              `https://…/api/song-preview?song=...&artist=...` → 200 with the preview JSON,
              then streams the audio directly from Apple's CDN as before.

  - task: "Enhanced library search & filter (BPM band, choreographer, sort)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/library.tsx, frontend/src/components/DanceFilterModal.tsx, frontend/src/lib/dance-filter.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Rebuilt the library screen with client-side filtering (fast even at 211+ dances) and a
          bottom-sheet filter modal. Verified end-to-end via screenshots:
            • Search bar now matches across name / song / artist / choreographer (verified "song"
              query returns 3 dances). Clear-X clears the query.
            • Difficulty chips stay inline for the primary filter (unchanged UX).
            • New Filter button (right of search) opens a bottom-sheet modal with:
              - Sort (Name A→Z / Z→A, Easiest first, BPM Slow→Fast, BPM Fast→Slow, Newest first)
              - Tempo (BPM) presets: Any / Slow <90 / Medium 90-120 / Fast 120-140 / Very Fast 140+
              - Choreographer chip flow with per-chor count badges (21 unique choreographers).
            • Badge on filter button shows # of secondary filters active.
            • Active-filter chip row below the search shows each active filter with an X to
              remove it individually.
            • Reset button clears secondary filters; empty state has its own "Reset filters" CTA.
            • Sticky "Show N dances" button in the modal previews the result count in real time.
          Verified with a screenshot combo of Fast BPM + Rob Fowler + BPM Fast→Slow sort
          (11 results, all Rob Fowler dances at 138/132/132/130 BPM in descending order).

  - task: "Boot Scoot Board leaderboard (opt-in) with home preview"
    implemented: true
    working: true
    file: "frontend/app/leaderboard.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/profile.tsx, frontend/src/api/client.ts, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Full opt-in leaderboard flow shipped end-to-end.

          Backend (server.py):
            • Added `PATCH /api/users/me/leaderboard` toggle (LeaderboardOptInBody).
            • Added `GET /api/leaderboard?range=all|week|month&limit=N` — aggregates
              tracking (`status="completed"`) grouped by user_id, joins `users`, and returns:
                - `entries`: top-N ranked visible users (opted-in only) with rank/name/pic/count.
                - `me`: caller's absolute rank + count (private) even if opted out.
                - `total_visible` / `total_dancers`.
            • `user_to_out` now returns `show_on_leaderboard` so the client can gate UI.
          Verified by seeding 5 admin + 3 Erin completions, opting both in, and hitting
          the endpoint: entries returned in correct order.

          Frontend:
            • New /leaderboard route with gradient trophy header, range picker
              (Week / Month / All Time), top-3 podium (medals gold/silver/bronze), rank rows
              for #4+, "You" badge highlighting, Instructor mini-badge, private "Your rank"
              card if user is out of top-N or opted-out, "N others chose to stay private"
              footer.
            • Home tab preview card ("Boot Scoot Board") shows top-3 as
              "1. First (count) · 2. First (count) · 3. First (count)" and links into the
              full board.
            • Profile screen adds a row showing current visibility state and deep-links
              into /leaderboard.
            • Opt-in / Opt-out is a single-tap "Join" / "tap to hide" control on the board.
            • Full end-to-end tested on web: podium renders, opt-out hides admin (Erin still
              visible), private "Your rank" block shows for opted-out caller, range picker
              switches without re-fetching.

  - task: "Celebration screen on dance completion (fireworks)"
    implemented: true
    working: true
    file: "frontend/app/celebrate.tsx, frontend/app/dance/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New /celebrate route mirrors the /welcome fireworks experience for a first-time
          completion of any dance.
            • Triggered from `setStatus("completed")` on the dance-detail sticky button —
              only when transitioning from a non-completed status (re-toggling doesn't
              re-fire the celebration).
            • Passes `danceName` and `count` params so the page can show:
                – "You danced <name>"
                – "Your first completed dance 🎉" / "N dances completed"
                – Milestone shoutouts at 1 / 5 / 10 / 25 / 50 / 100 / every 25 after 50.
            • Same visual palette as /welcome — cowboy-boot background image, orbiting SGY
              logo (2.5s pass), colourful FireworksOverlay bursting from the top 2/3, and
              the same font/text-shadow treatment on the headline.
            • Auto-dismisses back to the dance detail after 3.6s or on tap anywhere on the
              screen or the round ✓ button (bottom-right).
            • Count is computed by re-fetching `myTracking` after the save so the milestone
              message is accurate.
          Verified with fresh registration → mark completed → screenshot showing
          "NICE WORK! / You danced 5-1-5-0 / Your first completed dance 🎉 / First one down!"
          then auto-return to dance detail (which now shows "Completed" green pill).

  - task: "Instructor Dashboard"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/instructor-dashboard.tsx, frontend/app/(tabs)/instructor.tsx, frontend/src/api/client.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Backend
            • GET /api/instructor/dashboard — instructors + admins only. Aggregates:
                – overview (total students, active in last 7 days, completions all-time /
                  weekly, classes in last 30 days, total attendance records)
                – top 10 completed dances (with choreographer, difficulty, BPM)
                – full student roster (name, picture, is_instructor, completed / wishlist /
                  attendance counts, last completion, last class, last active, joined date)
                – recent classes (last 20, with attendee count)
            • Email is admin-only; regular instructors see everything else but no PII.

          Frontend
            • New /instructor-dashboard route with:
                – Gradient stats-chart header
                – 6 stat tiles (Students / Active 7d / Completions / This Week /
                  Classes 30d / Attendance)
                – Top completed dances section — 10 ranked rows with difficulty pill + BPM
                – Roster section with search (name / email), 4 sort chips (Most completed,
                  Most attendance, Recently active, Name A→Z), CSV export button
                  (browser Blob download on web, native Share sheet on iOS/Android)
                – Recent classes section (date, label, dance & attendee counts)
            • Wired an "Insights" icon button into the Instructor tab header so instructors
              can jump straight in from any sub-tab.
          Verified end-to-end via screenshots: 43 students, 7 active (7d), 15 completions,
          top-7 dances rendered in descending order (5-1-5-0 leading at 7 completions),
          roster search "erin" filtered from 7 → 1, and header layout no longer wraps.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 16
  run_ui: false

backend_new:
  - task: "Phase 1 Gamification: Badges + Streaks endpoints and auto-award hooks"
    implemented: true
    working: "NA"
    file: "backend/services/badges.py, backend/routes/badges.py, backend/routes/tracking.py, backend/routes/activity.py, backend/routes/classes.py, backend/routes/__init__.py, backend/services/startup.py, backend/core/serialize.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          NEW Phase 1 Gamification backend:
            • services/badges.py — static badge catalog (12 badges across 5 categories:
              milestone/streak/class/practice/variety), evaluate_badges() upserts newly
              earned rows into db.user_badges (unique index on user_id+badge_id, safe
              vs races), list_badges_for() returns full catalog with per-user progress,
              bump_streak() maintains current/longest with UTC day boundary logic
              (idempotent per-day), get_streak() auto-expires stale streaks on read.
            • routes/badges.py — GET /api/badges (full catalog + progress + streak +
              unseen count), POST /api/badges/mark-seen (optional ids list),
              GET /api/streak (lightweight).
            • Hooked award_and_streak() inline into:
              - POST /api/tracking/{id}  (completion → streak + badges)
              - POST /api/practice-log/{id}  (streak + badges)
              - POST /api/classes/{id}/attend  (badges only, no streak bump)
              → Response payload now includes newly_earned_badges + streak so the
                client can render the celebration overlay without a second round-trip.
            • core/serialize.user_to_out now returns current_streak / longest_streak /
              last_streak_date fields.
            • services/startup adds unique index on db.user_badges (user_id, badge_id)
              + plain index on user_id.
            • routes/auth delete_my_account now also purges user_badges rows.
          Manually smoke-tested via curl:
            • login → GET /badges returns 12 badges, progress derived from existing
              tracking (Erin has 3 completed → progress:3 on milestone badges).
            • POST /tracking/{id} (complete) → response includes
              newly_earned_badges:[first_steps] and streak:{current:1, longest:1}.
            • Bug found + fixed: bump_streak treated an empty projection dict as
              "user not found" (Python empty dict is falsy). Switched to `if doc is None`.
              Verified end-to-end: first-ever completion bumps streak from 0 → 1 and
              writes to db.users. Second call same day is a no-op (idempotent).
          Needs testing_agent regression: verify existing endpoints unchanged
          (tracking/complete, tracking/wishlist, practice-log, attendance) and new
          endpoints (badges, mark-seen, streak) work under auth + return sensible
          shapes. Also verify streak doesn't double-count same-day activity.

frontend_new:
  - task: "Phase 1 Gamification: Achievements screen + Streak card + BadgeUnlockedOverlay"
    implemented: true
    working: "NA"
    file: "frontend/app/achievements.tsx, frontend/src/components/BadgeCard.tsx, frontend/src/components/BadgeUnlockedOverlay.tsx, frontend/src/components/StreakCard.tsx, frontend/app/(tabs)/index.tsx, frontend/app/(tabs)/profile.tsx, frontend/app/celebrate.tsx, frontend/app/dance/[id].tsx, frontend/src/api/client.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          NEW Phase 1 Gamification frontend:
            • Types: added Badge, Streak, BadgesResponse; extended User with
              current_streak / longest_streak / last_streak_date and Tracking with
              newly_earned_badges + streak (from the write-response envelope).
            • BadgeCard component (three sizes: sm/md/lg) — tinted-color-earned state
              w/ small checkmark, greyed locked state with progress bar underneath
              ("8 / 10 dances"), used across Achievements grid, Profile row, Home peek.
            • StreakCard — flame icon + "N days in a row" + hint text; dormant state
              never dance-shames a user w/ current=0.
            • BadgeUnlockedOverlay — stacked animated cards that pop in from below
              (spring easing, 500ms stagger between cards) then auto-fade. Uses
              react-native-reanimated. Non-blocking (pointerEvents box-none) so
              underlying Done button still tappable.
            • /app/achievements.tsx — new full grid screen grouped by category with
              hero counter ("1 / 12 BADGES UNLOCKED"), pull-to-refresh, marks unseen
              as seen on open.
            • Home tab — StreakCard beneath the Howdy greeting, plus an Achievements
              row with a red-dot indicator counting unseen badges (uses useFocusEffect
              so it refreshes every tab return).
            • Profile tab — new "Achievements" section with StreakCard + a horizontal
              scroll of 8 badges (earned first, sorted by earn date, then locked with
              highest progress). Links to /achievements.
            • Celebrate screen — receives newly_earned_badges as JSON param from
              /dance/[id] on completion, renders BadgeUnlockedOverlay cascade; auto-
              dismiss timer extended from 9s → 14s when badges are showing so users
              can read every one.
            • dance/[id] — forwards Tracking.newly_earned_badges into the celebrate
              params.
          Verified via screenshots:
            • Home shows "PRACTICE STREAK 1 day in a row" + "Achievements — You
              unlocked 1 new badge!" with red badge dot.
            • Achievements screen renders hero counter, streak card, and badges
              grouped by category with earned checkmarks + progress bars.
            • Profile shows Achievements section with streak card + badge showcase.
            • Celebrate screen after Mark-Completed shows the "BADGE UNLOCKED!
              First Steps" card animated on top of the fireworks.
          Ready for testing_agent regression on new UI + backwards-compat of
          existing screens.

test_plan_next:
  current_focus:
    - "App-wide localization (EN/ES/FR) — Language picker + tab wrapping across all major screens"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

metadata_old:

test_plan:
  current_focus:
    - "Phase 1: Gamification — Badges, achievements, and practice streaks"
  stuck_tasks: []
  test_all: false
  test_priority: "sequential"

agent_communication:
  - agent: "main"
    message: |
      Practice Mode is complete and verified end-to-end on web preview via screenshots. Audio
      playback is confirmed via HTTP 200 for the bundled WAV; live sound cannot be perceived from
      a headless screenshot but plays via expo-audio on-device. Next feature (Enhanced search /
      filter) pending user go-ahead per confirmed roadmap.
  - agent: "main"
    message: |
      Backend refactor complete. `server.py` reduced from 2,434 lines → 66 lines (thin entrypoint).
      Code split into:
        • core/     — config, database, security, rate_limit, email_service, push_service,
                      reset_tokens, serialize, time_helpers
        • models/   — schemas.py (all Pydantic models)
        • routes/   — auth, dances, tracking, classes, suggestions, chat, leaderboard,
                      dashboard, song_preview, push, misc  (each < 400 lines)
        • services/ — scheduler (24h class reminders), startup (indexes + seed data + accounts)
      Zero API surface changes — every URL, HTTP verb, request/response shape preserved.
      Verified locally via curl:
        • /api/, /api/venue, /api/dances, /api/classes, /api/leaderboard, /api/song-preview
          all return 200 with correct payload.
        • /api/auth/login → token → /api/auth/me, /api/instructor/dashboard,
          /api/tracking/me, /api/chat/messages, /api/suggestions, /api/dances/removed,
          /api/leaderboard (authed) all return 200 as expected.
      Backend supervisor logs are clean with no import or runtime warnings.
      Needs: comprehensive backend regression via testing_agent.
  - agent: "main"
    message: |
      New features + fixes for this iteration:
        • PDF Certificate of Completion — new `/api/certificate/{dance_id}` endpoint
          streams a warm-branded 1-page landscape PDF (reportlab). Only for dances
          the caller has marked completed. Per-user + per-IP rate limits guard the
          CPU cost. `sgy_certificate_<name>.pdf` returned as `Content-Disposition:
          attachment`. Frontend adds a "Certificate" button on the Celebrate screen
          and a ribbon icon per completed row on My Dances (opens native share sheet
          on iOS/Android, downloads directly on web).
        • Recently Practiced (backend + Home tab) — new `/api/practice-log/{dance_id}`
          + `/api/recently-practiced` endpoints; PracticeModePanel logs opens; Home
          shows a horizontal card row.
        • Leaderboard Prizes — public `/api/leaderboard/prizes` list; admin CRUD
          under `/api/admin/leaderboard/prizes/{rank}` per-range (all/week/month).
          Leaderboard screen shows a "Prizes up for grabs" card.
        • Admin Leaderboard controls — hide/unhide a user, reset a user's
          completions, roll to a new season (archives past top-10). New
          `/leaderboard-admin` screen with 3 tabs (Prizes / Users / Season).
        • Instructor Dashboard 8-week trend chart — new `/api/instructor/trend`
          endpoint + hand-rolled SVG sparkline in `AttendanceTrendChart.tsx`.
          Two overlaid series (attendance vs completions) with legend toggles.
        • Share on Celebrate screen — RN Share API + Web Share fallback with
          navigator.clipboard fallback for desktop.
        • P0 UX fix: dance detail sticky Complete/Wishlist buttons now TOGGLE on
          second tap (undo completion / remove from wishlist) — resolves the "no
          way to un-mark" complaint.
        • Backend fixes from testing_agent: `weeks=0` short-circuit bug fixed;
          `weeks=` empty & `weeks=abc` now hit the 8-week fallback instead of 422;
          same fix applied to /recently-practiced `limit` param.
      All new endpoints verified via testing_agent — 19/21 first pass, both
      remaining flakes fixed and re-verified locally (all pass now).


  - agent: "main"
    message: |
      New iteration (v2.5 — Home Reorder, Pick Main Instructor & Weekly Recap):

        • Home tab reordering (per user request):
          - Home hero now flows: Streak → Weekly Recap (new) → Achievements → Browse
            Dances → Community Activity → Recently Practiced → Boot Scoot Board →
            Find Events → Class Recap → Suggest a Dance → About the Venue.
          - Removed the redundant "example dances" strip from the hero — the poster
            already carries the community values.

        • Pick Main Instructor (backend + frontend):
          - New router `routes/instructors.py` — `GET /api/instructors` returns every
            account flagged `is_instructor` or `is_admin` (name/city/state/picture).
            `PATCH /api/auth/me/main-instructor` sets the caller's preferred
            instructor, and `DELETE` clears it.
          - `users` collection gained an optional `main_instructor_id` field.
          - `SuggestionIn` extended with an optional `target_instructor_id`; the
            suggestions route now falls back to the caller's stored
            `main_instructor_id` when the request body omits one, else lands in the
            admin firehose. `target_instructor_name` is denormalised at insert time.
          - New `GET /api/suggestions/for-instructor` returns the suggestions routed
            to the calling instructor (any instructor or admin).
          - Frontend: `PickInstructorSheet.tsx` — bottom-sheet directory with live
            search by name / city, blue verification checkmarks and a saving spinner.
            Wired from Home (first tap on "Suggest a Dance" if not picked yet),
            Suggest screen header (swap icon → change), and a new Profile row
            "Main instructor · {Name} — tap to change".
          - Suggest header + hint + success alert + submit button now personalise
            to the picked instructor's first name.

        • Weekly Recap Card:
          - New backend endpoint `GET /api/weekly-recap`. Merges Practice Mode opens
            (`practice_daily`) and completions (`tracking.updated_at` where
            `status="completed"`) across the current Monday→Sunday window. Returns
            `{days[], practices, completions, total, days_active, best_day}`.
          - Frontend `WeeklyRecapCard.tsx` renders on Home directly under the streak
            card. Sunday shows a "🎉 Weekly Recap" celebration tone, Mon-Sat shows
            "This week so far". Includes a 3-stat row (Practices · Completed · Best
            day) and Mon-Sun activity dots with today highlighted. Card is hidden
            when the user has 0 activity — no zero-shame states.

      Local verification:
        • `curl /api/weekly-recap` → 200 with the full summary object.
        • `curl /api/instructors` → 200 with the 11-member instructor directory.
        • Frontend smoke: Home renders correctly, Weekly Recap card shows Erin's
          2 completions this week (Sunday tone), Suggest-a-Dance opens the picker
          when no instructor is set, personalises when picked, and profile shows
          the "Main instructor" row with the current pick.

      Needs: `testing_agent` — comprehensive regression on the new endpoints plus
      the Suggest → PickInstructorSheet → Suggest personalisation flow.


  - agent: "main"
    message: |
      Follow-up (v2.6 — Multi-Instructor Pick + Auto-Follow):

        • Backend: `users.instructor_ids` array added. New atomic endpoint
          `PUT /api/auth/me/instructors` accepts `{instructor_ids, main_instructor_id?, follow?}`.
          - Validates each id against the instructors directory (silently drops
            unknown / non-instructor ids).
          - Resolves Primary via explicit → existing → first → cleared.
          - When `follow=true`, upserts follow rows for each selected instructor
            using the shared `services.social.follow(follower, followee)` helper
            (idempotent, uses the canonical `followee_id` field + unique index).
          - Returns `{ok, user (hydrated), new_follows}`.
          - Existing `PATCH /api/auth/me/main-instructor` now also
            `$addToSet`'s the id into `instructor_ids` so single-pick and
            multi-pick paths stay in sync.

        • Frontend: `PickInstructorSheet.tsx` rewritten as multi-select bottom
          sheet with checkboxes, "Follow when I save" toggle, star-to-promote
          Primary, sticky Cancel / "Save N picks" footer. Selected → brand red;
          Primary → brand tertiary + "⭐ PRIMARY" pill.
        • Profile row renamed to "My instructors" with dynamic subtitle:
          "Primary: {Name} · +N more".
        • Home + Suggest continue to personalise off the Primary pick.

      Testing:
        • 16/16 pytest cases in `test_multi_instructor_pick.py`. Iteration 25 caught
          a critical `followee_id` field-name bug in the initial follow upsert;
          fixed by delegating to `services.social.follow`. Iteration 26 verified
          the fix end-to-end (follow rows visible via /follows/me + /feed).
        • Frontend smoke: multi-select opens from Profile → "My instructors" and
          Home → Suggest a Dance; picks + Primary + follow-toggle all persist; the
          "Save N picks" flow closes the sheet and toasts new follows.


  - agent: "main"
    message: |
      Phase 19 — Merged External Search & Batch Import UI wiring:

      Frontend wiring (this session):
        • Library `(tabs)/library.tsx` — replaced the pair of provider-specific
          "Search CopperKnob / Search BootStepper" CTAs with a SINGLE unified
          "Search CopperKnob + BootStepper" primary button that routes to
          `/external-search`. Provider-specific searches are demoted to
          smaller fallback links ("Or search a single directory") so power
          users still have an escape hatch.
        • Footer of the library also gets the primary unified CTA + the two
          "Popular on CopperKnob / Popular on BootStepper" fallbacks.
        • `/external-search/index.tsx` (already built, now reachable): merged
          search over both providers, provider outage banner, admin-only
          "Select" batch mode with tap-to-toggle, bottom bar with "Review N"
          → routes to `/external-search/batch`.
        • `/external-search/batch.tsx` (already built, now reachable): dry-run
          preview via `/api/dances/bulk-preview-external`, categorised list
          (Ready / Already in Library / Error), publish-immediately toggle,
          commit via `/api/dances/bulk-from-external`, per-row success view.

      Screenshot-verified end-to-end (admin login `erinboroughs@gmail.com`):
        1. Library empty-state ("xxxxxx" search) shows the unified primary
           CTA + "Or search a single directory" fallback row.
        2. External-search screen renders the merged results with source
           badges (CopperKnob / BootStepper) and admin "Select" affordance.
        3. Selecting "footloose" + tap Select → batch mode enters, "Already
           in Library" row is locked, unlocked rows are tappable.
        4. Pick a card → bottom bar shows "1 selected · Review 1" → tap
           Review → Batch import preview loads with pre-ticked ready row,
           "Publish immediately" toggle default off, `Import 1` CTA.

      Testing:
        • Needs `testing_agent` — end-to-end verification of the merged
          search & batch import UI (login as admin, search, select 2-3,
          preview, commit as drafts, verify DB rows exist as drafts).
        • Old `/copperknob/*` and `/bootstepper/*` routes retained as
          fallback per user request (they are still reachable from the
          smaller fallback links). No routes were deleted.

  - agent: "main"
    message: |
      Phase — App-wide localization (EN/ES/FR) — Frontend rollout completed:

      Frontend:
        • `src/i18n/translations.ts` expanded to ~200 keys/locale covering
          onboarding, age gate, tabs, auth, welcome, common, home, library,
          my_dances, instructor, profile, language screen, notifications
          prefs and generic errors.
        • `src/i18n/index.ts` — added:
            – Custom `toRuntimeString` step at nest-time to rewrite our
              authoring placeholder syntax `{name}` → i18n-js sprintf-style
              `%{name}` so single-brace placeholders interpolate at runtime.
            – Device-locale-change detection: bootstrap now serialises the
              OS's ordered locale-tag list and, if it changed since the last
              boot AND the user hadn't pinned an override, wipes the
              "picker was shown" AsyncStorage flag so the LanguagePickerModal
              re-prompts on the next launch. Users who explicitly picked a
              language are NEVER re-prompted.
        • Wrapped major screens with `useTranslation()`:
            – `app/(tabs)/_layout.tsx` — tabs
            – `app/auth.tsx` — every label incl. legal footer (mode swap)
            – `app/welcome.tsx` — greeting + subtitle
            – `app/(tabs)/index.tsx` — hello, CTAs, cards, about section,
              activity feed empty state, all 5 orbit cards
            – `app/(tabs)/library.tsx` — brand, chip labels (including all
              6 difficulty codes mapped via DIFFICULTY_KEYS), search
              placeholder, empty state, external-search CTAs, footer,
              cards including "By {name}" / "{bpm} BPM"
            – `app/(tabs)/my-dances.tsx` — title, seg tabs, empty states,
              a11y labels for cert download
            – `app/(tabs)/instructor.tsx` — header, dance/class empty
              states, tab bar labels, legend, class card meta
            – `app/(tabs)/profile.tsx` — every visible label (~40 keys)
              including delete-account modal, sub-components
              (MentionsProfileRow, RefreshRecommendationsAdminRow,
              CurrentVersionRow)
            – `src/components/AgeGateModal.tsx` — hero, body copy, both
              CTAs, legal footer with in-place link splicing
      Verified via screenshots:
        1. Language picker opens on first launch, French → Continue.
        2. Age Gate renders in FR ("Vérification d'âge", "J'ai 13 ans ou
           plus").
        3. Auth screen renders in FR ("Se connecter", "Créer un compte",
           legal footer with linked Conditions + Politique de
           confidentialité).
        4. Home tab after login: "Salut, Erin !", "Prêt·e à danser ?",
           "Succès", "Parcourir les danses", "Activité de la communauté",
           "Récemment pratiqué", "Classement Boot Scoot", "Événements près
           de chez vous", "Suggérer une danse à Jamin", "À propos du lieu"
           + brand copy.
        5. Library tab: "Bibliothèque de line dance", "Rechercher nom,
           chanson, artiste, chorégraphe", Tous / Débutant absolu /
           Débutant / Intermédiaire / Avancé chips, "Par {name}" and
           "{bpm} BPM" formatting.
        6. Profile tab: "Administrateur" badge, "Terminées / À faire /
           Cours / ★ moy." stats, "Succès", "Historique de pratique",
           all account rows.
        7. Tab bar labels: "Accueil / Danses / Mes danses / Instructeur
           / Profil".

      Behaviour required per user request:
        • Re-prompt if device language changes: DONE (see bootstrap
          device-tag comparison above).

      Ready for testing_agent frontend smoke.


  - agent: "main"
    message: |
      Session (June 2026) — added 5 new locales on top of EN/ES/FR:
      German (de), Dutch (nl), Korean (ko), Simplified Chinese (zh-Hans),
      Traditional Chinese (zh-Hant). All ~315 keys translated per locale.

      Frontend
        • src/i18n/translations.ts: 8-locale catalog, ~315 keys each.
          Cleaned up 4 broken zh-Hans string values that embedded raw
          ASCII '"' inside double-quoted values — replaced with the
          canonical CJK corner-brackets 「 」 (U+300C / U+300D). Metro
          now bundles cleanly.
        • src/i18n/index.ts: NESTED_TRANSLATIONS + deviceLocale() know
          about the new codes. zh-Hant is inferred from script `hant`
          or region TW/HK/MO; bare `zh` / `zh-CN` resolves to zh-Hans.
        • Language picker (LanguagePickerModal.tsx) and settings
          (settings/language.tsx) already iterate SUPPORTED_LOCALES /
          LOCALE_LABELS, so both picked up the 5 new options with
          zero screen edits.
        • LOCALES_NEEDING_NATIVE_REVIEW = [ko, zh-Hans, zh-Hant] —
          machine-drafted, flagged for native-speaker review pass.
        • CJK fonts covered by iOS PingFang / Android Noto Sans CJK
          system fallback; no custom font on translated text.

      Backend
        • core/i18n.py: SUPPORTED_LANGUAGES tuple extended with the
          new codes. Push + email templates translated (fallback to
          English still active via _normalise_lang()).
        • PATCH /api/auth/me/language: accepts the new codes; anything
          else stays 400.

      Verification
        • Screenshot walkthrough: picker shows all 8 languages,
          switching to zh-Hans / zh-Hant / ko / de / nl live-swaps
          the UI (age-gate, auth CTAs, legal footer, tab labels).
        • German long-word layout (Datenschutzerklärung, Altersprüfung)
          wraps cleanly on 390px width.
        • zh-Hans vs zh-Hant script separation confirmed
          (登录/账号/隐私 vs 登入/帳號/隱私權).

      Non-goals honoured
        • UGC (dance titles, chat, event descriptions) untouched.
        • External resource links (CopperKnob / BootStepper) keep
          upstream language.
        • No changes to push credentials, Firebase, Apple keys, or
          store release configuration.

      Follow-up (planned this session)
        • Security audit was originally requested before this task —
          triggering security_audit_agent now.


#====================================================================================================
# NEW FEATURE: User-Submitted Dances (Pending Approval Queue) — 2026-06
#====================================================================================================

backend:
  - task: "User-Submitted Dances — pending approval queue"
    implemented: true
    working: "NA"
    file: "backend/routes/pending_dances.py, backend/routes/__init__.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Added `/api/pending-dances/*` (user) and
          `/api/admin/pending-dances/*` (admin) endpoints:
            • POST /api/pending-dances/submit  — body {source, ref}
              - source must be `copperknob` or `bootstepper`
              - server re-fetches source metadata (never trusts client)
              - Duplicate check: same source+ref pending/approved OR
                already in the dances library (via services.dance_dedupe)
              - Rate limit: 5 non-rejected submissions per UTC day per
                user; 429 on excess with reset time
            • GET  /api/pending-dances/quota   — used/limit/remaining/resets_at
            • GET  /api/pending-dances/mine    — user's own submissions
            • GET  /api/admin/pending-dances   — admin list with tab filter,
              returns pending_count for the tab badge
            • POST /api/admin/pending-dances/{id}/approve  — re-fetches
              upstream and creates a real `dances` row (published=true,
              credited to submitter), fires choreographer-follow notify
            • POST /api/admin/pending-dances/{id}/reject   — body {reason}
          Auth: user endpoints use get_current_user; admin endpoints use
          require_admin_or_editor. Rejected submissions do NOT consume
          the daily quota.

frontend:
  - task: "Request to Add Dance button on CopperKnob / BootStepper cards"
    implemented: true
    working: "NA"
    file: "frontend/src/components/CopperKnobResultCard.tsx, frontend/src/components/BootStepperResultCard.tsx, frontend/src/components/RequestAddToLibraryButton.tsx, frontend/src/context/pending-submissions-context.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Regular users now see a `+ Request to Add` button on both
          CopperKnob and BootStepper result cards (search + popular).
          Admin/instructor flow (direct import) unchanged.
          States rendered by RequestAddToLibraryButton:
            • idle → primary button
            • submitting → spinner
            • pending → tan "Pending Review" pill (tap for info)
            • approved → primary "In Library" (routes to /dance/{id})
            • rejected → red "Not Approved" pill (tap shows reason)
            • limit reached → disabled "5/5 today"
          A new PendingSubmissionsProvider hydrates the user's own
          submissions once per session and drives all card state so
          each card doesn't re-fetch. Optimistic write on submit so
          the button flips instantly.

  - task: "Admin Pending Dances queue screen"
    implemented: true
    working: "NA"
    file: "frontend/app/admin/pending-dances.tsx, frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          New route `/admin/pending-dances` reachable from Profile →
          SGY Admin section for admins/instructors. Tabs: Pending
          (default, with red count badge) / Approved / Rejected / All.
          Each row shows title, choreographer, level, count/wall,
          music, submitter + submitted_at, and (for approved) the
          admin who reviewed. Approve = one tap; Reject opens a modal
          with an optional reason (500 char cap) that is surfaced to
          the user. Pull-to-refresh + refresh header button.

  - task: "i18n translations for pending_dance / admin_pending across 8 locales"
    implemented: true
    working: "NA"
    file: "frontend/src/i18n/translations.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Added ~40 new keys × 8 locales = 320 translations for
          pending_dance.* (button labels, alert bodies, quota
          messaging) and admin_pending.* (tabs, actions, modal). No
          escaped quotes inside zh-Hans / zh-Hant (used 「」 or plain
          text). Lint clean.

metadata:
  test_sequence: 42
  test_priority: "high_first"

test_plan:
  current_focus:
    - "User-Submitted Dances — pending approval queue"
    - "Request to Add Dance button on CopperKnob / BootStepper cards"
    - "Admin Pending Dances queue screen"
  stuck_tasks: []
  test_all: false

agent_communication:
    -agent: "main"
    -message: |
      Please test the new User-Submitted Dances feature end-to-end.

      BACKEND (priority):
        1. As a REGULAR user (create one via POST /api/auth/register):
           - GET /api/pending-dances/quota → {used:0, limit:5, remaining:5}
           - POST /api/pending-dances/submit {source:"copperknob", ref:"<any valid CK ref>"}
             (You can hit GET /api/copperknob/popular to find a real ref.)
             → 200 with `submission` + updated `quota`
           - GET /api/pending-dances/mine → contains the row
           - POST same source+ref again → 409 code=already_pending
           - Repeat submits with 5 DIFFERENT refs from popular, then the
             6th should return 429 with code=daily_limit_reached
        2. As ADMIN (`admin@stompinground.com` / `<redacted-SEC-001>`):
           - GET /api/admin/pending-dances?status=pending → shows the rows
           - POST /api/admin/pending-dances/{id}/reject {reason:"test"}
             → 200; then GET pending shows one less, GET rejected shows it
           - POST /api/admin/pending-dances/{id}/approve on a pending row
             → 200 with dance_id; a new row appears in `dances` collection
             with copperknob_ref/bootstepper_ref set and is_published=true
        3. Auth guards:
           - Regular user → 403 on /api/admin/pending-dances/*
           - Missing token → 401 on /api/pending-dances/*
        4. Regression: existing /api/dances, /api/copperknob/*,
           /api/bootstepper/* should still work.

      FRONTEND (light UI check is fine):
        - Sign in as a regular user, go to CopperKnob search, submit a
          request → banner + button flips to "Pending Review".
        - Sign in as admin, open Profile → SGY Admin → "Pending
          Dances", approve/reject a row.


#====================================================================================================
# APPLE UGC 1.2 COMPLIANCE — 2026-06-24
#====================================================================================================

backend:
  - task: "Apple UGC 1.2 — full compliance surface"
    implemented: true
    working: "NA"
    file: "backend/routes/moderation.py, backend/routes/legal.py, backend/routes/auth.py, backend/core/security.py, backend/core/terms.py, backend/services/content_filter.py, backend/models/schemas.py, backend/routes/chat.py, backend/routes/feedback.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Full backend package for Apple Guideline 1.2 rejection response.
          Changes:
          1. Content filter (`services/content_filter.py`) — wordlist +
             regex for slurs, threats, sexual solicitation, spam.
             Applied on POST /chat/messages and POST /feedback BEFORE
             insert. Blocked posts return 400 with
             `{code:"content_blocked", message, category}`.
          2. Terms/EULA version tracking (`core/terms.py`,
             TERMS_VERSION="2026-06-24") + new endpoints:
             - POST /api/auth/register now requires accepted_terms_version
               matching current version (400 code=terms_not_accepted).
             - GET /api/legal/terms-status
             - POST /api/legal/accept-terms {version}
             - GET /api/legal/terms (HTML)
             - GET /api/legal/community-guidelines (HTML)
          3. Unified moderation API (`routes/moderation.py`):
             - GET /api/moderation/report-reasons
             - POST /api/moderation/reports {target_type, target_id,
               reason, note, target_user_id?} — supports feed/chat/
               profile/dance/event/comment.
             - GET /api/admin/moderation/reports (with tab filter +
               pending_count + elapsed_seconds for 24-h SLA UI)
             - PATCH /api/admin/moderation/reports/{id}
             - POST /api/admin/moderation/reports/{id}/remove-content
               (soft-deletes chat msgs, deletes feed events, un-publishes
                dances/events, clears profile bios)
             - POST /api/admin/moderation/users/{id}/suspend
               {duration_hours=24|168|720|999999, reason}
             - POST /api/admin/moderation/users/{id}/unsuspend
             - POST /api/admin/moderation/users/{id}/ban
             - POST /api/admin/moderation/users/{id}/warn {reason}
             - GET /api/admin/moderation/users/{id}/history
          4. Account status enforcement in `core/security.py` —
             get_current_user now rejects banned users (403
             code=account_banned) and currently-suspended users
             (403 code=account_suspended) plus their current pwd_ver
             is bumped so all existing tokens are invalid.
          Users collection gets new fields (all optional, backward
          compatible): accepted_terms_version, accepted_terms_at,
          is_suspended, is_banned, suspend_until, moderation_reason,
          moderation_action, moderation_at, moderation_by,
          moderation_by_name, warnings_count, last_warning_at,
          last_warning_reason.
          New Mongo collections: moderation_reports, moderation_actions.

frontend:
  - task: "Apple UGC 1.2 — active Terms checkbox + terms re-accept gate"
    implemented: true
    working: "NA"
    file: "frontend/app/auth.tsx, frontend/app/terms-accept.tsx, frontend/src/components/TermsGate.tsx, frontend/src/lib/terms.ts, frontend/app/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Registration flow now shows a mandatory checkbox
          ("I have read and agree to the Terms of Use and Community
          Guidelines") that MUST be actively ticked before the
          Create Account button becomes enabled. On submit, the
          client sends `accepted_terms_version=TERMS_VERSION` in the
          register payload; server rejects if version mismatch.
          A root-level TermsGate component runs on every route and
          redirects signed-in users to /terms-accept whenever their
          accepted_terms_version doesn't match the current live
          version. The terms-accept screen has the same checkbox
          gate and shows what changed + links to the full Terms and
          Community Guidelines HTML pages (served by the backend).

  - task: "Apple UGC 1.2 — Report + Block on chat messages"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/instructor.tsx, frontend/src/components/ReportContentSheet.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          Long-press on someone else's chat message now shows Reply /
          Report / Block. Report opens the shared
          ReportContentSheet with the canonical 8-reason picker
          (loaded from GET /moderation/report-reasons). Block was
          already implemented and continues to hide the user's
          content instantly.

  - task: "Apple UGC 1.2 — Safety Center screen"
    implemented: true
    working: "NA"
    file: "frontend/app/safety.tsx, frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          New /safety route reachable from Profile → Safety Center
          row. Shows the zero-tolerance banner, step-by-step Report
          instructions, step-by-step Block instructions, a big
          "Email Safety Team" button, and links to the Terms /
          Community Guidelines / Privacy Policy HTML pages served
          by the backend.

  - task: "Apple UGC 1.2 — Admin moderation queue"
    implemented: true
    working: "NA"
    file: "frontend/app/admin/moderation.tsx, frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          New unified queue at /admin/moderation (Profile → SGY
          Admin → Moderation Queue for admins). Tabs Pending (with
          red count badge) / Actioned / Dismissed / All. Every card
          shows the reported item's snapshot, reason, reporter, and
          elapsed time (amber pill at ≥20h, red pill at ≥24h).
          Per-card actions: View User, Dismiss, Warn, Remove
          Content, Suspend/Ban (opens sheet with 24h/7d/30d/permanent
          options + reason field).

metadata:
  test_sequence: 43
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Apple UGC 1.2 — full compliance surface"
    - "Apple UGC 1.2 — active Terms checkbox + terms re-accept gate"
    - "Apple UGC 1.2 — Report + Block on chat messages"
    - "Apple UGC 1.2 — Safety Center screen"
    - "Apple UGC 1.2 — Admin moderation queue"
  stuck_tasks: []
  test_all: false

agent_communication:
    -agent: "main"
    -message: |
      Backend + frontend implementation for Apple Guideline 1.2 UGC
      rejection response is complete. Please run the following
      acceptance tests:

#====================================================================================================
# NEW: Follower notifications now land in Notification Center + double-push fix — 2026-10-02
#====================================================================================================

backend:
  - task: "Follower notifications: Notification Center logging + double-push dedupe"
    implemented: true
    working: true
    file: "backend/services/instructor_notifications.py, backend/routes/classes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Two gaps closed in a single edit of
          `services/instructor_notifications.py`:

          1) NOTIFICATION CENTER logging: both
             `notify_followers_of_new_class` and
             `notify_followers_of_new_event` now call
             `notification_feed.log_event(...)` after a successful push
             with kinds `new_class` / `new_event`. Followers who tap
             away before the OS banner lands can still find the alert
             in the bell icon. Rows carry metadata.entity_id so the
             frontend icon map (`new_class` = school/green, `new_event`
             = flag/blue) is used and tapping deep-links to `/classes`
             or `/events/{event_id}`.

          2) DOUBLE-PUSH FIX: both helpers now RETURN a `list[str]` of
             user_ids that were just pushed (previously returned int).
             `routes/classes.py` captures this list and passes it as
             `skip_user_ids=` to `broadcast_new_class`, so followers
             already pinged via the instructor fan-out are NEVER
             library-broadcast on the same class. Backwards-compat:
             the route defensively still accepts an int return and
             falls through to the broadcast's own dedupe ledger when
             the helper hasn't been upgraded.

          Verified end-to-end:
            * Smoke script (register follower → pick instructor →
              create class → create event) confirms 1 feed row per
              recipient per entity, 1 follower push ledger row, and
              0 library-broadcast ledger rows for that user.
            * pytest suite `tests/test_instructor_notifications.py`
              extended with `TestFeedCenterLogging` (2 cases) and
              `TestNoDoublePushDedupe` (1 case). All 10 tests pass.
            * Live UI screenshot: Erin's Notification Center now shows
              "New class from Jamin Brown — Thursday Night Line
              Dancing · 2026-10-03 — class" at the top with the green
              school icon.

frontend:
  - task: "Notification Center shows `new_class` and `new_event` rows"
    implemented: true
    working: true
    file: "frontend/app/notifications.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          No code change required — the Notification Center icon/tint
          map (`KIND_ICON_MAP`) already included entries for
          `new_class` (school icon, green) and `new_event` (flag icon,
          blue). The screen auto-renders the new rows and deep-links
          via the existing `router.push(deeplink)` handler.

#====================================================================================================
# NEW: Weekly Digest Email — Monday-morning unread-notifications recap — 2026-10-02
#====================================================================================================

backend:
  - task: "Weekly Digest Email (service + scheduler + admin endpoints)"
    implemented: true
    working: true
    file: "backend/services/weekly_digest.py, backend/routes/weekly_digest.py, backend/services/scheduler.py, backend/services/notification_prefs.py, backend/routes/notification_prefs.py, backend/routes/auth.py, backend/routes/__init__.py, backend/tests/test_weekly_digest.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Builds a Monday 08:00-America/Phoenix (15:00 UTC — Arizona
          has no DST) weekly email summarising every UNREAD
          notification from the last 7 days, grouped into 4 sections:
          Classes (new_class / library_new_class / class_reminder),
          Events (new_event), Announcements & Pins (announcement),
          @Mentions (chat_mention). Caps 5 items per section with a
          "+N more in the app →" tail linking to /notifications.

          Pieces delivered:
            * services/weekly_digest.py — collect_user_digest,
              send_digest_for_user, send_weekly_digest sweep,
              branded HTML + plain-text renderers, per-ISO-week
              idempotency ledger in `weekly_digest_sends`
              (unique on user_id + week_start).
            * services/notification_prefs.py — added `weekly_digest`
              to ALL_CATEGORIES tuple so the merge-PATCH in
              routes/notification_prefs auto-handles it. Default is
              True (opt-out).
            * routes/notification_prefs.py — added
              `weekly_digest: Optional[bool]` to NotificationPrefsIn.
            * routes/weekly_digest.py — new admin router with:
                - POST /api/admin/weekly-digest/preview
                  (force=True, bypasses prefs + ledger + empty-skip
                  so an admin can preview any time)
                - POST /api/admin/weekly-digest/run-now (manual
                  sweep trigger with full guards)
                - GET /api/admin/weekly-digest/status
            * services/scheduler.py — new CronTrigger job
              `weekly_digest_email` at Monday 15:00 UTC. CronTrigger
              (not interval=weeks=1) so a mid-week restart doesn't
              shift the send.
            * routes/auth.py — account-delete flow now also purges
              `weekly_digest_sends` rows for the deleted user.

          Guards:
            * Skips users with `email_is_synthetic: True` (Apple
              private-relay accounts whose email is `apple:<sub>`).
            * Skips users whose pref is explicitly False.
            * Skips users with zero unread items in the window
              (silence is a feature).
            * Idempotency: one send per user per ISO week — a pod
              restart around 15:00 UTC Monday is a no-op.

          Email template:
            * Red→orange gradient brand header "Stompin' Ground Yuma
              — Your week on the dance floor".
            * Personal greeting ("Hey {first_name} 👋") with unread
              count.
            * Section cards with emoji headers, item titles+bodies,
              relative-time stamps ("13m ago", "3d ago"), truncation
              tail.
            * Red "Open the Notification Center" CTA.
            * Footer link to /settings/notifications for pref change.
            * Plain-text alternative part is included for text-only
              email clients.

          Tests: tests/test_weekly_digest.py — 15 cases covering
          pref defaults + patch, grouping/cap/truncation, 4 short-
          circuit reasons (empty / pref-off / synthetic / already-
          sent), force bypasses ledger write, admin-only guards on
          all 3 endpoints, status endpoint shape. 15/15 pass.

          Combined with existing suites — 65/65 pass
          (test_weekly_digest + test_instructor_notifications +
          test_notifications_v2 + test_dotd_streak_and_audience).

          Live verification: rendered HTML preview saved and
          screenshotted — brand gradient header, "Hey Erin 👋", 📚
          Classes with Jamin's new class, 📣 Announcements & Pins
          with 5 items + "+50 more in the app →" tail, CTA button,
          settings link, "Yuma, AZ · Where line dancing is
          community" tagline.

          SMTP sending blocked only by test-env firewall (production
          Resend / outbound SMTP will deliver). Logged cleanly as
          [EMAIL:FAILED] with a correlation id — no secrets logged.

frontend:
  - task: "Settings → Notifications gains the weekly-digest toggle"
    implemented: true
    working: true
    file: "frontend/app/settings/notifications.tsx, frontend/src/api/client.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Added `weekly_digest: boolean` to the NotificationPrefs
          type in `client.ts` and a new row to the Settings UI:
            * Icon: mail (envelope)
            * Title: "Weekly email digest"
            * Subtitle: "Monday-morning recap of unread
              notifications so you never miss a new class, event,
              or @mention"
          Default ON (opt-out), toggles via the existing PATCH
          /users/me/notification-prefs endpoint. Verified via
          screenshot — the new row appears between "Admin
          announcements" and the admin-only "Admin: pending-review
          alerts" row.

metadata:
  test_sequence: 45
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Weekly Digest Email (service + scheduler + admin endpoints)"
    - "Settings → Notifications gains the weekly-digest toggle"
  stuck_tasks: []
  test_all: false

#====================================================================================================
# NEW: Chat Reply Push + In-App Notification — 2026-10-02
#====================================================================================================

backend:
  - task: "Chat Reply Push + In-App Notification"
    implemented: true
    working: true
    file: "backend/services/chat_replies.py, backend/routes/chat.py, backend/services/notification_feed.py, backend/services/weekly_digest.py, backend/core/i18n.py, backend/tests/test_chat_replies.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Threaded replies already existed in chat (parent_id on
          each message, frontend already sends it). This change adds
          the "notify the ORIGINAL POSTER" leg — push + Notification
          Center feed row.

          Pieces:
            * services/chat_replies.py (NEW) — fan_out_chat_reply.
              Looks up parent, applies all guards (self-reply,
              deleted parent, mutual-block, already-notified via
              @mention, pref gate on mention_alerts), sends push +
              log_event(kind="chat_reply").
            * routes/chat.py — post_chat() calls fan_out_chat_reply
              AFTER fan_out_mentions, BEFORE fan_out_chat_post. The
              parent author is added to already_notified passed to
              the general fan-out so one message never produces more
              than one notification per recipient.
            * services/notification_feed.py — chat_reply in KNOWN_KINDS.
            * services/weekly_digest.py — chat_reply routed into the
              💬 @Mentions digest section.
            * core/i18n.py — push.chat_reply.title/body across all 8
              locales (EN, ES, FR, DE, NL, KO, zh-Hans, zh-Hant).
            * frontend/app/notifications.tsx — KIND_ICON_MAP gets
              chat_reply: return-up-back icon, brand red.

          Dedupe cascade (one message = one notification per recipient):
          @mention wins > chat_reply wins > general chat_message.
          Self-reply, deleted parent, mutual block = no notification.

          Pref gate: mention_alerts (same gate as @mentions —
          targeted engagement). Replies respect quiet hours.

          Tests: tests/test_chat_replies.py — 6/6 pass.
          Combined notification suites: 71/71 passing.
          Live UI verified via screenshot.

frontend:
  - task: "Notification Center icon for chat_reply"
    implemented: true
    working: true
    file: "frontend/app/notifications.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Added chat_reply to KIND_ICON_MAP: return-up-back icon,
          brand red tint. Deeplink to /(tabs)/instructor handled by
          existing router.push logic.

#====================================================================================================
# APPLE REVIEW ACCOUNTS — REMOVED FROM LIVE DB — 2026-10-02
#====================================================================================================

backend:
  - task: "Remove Apple App Review seeded accounts from live DB"
    implemented: true
    working: true
    file: "backend/services/startup.py, backend/scripts/purge_apple_review_seeds.py, memory/test_credentials.md"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Apple approved the build; the 3 seeded reviewer accounts
          (reviewer@, adminreview@, samplecontent@stompinground.com)
          + the demo chat message no longer need to be live.
          Verified: all 3 → 401 on login, zero rows after restart,
          3 other admins active (last-admin guard safe), 71/71
          notification tests still pass.

#====================================================================================================
# NEW: Followed-Instructor Hub on Home — 2026-10-05
#====================================================================================================

backend:
  - task: "Followed-Instructor Hub (upcoming from followed instructors)"
    implemented: true
    working: true
    file: "backend/routes/followed_instructors.py, backend/routes/__init__.py, backend/tests/test_followed_instructor_hub.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          New endpoint GET /api/followed-instructors/upcoming reads
          the caller's users.instructor_ids, pulls every upcoming
          class and PUBLISHED event authored by those instructors,
          merges them into a unified shape, and returns the list
          sorted chronologically (date asc, start_time asc).

          Response shape: {items[], total, has_follows, today}. Each
          item has kind (class|event), id, instructor_id,
          instructor_name, title, date, start_time, venue_name,
          city, dance_count, deeplink — enough for one renderer to
          handle both.

          Guards:
            * has_follows=false if caller follows nobody (client
              hides the card gracefully, no "pick an instructor"
              nag).
            * Draft events hidden (is_published must be true).
            * Past-dated items hidden (date >= today_utc).
            * limit= caps items but total reflects pre-truncation
              count so client can show "+N more".
            * Non-followed instructors' content never leaks in.
            * Unknown/deleted instructor ids silently skipped.

          Tests: tests/test_followed_instructor_hub.py — 9/9 pass:
            1. Requires auth (401 without token).
            2. No-follows caller → has_follows=false.
            3. Followed class shows up with class shape.
            4. Published event shows up with event shape + time + venue.
            5. Draft event hidden.
            6. Past class hidden.
            7. Items sorted chronologically.
            8. limit= caps items, total unchanged.
            9. Non-followed caller never sees anything.

          Full suite: 80/80 pass (hub + chat_replies + weekly_digest
          + instructor_notifications + notifications_v2 +
          dotd_streak_and_audience).

frontend:
  - task: "Followed-Instructor Hub card on Home"
    implemented: true
    working: true
    file: "frontend/src/components/FollowedInstructorHub.tsx, frontend/app/(tabs)/index.tsx, frontend/src/api/client.ts, frontend/src/i18n/translations.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          New FollowedInstructorHub component on Home right after
          the DOTD card. Shows up to 4 upcoming classes + events
          from the dancer's followed instructors. Each row has a
          CLASS/EVENT pill, title, instructor name, time/venue/
          city/dance-count metadata chain, and relative-date label
          ("Tomorrow", "Thu, Oct 8", etc.). Rows deep-link to
          /classes or /events/{id}. If more than 4 items exist, a
          "+N more" footer links to the Instructor tab.

          Hidden entirely when:
            * User is signed out.
            * User follows nobody (has_follows=false).
            * No upcoming items this cycle.

          Refreshes on Home focus so new classes from followed
          instructors show up without a relaunch.

          i18n: ~10 new keys per locale (home.hub_title, hub_sub,
          hub_view_all, hub_class_pill, hub_event_pill,
          hub_class_dances / hub_class_dances_one, hub_more,
          hub_date_today, hub_date_tomorrow) across all 8 locales
          (EN, ES, FR, DE, NL, KO, zh-Hans, zh-Hant).

          Verified via screenshot: Erin's Home now shows "From Your
          Instructors — Upcoming classes and events" with 3 live
          rows for Jamin's seeded classes + event.

#====================================================================================================
# SECURITY AUDIT FIXES — SEC-001 + SEC-002 — 2026-10-05
#====================================================================================================

backend:
  - task: "SEC-001 — admins exempt from chat mutual-block filter"
    implemented: true
    working: true
    file: "backend/routes/chat.py, backend/tests/test_sec001_moderation_blind_spot.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Audit flagged a moderation blind spot: a troll could
          block every admin via POST /blocks and their abusive
          chat messages would drop out of admins' live
          /chat/messages view. Reactive moderation still worked;
          proactive did not. Fix in routes/chat.py::list_chat —
          bypass hidden_user_ids when viewer is admin
          (instructor.get("is_admin") == True). Non-admins
          keep block preferences; admins' personal blocks still
          apply everywhere else (profile, DMs, mentions) — only
          the chat tab (their moderation surface) is unfiltered.
          Regression suite 2/2 pass; full affected suite 82/82.

  - task: "SEC-002 — .env now covered by .gitignore"
    implemented: true
    working: true
    file: ".gitignore"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Audit flagged latent exposure: backend/.env holds SMTP
          password, JWT signing secret, seed passwords, but was
          NOT covered by any .gitignore. One `git add .` would
          publish those to history. No present leak (untracked).
          Fix: added .env, .env.*, backend/.env*, frontend/.env*,
          *.env — with !.env.example / !.env.sample negations so
          template files stay trackable. Verified via
          `git check-ignore backend/.env` → path printed (now
          ignored); .env.example NOT ignored.

#====================================================================================================
# NEW: Simplify completion celebration — 2026-10-05
#====================================================================================================

frontend:
  - task: "Simplify completion celebration layout"
    implemented: true
    working: true
    file: "frontend/app/celebrate.tsx, frontend/src/components/BadgeUnlockedOverlay.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          Design review flagged three issues on /celebrate:
          1. Newly-earned badge floated at `top: 26%` of screen,
             covering the "You danced …" headline (overlap bug).
          2. headline + "N dances completed" + milestone label were
             all large-ish text lines competing for the eye.
          3. No fast path to pick a NEXT dance; users had to
             dismiss back through dance detail.

          Fixes:
          * ONE clear headline — "You completed {danceName}!"
            (was: "You danced {danceName}"). Fallback: "You
            completed a dance!" when name is missing.
          * Compact single-line secondary — milestone > "Dance #N"
            > default encouragement. Replaces the old count +
            milestone double-stack.
          * BadgeUnlockedOverlay gets a new `inline` prop that
            skips its position:absolute,top:26% wrap and
            participates in flex flow. Parent places the badges
            BELOW the headline, never over it.
          * New "Choose your next dance" button in the bottom row,
            routes to /(tabs)/library with musical-notes icon.
          * Orbit polish — center 62%→72%, radius 130→110 so the
            one-time logo flourish never visits the headline band.
          * Web rendering robustness — shared value `t`
            initialises at 1 on web (end state) with the entry
            animation disabled. Reanimated's withDelay adapter on
            web was occasionally leaving the hero at opacity 0.
            Native path unchanged.

          Verified via screenshot: hero now shows NICE WORK! →
          "You completed Dance With Me!" (big, serif, white) →
          compact orange milestone → gap → Share your win ·
          Choose your next dance · Done ✓. No overlap. No
          competing big text.

          Lint: clean. Backend tests: 32/32 passing (no regression).

#====================================================================================================
# NEW: Thank-you Toast + Streak Save nudge — 2026-10-08
#====================================================================================================

frontend:
  - task: "Thank-you toast after Share Your Win"
    implemented: true
    working: true
    file: "frontend/app/celebrate.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          handleShare on /celebrate now watches whether the share
          actually reached the OS sheet / clipboard. On success,
          calls toast.success("Thanks for spreading the word! 🎉",
          {duration: 2600}) via the existing useToast() context.
          User-cancels (AbortError on web, Share.dismissedAction on
          native) stay silent — no fake gratitude for closed sheets.
          Toast context has a NOOP fallback so the call is safe in
          test envs where ToastProvider isn't mounted.

backend:
  - task: "Streak at-risk flags on /dance-of-the-day/streak"
    implemented: true
    working: true
    file: "backend/services/dotd_streak.py, backend/tests/test_dotd_streak_and_audience.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          get_streak() return shape expanded with `last_day`,
          `at_risk`, `grace_days`. at_risk=True iff
          (current>=1 AND today_done=False AND last_day==yesterday)
          — the one calendar day where opening today's DOTD would
          still preserve the stored streak. record_open() returns
          the updated get_streak() so new fields propagate without
          a caller change. 3 new pytest cases:
            * at_risk True when last_open_was_yesterday
            * at_risk False when last_open_was_today
            * at_risk False when last_open_was_two_days_ago
          Combined 7-suite regression: 85/85 passing.

frontend:
  - task: "Streak Save card on Home"
    implemented: true
    working: true
    file: "frontend/src/components/StreakSaveCard.tsx, frontend/app/(tabs)/index.tsx, frontend/src/api/client.ts, frontend/src/i18n/translations.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
          New StreakSaveCard component renders ONLY when the backend
          flags at_risk=true. Uses DOTD-matching flame orange
          (#D9502A) in warm ember-tinted panel ("One dance keeps
          your streak alive 🔥") with CTA that deep-links to the
          DOTD's dance detail page. Inserted on Home between the
          DOTD card and the Followed-Instructor Hub. 3 new i18n
          keys per locale × 8 locales. useFocusEffect refresh so
          the card disappears instantly after opening the DOTD
          elsewhere. Verified live via screenshot: Home shows DOTD
          at top with 🔥 5 pill, Streak Save card directly beneath
          with orange flame bubble, "5-day streak at..." title,
          "One dance keeps y..." body, orange CTA.

metadata:
  test_sequence: 51
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Thank-you toast after Share Your Win"
    - "Streak at-risk flags on /dance-of-the-day/streak"
    - "Streak Save card on Home"
  stuck_tasks: []
  test_all: false

obsolete_celebrate_block:
  - task: "Simplify completion celebration layout (dup — see latest block above)"


metadata:
  test_sequence: 48
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Followed-Instructor Hub (upcoming from followed instructors)"
    - "Followed-Instructor Hub card on Home"
  stuck_tasks: []
  test_all: false

obsolete_remove_apple_block:
  - task: "Remove Apple App Review seeded accounts from live DB (dup block above)"

          Done:
          * Commented out the seed_apple_review_accounts() call in
            services/startup.py::run_startup() so the accounts can't
            come back on backend restart. Seed source files are
            kept dormant on disk (user chose "re-enable later if
            Apple asks for another review" option) — re-enabling
            is just un-commenting the two lines.
          * New scripts/purge_apple_review_seeds.py — mirrors the
            full delete_my_account purge for each of the 3 users:
            sessions, tracking, attendance, practice logs, event
            RSVPs, chat (messages/reactions/reads/mentions), social
            follows, choreographer follows, instructor notification
            ledger, library broadcast ledger, notification feed,
            DOTD streak, weekly digest ledger, badges — then
            anonymises any content they authored and deletes the
            user doc. Idempotent.
          * memory/test_credentials.md updated — reviewer section
            replaced with a "REMOVED 2026-10-02" block that records
            the re-enable procedure.

          Verification:
          * All 3 emails → 401 on login post-purge.
          * Zero rows remain in users / instructor_messages for
            these accounts after a backend restart.
          * 3 other admins still active (last-admin guard safe).
          * 71/71 notification tests still pass.

metadata:
  test_sequence: 47
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Remove Apple App Review seeded accounts from live DB"
  stuck_tasks: []
  test_all: false

obsolete_chat_reply_block:
  - task: "Notification Center icon for chat_reply (duplicate — see latest block above)"


old_frontend:
  - task: "Notification Center shows `new_class` and `new_event` rows"

metadata:
  test_sequence: 44
  test_priority: "high_first"

test_plan:
  current_focus:
    - "Follower notifications: Notification Center logging + double-push dedupe"
  stuck_tasks: []
  test_all: false

old_agent_communication:
    -agent: "main"
    -message: |
      Backend + frontend implementation for Apple Guideline 1.2 UGC
      rejection response is complete. Please run the following
      acceptance tests:

      BACKEND:
      1. Terms enforcement:
         a. POST /api/auth/register with NO accepted_terms_version
            → 400 code=terms_not_accepted
         b. POST /api/auth/register with accepted_terms_version="wrong"
            → 400 code=terms_not_accepted
         c. POST /api/auth/register with accepted_terms_version=
            "2026-06-24" → 200, account created, user record has
            accepted_terms_version set.
         d. GET /api/legal/terms-status as fresh user → up_to_date=true
         e. POST /api/legal/accept-terms {version:"2026-06-24"} → 200
         f. POST /api/legal/accept-terms {version:"wrong"} → 400

      2. Content filter (chat + feedback):
         a. As instructor, POST /api/chat/messages
            {message:"you nigger"} → 400 code=content_blocked
         b. Same with "kill yourself" → 400
         c. Same with "send me nudes" → 400
         d. Same with "AAAAAAAAAA"×20 → 400 (spam)
         e. Same with "great dance today" → 200
         f. POST /api/feedback with slur → 400
         g. POST /api/feedback with normal text → 200

      3. Reporting:
         a. As user, POST /api/moderation/reports
            {target_type:"chat", target_id:<a real chat id>,
             reason:"harassment"} → 200
         b. Same report again → 200 already_reported=true
         c. Bad target_type → 400
         d. Bad reason → 400
         e. Self-report (target_user_id = own user_id) → 400
         f. GET /api/moderation/report-reasons → 8 reasons list
         g. GET /api/admin/moderation/reports?status=pending as
            regular user → 403
         h. Same as admin → 200 with pending_count

      4. Admin actions:
         a. POST /api/admin/moderation/reports/{id}/remove-content
            for a chat report → 200; message deleted_at set,
            message="", report.status="actioned"
         b. POST /api/admin/moderation/users/{u}/suspend
            {duration_hours:24, reason:"test"} → 200; user is_suspended
            true, suspend_until iso, pwd_ver bumped, sessions cleared
         c. Existing token for suspended user → 403 code=account_suspended
         d. POST /api/admin/moderation/users/{u}/unsuspend → 200,
            user can log back in via password.
         e. POST /api/admin/moderation/users/{u}/ban → 200; get_current_user
            returns 403 code=account_banned.
         f. POST /api/admin/moderation/users/{u}/warn {reason:"..."} → 200,
            warnings_count incremented.
         g. Attempting to suspend/ban an admin → 400.
         h. Attempting to suspend/ban self → 400.

      5. HTML pages:
         a. GET /api/legal/terms → 200 HTML with zero-tolerance clause
            + prohibited-conduct list.
         b. GET /api/legal/community-guidelines → 200 HTML.

      Existing pending-dances, chat threads, link previews, feed
      reporting should all continue to work — regression run.

      FRONTEND (light smoke check):
      1. Fresh app boot → language picker OK, then auth screen.
         Register tab shows an active checkbox that MUST be ticked
         before Create Account button enables.
      2. Register a fresh user → account created, arrives in app,
         no forced /terms-accept redirect.
      3. Sign in as an existing user whose accepted_terms_version is
         old / missing → app redirects to /terms-accept, checkbox
         MUST be ticked to Continue.
      4. Profile shows a "Safety Center" row (before the feedback row).
      5. Admin profile shows "Moderation Queue" (renamed from Reports).

      CREDENTIALS: admin@stompinground.com / <redacted-SEC-001>
      (see /app/memory/test_credentials.md)

## 2026-10-12 — URGENT: Registration Terms checkbox (Apple 1.2) hardening
- Root cause: installed Android build predates the signup Terms checkbox (added 2026-09-17, OTA updates disabled) while live backend enforces accepted_terms_version → old build shows no checkbox; old client JSON.stringify'd the object `detail` → raw JSON in UI.
- Backend: /auth/register + /legal/accept-terms now return string `detail` + top-level `code`/`required_version` (enforcement unchanged). New public GET /api/legal/terms-version.
- Frontend: auth.tsx — prominent Terms card (testIDs auth-terms-card, auth-accept-terms-checkbox, auth-accept-terms-label, auth-accept-terms-link, auth-accept-guidelines-link, auth-terms-error); Create Account tappable when unticked → highlights card + friendly msg, NO request sent; KeyboardAwareScrollView (Android edge-to-edge keyboard fix); version fetched from server. client.ts — ApiError, never stringifies JSON.
