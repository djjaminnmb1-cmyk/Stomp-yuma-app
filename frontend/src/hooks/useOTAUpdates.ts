/**
 * useOTAUpdates
 * -------------
 * Runtime helper that checks Expo's EAS Update service for a new
 * JavaScript bundle any time the app becomes active, downloads it in
 * the background, and — depending on the caller's ``strategy`` —
 * either shows a friendly banner ("A new version is ready — reload
 * to update") or silently reloads.
 *
 * Guards:
 *   • Skips entirely on web (OTA is a native-only feature)
 *   • Skips in dev (Expo Go / dev-client) where updates aren't real
 *   • Never blocks the UI: every await is wrapped and errors are
 *     swallowed with a console.warn
 *
 * Consumers:
 *   • ``UpdateChecker`` (mounted at root) — runs the passive
 *     foreground check + Alert prompt on install
 *   • Profile → "Check for updates" row — calls ``checkNow`` directly
 *     so the user can force a refresh
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

export type OTAStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "silent-ready"
  | "up-to-date"
  | "error";

/**
 * Read the ``silent`` flag from the JUST-DOWNLOADED manifest. Admins
 * mark a hotfix as silent by editing ``app.json.extra.otaUpdate = {
 *   silent: true, reason: "..." }`` before running ``eas update``.
 * Each OTA bundle contains its own app.json so the flag travels with
 * the specific update it was applied to — nothing "sticks" after the
 * next release.
 */
function readSilentFlag(manifest: any): boolean {
  try {
    // ``manifest.extra`` is the flattened extra config in newer
    // expo-updates versions. Older shapes nest it under
    // ``metadata.branchName`` or ``expoClient.extra`` — we probe both.
    const paths = [
      manifest?.extra?.otaUpdate?.silent,
      manifest?.extra?.expoClient?.extra?.otaUpdate?.silent,
      manifest?.metadata?.otaUpdate?.silent,
    ];
    return paths.some((v) => v === true || v === "true" || v === 1);
  } catch {
    return false;
  }
}

export function useOTAUpdates(options?: {
  /** If true, run a check as soon as the hook mounts. Default true. */
  checkOnMount?: boolean;
  /** If true, re-check every time the app returns to foreground. Default true. */
  checkOnForeground?: boolean;
}) {
  const { checkOnMount = true, checkOnForeground = true } = options || {};
  const [status, setStatus] = useState<OTAStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inflight = useRef(false);

  const isNativeRuntime = Platform.OS !== "web" && Updates.isEnabled;

  const checkNow = useCallback(async (): Promise<
    "ready" | "silent-ready" | "up-to-date" | "error"
  > => {
    if (!isNativeRuntime) return "up-to-date";
    if (inflight.current)
      return (status === "ready" || status === "silent-ready"
        ? status
        : ("checking" as any));
    inflight.current = true;
    setErrorMsg(null);
    setStatus("checking");
    try {
      const res = await Updates.checkForUpdateAsync();
      if (!res.isAvailable) {
        setStatus("up-to-date");
        return "up-to-date";
      }
      setStatus("downloading");
      const fetched = await Updates.fetchUpdateAsync();
      const silent = readSilentFlag((fetched as any).manifest || res.manifest);
      if (silent) {
        // Silent hotfix — install on natural cold-start. Don't show
        // the banner, don't force-reload. Log for audit only.
        console.log(
          "[useOTAUpdates] Silent OTA downloaded — banner suppressed."
        );
        setStatus("silent-ready");
        return "silent-ready";
      }
      setStatus("ready");
      return "ready";
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Common benign paths — running in Expo Go, no network, etc. —
      // we surface as "up-to-date" so the UI never scares people.
      if (/development|expo go|not enabled/i.test(msg)) {
        setStatus("up-to-date");
        return "up-to-date";
      }
      console.warn("[useOTAUpdates] check failed:", msg);
      setErrorMsg(msg);
      setStatus("error");
      return "error";
    } finally {
      inflight.current = false;
    }
  }, [isNativeRuntime, status]);

  const applyReady = useCallback(async () => {
    if (!isNativeRuntime) return;
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.warn("[useOTAUpdates] reload failed:", e);
    }
  }, [isNativeRuntime]);

  useEffect(() => {
    if (!isNativeRuntime) return;
    if (checkOnMount) checkNow();
    if (!checkOnForeground) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkNow();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativeRuntime, checkOnMount, checkOnForeground]);

  return {
    status,
    errorMsg,
    isReady: status === "ready",
    isSilentReady: status === "silent-ready",
    isChecking: status === "checking" || status === "downloading",
    checkNow,
    applyReady,
    // Expose current channel/runtimeVersion for debugging in the UI.
    channel: (Updates as any).channel ?? null,
    runtimeVersion: (Updates as any).runtimeVersion ?? null,
    updateId: (Updates as any).updateId ?? null,
  };
}
