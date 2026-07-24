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
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  is_admin: boolean;
  is_instructor: boolean;
  can_edit_step_sheets?: boolean;
  auth_provider: string;
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
  notes: string;
  status: string;
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
    req<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name, instructor_code }),
    }),
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleSession: (session_id: string) =>
    req<{ token: string; user: User }>("/auth/google-session", {
      method: "POST",
      body: JSON.stringify({ session_id }),
    }),
  me: (token: string) => req<User>("/auth/me", {}, token),
  setInstructor: (instructor_code: string, token: string) =>
    req<{ ok: boolean; user: User }>(
      "/auth/set-instructor",
      { method: "POST", body: JSON.stringify({ instructor_code }) },
      token,
    ),
  logout: (token: string) =>
    req<{ ok: boolean }>("/auth/logout", { method: "POST" }, token),
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
      notes?: string;
    },
    token: string
  ) =>
    req<Suggestion>("/suggestions", { method: "POST", body: JSON.stringify(body) }, token),
  mySuggestions: (token: string) => req<Suggestion[]>("/suggestions/mine", {}, token),
  allSuggestions: (token: string) => req<Suggestion[]>("/suggestions", {}, token),
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
};
