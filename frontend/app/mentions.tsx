/**
 * My mentions screen
 * ------------------
 * Route: ``/mentions`` — deep-link target from a chat-mention push
 * notification. Also reachable from the Profile screen row.
 *
 * Behaviour:
 *   • Loads /chat/mentions/me on mount.
 *   • Fires a mark-seen call ONCE per visit so the profile-row unread
 *     pill drops back to 0 the moment the user opens the screen.
 *   • Pull-to-refresh + last-40 cap; older mentions can be exposed
 *     later behind a "See more" if it becomes noisy.
 *
 * The message snippet is capped server-side to 200 chars, so we can
 * safely render it in-line without truncation logic.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, ChatMention } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

function formatWhen(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MentionsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [mentions, setMentions] = useState<ChatMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.getMyMentions(token, 50);
      setMentions(r.mentions);
    } catch {
      // Keep whatever we had — user can pull-to-refresh.
    }
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Fire mark-seen once, AFTER the first successful load, so the
  // Profile row's unread pill flips to 0 the moment the user opens
  // the list. We do this outside the initial fetch so a failed load
  // doesn't accidentally wipe the seen state.
  useEffect(() => {
    if (!token || loading || mentions.length === 0) return;
    const anyUnread = mentions.some((m) => !m.seen);
    if (!anyUnread) return;
    api
      .markMentionsSeen(token)
      .then(() =>
        setMentions((prev) => prev.map((m) => ({ ...m, seen: true })))
      )
      .catch(() => {});
  }, [token, loading, mentions]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="mentions-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>My mentions</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          {mentions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="at" size={44} color={colors.muted} />
              <Text style={styles.emptyTitle}>No mentions yet</Text>
              <Text style={styles.emptyBody}>
                When an instructor tags you with{" "}
                <Text style={styles.emptyAccent}>@{user?.name || "yourname"}</Text>{" "}
                in the class chat, it&apos;ll land here — and you&apos;ll get
                a push if you have notifications enabled.
              </Text>
            </View>
          ) : (
            mentions.map((m) => (
              <Pressable
                key={m.mention_id}
                testID={`mention-row-${m.mention_id}`}
                onPress={() => router.push(`/users/${m.mentioner_id}`)}
                style={[styles.row, !m.seen && styles.rowUnread]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(m.mentioner_name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowFrom} numberOfLines={1}>
                      {m.mentioner_name || "An instructor"}
                    </Text>
                    <Text style={styles.rowWhen}>
                      {formatWhen(m.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.rowMsg} numberOfLines={3}>
                    {m.message_text_snippet || "(no preview)"}
                  </Text>
                </View>
                {!m.seen ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            ))
          )}
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
  },
  empty: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  emptyAccent: {
    color: colors.brandPrimary,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: {
    backgroundColor: colors.brandPrimary + "10",
    borderColor: colors.brandPrimary + "55",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.brandPrimary,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowFrom: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
    flex: 1,
  },
  rowWhen: {
    fontSize: 11,
    color: colors.muted,
  },
  rowMsg: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
});
