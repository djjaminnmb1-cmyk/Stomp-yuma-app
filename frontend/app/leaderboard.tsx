import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { api, LeaderboardEntry, LeaderboardPrize, LeaderboardResponse, LeaderboardRange } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

const RANGES: { key: LeaderboardRange; label: string; icon: any }[] = [
  { key: "week", label: "This Week", icon: "calendar" },
  { key: "month", label: "This Month", icon: "calendar-outline" },
  { key: "all", label: "All Time", icon: "trophy" },
];

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function prizeBadgeStyle(rank: number) {
  if (rank === 1) return { backgroundColor: "#F2A628" };
  if (rank === 2) return { backgroundColor: "#B0B0B0" };
  return { backgroundColor: "#C08040" };
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { token, user, updateUser } = useAuth();
  const [range, setRange] = useState<LeaderboardRange>("all");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [prizes, setPrizes] = useState<LeaderboardPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        api.getLeaderboard(range, 20, token || undefined),
        api.listPrizes(range).catch(() => ({ range, prizes: [] as LeaderboardPrize[] })),
      ]);
      setData(d);
      setPrizes(p.prizes || []);
    } catch {
      setData(null);
      setPrizes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, token]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const toggleOptIn = async (next: boolean) => {
    if (!token || toggling) return;
    setToggling(true);
    try {
      const res = await api.toggleLeaderboard(next, token);
      updateUser({ show_on_leaderboard: res.user.show_on_leaderboard });
      await load();
    } catch {}
    setToggling(false);
  };

  const optedIn = !!user?.show_on_leaderboard;
  // Backend no longer returns `user_id` in public entries (SEC hardening).
  // Instead each entry carries an `is_you` boolean scoped to the caller —
  // and each entry from the server needs a stable key for React.
  const entryKey = (e: LeaderboardEntry, idx: number) =>
    `${e.rank}-${e.name}-${idx}`;

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <LinearGradient
          colors={[colors.brandTertiary, colors.brandPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            testID="lb-back"
            style={styles.iconBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Boot Scoot Board</Text>
            <Text style={styles.headerTitle}>Leaderboard</Text>
          </View>
          {user?.is_admin ? (
            <Pressable
              onPress={() => router.push({ pathname: "/leaderboard-admin", params: { range } })}
              testID="lb-admin"
              style={styles.iconBtn}
              hitSlop={12}
              accessibilityLabel="Manage leaderboard"
            >
              <Ionicons name="settings-sharp" size={22} color="#fff" />
            </Pressable>
          ) : (
            <Ionicons name="trophy" size={26} color="#fff" />
          )}
        </View>

        {/* Range picker */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const on = range === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                testID={`lb-range-${r.key}`}
                style={[styles.rangeChip, on && styles.rangeChipOn]}
              >
                <Ionicons
                  name={r.icon}
                  size={13}
                  color={on ? colors.brandPrimary : "#fff"}
                />
                <Text style={[styles.rangeChipText, on && styles.rangeChipTextOn]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
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
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <>
            {/* Opt-in banner if user not opted in */}
            {token && !optedIn ? (
              <View style={styles.optInCard}>
                <Ionicons name="eye-off" size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optInTitle}>You&apos;re hidden from the board</Text>
                  <Text style={styles.optInSub}>
                    Only your name and completed count would be shown. You can turn
                    this off any time.
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggleOptIn(true)}
                  disabled={toggling}
                  testID="lb-opt-in"
                  style={[styles.optBtn, toggling && { opacity: 0.6 }]}
                >
                  <Text style={styles.optBtnText}>
                    {toggling ? "…" : "Join"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {token && optedIn ? (
              <Pressable
                onPress={() => toggleOptIn(false)}
                disabled={toggling}
                testID="lb-opt-out"
                style={styles.hideBtn}
              >
                <Ionicons name="eye-off-outline" size={14} color={colors.muted} />
                <Text style={styles.hideBtnText}>
                  You&apos;re on the board — tap to hide
                </Text>
              </Pressable>
            ) : null}

            {/* "You" personal block if authed but out of top-N */}
            {data?.me && data.me.rank && !data.me.in_top ? (
              <View style={styles.youCard}>
                <Text style={styles.youLabel}>Your rank</Text>
                <View style={styles.youRow}>
                  <RankBadge rank={data.me.rank} />
                  <Avatar name={user?.name || "You"} picture={user?.picture} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.youName}>{user?.name || "You"}</Text>
                    <Text style={styles.youMeta}>
                      {data.me.opted_in ? "Visible on board" : "Only visible to you"}
                    </Text>
                  </View>
                  <View style={styles.countBox}>
                    <Text style={styles.countBig}>{data.me.count}</Text>
                    <Text style={styles.countLbl}>done</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Empty state */}
            {(data?.entries?.length ?? 0) === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="trophy-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyTitle}>Board is quiet</Text>
                <Text style={styles.emptyText}>
                  {range === "week"
                    ? "No dances completed in the last 7 days yet."
                    : range === "month"
                      ? "No dances completed in the last 30 days yet."
                      : "Be the first to top the board! Mark a dance completed on any dance page."}
                </Text>
              </View>
            ) : null}

            {/* Prizes for this range */}
            {prizes.some((p) => p.title || p.description || p.image) ? (
              <View style={styles.prizesCard}>
                <View style={styles.prizesHeader}>
                  <Ionicons name="gift" size={16} color={colors.brandPrimary} />
                  <Text style={styles.prizesTitle}>
                    Prizes {range === "week" ? "this week" : range === "month" ? "this month" : "up for grabs"}
                  </Text>
                </View>
                <View style={styles.prizesRow}>
                  {prizes
                    .filter((p) => p.title || p.description || p.image)
                    .map((p) => (
                      <View key={`${p.range}-${p.rank}`} style={styles.prizeSlot}>
                        <View style={[styles.prizeRankBadge, prizeBadgeStyle(p.rank)]}>
                          <Text style={styles.prizeRankText}>{ordinal(p.rank)}</Text>
                        </View>
                        {p.image ? (
                          <Image source={{ uri: p.image }} style={styles.prizeImage} />
                        ) : (
                          <View style={[styles.prizeImage, styles.prizeImagePh]}>
                            <Ionicons
                              name={p.rank === 1 ? "trophy" : p.rank === 2 ? "medal" : "ribbon"}
                              size={30}
                              color={colors.brandPrimary}
                            />
                          </View>
                        )}
                        {p.title ? (
                          <Text style={styles.prizeSlotTitle} numberOfLines={2}>
                            {p.title}
                          </Text>
                        ) : null}
                        {p.description ? (
                          <Text style={styles.prizeSlotDesc} numberOfLines={3}>
                            {p.description}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                </View>
              </View>
            ) : user?.is_admin ? (
              <Pressable
                onPress={() => router.push({ pathname: "/leaderboard-admin", params: { range } })}
                testID="lb-add-prizes"
                style={styles.prizesEmpty}
              >
                <Ionicons name="gift-outline" size={20} color={colors.brandPrimary} />
                <Text style={styles.prizesEmptyText}>
                  Add prizes for the top 3 → tap to edit
                </Text>
              </Pressable>
            ) : null}

            {/* Podium (top 3) */}
            {(data?.entries?.length ?? 0) > 0 ? (
              <View style={styles.podium}>
                {data!.entries.slice(0, 3).map((e, i) => (
                  <PodiumSlot key={entryKey(e, i)} entry={e} you={!!e.is_you} />
                ))}
              </View>
            ) : null}

            {/* Rank rows 4+ */}
            {(data?.entries?.length ?? 0) > 3 ? (
              <View style={styles.rankList}>
                {data!.entries.slice(3).map((e, i) => (
                  <RankRow key={entryKey(e, i + 3)} entry={e} you={!!e.is_you} />
                ))}
              </View>
            ) : null}

            {data && data.total_visible < data.total_dancers ? (
              <Text style={styles.footNote}>
                {data.total_dancers - data.total_visible}{" "}
                other dancer
                {data.total_dancers - data.total_visible === 1 ? "" : "s"} chose to
                stay private.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PodiumSlot({ entry, you }: { entry: LeaderboardEntry; you: boolean }) {
  const isFirst = entry.rank === 1;
  const isSecond = entry.rank === 2;
  const size = isFirst ? 100 : 80;
  const heightBoost = isFirst ? 0 : isSecond ? 16 : 30;
  const medalColor =
    entry.rank === 1 ? "#F2A628" : entry.rank === 2 ? "#B0B0B0" : "#C08040";

  return (
    <View style={[styles.podiumSlot, { marginTop: heightBoost }]}>
      <View
        style={[
          styles.podiumAvatarRing,
          { width: size, height: size, borderRadius: size / 2, borderColor: medalColor },
        ]}
      >
        <Avatar
          name={entry.name}
          picture={entry.picture}
          size={size - 12}
          you={you}
        />
        <View style={[styles.medal, { backgroundColor: medalColor }]}>
          <Text style={styles.medalText}>{entry.rank}</Text>
        </View>
      </View>
      <Text
        style={[styles.podiumName, isFirst && { fontSize: 15 }]}
        numberOfLines={1}
      >
        {you ? "You" : entry.name}
      </Text>
      <Text style={styles.podiumCount}>{entry.count} completed</Text>
      {entry.is_instructor ? (
        <View style={styles.instBadge}>
          <Ionicons name="school" size={10} color={colors.brandSecondary} />
          <Text style={styles.instBadgeText}>Instructor</Text>
        </View>
      ) : null}
    </View>
  );
}

function RankRow({ entry, you }: { entry: LeaderboardEntry; you: boolean }) {
  return (
    <View style={[styles.rankRow, you && styles.rankRowYou]}>
      <RankBadge rank={entry.rank} />
      <Avatar name={entry.name} picture={entry.picture} size={36} you={you} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rankName} numberOfLines={1}>
          {you ? `${entry.name} · You` : entry.name}
        </Text>
        {entry.is_instructor ? (
          <View style={styles.miniInstBadge}>
            <Ionicons name="school" size={10} color={colors.brandSecondary} />
            <Text style={styles.miniInstBadgeText}>Instructor</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.countBoxSm}>
        <Text style={styles.countBigSm}>{entry.count}</Text>
        <Text style={styles.countLblSm}>done</Text>
      </View>
    </View>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <View style={styles.rankBadge}>
      <Text style={styles.rankBadgeText}>#{rank}</Text>
    </View>
  );
}

function Avatar({
  name,
  picture,
  size = 56,
  you,
}: {
  name: string;
  picture?: string;
  size?: number;
  you?: boolean;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (picture) {
    return (
      <Image
        source={{ uri: picture }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: you ? colors.brandPrimary : colors.brandSecondary,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarInitial,
          { fontSize: size * 0.4, color: "#fff" },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerWrap: {
    paddingBottom: spacing.lg,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    zIndex: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  headerTitle: {
    fontFamily: "serif",
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },

  rangeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    zIndex: 2,
  },
  rangeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  rangeChipOn: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  rangeChipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rangeChipTextOn: { color: colors.brandPrimary },

  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  loading: { alignItems: "center", padding: spacing.xxl },
  empty: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: 4,
  },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: 13, maxWidth: 300 },

  optInCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  optInTitle: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  optInSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  optBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  optBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  hideBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hideBtnText: { color: colors.muted, fontSize: 11, fontWeight: "600" },

  youCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    gap: 6,
  },
  youLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brandPrimary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  youRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  youName: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  youMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },

  podium: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  podiumSlot: {
    alignItems: "center",
    gap: 6,
    maxWidth: 120,
  },
  podiumAvatarRing: {
    borderWidth: 3,
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    backgroundColor: colors.surface,
  },
  medal: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  medalText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  podiumName: {
    fontFamily: "serif",
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  podiumCount: { color: colors.muted, fontSize: 11, textAlign: "center" },

  rankList: { gap: 8, marginTop: spacing.md },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankRowYou: {
    borderColor: colors.brandPrimary,
    borderWidth: 2,
  },
  rankName: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  rankBadge: {
    minWidth: 44,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 12 },

  countBox: {
    alignItems: "center",
    gap: 2,
    minWidth: 56,
  },
  countBigSm: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.brandPrimary,
    lineHeight: 24,
  },
  countBig: {
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "700",
    color: colors.brandPrimary,
    lineHeight: 28,
  },
  countLbl: { fontSize: 10, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  countLblSm: { fontSize: 10, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  countBoxSm: { alignItems: "center", gap: 2, minWidth: 48 },

  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontWeight: "700" },

  instBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "rgba(29,59,135,0.1)",
  },
  instBadgeText: {
    color: colors.brandSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  miniInstBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: "rgba(29,59,135,0.1)",
  },
  miniInstBadgeText: {
    color: colors.brandSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  footNote: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 11,
    marginTop: spacing.md,
    fontStyle: "italic",
  },

  // ---- Prizes card ----
  prizesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandTertiary + "66",
    marginBottom: spacing.md,
  },
  prizesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.md,
  },
  prizesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  prizesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: spacing.sm,
  },
  prizeSlot: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    maxWidth: 130,
  },
  prizeRankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  prizeRankText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  prizeImage: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    marginBottom: 4,
    backgroundColor: colors.surfaceSecondary,
  },
  prizeImagePh: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  prizeSlotTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  prizeSlotDesc: {
    fontSize: 10,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
  },
  prizesEmpty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.brandPrimary + "0F",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brandPrimary + "55",
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  prizesEmptyText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
});
