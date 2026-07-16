import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../api/client";
import { useAuth } from "./auth-context";

type Ctx = {
  draftCount: number;
  refresh: () => Promise<void>;
};

const DraftCountCtx = createContext<Ctx>({ draftCount: 0, refresh: async () => {} });

export function DraftCountProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [draftCount, setDraftCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || !token || (!user.is_admin && !user.is_instructor)) {
      setDraftCount(0);
      return;
    }
    try {
      const dances = await api.listDances(undefined, undefined, "mine", token);
      setDraftCount(dances.filter((d) => d.is_published === false).length);
    } catch {
      // Ignore silently; badge just won't update.
    }
  }, [user, token]);

  useEffect(() => {
    refresh();
    if (!user || (!user.is_admin && !user.is_instructor)) return;
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [refresh, user]);

  return (
    <DraftCountCtx.Provider value={{ draftCount, refresh }}>
      {children}
    </DraftCountCtx.Provider>
  );
}

export function useDraftCount() {
  return useContext(DraftCountCtx);
}
