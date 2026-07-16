import Constants from "expo-constants";

const BASE =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL ||
  "";

export const API_BASE = `${BASE}/api`;

export type Dance = {
  id: string;
  name: string;
  choreographer: string;
  song: string;
  artist: string;
  difficulty: string;
  bpm?: number | null;
  count?: string;
  youtube_url?: string;
  description?: string;
  tags?: string[];
  created_at: string;
};

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
  auth_provider: string;
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
  register: (email: string, password: string, name: string) =>
    req<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
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
  logout: (token: string) =>
    req<{ ok: boolean }>("/auth/logout", { method: "POST" }, token),

  listDances: (q?: string, difficulty?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (difficulty && difficulty !== "All") params.set("difficulty", difficulty);
    const qs = params.toString();
    return req<Dance[]>(`/dances${qs ? `?${qs}` : ""}`);
  },
  getDance: (id: string) => req<Dance>(`/dances/${id}`),
  createDance: (body: Partial<Dance>, token: string) =>
    req<Dance>("/dances", { method: "POST", body: JSON.stringify(body) }, token),
  updateDance: (id: string, body: Partial<Dance>, token: string) =>
    req<Dance>(`/dances/${id}`, { method: "PUT", body: JSON.stringify(body) }, token),

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
};
