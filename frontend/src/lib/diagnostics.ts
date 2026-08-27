/**
 * Client Diagnostics
 * ------------------
 * Collects the "what version of the app is this dancer running" info
 * that lets an admin trace a bug report back to the exact JS bundle
 * that was live at the time. Everything is best-effort — never throws.
 *
 * Fields:
 *  • appVersion       — CFBundleShortVersionString / versionName
 *  • buildNumber      — CFBundleVersion / versionCode
 *  • sdkVersion       — the expo-config SDK version
 *  • runtimeVersion   — from expo-updates
 *  • otaUpdateId      — the currently-loaded OTA update UUID (empty on
 *                       embedded/first-launch)
 *  • otaChannel       — "preview" / "production" / "" (in dev)
 *  • otaIsEmbedded    — true when the app is running the bundle it was
 *                       built with, not an OTA
 *  • platform         — "ios" | "android" | "web"
 *  • osVersion        — best-effort from Platform.Version
 *  • locale           — from expo-localization if present, else "en"
 *
 * Serialised as HTTP headers so every request auto-tags itself; and
 * inlined into report/feedback bodies so it lives in Mongo alongside
 * the record.
 */
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export type ClientDiagnostics = {
  app_version: string;
  build_number: string;
  sdk_version: string;
  runtime_version: string;
  ota_update_id: string;
  ota_channel: string;
  ota_is_embedded: boolean;
  ota_created_at: string;
  platform: string;
  os_version: string;
};

let _cached: ClientDiagnostics | null = null;

export function getClientDiagnostics(): ClientDiagnostics {
  if (_cached) return _cached;
  try {
    const ec = (Constants.expoConfig as any) || {};
    const ua: any = Updates as any;
    const d: ClientDiagnostics = {
      app_version: String(ec?.version || ec?.ios?.buildNumber || ""),
      build_number: String(
        ec?.ios?.buildNumber || ec?.android?.versionCode || ""
      ),
      sdk_version: String(ec?.sdkVersion || ""),
      runtime_version: String(ua.runtimeVersion || ""),
      ota_update_id: String(ua.updateId || ""),
      ota_channel: String(ua.channel || ""),
      ota_is_embedded: Boolean(ua.isEmbeddedLaunch),
      ota_created_at:
        (ua.createdAt && ua.createdAt.toISOString?.()) ||
        (ua.createdAt ? String(ua.createdAt) : ""),
      platform: Platform.OS,
      os_version: String(Platform.Version || ""),
    };
    _cached = d;
    return d;
  } catch {
    // Defensive default — never let diagnostics crash a network call.
    const empty: ClientDiagnostics = {
      app_version: "",
      build_number: "",
      sdk_version: "",
      runtime_version: "",
      ota_update_id: "",
      ota_channel: "",
      ota_is_embedded: false,
      ota_created_at: "",
      platform: Platform.OS,
      os_version: "",
    };
    _cached = empty;
    return empty;
  }
}

/** Wire the diagnostics into HTTP headers. Only truthy values are
 * emitted so the header set stays compact. Header names use the
 * ``X-Client-…`` prefix to be firewall-friendly. */
export function diagnosticsHeaders(): Record<string, string> {
  const d = getClientDiagnostics();
  const out: Record<string, string> = {};
  const entries: [string, string | boolean][] = [
    ["X-Client-App-Version", d.app_version],
    ["X-Client-Build-Number", d.build_number],
    ["X-Client-SDK-Version", d.sdk_version],
    ["X-Client-Runtime-Version", d.runtime_version],
    ["X-Client-OTA-Update-Id", d.ota_update_id],
    ["X-Client-OTA-Channel", d.ota_channel],
    ["X-Client-OTA-Is-Embedded", d.ota_is_embedded ? "1" : "0"],
    ["X-Client-Platform", d.platform],
    ["X-Client-OS-Version", d.os_version],
  ];
  for (const [k, v] of entries) {
    const s = String(v || "");
    if (s) out[k] = s;
  }
  return out;
}
