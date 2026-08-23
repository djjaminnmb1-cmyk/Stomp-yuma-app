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
  Stompin' Ground Yuma line-dance mobile app enhancement. In this session we're rolling out five
  additive features one at a time (Practice Mode → Enhanced Search → Leaderboard → Instructor
  Dashboard → Backend Refactor). Currently working on Practice Mode.

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
    - "Phase 1 Gamification backend: badges/streak endpoints + auto-award hooks"
    - "Phase 1 Gamification frontend: Achievements screen + BadgeUnlockedOverlay"
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
