/**
 * /settings/notifications — per-category push notification toggles.
 *
 * Each row flips a boolean flag on the caller's ``notification_prefs``
 * sub-doc via PATCH ``/users/me/notification-prefs``. Everything is
 * opt-out (default = notifications ON). Muting is applied SERVER-SIDE
 * at fan-out time so a mute takes effect immediately for the next
 * class / event / mention / choreographer drop.
 *
 * A single retry banner appears if the last PATCH failed — otherwise
 * the toggles auto-save silently.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, NotificationPrefs } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

type Row = {
  key: keyof NotificationPrefs;
  icon: string;
  title: string;
  subtitle: string;
};

const ROWS: Row[] = [
  {
    key: "class_alerts",
    icon: "school",
    title: "New class posted",
    subtitle:
      "When an instructor you follow posts a new class in the schedule",
  },
  {
    key: "event_alerts",
    icon: "calendar",
    title: "New event or workshop",
    subtitle: "When an instructor you follow adds an event to the calendar",
  },
  {
    key: "reminder_alerts",
    icon: "alarm",
    title: "24-hour class reminder",
    subtitle: "The day-before nudge for classes you've RSVP'd to",
  },
  {
    key: "choreographer_alerts",
    icon: "musical-notes",
    title: "New dance by a choreographer",
    subtitle:
      "When a choreographer you follow has a new dance imported to the library",
  },
  {
    key: "mention_alerts",
    icon: "at",
    title: "Chat mentions",
    subtitle:
      "When an instructor tags you with @yourname in the class chat",
  },
  {
    key: "chat_alerts",
    icon: "chatbubbles",
    title: "New chat messages",
    subtitle:
      "When any instructor posts in the class chat — turn off to only hear about @mentions",
  },
];

export default function NotificationSettings() {
  const router = useRouter();
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getNotificationPrefs(token)
      .then((r) => setPrefs(r.prefs))
      .catch(() => setPrefs(null))
      .finally(() => setLoading(false));
  }, [token]);

  const toggle = useCallback(
    async (key: keyof NotificationPrefs, next: boolean) => {
      if (!token || !prefs) return;
      // Optimistic — flip locally, rollback if the PATCH errors.
      const previous = prefs[key];
      setPrefs({ ...prefs, [key]: next });
      setSaveError(null);
      try {
        const r = await api.updateNotificationPrefs(token, { [key]: next });
        setPrefs(r.prefs);
      } catch (e: any) {
        setPrefs({ ...prefs, [key]: previous });
        setSaveError(
          e?.message ||
            "Couldn't save that change. Check your connection and try again."
        );
      }
    },
    [token, prefs]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="notif-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : !prefs ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Couldn&apos;t load preferences</Text>
          <Text style={styles.errorBody}>
            Check your connection and pull-to-refresh, or reopen this screen
            in a moment.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        >
          <Text style={styles.intro}>
            Choose which pushes you want to receive. Turning a category off
            takes effect immediately — you can flip it back on anytime.
          </Text>
          {saveError ? (
            <View style={styles.errBanner} testID="notif-save-error">
              <Ionicons
                name="alert-circle"
                size={16}
                color={colors.danger || "#B22314"}
              />
              <Text style={styles.errBannerText}>{saveError}</Text>
            </View>
          ) : null}
          {ROWS.map((row) => (
            <View
              key={row.key}
              testID={`notif-row-${row.key}`}
              style={styles.row}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={row.icon as any}
                    size={20}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                </View>
              </View>
              <Switch
                testID={`notif-toggle-${row.key}`}
                value={prefs[row.key]}
                onValueChange={(v) => toggle(row.key, v)}
                trackColor={{ true: colors.brandPrimary }}
              />
            </View>
          ))}
          <View style={styles.footNote}>
            <Text style={styles.footNoteText}>
              Push notifications also depend on your device settings. If
              they&apos;re not landing, check iOS / Android system
              notification permissions for Stompin&apos; Ground Yuma.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
    flex: 1,
    textAlign: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  errorBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  intro: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  errBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: (colors.danger || "#B22314") + "55",
    backgroundColor: (colors.danger || "#B22314") + "10",
    marginBottom: spacing.md,
  },
  errBannerText: {
    color: colors.danger || "#B22314",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary + "18",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    lineHeight: 17,
  },
  footNote: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  footNoteText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});
