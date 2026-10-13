import Constants from "expo-constants";
import { diagnosticsHeaders } from "@/src/lib/diagnostics";

const BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL ||
  "";

export const API_BASE = `${BASE}/api`;

export type Tracking = {
  dance_id: string;
  status: "completed" | "wishlist";
  rating: number;
  notes: string;
  updated_at: string;
  // Present on write-side responses (POST /tracking/{id}). Empty otherwise.
  newly_earned_badges?: Badge[];
  streak?: Streak | null;
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  is_admin: boolean;
  is_instructor: boolean;
  can_edit_step_sheets?: boolean;
  show_on_leaderboard?: boolean;
  show_in_activity_feed?: boolean;
  certificate_theme?: string;
  current_streak?: number;
  longest_streak?: number;
  last_streak_date?: string;
  auth_provider: string;
  apple_sub?: string;  // present iff Apple is linked
  email_is_synthetic?: boolean;
  main_instructor_id?: string;
  instructor_ids?: string[];
  // BCP-47 short code chosen by the user, or "" to follow device
  // locale. Server enforces membership in the supported set.
  preferred_language?: string;
  // Apple UGC 1.2 — stamped on the user record when they actively
  // accept the current Terms/Community Guidelines via a checkbox.
  // The client compares against the server's TERMS_VERSION on
  // startup and shows the Terms Accept screen if it doesn't match.
  accepted_terms_version?: string;
  accepted_terms_at?: string;
  // Moderation state. Any of these truthy means the server is
  // already refusing the auth token (403); we surface them just so
  // the client can render a friendly "your account is on hold" screen
  // when it hits a stale cached user object.
  is_suspended?: boolean;
  is_banned?: boolean;
  suspend_until?: string;
  moderation_reason?: string;
};

// ---------------- Badges / Achievements ----------------
export type Badge = {
  id: string;
  title: string;
  description: string;
  icon: string;   // Ionicons name
  color: string;  // hex
  category: "milestone" | "streak" | "class" | "practice" | "variety";
  requirement: number;
  unit: string;
  progress: number;
  earned: boolean;
  earned_at: string;
  seen: boolean;
};

export type Streak = {
  current: number;
  longest: number;
  last_streak_date: string;
};

export type BadgesResponse = {
  badges: Badge[];
  streak: Streak;
  total_earned: number;
  total_badges: number;
  unseen_count: number;
};

// ---------------- Practice history ----------------
export type PracticeHistoryDay = { date: string; count: number };
export type PracticeHistoryResponse = {
  days: PracticeHistoryDay[];
  total: number;
  days_active: number;
  best_day: PracticeHistoryDay;
};

// ---------------- Weekly Recap ----------------
export type WeeklyRecapDay = {
  date: string;
  practices: number;
  completions: number;
  count: number;
};
export type WeeklyRecap = {
  week_start: string;
  week_end: string;
  today: string;
  days: WeeklyRecapDay[];
  practices: number;
  completions: number;
  total: number;
  days_active: number;
  best_day: WeeklyRecapDay | null;
};

// ---------------- Social ----------------
export type PublicUser = {
  user_id: string;
  name: string;
  picture: string;
  current_streak: number;
  is_instructor: boolean;
  is_following?: boolean;
};

export type PublicProfile = {
  user_id: string;
  name: string;
  picture: string;
  is_admin: boolean;
  is_instructor: boolean;
  current_streak: number;
  longest_streak: number;
  show_in_activity_feed: boolean;
  show_on_leaderboard: boolean;
  counts: {
    completed: number;
    badges: number;
    following: number;
    followers: number;
  };
  is_following: boolean;
  is_following_as_instructor?: boolean;
  instructor_follower_count?: number;
  is_self: boolean;
};

export type FollowLists = {
  following: PublicUser[];
  followers: PublicUser[];
  counts: { following: number; followers: number };
};

export type FeedReactionKind = "high_five" | "clap" | "dancer" | "yeehaw" | "heart";

export type FeedReactionMeta = {
  kind: FeedReactionKind;
  emoji: string;
  label: string;
};

export type FeedReactor = {
  user_id: string;
  name: string;
  picture: string;
  is_instructor: boolean;
  kind: FeedReactionKind;
  emoji: string;
  created_at: string;
};

export type FeedReactions = {
  counts: Partial<Record<FeedReactionKind, number>>;
  mine: FeedReactionKind[];
};

export type FeedEvent =
  | {
      id: string;
      type: "completion";
      user: {
        user_id: string;
        name: string;
        picture: string;
        is_instructor?: boolean;
      };
      created_at: string;
      reactions?: FeedReactions;
      dance: {
        id: string;
        name: string;
        choreographer: string;
        difficulty: string;
        bpm?: number | null;
      };
    }
  | {
      id: string;
      type: "badge";
      user: {
        user_id: string;
        name: string;
        picture: string;
        is_instructor?: boolean;
      };
      created_at: string;
      reactions?: FeedReactions;
      badge: {
        id: string;
        title: string;
        description: string;
        icon: string;
        color: string;
      };
    }
  | {
      id: string;
      type: "streak_milestone";
      user: {
        user_id: string;
        name: string;
        picture: string;
        is_instructor?: boolean;
      };
      created_at: string;
      reactions?: FeedReactions;
      days: number;
    };

// ---------------- Events (workshops / socials / classes discovery) ----------------
export type EventType = "class" | "workshop" | "social" | "private_party";

export type EventItem = {
  id: string;
  kind: "event" | "class";
  name: string;
  description?: string;
  event_type: EventType | string;
  skill_level?: string;
  date: string;             // YYYY-MM-DD (start / single-day)
  end_date?: string;        // YYYY-MM-DD (multi-day workshops)
  start_time?: string;
  end_time?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  display_name?: string;
  cover_image?: string;
  price?: string;
  registration_url?: string;
  max_attendees?: number | null;
  is_published?: boolean;
  instructor_id?: string;
  instructor_name?: string;
  distance_miles?: number;  // populated only when the search was geo
};

export type EventSearchResult = {
  events: EventItem[];
  classes: EventItem[];
  count: number;
};

export type EventTypesCatalog = {
  types: string[];
  skill_levels: string[];
};

// ---------------- Admin: Feed Moderation ----------------
export type AdminFeedReport = {
  report_id: string;      // "reporter_id:event_id"
  reporter_id: string;
  reporter_name: string;
  event_id: string;
  reported_user_id: string;
  reported_user_name: string;
  reason: string;
  note: string;
  status: "open" | "resolved" | "actioned" | "dismissed";
  event_exists: boolean;
  event_snippet?: string;
  created_at: string;
  updated_at?: string;
  resolution_note?: string;
  resolved_by?: string;
  resolved_at?: string;
};

export type EventInput = {
  name: string;
  description?: string;
  event_type: EventType | string;
  skill_level?: string;
  date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  venue_name?: string;
  address: string;
  city: string;
  state?: string;
  zip_code?: string;
  country?: string;
  cover_image?: string;
  price?: string;
  registration_url?: string;
  max_attendees?: number | null;
  is_published?: boolean;
};

export type EventSearchQuery = {
  q?: string;
  types?: string[];        // ["workshop","social"]
  levels?: string[];       // ["Improver","Intermediate"]
  date_from?: string;
  date_to?: string;
  city?: string;
  near_lat?: number;
  near_lng?: number;
  radius_miles?: number;
  instructor?: string;
  include_classes?: boolean;
  limit?: number;
};

export type CertificateTheme = {
  key: string;
  label: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    ink: string;
  };
};

export type LeaderboardRange = "all" | "week" | "month";
export type LeaderboardEntry = {
  rank: number;
  // NOTE: `user_id` is intentionally NOT returned by the public endpoint —
  // only the caller's `is_you` flag exposes identity for highlighting.
  is_you?: boolean;
  name: string;
  picture: string;
  count: number;
  last_completed_at: string;
  is_instructor: boolean;
};
export type LeaderboardResponse = {
  range: LeaderboardRange;
  limit: number;
  total_visible: number;
  total_dancers: number;
  entries: LeaderboardEntry[];
  me: {
    rank: number | null;
    count: number;
    opted_in: boolean;
    in_top: boolean;
  } | null;
};

export type LeaderboardPrize = {
  range: LeaderboardRange;
  rank: 1 | 2 | 3;
  title: string;
  description: string;
  image: string;
  updated_at?: string;
};

// ---------------- Instructor Dashboard ----------------
export type DashboardOverview = {
  total_students: number;
  students_last_7d_active: number;
  classes_last_30d: number;
  completions_all_time: number;
  completions_last_7d: number;
  attendance_records: number;
};
export type DashboardTopDance = {
  dance_id: string;
  name: string;
  choreographer: string;
  difficulty: string;
  bpm: number | null;
  completions: number;
};
export type DashboardStudent = {
  user_id: string;
  name: string;
  picture: string;
  email?: string; // admin only
  is_instructor: boolean;
  completed_count: number;
  wishlist_count: number;
  attendance_count: number;
  last_completed_at: string;
  last_class_date: string;
  last_active_at: string;
  joined_at: string;
};
export type DashboardRecentClass = {
  id: string;
  date: string;
  label: string;
  dance_count: number;
  attendee_count: number;
};
export type InstructorDashboard = {
  as_admin: boolean;
  overview: DashboardOverview;
  top_dances: DashboardTopDance[];
  students: DashboardStudent[];
  recent_classes: DashboardRecentClass[];
};

export type TrendWeek = {
  week_start: string;
  attendance: number;
  completions: number;
  classes: number;
};
export type InstructorTrend = {
  weeks: TrendWeek[];
  totals: { attendance: number; completions: number; classes: number };
  peaks: { attendance: number; completions: number };
};

export type Dance = {
  id: string;
  name: string;
  choreographer: string;
  choreographer_country?: string;
  /** Co-choreographers preserved from multi-name credit strings
   *  (e.g. "Alice & Bob" → main=Alice, co=[Bob]) or from
   *  BootStepper's structured ``danceChoreographers[]`` list. Only
   *  the MAIN choreographer gets a library entry — co members
   *  surface exclusively on the individual dance page. Always
   *  present (empty list for solo dances). */
  co_choreographers?: string[];
  song: string;
  artist: string;
  difficulty: string;
  bpm?: number | null;
  count?: string;
  youtube_url?: string;
  step_sheet?: string;
  step_sheet_image?: string;
  copperknob_url?: string;
  bootstepper_url?: string;
  /** CopperKnob stable reference (e.g. ``XCZW7BV``). Present when the
   *  dance was imported from — or manually linked to — a CopperKnob
   *  record. Powers duplicate detection + the admin refresh flow. */
  copperknob_ref?: string;
  /** BootStepper stable reference (e.g. ``D36J5F44H3GB38N``). Coexists
   *  with ``copperknob_ref`` — a single dance may carry BOTH provider
   *  references at once. */
  bootstepper_ref?: string;
  description?: string;
  tags?: string[];
  is_published?: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
};

export type CopperKnobResult = {
  ref: string;
  title: string;
  choreographer: string;
  count: string;
  wall: string;
  level: string;
  music: string;
  song: string;
  artist: string;
  url: string;
  /** Present when this CopperKnob record is already listed in our
   *  Dance Library. Used to swap the "Add" button for "View Dance". */
  existing_dance?: {
    id: string;
    name: string;
    difficulty?: string;
    has_copperknob_ref?: boolean;
    has_bootstepper_ref?: boolean;
  } | null;
};

export type BootStepperResult = {
  /** BootStepper's opaque stable ID (e.g. ``D36J5F44H3GB38N``). */
  id: string;
  /** Duplicate of ``id`` — retained so shared code paths that
   *  originally treated CopperKnob's ``ref`` as the canonical key
   *  keep working without special-casing.  Always equals ``id``. */
  ref: string;
  title: string;
  choreographer: string;
  choreographer_country: string;
  count: string;
  wall: string;
  level: string;
  music: string;
  song: string;
  artist: string;
  url: string;
  video_count?: number;
  tags_count?: number;
  restarts?: number;
  /** Present when this BootStepper record is already listed in our
   *  Dance Library. ``has_copperknob_ref`` lets us surface hints
   *  like "Already in Library · also on CopperKnob". */
  existing_dance?: {
    id: string;
    name: string;
    difficulty?: string;
    has_copperknob_ref?: boolean;
    has_bootstepper_ref?: boolean;
  } | null;
};

/**
 * Unified result from the merged external search — coalesces
 * CopperKnob + BootStepper records that describe the same dance
 * into ONE row. ``sources`` tells the UI which provider chips to
 * render, and the per-provider ref/URL is preserved so a downstream
 * import knows which endpoint to hit.
 */
export type MergedExternalResult = {
  title: string;
  choreographer: string;
  choreographer_country: string;
  count: string;
  wall: string;
  level: string;
  music: string;
  song: string;
  artist: string;
  copperknob: { ref: string; url: string };
  bootstepper: { id: string; url: string };
  sources: ("copperknob" | "bootstepper")[];
  existing_dance?: {
    id: string;
    name: string;
    difficulty?: string;
    has_copperknob_ref?: boolean;
    has_bootstepper_ref?: boolean;
  } | null;
};

export type BulkImportEntry = {
  source: "copperknob" | "bootstepper";
  ref: string;
  is_published?: boolean;
};

export type BulkImportPreviewRow = {
  source: "copperknob" | "bootstepper";
  ref: string;
  status: "ready" | "skipped_duplicate" | "error";
  title?: string;
  choreographer?: string;
  level?: string;
  count?: string;
  wall?: string;
  existing_dance_id?: string;
  existing_dance_name?: string;
  error?: string;
};

export type BulkImportPreviewResponse = {
  total: number;
  ready_to_import: number;
  already_in_library: number;
  errors: number;
  resolved: BulkImportPreviewRow[];
};

export type BulkImportRow = {
  source: "copperknob" | "bootstepper";
  ref: string;
  status: "imported" | "skipped_duplicate" | "error";
  dance_id?: string;
  dance_name?: string;
  is_published?: boolean;
  existing_dance_id?: string;
  existing_dance_name?: string;
  error?: string;
  has_copperknob_ref?: boolean;
  has_bootstepper_ref?: boolean;
};

export type BulkImportResponse = {
  imported: number;
  skipped_duplicates: number;
  errors: number;
  total: number;
  results: BulkImportRow[];
};

export type ChoreographerFollowRow = {
  choreographer: string;
  choreographer_key: string;
  dance_count: number;
  latest_dance_id: string;
  latest_dance_name: string;
  latest_dance_at: string;
  created_at?: string;
  is_following?: boolean;
};

export type ChoreographerDetail = {
  choreographer: string;
  choreographer_key: string;
  dance_count: number;
  follower_count: number;
  is_following: boolean;
  dances: Array<{
    id: string;
    name: string;
    choreographer: string;
    song: string;
    artist: string;
    difficulty: string;
    bpm?: number | null;
    count?: string;
    created_at: string;
  }>;
};

/** Response for the co-choreographer discovery popup. Co-only
 *  people never get a full library page (that would defeat the
 *  "solo choreographers only" grouping) — the dance page fires
 *  this endpoint to power a small popup listing every LOCAL dance
 *  where they appear as either the main artist or a collaborator. */
export type CoChoreographerDances = {
  choreographer: string;
  dance_count: number;
  dances: Array<{
    id: string;
    name: string;
    choreographer: string;
    co_choreographers?: string[];
    song: string;
    artist: string;
    difficulty: string;
    bpm?: number | null;
    count?: string;
    created_at: string;
  }>;
};

export type NotificationPrefs = {
  class_alerts: boolean;
  event_alerts: boolean;
  choreographer_alerts: boolean;
  mention_alerts: boolean;
  reminder_alerts: boolean;
  chat_alerts: boolean;
  // June 2026 — admin & broadcast categories.
  admin_requests: boolean;
  announcements: boolean;
  library_updates: boolean;
  // October 2026 — Monday-morning weekly digest email.
  weekly_digest: boolean;
  quiet_hours: {
    enabled: boolean;
    start_hour: number;   // 0-23 inclusive
    end_hour: number;     // 0-23 exclusive; may wrap past midnight
    tz_offset_minutes: number;
  };
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  scheduled_for?: string | null;   // ISO datetime (UTC) or null = immediate
  broadcasted_at?: string | null;  // ISO datetime (UTC) or null = scheduled draft
  audience?: AnnouncementAudience | null;
};

// Audience filter for an announcement broadcast.
// scope=everyone  → no filter, full fan-out (default when omitted).
// scope=custom    → optional filter on instructor-followers and/or
//                   difficulty-tier. If both are set, intersection.
export type AnnouncementAudience = {
  scope: "everyone" | "custom";
  instructor_user_ids?: string[];
  difficulty_tiers?: string[];
};

export type InstructorPickerItem = {
  user_id: string;
  name: string;
  picture: string;
};

// --- Notification Center ---
export type NotificationEvent = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  deeplink: string;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

// --- Dance Of The Day ---
export type DanceOfTheDay = {
  dance: {
    id: string;
    name: string;
    choreographer: string;
    co_choreographers?: string[];
    difficulty: string;
    song?: string;
    artist?: string;
    bpm?: number | null;
    tags?: string[];
  } | null;
  source: "cached" | "unpracticed" | "caught_up" | null;
};

export type DotdStreak = {
  current: number;
  longest: number;
  today_done: boolean;
  // ISO date (YYYY-MM-DD) of the most recent credited open, or null
  // when the dancer has never opened a DOTD. Added 2026-10-05 for the
  // Streak Save Home nudge card.
  last_day?: string | null;
  // True when the dancer has a streak worth saving AND they haven't
  // opened today yet AND their last open was exactly yesterday — i.e.
  // the "save-your-streak day". Home watches this to decide whether
  // to render the StreakSaveCard nudge.
  at_risk?: boolean;
  // How many calendar days remain before the stored streak would
  // reset on next open. 1 on the save-your-streak day; 0 otherwise.
  grace_days?: number;
};

export type DotdOpenResponse = {
  streak: DotdStreak;
  newly_earned: {
    badge_id: string;
    title?: string;
    description?: string;
    icon?: string;
    color?: string;
  }[];
  dance_matches: boolean;
};

// Followed-Instructor Hub — upcoming classes + events from the
// instructors the caller follows (via `users.instructor_ids`).
export type FollowedUpcomingItem = {
  kind: "class" | "event";
  id: string;
  instructor_id: string;
  instructor_name: string;
  title: string;
  date: string;         // YYYY-MM-DD
  start_time: string;   // "HH:MM" (events) or "" (classes)
  venue_name: string;
  city: string;
  dance_count: number;  // classes only
  deeplink: string;     // "/classes" or "/events/{id}"
};

export type FollowedUpcomingResponse = {
  items: FollowedUpcomingItem[];
  total: number;
  has_follows: boolean;
  today: string;
};

export type RsvpCounts = {
  going: number;
  maybe: number;
  declined: number;
};

export type RefreshRecommendationFlag = {
  dance_id: string;
  source: "copperknob" | "bootstepper";
  differs_count: number;
  drift_summary: string;
  fields: Array<{ field: string; ours: string; theirs: string }>;
  checked_at: string;
  seen: boolean;
  dance_name: string;
  dance_choreographer: string;
  dance_difficulty: string;
  dance_exists: boolean;
};

export type ChatMention = {
  mention_id: string;
  mentioned_user_id: string;
  mentioner_id: string;
  mentioner_name: string;
  message_id: string;
  message_text_snippet: string;
  seen: boolean;
  created_at: string;
};

export type ChatLinkPreview = {
  url: string;
  kind: "youtube" | "bootstepper" | "copperknob";
  title: string;
  subtitle: string;
  thumbnail: string;
  meta: string;
};

export type ChatMessageParent = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
  reactions?: {
    counts: Record<string, number>;
    mine: string[];
  };
  parent_id?: string;
  parent?: ChatMessageParent;
  link_previews?: ChatLinkPreview[];
};

export type ChatReadRow = {
  user_id: string;
  user_name: string;
  picture: string;
  last_read_at: string;
};

export type ClassSession = {
  id: string;
  date: string;
  session_label: string;
  notes: string;
  instructor_id: string;
  instructor_name: string;
  dance_ids: string[];
  dances: { id: string; name: string; difficulty: string }[];
  flyer_image?: string;
  created_at: string;
};

export type Suggestion = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  dance_name: string;
  song: string;
  artist: string;
  difficulty: string;
  youtube_url: string;
  step_sheet_url?: string;
  step_sheet_image?: string;
  notes: string;
  status: string;
  target_instructor_id?: string;
  target_instructor_name?: string;
  created_at: string;
};

// A user-submitted dance awaiting admin approval. Sourced from
// CopperKnob or BootStepper metadata only (no step sheet content).
export type PendingDance = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  source: "copperknob" | "bootstepper";
  ref: string;
  title: string;
  choreographer: string;
  choreographer_country?: string;
  song: string;
  artist: string;
  music?: string;
  level?: string;
  count?: string;
  wall?: string;
  url: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  rejection_reason?: string | null;
  approved_dance_id?: string | null;
};

// A user-generated content report — Apple UGC 1.2. Sourced from
// /moderation/reports (user POST) and rendered in the unified admin
// moderation queue.
export type ModerationReport = {
  id: string;
  target_type: "feed" | "chat" | "profile" | "comment" | "dance" | "event";
  target_id: string;
  target_user_id?: string | null;
  reporter_id: string;
  reporter_email: string;
  reporter_name: string;
  reason: string;
  note?: string;
  content_snapshot?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed" | "actioned";
  reported_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  admin_note?: string;
  content_removed?: boolean;
  moderation_action?: string;
  elapsed_seconds?: number;
};

// Any admin action taken against a user account.
export type ModerationAction = {
  id: string;
  user_id: string;
  action: string;
  duration_hours: number;
  reason: string;
  at: string;
  by: string;
  by_name: string;
};

async function req<T>(
  path: string,
  opts: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Auto-tag every request with the running app version / OTA
    // update ID / channel — lets admins trace a bug report back to
    // the exact bundle the dancer was on.
    ...diagnosticsHeaders(),
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new ApiError(
      errorMessage(data, res.status),
      res.status,
      data?.code ?? data?.detail?.code,
      data,
    );
  }
  return data as T;
}

/** Server-driven app version policy (Admin → App Version). */
export type VersionPolicy = {
  min_version: string;
  latest_version: string;
  ios_url: string;
  android_url: string;
  updated_at?: string | null;
  updated_by_email?: string | null;
};

/** Error thrown by every API call. ``message`` is always human-readable
 *  (raw backend JSON is never surfaced); ``code`` carries the backend's
 *  machine-readable reason (e.g. ``terms_not_accepted``) when present. */
export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function errorMessage(data: any, status: number): string {
  const d = data?.detail ?? data?.message ?? data;
  if (typeof d === "string" && d.trim() && !d.trim().startsWith("<")) return d;
  // FastAPI validation errors: [{ loc, msg, type }, ...]
  if (Array.isArray(d) && typeof d[0]?.msg === "string") {
    return d[0].msg.replace(/^Value error,\s*/i, "");
  }
  if (d && typeof d === "object" && typeof d.message === "string") return d.message;
  return `Something went wrong (error ${status}). Please try again.`;
}

export const api = {
  register: (
    email: string,
    password: string,
    name: string,
    instructor_code: string | undefined,
    accepted_terms_version: string,
  ) =>
    req<{ token: string; user: User; is_new_user?: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        name,
        instructor_code,
        accepted_terms_version,
      }),
    }),
  getTermsVersion: () =>
    req<{ required_version: string }>("/legal/terms-version"),
  login: (email: string, password: string) =>
    req<{ token: string; user: User; is_new_user?: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleSession: (session_id: string) =>
    req<{ token: string; user: User; is_new_user?: boolean }>("/auth/google-session", {
      method: "POST",
      body: JSON.stringify({ session_id }),
    }),
  appleSignIn: (
    identity_token: string,
    full_name?: string,
    email?: string,
    authorization_code?: string,
  ) =>
    req<{ token: string; user: User; is_new_user?: boolean }>(
      "/auth/apple",
      {
        method: "POST",
        body: JSON.stringify({
          identity_token,
          full_name: full_name || null,
          email: email || null,
          authorization_code: authorization_code || null,
        }),
      },
    ),
  linkApple: (
    token: string,
    identity_token: string,
    authorization_code?: string,
  ) =>
    req<{ ok: boolean; user: User }>(
      "/auth/apple/link",
      {
        method: "POST",
        body: JSON.stringify({
          identity_token,
          authorization_code: authorization_code || null,
        }),
      },
      token,
    ),
  unlinkApple: (token: string) =>
    req<{ ok: boolean; user: User }>(
      "/auth/apple/unlink",
      { method: "POST" },
      token,
    ),

  // ---------------- Instructors picker ----------------
  listInstructors: (
    token: string,
    opts?: { q?: string; city?: string }
  ) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (opts?.city) params.set("city", opts.city);
    const qs = params.toString();
    return req<{
      instructors: {
        user_id: string;
        name: string;
        picture: string;
        city: string;
        state: string;
      }[];
    }>(`/instructors${qs ? `?${qs}` : ""}`, {}, token);
  },
  setMainInstructor: (token: string, instructor_id: string) =>
    req<{
      ok: boolean;
      main_instructor_id: string;
      main_instructor_name: string;
    }>(
      "/auth/me/main-instructor",
      { method: "PATCH", body: JSON.stringify({ instructor_id }) },
      token,
    ),
  clearMainInstructor: (token: string) =>
    req<{ ok: boolean }>(
      "/auth/me/main-instructor",
      { method: "DELETE" },
      token,
    ),
  saveInstructors: (
    token: string,
    body: {
      instructor_ids: string[];
      main_instructor_id?: string;
      follow?: boolean;
    }
  ) =>
    req<{ ok: boolean; user: User; new_follows: number }>(
      "/auth/me/instructors",
      {
        method: "PUT",
        body: JSON.stringify({
          instructor_ids: body.instructor_ids,
          main_instructor_id: body.main_instructor_id,
          follow: body.follow ?? true,
        }),
      },
      token,
    ),
  me: (token: string) => req<User>("/auth/me", {}, token),
  setPreferredLanguage: (language: string, token: string) =>
    req<{ ok: boolean; user: User }>(
      "/auth/me/language",
      { method: "PATCH", body: JSON.stringify({ language }) },
      token,
    ),
  setInstructor: (instructor_code: string, token: string) =>
    req<{ ok: boolean; user: User }>(
      "/auth/set-instructor",
      { method: "POST", body: JSON.stringify({ instructor_code }) },
      token,
    ),
  logout: (token: string) =>
    req<{ ok: boolean }>("/auth/logout", { method: "POST" }, token),
  deleteAccount: (token: string) =>
    req<{ ok: boolean; message: string }>("/auth/me", { method: "DELETE" }, token),

  // ---------------- Leaderboard ----------------
  getLeaderboard: (range: LeaderboardRange = "all", limit: number = 20, token?: string) =>
    req<LeaderboardResponse>(
      `/leaderboard?range=${range}&limit=${limit}`,
      {},
      token,
    ),
  toggleLeaderboard: (show_on_leaderboard: boolean, token: string) =>
    req<{ ok: boolean; user: User }>(
      "/users/me/leaderboard",
      {
        method: "PATCH",
        body: JSON.stringify({ show_on_leaderboard }),
      },
      token,
    ),

  // ---------------- Certificate themes ----------------
  listCertificateThemes: () =>
    req<{ themes: CertificateTheme[]; default: string }>("/certificate-themes"),
  setCertificateTheme: (theme: string, token: string) =>
    req<{ ok: boolean; theme: string }>(
      "/users/me/certificate-theme",
      { method: "PATCH", body: JSON.stringify({ theme }) },
      token,
    ),

  // ---------------- Badges & Streak ----------------
  getBadges: (token: string) =>
    req<BadgesResponse>("/badges", {}, token),
  markBadgesSeen: (token: string, ids?: string[]) =>
    req<{ ok: boolean; updated: number }>(
      "/badges/mark-seen",
      { method: "POST", body: JSON.stringify({ ids: ids || null }) },
      token
    ),
  getStreak: (token: string) => req<Streak>("/streak", {}, token),

  // ---------------- Feedback ----------------
  submitFeedback: (
    token: string,
    body: {
      message: string;
      category?: "bug" | "feature_request" | "content_error" | "instructor_help" | "other";
      screen?: string;
      context?: Record<string, unknown>;
    }
  ) =>
    req<{ ok: boolean; feedback: any }>(
      "/feedback",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  listFeedback: (
    token: string,
    opts?: { status?: string; category?: string; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.category) params.set("category", opts.category);
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    const qs = params.toString();
    return req<{ items: any[]; counts: Record<string, number>; total_returned: number }>(
      `/admin/feedback${qs ? `?${qs}` : ""}`,
      {},
      token
    );
  },
  patchFeedback: (
    token: string,
    id: string,
    body: { status?: "open" | "in_progress" | "resolved" | "wontfix"; admin_note?: string }
  ) =>
    req<{ ok: boolean; feedback: any }>(
      `/admin/feedback/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
      token
    ),

  // ---------------- Practice history ----------------
  getPracticeHistory: (token: string, days = 30) =>
    req<PracticeHistoryResponse>(`/practice-history?days=${days}`, {}, token),

  // ---------------- Weekly Recap ----------------
  getWeeklyRecap: (token: string) =>
    req<WeeklyRecap>("/weekly-recap", {}, token),

  // ---------------- Social ----------------
  getMyFollows: (token: string) =>
    req<FollowLists>("/follows/me", {}, token),
  followUser: (token: string, userId: string) =>
    req<{
      ok: boolean;
      created: boolean;
      is_following: boolean;
      target_followers: number;
    }>(`/follows/${userId}`, { method: "POST" }, token),
  unfollowUser: (token: string, userId: string) =>
    req<{
      ok: boolean;
      removed: boolean;
      is_following: boolean;
      target_followers: number;
    }>(`/follows/${userId}`, { method: "DELETE" }, token),
  searchUsers: (token: string, q: string, limit = 20) =>
    req<{ users: PublicUser[] }>(
      `/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {},
      token
    ),
  getPublicProfile: (token: string, userId: string) =>
    req<PublicProfile>(`/users/${userId}`, {}, token),
  getFeed: (token: string, limit = 30, includeSelf = true) =>
    req<{ events: FeedEvent[]; count: number }>(
      `/feed?limit=${limit}&include_self=${includeSelf}`,
      {},
      token
    ),
  setActivityOptIn: (token: string, showInFeed: boolean) =>
    req<{ ok: boolean; show_in_activity_feed: boolean }>(
      "/auth/me/activity-opt-in",
      {
        method: "PATCH",
        body: JSON.stringify({ show_in_activity_feed: showInFeed }),
      },
      token
    ),
  getReactionKinds: (token: string) =>
    req<{ kinds: FeedReactionMeta[] }>("/feed/reaction-kinds", {}, token),
  addFeedReaction: (
    token: string,
    eventId: string,
    kind: FeedReactionKind
  ) =>
    req<{ ok: boolean; created: boolean; reactions: FeedReactions }>(
      `/feed/${encodeURIComponent(eventId)}/reactions/${kind}`,
      { method: "POST" },
      token
    ),
  removeFeedReaction: (
    token: string,
    eventId: string,
    kind: FeedReactionKind
  ) =>
    req<{ ok: boolean; removed: boolean; reactions: FeedReactions }>(
      `/feed/${encodeURIComponent(eventId)}/reactions/${kind}`,
      { method: "DELETE" },
      token
    ),
  getFeedReactors: (
    token: string,
    eventId: string,
    opts?: { kind?: FeedReactionKind; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (opts?.kind) params.set("kind", opts.kind);
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    const qs = params.toString();
    return req<{
      event_id: string;
      kind: FeedReactionKind | null;
      reactors: FeedReactor[];
      count: number;
    }>(
      `/feed/${encodeURIComponent(eventId)}/reactors${qs ? `?${qs}` : ""}`,
      {},
      token
    );
  },
  getReportReasons: (token: string) =>
    req<{ reasons: { reason: string; label: string }[] }>(
      "/feed/report-reasons",
      {},
      token
    ),
  reportFeedEvent: (
    token: string,
    eventId: string,
    reason: string,
    note?: string
  ) =>
    req<{ ok: boolean; created: boolean; ref?: string }>(
      `/feed/${encodeURIComponent(eventId)}/report`,
      {
        method: "POST",
        body: JSON.stringify({ reason, note: note || "" }),
      },
      token
    ),

  // ---------------- Events (workshops / socials / classes discovery) ----------------
  getEventTypesCatalog: (token: string) =>
    req<EventTypesCatalog>("/events/types", {}, token),
  searchEvents: (token: string, q: EventSearchQuery) => {
    const params = new URLSearchParams();
    if (q.q) params.set("q", q.q);
    if (q.types?.length) params.set("type", q.types.join(","));
    if (q.levels?.length) params.set("level", q.levels.join(","));
    if (q.date_from) params.set("date_from", q.date_from);
    if (q.date_to) params.set("date_to", q.date_to);
    if (q.city) params.set("city", q.city);
    if (typeof q.near_lat === "number" && typeof q.near_lng === "number") {
      params.set("near_lat", String(q.near_lat));
      params.set("near_lng", String(q.near_lng));
    }
    if (typeof q.radius_miles === "number") params.set("radius_miles", String(q.radius_miles));
    if (q.instructor) params.set("instructor", q.instructor);
    if (typeof q.include_classes === "boolean")
      params.set("include_classes", String(q.include_classes));
    if (typeof q.limit === "number") params.set("limit", String(q.limit));
    return req<EventSearchResult>(`/events/search?${params.toString()}`, {}, token);
  },
  getEvent: (token: string, eventId: string) =>
    req<EventItem>(`/events/${eventId}`, {}, token),
  getMyEvents: (token: string) =>
    req<{ events: EventItem[] }>("/events/mine", {}, token),
  createEvent: (token: string, body: EventInput) =>
    req<EventItem>(
      "/events",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  updateEvent: (token: string, eventId: string, body: EventInput) =>
    req<EventItem>(
      `/events/${eventId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      token
    ),
  deleteEvent: (token: string, eventId: string) =>
    req<{ ok: boolean }>(`/events/${eventId}`, { method: "DELETE" }, token),
  geocodeEventAddress: (
    token: string,
    body: {
      address: string;
      city: string;
      state?: string;
      zip_code?: string;
      country?: string;
    }
  ) =>
    req<{ lat: number; lng: number; display_name: string }>(
      "/events/geocode",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),

  // ---------------- Admin: Feed Moderation ----------------
  getAdminFeedReports: (
    token: string,
    opts?: { status?: string; limit?: number }
  ) => {
    const status = opts?.status || "open";
    const limit = opts?.limit || 50;
    return req<{ reports: AdminFeedReport[] }>(
      `/admin/feed/reports?status=${encodeURIComponent(status)}&limit=${limit}`,
      {},
      token
    );
  },
  updateAdminFeedReport: (
    token: string,
    reportId: string,
    status: "open" | "resolved" | "actioned" | "dismissed",
    resolution_note: string = ""
  ) =>
    req<{ ok: boolean }>(
      `/admin/feed/reports/${encodeURIComponent(reportId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, resolution_note }),
      },
      token
    ),
  adminDeleteFeedEvent: (token: string, eventId: string) =>
    req<{ ok: boolean }>(
      `/admin/feed/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Instructor Dashboard ----------------
  getInstructorDashboard: (token: string) =>
    req<InstructorDashboard>("/instructor/dashboard", {}, token),
  getInstructorTrend: (token: string, weeks = 8) =>
    req<InstructorTrend>(`/instructor/trend?weeks=${weeks}`, {}, token),
  forgotPassword: (email: string) =>
    req<{ ok: boolean; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    req<{ ok: boolean; message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),

  listDances: (q?: string, difficulty?: string, scope?: "public" | "mine" | "all", token?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (difficulty && difficulty !== "All") params.set("difficulty", difficulty);
    if (scope) params.set("scope", scope);
    const qs = params.toString();
    return req<Dance[]>(`/dances${qs ? `?${qs}` : ""}`, {}, token);
  },
  getDance: (id: string) => req<Dance>(`/dances/${id}`),
  createDance: (body: Partial<Dance>, token: string) =>
    req<Dance>("/dances", { method: "POST", body: JSON.stringify(body) }, token),
  updateDance: (id: string, body: Partial<Dance>, token: string) =>
    req<Dance>(`/dances/${id}`, { method: "PUT", body: JSON.stringify(body) }, token),

  // Restore-deleted-dance flow (whitelist editors + admins only)
  listRemovedDances: (token: string) =>
    req<Array<Omit<Dance, "step_sheet" | "step_sheet_image">>>(
      "/dances/removed",
      {},
      token
    ),
  restoreDanceByName: (name: string, token: string) =>
    req<Dance>(
      "/dances/restore-by-name",
      { method: "POST", body: JSON.stringify({ name }) },
      token
    ),
  dismissRemovedDance: (name: string, token: string) =>
    req<{ ok: boolean; name: string }>(
      "/dances/removed/dismiss",
      { method: "POST", body: JSON.stringify({ name }) },
      token
    ),
  restoreDancesBulk: (names: string[], token: string) =>
    req<{ restored: string[]; skipped: string[] }>(
      "/dances/restore-bulk",
      { method: "POST", body: JSON.stringify({ names }) },
      token
    ),
  dismissRemovedDancesBulk: (names: string[], token: string) =>
    req<{ removed: string[]; skipped: string[] }>(
      "/dances/removed/dismiss-bulk",
      { method: "POST", body: JSON.stringify({ names }) },
      token
    ),
  undoRemovedDances: (names: string[], token: string) =>
    req<{ undone: number }>(
      "/dances/removed/undo",
      { method: "POST", body: JSON.stringify({ names }) },
      token
    ),
  getVersionPolicy: () => req<VersionPolicy>("/app/version-policy"),
  adminGetVersionPolicy: (token: string) =>
    req<VersionPolicy>("/admin/app-version", {}, token),
  adminSetVersionPolicy: (
    body: Pick<VersionPolicy, "min_version" | "latest_version" | "ios_url" | "android_url">,
    token: string
  ) =>
    req<VersionPolicy>(
      "/admin/app-version",
      { method: "PUT", body: JSON.stringify(body) },
      token
    ),
  publishDance: (id: string, token: string) =>
    req<Dance>(`/dances/${id}/publish`, { method: "PUT" }, token),
  unpublishDance: (id: string, token: string) =>
    req<Dance>(`/dances/${id}/unpublish`, { method: "PUT" }, token),
  importDances: (
    body: {
      dances: Array<{
        name: string;
        choreographer?: string;
        song?: string;
        artist?: string;
        difficulty?: string;
        bpm?: number;
        count?: string;
        youtube_url?: string;
        step_sheet?: string;
      }>;
      publish_all: boolean;
    },
    token: string
  ) =>
    req<{ imported: number; skipped_duplicates: number; errors: { row: number; reason: string }[] }>(
      "/dances/import",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),

  myTracking: (token: string) => req<Tracking[]>("/tracking/me", {}, token),
  saveTracking: (
    dance_id: string,
    body: { status: string; rating?: number; notes?: string },
    token: string
  ) =>
    req<Tracking>(
      `/tracking/${dance_id}`,
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  removeTracking: (dance_id: string, token: string) =>
    req<{ ok: boolean }>(`/tracking/${dance_id}`, { method: "DELETE" }, token),

  venue: () => req<any>("/venue"),

  submitSuggestion: (
    body: {
      dance_name: string;
      song?: string;
      artist?: string;
      difficulty?: string;
      youtube_url?: string;
      step_sheet_url?: string;
      step_sheet_image?: string;
      notes?: string;
      target_instructor_id?: string;
    },
    token: string
  ) =>
    req<Suggestion>("/suggestions", { method: "POST", body: JSON.stringify(body) }, token),
  mySuggestions: (token: string) => req<Suggestion[]>("/suggestions/mine", {}, token),
  allSuggestions: (token: string) => req<Suggestion[]>("/suggestions", {}, token),
  suggestionsForInstructor: (token: string) =>
    req<Suggestion[]>("/suggestions/for-instructor", {}, token),
  updateSuggestionStatus: (id: string, status: string, token: string) =>
    req<Suggestion>(
      `/suggestions/${id}/status?status=${encodeURIComponent(status)}`,
      { method: "PUT" },
      token
    ),
  deleteSuggestion: (id: string, token: string) =>
    req<{ ok: boolean }>(`/suggestions/${id}`, { method: "DELETE" }, token),

  listClasses: (
    scope: "all" | "upcoming" | "past" = "all",
    limit = 100,
    dateFromLocal?: string,
  ) => {
    // Pass the client's LOCAL calendar day as ``date_from`` so an
    // instructor in Arizona posting a class dated "today" still sees
    // it in "upcoming" between local 5pm and midnight — see
    // ``src/utils/date.ts`` for the reasoning.
    const params = new URLSearchParams({
      scope,
      limit: String(limit),
    });
    if (dateFromLocal) params.set("date_from", dateFromLocal);
    return req<ClassSession[]>(`/classes?${params.toString()}`);
  },
  getClass: (id: string) => req<ClassSession>(`/classes/${id}`),
  createClass: (
    body: {
      date: string;
      session_label?: string;
      dance_ids: string[];
      notes?: string;
      flyer_image?: string;
    },
    token: string
  ) =>
    req<ClassSession>("/classes", { method: "POST", body: JSON.stringify(body) }, token),
  updateClass: (
    id: string,
    body: {
      date: string;
      session_label?: string;
      dance_ids: string[];
      notes?: string;
      flyer_image?: string;
    },
    token: string
  ) =>
    req<ClassSession>(`/classes/${id}`, { method: "PUT", body: JSON.stringify(body) }, token),
  deleteClass: (id: string, token: string) =>
    req<{ ok: boolean }>(`/classes/${id}`, { method: "DELETE" }, token),

  attend: (classId: string, token: string) =>
    req<{ ok: boolean; attended: boolean }>(
      `/classes/${classId}/attend`,
      { method: "POST" },
      token
    ),
  unattend: (classId: string, token: string) =>
    req<{ ok: boolean; attended: boolean }>(
      `/classes/${classId}/attend`,
      { method: "DELETE" },
      token
    ),
  myAttendance: (token: string) =>
    req<{ class_ids: string[]; classes: ClassSession[] }>(
      "/attendance/me",
      {},
      token
    ),

  listChat: (token: string) => req<ChatMessage[]>("/chat/messages", {}, token),
  postChat: (message: string, token: string, parent_id?: string) =>
    req<ChatMessage & { mentioned_user_ids?: string[] }>(
      "/chat/messages",
      {
        method: "POST",
        body: JSON.stringify(parent_id ? { message, parent_id } : { message }),
      },
      token
    ),
  deleteChat: (id: string, token: string) =>
    req<{ ok: boolean }>(`/chat/messages/${id}`, { method: "DELETE" }, token),

  // ---------------- Chat read receipts ----------------
  getChatReads: (token: string) =>
    req<{ reads: ChatReadRow[]; count: number }>("/chat/reads", {}, token),
  markChatRead: (token: string, at?: string) =>
    req<{ ok: boolean; last_read_at: string }>(
      "/chat/mark-read",
      { method: "POST", body: JSON.stringify(at ? { at } : {}) },
      token
    ),

  // ---------------- Chat reactions ----------------
  reactToChat: (msgId: string, kind: string, token: string) =>
    req<{
      added: boolean;
      kind: string;
      reactions: { counts: Record<string, number>; mine: string[] };
    }>(
      `/chat/messages/${msgId}/reactions`,
      { method: "POST", body: JSON.stringify({ kind }) },
      token
    ),

  // ---------------- Chat @mentions (recipient view) ----------------
  getMyMentions: (token: string, limit: number = 40) =>
    req<{ mentions: ChatMention[]; count: number; unread_count: number }>(
      `/chat/mentions/me?limit=${limit}`,
      {},
      token
    ),
  markMentionsSeen: (token: string, mention_ids?: string[]) =>
    req<{ ok: boolean; updated: number }>(
      "/chat/mentions/mark-seen",
      {
        method: "POST",
        body: JSON.stringify({ mention_ids: mention_ids || null }),
      },
      token
    ),

  // ---------------- Notification preferences ----------------
  getNotificationPrefs: (token: string) =>
    req<{ prefs: NotificationPrefs; categories: string[] }>(
      "/users/me/notification-prefs",
      {},
      token
    ),
  updateNotificationPrefs: (
    token: string,
    prefs: Partial<Omit<NotificationPrefs, "quiet_hours">> & {
      quiet_hours?: Partial<NotificationPrefs["quiet_hours"]>;
    }
  ) =>
    req<{ prefs: NotificationPrefs }>(
      "/users/me/notification-prefs",
      { method: "PATCH", body: JSON.stringify(prefs) },
      token
    ),

  // ---------------- Admin announcements ("pin" posts) ----------------
  // Admin creates + broadcasts a push to every opted-in user. Any
  // signed-in user can read the recent feed via listAnnouncements.
  // ``scheduled_for`` (ISO datetime UTC) delays the broadcast to a
  // future tick of the scheduler — leave null/omitted for immediate.
  listAnnouncements: (token: string, limit = 50) =>
    req<{ items: Announcement[]; count: number }>(
      `/announcements?limit=${limit}`,
      {},
      token
    ),
  listScheduledAnnouncements: (token: string) =>
    req<{ items: Announcement[]; count: number }>(
      "/admin/announcements/scheduled",
      {},
      token
    ),
  createAnnouncement: (
    token: string,
    title: string,
    body: string,
    scheduled_for?: string | null,
    audience?: AnnouncementAudience | null,
  ) =>
    req<{ ok: boolean; announcement: Announcement }>(
      "/admin/announcements",
      {
        method: "POST",
        body: JSON.stringify({
          title,
          body,
          ...(scheduled_for ? { scheduled_for } : {}),
          ...(audience ? { audience } : {}),
        }),
      },
      token
    ),
  updateAnnouncement: (
    token: string,
    id: string,
    patch: {
      title?: string;
      body?: string;
      scheduled_for?: string | null;
      audience?: AnnouncementAudience | null;
    },
  ) =>
    req<{ ok: boolean; announcement: Announcement }>(
      `/admin/announcements/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      token
    ),
  previewAnnouncementAudience: (
    token: string,
    audience: AnnouncementAudience,
  ) =>
    req<{ count: number; sample_names: string[] }>(
      "/admin/announcements/audience/preview",
      { method: "POST", body: JSON.stringify(audience) },
      token
    ),
  listAnnouncementInstructorPicker: (token: string) =>
    req<{ items: InstructorPickerItem[] }>(
      "/admin/announcements/instructor-picker",
      {},
      token
    ),
  listAnnouncementDifficultyTiers: (token: string) =>
    req<{ items: string[] }>(
      "/admin/announcements/difficulty-tiers",
      {},
      token
    ),
  deleteAnnouncement: (token: string, id: string) =>
    req<{ ok: boolean }>(
      `/admin/announcements/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Notification Center ----------------
  listNotifications: (token: string, limit = 50, before?: string) =>
    req<{
      items: NotificationEvent[];
      count: number;
      has_more: boolean;
    }>(
      `/notifications?limit=${limit}${
        before ? `&before=${encodeURIComponent(before)}` : ""
      }`,
      {},
      token
    ),
  getUnreadNotificationCount: (token: string) =>
    req<{ unread: number }>("/notifications/unread-count", {}, token),
  markNotificationRead: (token: string, id: string) =>
    req<{ ok: boolean }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
      token
    ),
  markAllNotificationsRead: (token: string) =>
    req<{ ok: boolean; marked_read: number }>(
      "/notifications/read-all",
      { method: "POST" },
      token
    ),
  deleteNotification: (token: string, id: string) =>
    req<{ ok: boolean }>(
      `/notifications/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Dance Of The Day ----------------
  getDanceOfTheDay: (token: string) =>
    req<DanceOfTheDay>("/dance-of-the-day", {}, token),
  getDotdStreak: (token: string) =>
    req<DotdStreak>("/dance-of-the-day/streak", {}, token),
  recordDotdOpen: (token: string, dance_id: string) =>
    req<DotdOpenResponse>(
      "/dance-of-the-day/open",
      { method: "POST", body: JSON.stringify({ dance_id }) },
      token
    ),

  // ---------------- Followed-Instructor Hub ----------------
  getFollowedUpcoming: (token: string, limit = 10) =>
    req<FollowedUpcomingResponse>(
      `/followed-instructors/upcoming?limit=${limit}`,
      {},
      token
    ),

  // ---------------- Instructor follow (push-alert graph) ----------------
  followInstructor: (instructor_id: string, token: string) =>
    req<{ ok: boolean; is_following: boolean; follower_count: number }>(
      `/instructors/${encodeURIComponent(instructor_id)}/follow`,
      { method: "POST" },
      token
    ),
  unfollowInstructor: (instructor_id: string, token: string) =>
    req<{ ok: boolean; is_following: boolean; follower_count: number }>(
      `/instructors/${encodeURIComponent(instructor_id)}/follow`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Event RSVP ----------------
  getMyRsvp: (token: string, event_id: string) =>
    req<{ status: string; counts: RsvpCounts }>(
      `/events/${encodeURIComponent(event_id)}/rsvp/me`,
      {},
      token
    ),
  setRsvp: (
    token: string,
    event_id: string,
    status: "going" | "maybe" | "declined"
  ) =>
    req<{ ok: boolean; status: string; counts: RsvpCounts }>(
      `/events/${encodeURIComponent(event_id)}/rsvp`,
      { method: "POST", body: JSON.stringify({ status }) },
      token
    ),
  clearRsvp: (token: string, event_id: string) =>
    req<{ ok: boolean; counts: RsvpCounts }>(
      `/events/${encodeURIComponent(event_id)}/rsvp`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Admin: Refresh Recommendations (drift) ----------------
  getRefreshRecommendations: (token: string, opts?: { seen?: boolean; limit?: number }) => {
    const params = new URLSearchParams();
    if (typeof opts?.seen === "boolean") params.set("seen", String(opts.seen));
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    const qs = params.toString();
    return req<{ flags: RefreshRecommendationFlag[]; count: number }>(
      `/admin/refresh-recommendations${qs ? `?${qs}` : ""}`,
      {},
      token
    );
  },
  getRefreshRecommendationCounts: (token: string) =>
    req<{ unseen: number; total: number }>(
      "/admin/refresh-recommendations/counts",
      {},
      token
    ),
  rerunRefreshRecommendations: (token: string) =>
    req<{
      ok: boolean;
      finished_at: string;
      runs: Array<{
        source: string;
        checked: number;
        flagged: number;
        cleared: number;
      }>;
    }>(
      "/admin/refresh-recommendations/rerun",
      { method: "POST" },
      token
    ),
  markRefreshRecommendationSeen: (
    token: string,
    dance_id: string,
    source?: "copperknob" | "bootstepper"
  ) => {
    const qs = source ? `?source=${source}` : "";
    return req<{ ok: boolean; updated: number }>(
      `/admin/refresh-recommendations/${encodeURIComponent(dance_id)}/seen${qs}`,
      { method: "POST" },
      token
    );
  },
  dismissRefreshRecommendation: (
    token: string,
    dance_id: string,
    source?: "copperknob" | "bootstepper"
  ) => {
    const qs = source ? `?source=${source}` : "";
    return req<{ ok: boolean; removed: number }>(
      `/admin/refresh-recommendations/${encodeURIComponent(dance_id)}${qs}`,
      { method: "DELETE" },
      token
    );
  },

  // ---------------- User blocks ----------------
  /**
   * Block a user by their user_id (preferred — never ambiguous). Mutual
   * invisibility: after this call, neither user sees the other's chat
   * messages, feed events, or reactor entries. Silently unfollows both
   * directions server-side. Idempotent.
   */
  blockUser: (
    args: { user_id?: string; email?: string },
    token: string
  ) =>
    req<{
      ok: boolean;
      blocked_id: string;
      blocked_email: string;
      blocked_name: string;
    }>(
      "/blocks",
      { method: "POST", body: JSON.stringify(args) },
      token
    ),
  listBlocks: (token: string) =>
    req<{
      blocks: {
        blocker_id: string;
        blocked_id: string;
        blocked_email: string;
        blocked_name: string;
        blocked_picture?: string;
        created_at: string;
      }[];
      count: number;
    }>("/blocks", {}, token),
  unblockUser: (blocked_user_id: string, token: string) =>
    req<{ ok: boolean; unblocked_id?: string; already?: boolean }>(
      `/blocks/${encodeURIComponent(blocked_user_id)}`,
      { method: "DELETE" },
      token
    ),

  // ---------------- CopperKnob (external stepsheet directory) ----------------
  // All calls are server-proxied — the API key never touches the app.
  copperknobSearch: (
    q: string,
    type_: "all" | "title" | "music" | "choreographer",
    token: string
  ) =>
    req<{
      results: number;
      query: string;
      type: string;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
      data: CopperKnobResult[];
    }>(
      `/copperknob/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type_)}`,
      {},
      token
    ),
  copperknobPopular: (token: string) =>
    req<{
      results: number;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
      data: CopperKnobResult[];
    }>("/copperknob/popular", {}, token),
  copperknobByRef: (ref: string, token: string) =>
    req<{
      data: CopperKnobResult;
      existing_dance: { id: string; name: string } | null;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
    }>(`/copperknob/stepsheets/${encodeURIComponent(ref)}`, {}, token),
  createDanceFromCopperKnob: (
    body: {
      ref: string;
      name?: string;
      choreographer?: string;
      song?: string;
      artist?: string;
      difficulty?: string;
      count?: string;
      bpm?: number | null;
      description?: string;
      tags?: string[];
      is_published?: boolean;
    },
    token: string
  ) =>
    req<{ dance: Dance }>(
      "/dances/from-copperknob",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  linkCopperKnob: (
    dance_id: string,
    ref: string,
    overwrite_url: boolean,
    token: string
  ) =>
    req<{ dance: Dance }>(
      `/dances/${encodeURIComponent(dance_id)}/link-copperknob`,
      {
        method: "POST",
        body: JSON.stringify({ ref, overwrite_url }),
      },
      token
    ),
  compareCopperKnob: (dance_id: string, token: string) =>
    req<{
      dance_id: string;
      ref: string;
      copperknob_url: string;
      fields: {
        field: string;
        ours: string;
        copperknob: string;
        differs: boolean;
      }[];
      differs_count: number;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
    }>(`/dances/${encodeURIComponent(dance_id)}/copperknob-compare`, {}, token),

  // ---------------- BootStepper (external dance directory) ----------------
  // All calls are server-proxied — the API key never touches the app.
  // Mirrors the CopperKnob surface for consistency; a single dance can
  // carry BOTH a copperknob_ref and a bootstepper_ref simultaneously.
  bootstepperSearch: (q: string, limit: number, token: string) =>
    req<{
      results: number;
      query: string;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
      data: BootStepperResult[];
    }>(
      `/bootstepper/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {},
      token
    ),
  bootstepperPopular: (token: string, limit: number = 30) =>
    req<{
      results: number;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
      data: BootStepperResult[];
    }>(`/bootstepper/popular?limit=${limit}`, {}, token),
  bootstepperById: (id: string, token: string) =>
    req<{
      data: BootStepperResult;
      existing_dance: {
        id: string;
        name: string;
        has_copperknob_ref?: boolean;
        has_bootstepper_ref?: boolean;
      } | null;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
    }>(`/bootstepper/dances/${encodeURIComponent(id)}`, {}, token),
  createDanceFromBootStepper: (
    body: {
      id: string;
      name?: string;
      choreographer?: string;
      choreographer_country?: string;
      song?: string;
      artist?: string;
      difficulty?: string;
      count?: string;
      bpm?: number | null;
      description?: string;
      tags?: string[];
      is_published?: boolean;
    },
    token: string
  ) =>
    req<{ dance: Dance }>(
      "/dances/from-bootstepper",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  linkBootStepper: (
    dance_id: string,
    id: string,
    overwrite_url: boolean,
    token: string
  ) =>
    req<{ dance: Dance }>(
      `/dances/${encodeURIComponent(dance_id)}/link-bootstepper`,
      {
        method: "POST",
        body: JSON.stringify({ id, overwrite_url }),
      },
      token
    ),
  compareBootStepper: (dance_id: string, token: string) =>
    req<{
      dance_id: string;
      id: string;
      bootstepper_url: string;
      fields: {
        field: string;
        ours: string;
        bootstepper: string;
        differs: boolean;
      }[];
      differs_count: number;
      attribution: {
        provider: string;
        text: string;
        link_label: string;
        home_url: string;
      };
    }>(`/dances/${encodeURIComponent(dance_id)}/bootstepper-compare`, {}, token),

  // ---------------- Merged external search + Bulk import ----------------
  /**
   * One query, both providers. Server fans out to CopperKnob AND
   * BootStepper in parallel, merges records that clearly represent the
   * same dance (by title + choreographer surname), and returns a single
   * unified list. Providers that fail are surfaced in the ``providers``
   * block so the UI can render a graceful "X unavailable" banner.
   */
  externalSearch: (q: string, token: string, limit: number = 30) =>
    req<{
      query: string;
      results: number;
      providers: {
        copperknob: { count: number; error: string | null };
        bootstepper: { count: number; error: string | null };
      };
      data: MergedExternalResult[];
    }>(
      `/external-search?q=${encodeURIComponent(q)}&limit=${limit}`,
      {},
      token
    ),
  /** Dry-run — see which entries will actually be imported vs.
   *  already-in-library vs. errored, without writing anything. */
  bulkPreviewExternal: (
    entries: { source: "copperknob" | "bootstepper"; ref: string }[],
    token: string
  ) =>
    req<BulkImportPreviewResponse>(
      "/dances/bulk-preview-external",
      { method: "POST", body: JSON.stringify({ entries }) },
      token
    ),
  /** Commit the batch. Same shape as the preview + per-entry status
   *  ("imported" | "skipped_duplicate" | "error"). */
  bulkImportExternal: (
    entries: {
      source: "copperknob" | "bootstepper";
      ref: string;
      is_published?: boolean;
    }[],
    publish_all: boolean,
    token: string
  ) =>
    req<BulkImportResponse>(
      "/dances/bulk-from-external",
      {
        method: "POST",
        body: JSON.stringify({ entries, publish_all }),
      },
      token
    ),

  // ---------------- Choreographer follows ----------------
  /** Discover choreographers who have at least one PUBLISHED dance
   *  in the local library. Hydrated with the caller's follow state
   *  and a per-choreographer published-dance count.
   */
  listChoreographers: (
    token: string,
    opts?: { q?: string; limit?: number }
  ) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set("q", opts.q);
    if (typeof opts?.limit === "number")
      params.set("limit", String(opts.limit));
    const qs = params.toString();
    return req<{ choreographers: ChoreographerFollowRow[]; count: number }>(
      `/choreographers${qs ? `?${qs}` : ""}`,
      {},
      token
    );
  },
  myFollowedChoreographers: (token: string) =>
    req<{
      choreographers: ChoreographerFollowRow[];
      counts: { following: number };
    }>("/choreographers/me/follows", {}, token),
  getChoreographerDetail: (name: string, token: string) =>
    req<ChoreographerDetail>(
      `/choreographers/${encodeURIComponent(name)}`,
      {},
      token
    ),
  followChoreographer: (name: string, token: string) =>
    req<{
      ok: boolean;
      created: boolean;
      is_following: boolean;
      follower_count: number;
    }>(
      `/choreographers/${encodeURIComponent(name)}/follow`,
      { method: "POST" },
      token
    ),
  unfollowChoreographer: (name: string, token: string) =>
    req<{
      ok: boolean;
      removed: boolean;
      is_following: boolean;
      follower_count: number;
    }>(
      `/choreographers/${encodeURIComponent(name)}/follow`,
      { method: "DELETE" },
      token
    ),
  /** Popup content for a co-choreographer chip on the dance detail
   *  page. Returns every LOCAL dance where the given person appears
   *  as either the main artist or a collaborator, newest first.
   *  Never renders their own library entry — that's reserved for
   *  main choreographers only. */
  listCoChoreographerDances: (name: string, token: string, limit = 50) =>
    req<CoChoreographerDances>(
      `/co-choreographers/${encodeURIComponent(name)}/dances?limit=${limit}`,
      {},
      token
    ),

  // ---------------- Activity / Recently Practiced ----------------
  logPractice: (dance_id: string, token: string) =>
    req<{ ok: boolean; last_opened_at: string }>(
      `/practice-log/${dance_id}`,
      { method: "POST" },
      token
    ),
  recentlyPracticed: (token: string, limit = 10) =>
    req<{
      items: {
        dance: {
          id: string;
          name: string;
          choreographer: string;
          difficulty: string;
          bpm: number | null;
        };
        last_activity_at: string;
        status: string;
        practice_count: number;
      }[];
    }>(`/recently-practiced?limit=${limit}`, {}, token),

  // ---------------- Leaderboard Prizes ----------------
  listPrizes: (range: LeaderboardRange = "all") =>
    req<{ range: LeaderboardRange; prizes: LeaderboardPrize[] }>(
      `/leaderboard/prizes?range=${range}`
    ),
  upsertPrize: (
    rank: 1 | 2 | 3,
    range: LeaderboardRange,
    body: { title: string; description: string; image?: string },
    token: string
  ) =>
    req<LeaderboardPrize>(
      `/admin/leaderboard/prizes/${rank}?range=${range}`,
      { method: "PUT", body: JSON.stringify(body) },
      token
    ),
  deletePrize: (rank: 1 | 2 | 3, range: LeaderboardRange, token: string) =>
    req<{ ok: boolean }>(
      `/admin/leaderboard/prizes/${rank}?range=${range}`,
      { method: "DELETE" },
      token
    ),

  // ---------------- Admin Leaderboard Management ----------------
  adminListHiddenUsers: (token: string) =>
    req<{
      hidden_user_ids: string[];
      users: { user_id: string; name: string; email?: string }[];
    }>("/admin/leaderboard/hidden-users", {}, token),
  adminHideFromLeaderboard: (user_id: string, token: string) =>
    req<{ ok: boolean; user_id: string; hidden: boolean }>(
      `/admin/leaderboard/users/${user_id}/hide`,
      { method: "POST" },
      token
    ),
  adminUnhideFromLeaderboard: (user_id: string, token: string) =>
    req<{ ok: boolean; user_id: string; hidden: boolean }>(
      `/admin/leaderboard/users/${user_id}/unhide`,
      { method: "POST" },
      token
    ),
  adminResetUserCount: (user_id: string, token: string) =>
    req<{ ok: boolean; removed_completions: number }>(
      `/admin/leaderboard/users/${user_id}/reset`,
      { method: "POST" },
      token
    ),
  adminGetSeason: (token: string) =>
    req<{
      current: { started_at?: string; label?: string; started_by?: string };
      past: {
        id: string;
        label: string;
        started_at: string;
        ended_at: string;
        top: { rank: number; name: string; count: number; picture: string }[];
      }[];
    }>("/admin/leaderboard/season", {}, token),
  adminResetSeason: (label: string, token: string) =>
    req<{ ok: boolean; started_at: string; label: string }>(
      "/admin/leaderboard/season/reset",
      { method: "POST", body: JSON.stringify({ label }) },
      token
    ),
  adminClearSeason: (token: string) =>
    req<{ ok: boolean }>(
      "/admin/leaderboard/season",
      { method: "DELETE" },
      token
    ),

  // ---------------- User-submitted dances (pending approval queue) ----------------
  // Users submit CopperKnob / BootStepper listings; admins approve or
  // reject. Enforces a 5-per-day limit server-side; UI reads
  // `getPendingDanceQuota` to keep the CTA in sync.
  getPendingDanceQuota: (token: string) =>
    req<{
      used: number;
      limit: number;
      remaining: number;
      resets_at: string;
    }>("/pending-dances/quota", {}, token),
  submitPendingDance: (
    source: "copperknob" | "bootstepper",
    ref: string,
    token: string
  ) =>
    req<{
      submission: PendingDance;
      quota: { used: number; limit: number; remaining: number; resets_at: string };
    }>(
      "/pending-dances/submit",
      { method: "POST", body: JSON.stringify({ source, ref }) },
      token
    ),
  getMyPendingDances: (token: string) =>
    req<{ items: PendingDance[]; count: number }>(
      "/pending-dances/mine",
      {},
      token
    ),
  adminListPendingDances: (
    status: "pending" | "approved" | "rejected" | "all",
    token: string
  ) =>
    req<{ items: PendingDance[]; count: number; pending_count: number }>(
      `/admin/pending-dances?status=${encodeURIComponent(status)}`,
      {},
      token
    ),
  adminApprovePendingDance: (id: string, token: string) =>
    req<{ ok: boolean; dance_id?: string; already_in_library?: boolean }>(
      `/admin/pending-dances/${encodeURIComponent(id)}/approve`,
      { method: "POST", body: JSON.stringify({}) },
      token
    ),
  adminRejectPendingDance: (id: string, reason: string, token: string) =>
    req<{ ok: boolean }>(
      `/admin/pending-dances/${encodeURIComponent(id)}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) },
      token
    ),

  // ---------------- Terms of Use / EULA (Apple 1.2) ----------------
  getTermsStatus: (token: string) =>
    req<{
      required_version: string;
      accepted_version: string;
      up_to_date: boolean;
      accepted_at?: string;
    }>("/legal/terms-status", {}, token),
  acceptTerms: (version: string, token: string) =>
    req<{ ok: boolean; accepted_version: string }>(
      "/legal/accept-terms",
      { method: "POST", body: JSON.stringify({ version }) },
      token
    ),

  // ---------------- Moderation / Reporting (Apple 1.2) ----------------
  getReportReasons: (token: string) =>
    req<{ reasons: { key: string; label: string }[] }>(
      "/moderation/report-reasons",
      {},
      token
    ),
  reportContent: (
    body: {
      target_type: "feed" | "chat" | "profile" | "comment" | "dance" | "event";
      target_id: string;
      target_user_id?: string;
      reason: string;
      note?: string;
    },
    token: string
  ) =>
    req<{
      ok: boolean;
      id?: string;
      ref?: string;
      already_reported?: boolean;
    }>(
      "/moderation/reports",
      { method: "POST", body: JSON.stringify(body) },
      token
    ),
  adminListModerationReports: (
    status: "pending" | "reviewed" | "resolved" | "dismissed" | "actioned" | "all",
    token: string,
    target_type?: string
  ) =>
    req<{
      items: ModerationReport[];
      count: number;
      pending_count: number;
    }>(
      `/admin/moderation/reports?status=${encodeURIComponent(status)}${
        target_type ? `&target_type=${encodeURIComponent(target_type)}` : ""
      }`,
      {},
      token
    ),
  adminPatchModerationReport: (
    id: string,
    body: { status?: string; admin_note?: string },
    token: string
  ) =>
    req<{ ok: boolean }>(
      `/admin/moderation/reports/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
      token
    ),
  adminRemoveReportedContent: (id: string, token: string) =>
    req<{ ok: boolean; action: string }>(
      `/admin/moderation/reports/${encodeURIComponent(id)}/remove-content`,
      { method: "POST", body: JSON.stringify({}) },
      token
    ),
  adminSuspendUser: (
    user_id: string,
    duration_hours: 24 | 168 | 720 | 999999,
    reason: string,
    token: string
  ) =>
    req<{
      user_id: string;
      is_suspended: boolean;
      is_banned: boolean;
      suspend_until?: string;
    }>(
      `/admin/moderation/users/${encodeURIComponent(user_id)}/suspend`,
      { method: "POST", body: JSON.stringify({ duration_hours, reason }) },
      token
    ),
  adminUnsuspendUser: (user_id: string, token: string) =>
    req<{ ok: boolean }>(
      `/admin/moderation/users/${encodeURIComponent(user_id)}/unsuspend`,
      { method: "POST", body: JSON.stringify({}) },
      token
    ),
  adminBanUser: (user_id: string, reason: string, token: string) =>
    req<{
      user_id: string;
      is_suspended: boolean;
      is_banned: boolean;
    }>(
      `/admin/moderation/users/${encodeURIComponent(user_id)}/ban`,
      {
        method: "POST",
        body: JSON.stringify({ duration_hours: 999999, reason }),
      },
      token
    ),
  adminWarnUser: (user_id: string, reason: string, token: string) =>
    req<{ ok: boolean; warnings_count: number }>(
      `/admin/moderation/users/${encodeURIComponent(user_id)}/warn`,
      { method: "POST", body: JSON.stringify({ reason }) },
      token
    ),
  adminUserModerationHistory: (user_id: string, token: string) =>
    req<{ actions: ModerationAction[]; reports: ModerationReport[] }>(
      `/admin/moderation/users/${encodeURIComponent(user_id)}/history`,
      {},
      token
    ),
};
