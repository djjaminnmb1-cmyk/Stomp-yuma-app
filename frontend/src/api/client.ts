import Constants from "expo-constants";

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
  is_self: boolean;
};

export type FollowLists = {
  following: PublicUser[];
  followers: PublicUser[];
  counts: { following: number; followers: number };
};

export type FeedReactionKind = "high_five" | "clap" | "yeehaw" | "heart";

export type FeedReactionMeta = {
  kind: FeedReactionKind;
  emoji: string;
  label: string;
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
  song: string;
  artist: string;
  difficulty: string;
  bpm?: number | null;
  count?: string;
  youtube_url?: string;
  step_sheet?: string;
  step_sheet_image?: string;
  description?: string;
  tags?: string[];
  is_published?: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
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

async function req<T>(
  path: string,
  opts: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
    const msg =
      (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string, name: string, instructor_code?: string) =>
    req<{ token: string; user: User; is_new_user?: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, instructor_code }),
    }),
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
  ) =>
    req<{ token: string; user: User; is_new_user?: boolean }>(
      "/auth/apple",
      {
        method: "POST",
        body: JSON.stringify({
          identity_token,
          full_name: full_name || null,
          email: email || null,
        }),
      },
    ),
  linkApple: (token: string, identity_token: string) =>
    req<{ ok: boolean; user: User }>(
      "/auth/apple/link",
      {
        method: "POST",
        body: JSON.stringify({ identity_token }),
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
    req<{ ok: boolean; created: boolean }>(
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

  listClasses: (scope: "all" | "upcoming" | "past" = "all", limit = 100) =>
    req<ClassSession[]>(`/classes?scope=${scope}&limit=${limit}`),
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
  postChat: (message: string, token: string) =>
    req<ChatMessage>("/chat/messages", { method: "POST", body: JSON.stringify({ message }) }, token),
  deleteChat: (id: string, token: string) =>
    req<{ ok: boolean }>(`/chat/messages/${id}`, { method: "DELETE" }, token),

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
};
