/**
 * Device-location helper.
 *
 * Centralizes the expo-location permission dance so callers don't have
 * to hand-roll it. Follows the app-wide permissions contract:
 *
 *   1. Check the current status FIRST (don't prompt unnecessarily).
 *   2. If undetermined AND ``canAskAgain`` is true → prompt via the OS.
 *   3. If denied AND ``canAskAgain`` is false → return ``{status: "blocked"}``
 *      so the caller can show an "Open Settings" affordance.
 *
 * We only ask for **When-In-Use** precision — we never track users in
 * the background.
 */
import * as Location from "expo-location";

export type LocationResult =
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "blocked" }        // permanently blocked, needs Settings
  | { status: "unavailable"; reason: string };

export async function getDeviceLocation(): Promise<LocationResult> {
  // 1. Check first so we don't re-prompt users who already granted / denied.
  let perm = await Location.getForegroundPermissionsAsync();

  if (perm.status !== "granted") {
    // 2. If we haven't asked yet OR we can still ask again, do so.
    if (!perm.canAskAgain && perm.status === "denied") {
      return { status: "blocked" };
    }
    perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      return perm.canAskAgain ? { status: "denied" } : { status: "blocked" };
    }
  }

  try {
    // Balanced accuracy is plenty for "events within N miles" — we don't
    // need turn-by-turn precision here, and Balanced is much faster on
    // Android.
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      status: "granted",
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? 0,
    };
  } catch (e: any) {
    return {
      status: "unavailable",
      reason: e?.message || "Couldn't get your location.",
    };
  }
}
