/**
 * Followed choreographers list
 * ----------------------------
 * Route: ``/choreographers``  (index)
 *
 * Header:
 *   • "Following" tab  → what the user follows (with a per-row Latest
 *      dance chip so they can jump into it in one tap)
 *   • "Discover" tab   → top choreographers in the library (by dance
 *      count), searchable, each row with a Follow / Following pill
 *
 * Reached from the Profile screen's new "Followed choreographers" row.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, ChoreographerFollowRow } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { ChoreographerFollowButton } from "@/src/components/ChoreographerFollowButton";
import { colors, spacing, radius } from "@/src/theme";

type TabKey = "following" | "discover";

export default function ChoreographersIndex() {
  const router = useRouter();
  const { token } = useAuth();

  const [tab, setTab] = useState<TabKey>("following");
  const [q, setQ] = useState("");
  const [following, setFollowing] = useState<ChoreographerFollowRow[] | null>(
    null
  );
  const [discover, setDiscover] = useState<ChoreographerFollowRow[] | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [f, d] = await Promise.all([
        api.myFollowedChoreographers(token),
        api.listChoreographers(token, { limit: 80 }),
      ]);
      setFollowing(f.choreographers);
      setDiscover(d.choreographers);
      // If the caller isn't following anyone yet, land them on
      // Discover automatically so the screen isn't empty.
      if (!f.choreographers.length && tab === "following") {
        setTab("discover");
      }
    } catch {
      // On failure keep whatever we had; users can pull-to-refresh.
    }
    setLoading(false);
    setRefreshing(false);
  }, [token, tab]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Filter the visible list by the search box. Discover already comes
  // pre-sorted by dance count on the server, so we just substring-match
  // on the display name client-side.
  const filteredDiscover = useMemo(() => {
    if (!discover) return [];
    const query = q.trim().toLowerCase();
    if (!query) return discover;
    return discover.filter((row) =>
      row.choreographer.toLowerCase().includes(query)
    );
  }, [discover, q]);

  const filteredFollowing = useMemo(() => {
    if (!following) return [];
    const query = q.trim().toLowerCase();
    if (!query) return following;
    return following.filter((row) =>
      row.choreographer.toLowerCase().includes(query)
    );
  }, [following, q]);

  const followingIds = useMemo(
    () => new Set((following || []).map((r) => r.choreographer_key)),
    [following]
  );

  const handleFollowChange = useCallback(
    (row: ChoreographerFollowRow, isFollowing: boolean) => {
      if (isFollowing) {
        // Optimistically add to the top of the following list so the
        // Following tab reflects the change instantly.
        setFollowing((prev) => {
          const cleaned = (prev || []).filter(
            (r) => r.choreographer_key !== row.choreographer_key
          );
          return [{ ...row, is_following: true }, ...cleaned];
        });
      } else {
        setFollowing((prev) =>
          (prev || []).filter(
            (r) => r.choreographer_key !== row.choreographer_key
          )
        );
      }
    },
    []
  );

  const rows = tab === "following" ? filteredFollowing : filteredDiscover;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="chors-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Choreographers</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.tabsRow}>
        <Pressable
          testID="tab-following"
          onPress={() => setTab("following")}
          style={[styles.tab, tab === "following" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "following" && styles.tabTextActive]}
          >
            Following{" "}
            {following ? `(${following.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          testID="tab-discover"
          onPress={() => setTab("discover")}
          style={[styles.tab, tab === "discover" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "discover" && styles.tabTextActive]}
          >
            Discover
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          testID="chors-search"
          placeholder="Search by name"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
        />
        {q ? (
          <Pressable onPress={() => setQ("")} hitSlop={12}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
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
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={
                  tab === "following"
                    ? "notifications-outline"
                    : "people-outline"
                }
                size={40}
                color={colors.muted}
              />
              <Text style={styles.emptyTitle}>
                {tab === "following"
                  ? "You're not following anyone yet"
                  : q
                    ? "No matches"
                    : "No choreographers yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === "following"
                  ? "Follow a choreographer to get a nudge when a new dance by them lands in the library."
                  : q
                    ? "Try a different spelling or clear the search."
                    : "The library is empty. Add a dance to get started."}
              </Text>
              {tab === "following" ? (
                <Pressable
                  onPress={() => setTab("discover")}
                  style={styles.primaryBtn}
                  testID="empty-go-discover"
                >
                  <Ionicons
                    name="compass"
                    size={16}
                    color={colors.onBrandPrimary}
                  />
                  <Text style={styles.primaryBtnText}>Discover choreographers</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            rows.map((row) => {
              const alreadyFollowing =
                followingIds.has(row.choreographer_key) ||
                !!row.is_following;
              return (
                <Pressable
                  key={row.choreographer_key}
                  testID={`chor-row-${row.choreographer_key}`}
                  onPress={() =>
                    router.push(
                      `/choreographers/${encodeURIComponent(row.choreographer)}`
                    )
                  }
                  style={styles.row}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {row.choreographer.charAt(0).toUpperCase() || "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.choreographer}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {row.dance_count} dance
                      {row.dance_count === 1 ? "" : "s"}
                      {row.latest_dance_name
                        ? ` · Latest: ${row.latest_dance_name}`
                        : ""}
                    </Text>
                  </View>
                  <ChoreographerFollowButton
                    choreographer={row.choreographer}
                    initialFollowing={alreadyFollowing}
                    onChange={(isFollowing) =>
                      handleFollowChange(row, isFollowing)
                    }
                    compact
                  />
                </Pressable>
              );
            })
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
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: {
    color: colors.onSurfaceSecondary,
    fontWeight: "700",
    fontSize: 13,
  },
  tabTextActive: { color: colors.onBrandPrimary },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
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
    textAlign: "center",
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryBtn: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
  rowName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});
