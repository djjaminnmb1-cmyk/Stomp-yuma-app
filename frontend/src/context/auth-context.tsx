import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api, User } from "../api/client";
import { registerForPush } from "../lib/push";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (t: string, u: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const TOKEN_KEY = "sgy_token";

const AuthCtx = createContext<AuthState>({} as any);

async function saveToken(t: string | null) {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } else {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function readToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const t = await readToken();
      if (t) {
        try {
          const me = await api.me(t);
          setUser(me);
          setToken(t);
          registerForPush(me.user_id);
        } catch {
          await saveToken(null);
          setUser(null);
          setToken(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (t: string, u: User) => {
    await saveToken(t);
    setToken(t);
    setUser(u);
    registerForPush(u.user_id);
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (token) await api.logout(token);
    } catch {}
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthCtx.Provider
      value={{ user, token, loading, signIn, signOut, refresh: bootstrap }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
