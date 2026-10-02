/**
 * Announcements feed — /announcements
 *
 * Read-only list of recent admin "pin" announcements for every signed-in
 * user. This is the deeplink target of the ``push.announcement`` push
 * so tapping the notification lands the dancer on the full message
 * even when the tiny push preview truncated it.
 *
 * Admins see the exact same list PLUS a "Compose new" button up top
 * that routes to ``/admin/announcements``.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, Announcement } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";


export default function AnnouncementsFeed() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await api.listAnnouncements(token, 50);
      setItems(r.items || []);
    } catch {
      // Non-fatal — a flaky network leaves the previous list in place.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="ann-feed-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Announcements</Text>
        {user?.is_admin ? (
          <Pressable
            testID="ann-feed-compose"
            onPress={() => router.push("/admin/announcements")}
            hitSlop={10}
            style={styles.composeBtn}
          >
            <Ionicons
              name="create"
              size={22}
              color={colors.brandPrimary}
            />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centered}
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
          <Ionicons name="megaphone-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>No announcements yet</Text>
          <Text style={styles.emptyBody}>
            When the Stompin&apos; Ground Yuma admins pin an update it&apos;ll
            show up here.
          </Text>
        </ScrollView>
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
          {items.map((ann) => (
            <View
              key={ann.id}
              style={styles.card}
              testID={`ann-card-${ann.id}`}
            >
              <View style={styles.cardHeader}>
                <View style={styles.pinIcon}>
                  <Ionicons
                    name="megaphone"
                    size={16}
                    color={colors.brandPrimary}
                  />
                </View>
                <Text style={styles.cardTitle}>{ann.title}</Text>
              </View>
              <Text style={styles.cardBody}>{ann.body}</Text>
              <Text style={styles.cardMeta}>
                {ann.created_by_name || "Admin"} ·{" "}
                {new Date(ann.created_at).toLocaleString()}
              </Text>
            </View>
          ))}
        </ScrollView>
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
  composeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.onSurface,
  },
  centered: {
    flexGrow: 1,
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
  },
  card: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.sm,
  },
  pinIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.brandPrimary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  cardBody: {
    fontSize: 15,
    color: colors.onSurface,
    lineHeight: 22,
  },
  cardMeta: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.muted,
  },
});
