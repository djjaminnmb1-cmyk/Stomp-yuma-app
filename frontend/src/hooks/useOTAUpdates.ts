/**
 * useOTAUpdates
 * -------------
 * Runtime helper that WOULD check Expo's EAS Update service for a new
 * JavaScript bundle and prompt the user to reload. Kept in the codebase
 * as a scaffold so we can flip OTA back on when Emergent's platform
 * exposes managed EAS Update for this project (see
 * ``/app/memory/emergent_support_email_ota.md``).
 *
 * Today this hook is a no-op:
 *   • ``updates.enabled = false`` in app.json means expo-updates is not
 *     initialised in the native runtime — every call would throw or
 *     silently fail with the placeholder URL we used to have.
 *   • Rather than pretending to work and confusing users with "Couldn't
 *     check for updates" alerts, we short-circuit to "up-to-date" and
 *     let the Publish → new build flow handle updates for now.
 *
 * When Emergent enables managed OTA:
 *   1. Set ``updates.enabled = true`` + real ``updates.url`` +
 *      ``extra.eas.projectId`` in app.json.
 *   2. Flip ``OTA_ENABLED`` below to ``true``.
 *   3. The banner + Profile row auto-light up — no other code changes
 *      needed.
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
 * Master switch. Kept false until Emergent hands us a real EAS project
 * ID + updates URL. See app.json ``updates`` block.
 */
const OTA_ENABLED = false;

function readSilentFlag(manifest: any): boolean {
  try {
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
  checkOnMount?: boolean;
  checkOnForeground?: boolean;
}) {
  const { checkOnMount = true, checkOnForeground = true } = options || {};
  const [status, setStatus] = useState<OTAStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inflight = useRef(false);

  // Guard: native-only AND OTA feature flag AND Updates.isEnabled at runtime.
  const isNativeRuntime =
    OTA_ENABLED && Platform.OS !== "web" && (Updates as any).isEnabled;

  const checkNow = useCallback(async (): Promise<
    "ready" | "silent-ready" | "up-to-date" | "error"
  > => {
    if (!isNativeRuntime) {
      // Feature disabled — pretend we checked and everything's fine.
      // The Profile row & banner won't render an "error" state.
      setStatus("up-to-date");
      return "up-to-date";
    }
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
    channel: (Updates as any).channel ?? null,
    runtimeVersion: (Updates as any).runtimeVersion ?? null,
    updateId: (Updates as any).updateId ?? null,
    /** Exposed so UI can render an honest state instead of pretending. */
    otaEnabled: OTA_ENABLED,
  };
}
