/**
 * Choreographer profile screen
 * -----------------------------
 * Route: ``/choreographers/[name]`` — deep-link target from
 *   • "By <chor>" subtitle on any dance card / detail
 *   • "Followed choreographers" list on the profile screen
 *   • Push-notification payload's ``deeplink`` when a new dance drops
 *
 * Shows the canonical display name, follower count in-app, a big
 * Follow / Following pill (uses the shared button), and every
 * PUBLISHED dance the library has by that person (newest first).
 * Each dance card is tappable → jumps into the dance detail screen.
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
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, ChoreographerDetail } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { ChoreographerFollowButton } from "@/src/components/ChoreographerFollowButton";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";

export default function ChoreographerProfile() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const displayName = decodeURIComponent((name as string) || "").trim();
  const router = useRouter();
  const { token } = useAuth();

  const [detail, setDetail] = useState<ChoreographerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token || !displayName) {
      setLoading(false);
      return;
    }
    try {
      const d = await api.getChoreographerDetail(displayName, token);
      setDetail(d);
      setFollowerCount(d.follower_count);
    } catch {
      setDetail(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [token, displayName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="chor-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/library");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Choreographer
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : !detail ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>No dances found</Text>
          <Text style={styles.errorBody}>
            We couldn&apos;t find any published dances by &ldquo;{displayName}&rdquo;
            in the library.
          </Text>
          <Pressable
            onPress={() => router.replace("/(tabs)/library")}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Back to library</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
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
          <View style={styles.heroCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {detail.choreographer.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {detail.choreographer}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statNum}>{detail.dance_count}</Text>
                <Text style={styles.statLabel}>
                  dance{detail.dance_count === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statNum}>
                  {(followerCount ?? detail.follower_count) || 0}
                </Text>
                <Text style={styles.statLabel}>
                  follower
                  {(followerCount ?? detail.follower_count) === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <ChoreographerFollowButton
              choreographer={detail.choreographer}
              initialFollowing={detail.is_following}
              onChange={(_isFollowing, count) => setFollowerCount(count)}
              testID="chor-follow-btn"
            />
            {(followerCount ?? detail.follower_count) === 0 ? (
              <Text style={styles.encourage}>
                Be the first to follow · get a nudge when they drop a new dance
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>
            Dances in the library ({detail.dances.length})
          </Text>
          {detail.dances.map((d) => (
            <Pressable
              key={d.id}
              testID={`chor-dance-${d.id}`}
              onPress={() => router.push(`/dance/${d.id}`)}
              style={styles.danceCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.danceTitle} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={styles.danceMeta} numberOfLines={1}>
                  {d.song || "—"}
                  {d.artist ? ` · ${d.artist}` : ""}
                </Text>
                <View style={styles.danceBadgeRow}>
                  <View
                    style={[
                      styles.diffBadge,
                      { backgroundColor: difficultyColor(d.difficulty) },
                    ]}
                  >
                    <Text style={styles.diffBadgeText}>
                      {d.difficulty || "Beginner"}
                    </Text>
                  </View>
                  {d.bpm ? (
                    <Text style={styles.metaSmall}>{d.bpm} BPM</Text>
                  ) : null}
                  {d.count ? (
                    <Text style={styles.metaSmall}>{d.count}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.muted}
              />
            </Pressable>
          ))}
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
    fontSize: 14,
  },
  heroCard: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandPrimary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "serif",
    fontSize: 34,
    fontWeight: "700",
    color: colors.brandPrimary,
  },
  name: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  statBlock: { alignItems: "center", minWidth: 60 },
  statNum: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: colors.divider,
  },
  encourage: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  danceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danceTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  danceMeta: {
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  danceBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 8,
    flexWrap: "wrap",
  },
  diffBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  diffBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  metaSmall: {
    fontSize: 11,
    color: colors.muted,
  },
});
