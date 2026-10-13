import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_BASE } from "../api/client";

/**
 * Registers this device for push notifications and posts the native FCM/APNs
 * token to the backend. Safe to call on every app open; tokens rotate and
 * the backend upserts.
 *
 * Silently no-ops on web or if no auth token is provided.
 */
export async function registerForPush(token: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    if (!token) return;

    // iOS uses the native APNs token from getDevicePushTokenAsync(); the
    // Emergent relay delivers via APNs with the .p8 key uploaded at build
    // time — no Firebase / GoogleService-Info.plist is involved on iOS.
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    if (!tokenResp?.data) return;

    await fetch(`${API_BASE}/register-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // user_id is ignored server-side (bound to auth token) but kept for
        // backward-compat with any older backend deploys.
        user_id: "",
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    // Never crash the app because of push registration.
  }
}
