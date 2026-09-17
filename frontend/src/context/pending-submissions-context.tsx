/**
 * usePendingSubmissions
 * ---------------------
 * Lightweight, singleton-in-memory store of the current user's
 * pending / approved / rejected library submissions. Powers the
 * "Request to Add" button on CopperKnob & BootStepper cards so each
 * card can render its status without every card re-fetching.
 *
 * Design notes:
 *   • One network call per app session (or on manual refresh). We
 *     don't need real-time — admin approval is a background flow the
 *     user can't observe frame-by-frame.
 *   • `submit()` is optimistic: the button flips to "Pending Review"
 *     as soon as the server responds, without re-fetching the whole
 *     list.
 *   • Rejection reasons are surfaced so users can see WHY.
 *   • Quota is tracked in the same store to keep the submit CTA and
 *     the search-screen banner in sync.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, PendingDance } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

type Status = "pending" | "approved" | "rejected";

type Quota = {
  used: number;
  limit: number;
  remaining: number;
  resets_at: string;
};

type SubmissionRef = {
  status: Status;
  rejection_reason?: string | null;
  approved_dance_id?: string | null;
  submission_id: string;
};

type Ctx = {
  loading: boolean;
  quota: Quota | null;
  /** Get status for a source+ref, or `undefined` if never submitted. */
  getStatus: (source: "copperknob" | "bootstepper", ref: string) => SubmissionRef | undefined;
  /** Submit a new pending dance. Throws on 429/409/etc so caller can
   *  render the error. Returns the fresh quota + submission. */
  submit: (
    source: "copperknob" | "bootstepper",
    ref: string
  ) => Promise<{ submission: PendingDance; quota: Quota }>;
  /** Force-refresh the store from the backend. */
  refresh: () => Promise<void>;
};

const CtxObj = createContext<Ctx>({} as any);

function keyOf(source: string, ref: string): string {
  // CopperKnob refs are uppercase in the DB; keep the lookup key
  // consistent regardless of local casing.
  const norm = source === "copperknob" ? ref.toUpperCase() : ref;
  return `${source}:${norm}`;
}

export function PendingSubmissionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [map, setMap] = useState<Record<string, SubmissionRef>>({});
  const [quota, setQuota] = useState<Quota | null>(null);
  const loadedForToken = useRef<string | null>(null);

  const doLoad = useCallback(async () => {
    if (!token) {
      setMap({});
      setQuota(null);
      return;
    }
    setLoading(true);
    try {
      const [mine, q] = await Promise.all([
        api.getMyPendingDances(token),
        api.getPendingDanceQuota(token),
      ]);
      const next: Record<string, SubmissionRef> = {};
      for (const it of mine.items) {
        next[keyOf(it.source, it.ref)] = {
          status: it.status,
          rejection_reason: it.rejection_reason,
          approved_dance_id: it.approved_dance_id,
          submission_id: it.id,
        };
      }
      setMap(next);
      setQuota(q);
      loadedForToken.current = token;
    } catch (e) {
      // Silent — a failed hydrate should never block the search UI.
      // The submit button will still work; the button just won't
      // reflect a pre-existing pending status until the next refresh.
      console.warn("[pending-submissions] hydrate failed", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // First load on token change
  useEffect(() => {
    if (token && loadedForToken.current !== token) {
      doLoad();
    } else if (!token) {
      setMap({});
      setQuota(null);
      loadedForToken.current = null;
    }
  }, [token, doLoad]);

  const getStatus = useCallback(
    (source: "copperknob" | "bootstepper", ref: string) =>
      map[keyOf(source, ref)],
    [map]
  );

  const submit = useCallback(
    async (source: "copperknob" | "bootstepper", ref: string) => {
      if (!token) throw new Error("Not signed in");
      const res = await api.submitPendingDance(source, ref, token);
      // Optimistic write
      setMap((prev) => ({
        ...prev,
        [keyOf(source, ref)]: {
          status: "pending",
          rejection_reason: null,
          approved_dance_id: null,
          submission_id: res.submission.id,
        },
      }));
      setQuota(res.quota);
      return res;
    },
    [token]
  );

  const value = useMemo(
    () => ({
      loading,
      quota,
      getStatus,
      submit,
      refresh: doLoad,
    }),
    [loading, quota, getStatus, submit, doLoad]
  );

  return <CtxObj.Provider value={value}>{children}</CtxObj.Provider>;
}

export function usePendingSubmissions(): Ctx {
  return useContext(CtxObj);
}
