/**
 * /follows — Following & Followers lists for the current user.
 *
 * Two-tab segment control. Each row is tappable → user's public
 * profile; a follow-back button appears on Follower rows the caller
 * doesn't already follow.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, PublicUser } from "@/src/api/client";
import { FollowButton } from "@/src/components/FollowButton";

type Tab = "following" | "followers";

export default function FollowsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("following");
  const [following, setFollowing] = useState<PublicUser[]>([]);
  const [followers, setFollowers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.getMyFollows(token);
      setFollowing(r.following);
      setFollowers(r.followers);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tab === "following" ? following : followers;

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={12}
            testID="follows-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Network</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.tabs}>
          <TabBtn
            active={tab === "following"}
            label={`Following · ${following.length}`}
            onPress={() => setTab("following")}
            testID="tab-following"
          />
          <TabBtn
            active={tab === "followers"}
            label={`Followers · ${followers.length}`}
            onPress={() => setTab("followers")}
            testID="tab-followers"
          />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="people-outline"
            size={56}
            color={colors.brandTertiary}
          />
          <Text style={styles.emptyTitle}>
            {tab === "following" ? "You're not following anyone yet" : "No followers yet"}
          </Text>
          <Text style={styles.emptySub}>
            {tab === "following"
              ? "Head to the Activity Feed and tap the person icon to find dancers to follow."
              : "As other dancers discover you, they'll show up here."}
          </Text>
          {tab === "following" ? (
            <Pressable
              onPress={() => router.push("/feed")}
              style={styles.cta}
              testID="follows-find-cta"
            >
              <Ionicons name="search" size={16} color="#fff" />
              <Text style={styles.ctaText}>Find dancers</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
          {rows.map((u) => (
            <Pressable
              key={u.user_id}
              style={styles.row}
              onPress={() => router.push(`/users/${u.user_id}`)}
              testID={`follows-row-${u.user_id}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(u.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {u.is_instructor ? "Instructor · " : ""}
                  {u.current_streak > 0
                    ? `🔥 ${u.current_streak}-day streak`
                    : "New dancer"}
                </Text>
              </View>
              <FollowButton
                userId={u.user_id}
                isFollowing={
                  tab === "following" ? true : !!u.is_following
                }
                size="sm"
                onFollowChange={() => load()}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TabBtn({
  active,
  label,
  onPress,
  testID,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  tabLabel: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 13,
  },
  tabLabelActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: {
    flex: 1,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    marginTop: spacing.sm,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  name: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
