import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_BASE } from "../api/client";

/**
 * Registers this device for push notifications and posts the native FCM/APNs
 * token to the backend. Safe to call on every app open; tokens rotate and
 * the backend upserts.
 *
 * Silently no-ops on web.
 */
export async function registerForPush(user_id: string): Promise<void> {
  try {
    if (Platform.OS === "web") return;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    if (!tokenResp?.data) return;

    await fetch(`${API_BASE}/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    // Never crash the app because of push registration.
  }
}
