/**
 * Notification Center screen — ``/notifications``
 *
 * Shows every push + in-app event the user has received (90-day
 * retention). Rows are tappable (deeplink + mark-as-read) and come
 * with an unread dot + a swipe/trash delete.
 *
 * The icon map lives inline so each row renders with a kind-matched
 * glyph without a per-row style lookup. Timestamps are shown in a
 * compact "2m / 3h / 5d" form; absolute dates kick in after a week.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api, NotificationEvent } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type IconHint = { name: keyof typeof Ionicons.glyphMap; tint: string };

const KIND_ICON_MAP: Record<string, IconHint> = {
  announcement: { name: "megaphone", tint: "#2E7CD6" },
  library_new_dance: { name: "sparkles", tint: "#D97706" },
  library_new_class: { name: "calendar", tint: "#00A86B" },
  admin_pending_dance: { name: "download", tint: "#6B21A8" },
  admin_instructor_grant: { name: "ribbon", tint: "#6B21A8" },
  chat_mention: { name: "at", tint: "#D62828" },
  chat_message: { name: "chatbubbles", tint: "#2E7CD6" },
  chat_reply: { name: "return-up-back", tint: "#D62828" },
  new_dance: { name: "musical-notes", tint: "#D97706" },
  new_class: { name: "school", tint: "#00A86B" },
  new_event: { name: "flag", tint: "#2E7CD6" },
  class_reminder: { name: "alarm", tint: "#D97706" },
  new_follower: { name: "person-add", tint: "#00A86B" },
  event_rsvp: { name: "checkmark-done", tint: "#2E7CD6" },
};

const DEFAULT_ICON: IconHint = {
  name: "notifications",
  tint: "#2E7CD6",
};


function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString();
}


export default function NotificationCenter() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (initial: boolean = false) => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const r = await api.listNotifications(token, 50);
        setItems(r.items);
        setHasMore(r.has_more);
      } catch {
        if (initial) setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Refresh unread count on every focus so the badge is accurate.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      // Re-fetch list quietly on focus so new rows show up without a
      // pull-to-refresh.
      api
        .listNotifications(token, 50)
        .then((r) => {
          setItems(r.items);
          setHasMore(r.has_more);
        })
        .catch(() => {});
    }, [token]),
  );

  const unreadCount = useMemo(
    () => items.filter((i) => !i.read_at).length,
    [items],
  );

  const onRowPress = useCallback(
    async (row: NotificationEvent) => {
      if (!token) return;
      // Optimistic: mark read locally first.
      if (!row.read_at) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === row.id
              ? { ...x, read_at: new Date().toISOString() }
              : x,
          ),
        );
        try {
          await api.markNotificationRead(token, row.id);
        } catch {
          // Non-fatal — the next focus will re-sync.
        }
      }
      // Deeplink navigation — tolerate missing / "/" by routing home.
      const deeplink = (row.deeplink || "/").trim();
      if (deeplink && deeplink !== "/") {
        router.push(deeplink as never);
      }
    },
    [token, router],
  );

  const onDelete = useCallback(
    (row: NotificationEvent) => {
      Alert.alert(
        "Delete notification?",
        "This removes it from your history. The push already shown isn't recalled.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (!token) return;
              // Optimistic: remove locally.
              setItems((prev) => prev.filter((x) => x.id !== row.id));
              try {
                await api.deleteNotification(token, row.id);
              } catch {
                // Rollback — API failed, re-fetch to resync.
                load();
              }
            },
          },
        ],
      );
    },
    [token, load],
  );

  const onMarkAllRead = useCallback(async () => {
    if (!token) return;
    const unreadIds = items.filter((i) => !i.read_at).map((i) => i.id);
    if (unreadIds.length === 0) return;
    const stamp = new Date().toISOString();
    setItems((prev) =>
      prev.map((x) => (x.read_at ? x : { ...x, read_at: stamp })),
    );
    try {
      await api.markAllNotificationsRead(token);
    } catch {
      // Non-fatal — next focus will reconcile.
    }
  }, [token, items]);

  const onLoadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const r = await api.listNotifications(token, 50, last.created_at);
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.has_more);
    } catch {
      // No-op — swipe up again later.
    } finally {
      setLoadingMore(false);
    }
  }, [token, items, hasMore, loadingMore]);

  const renderItem = useCallback(
    ({ item }: { item: NotificationEvent }) => {
      const hint = KIND_ICON_MAP[item.kind] ?? DEFAULT_ICON;
      return (
        <Pressable
          testID={`notif-row-${item.id}`}
          onPress={() => onRowPress(item)}
          onLongPress={() => onDelete(item)}
          style={({ pressed }) => [
            styles.row,
            pressed && styles.rowPressed,
            !item.read_at && styles.rowUnread,
          ]}
        >
          <View style={[styles.iconBox, { backgroundColor: `${hint.tint}1F` }]}>
            <Ionicons name={hint.name} size={20} color={hint.tint} />
            {!item.read_at && <View style={styles.unreadDot} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                styles.rowTitle,
                !item.read_at && styles.rowTitleUnread,
              ]}
              numberOfLines={1}
            >
              {item.title || "Notification"}
            </Text>
            <Text style={styles.rowBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.rowMeta}>
              {relativeTime(item.created_at)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      );
    },
    [onRowPress, onDelete],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)");
            }}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.onSurface}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="notif-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>
          Notifications
          {unreadCount > 0 ? ` · ${unreadCount}` : ""}
        </Text>
        {unreadCount > 0 ? (
          <Pressable
            testID="notif-mark-all-read"
            onPress={onMarkAllRead}
            hitSlop={10}
            style={styles.markReadBtn}
          >
            <Text style={styles.markReadText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons
            name="notifications-off-outline"
            size={40}
            color={colors.muted}
          />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyBody}>
            When admins pin an announcement, an instructor posts in chat,
            or someone follows you, you&apos;ll see it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
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
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  markReadBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 36,
    minHeight: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  markReadText: {
    color: colors.brandPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: colors.onSurface,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    fontWeight: "600",
    color: colors.onSurface,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowUnread: {
    backgroundColor: colors.brandPrimary + "0A",
    borderColor: colors.brandPrimary + "33",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
  },
  rowTitleUnread: {
    fontWeight: "800",
  },
  rowBody: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.muted,
  },
});
