/**
 * Admin — Refresh Recommendations
 * -------------------------------
 * Route: ``/admin/refresh-recommendations``
 *
 * Lists every library dance whose CopperKnob or BootStepper metadata
 * has drifted from what we've stored locally. Each row shows a
 * compact drift summary + the top 3 differing fields; tapping "Review"
 * jumps to the dance detail where the existing Compare sheet lets
 * admins accept the update in one tap.
 *
 * Header controls:
 *   • Toggle "Unreviewed" vs "All"
 *   • "Rerun scan" — kicks a fresh drift check on demand (backend runs
 *     synchronously; we show a spinner + the summary counts)
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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, RefreshRecommendationFlag } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

const FIELD_LABEL: Record<string, string> = {
  name: "Title",
  choreographer: "Choreographer",
  song: "Song",
  artist: "Artist",
  count: "Count",
  difficulty: "Difficulty",
};

export default function RefreshRecommendationsScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"unseen" | "all">("unseen");
  const [flags, setFlags] = useState<RefreshRecommendationFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [counts, setCounts] = useState<{ unseen: number; total: number }>({
    unseen: 0,
    total: 0,
  });

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [q, c] = await Promise.all([
        api.getRefreshRecommendations(token, {
          seen: tab === "unseen" ? false : undefined,
          limit: 200,
        }),
        api.getRefreshRecommendationCounts(token),
      ]);
      setFlags(q.flags);
      setCounts(c);
    } catch {
      // Keep whatever we had — pull-to-refresh remains as escape.
    }
    setLoading(false);
    setRefreshing(false);
  }, [token, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const onRerun = async () => {
    if (!token || rerunBusy) return;
    setRerunBusy(true);
    try {
      const res = await api.rerunRefreshRecommendations(token);
      const summary = res.runs
        .map(
          (r) =>
            `${r.source}: checked ${r.checked}, flagged ${r.flagged}, cleared ${r.cleared}`
        )
        .join("\n");
      Alert.alert(
        "Scan complete",
        summary || "No sources scanned.",
        [{ text: "OK", onPress: () => load() }]
      );
    } catch (e: any) {
      Alert.alert(
        "Scan failed",
        e?.message || "The drift scanner couldn't reach one of the providers."
      );
    } finally {
      setRerunBusy(false);
    }
  };

  const onDismiss = async (row: RefreshRecommendationFlag) => {
    if (!token) return;
    try {
      await api.dismissRefreshRecommendation(token, row.dance_id, row.source);
      setFlags((prev) =>
        prev.filter(
          (r) => !(r.dance_id === row.dance_id && r.source === row.source)
        )
      );
      setCounts((c) => ({
        unseen: Math.max(0, c.unseen - (row.seen ? 0 : 1)),
        total: Math.max(0, c.total - 1),
      }));
    } catch (e: any) {
      Alert.alert("Couldn't dismiss", e?.message || "Try again in a moment.");
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar router={router} title="Refresh Recommendations" />
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Admins only</Text>
          <Text style={styles.errorBody}>
            The drift-scan queue is a moderator tool. If you think you should
            have access, chat with Erin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <HeaderBar router={router} title="Refresh Recommendations" />

      <View style={styles.tabsRow}>
        <Pressable
          testID="tab-unseen"
          onPress={() => setTab("unseen")}
          style={[styles.tab, tab === "unseen" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "unseen" && styles.tabTextActive]}
          >
            Unreviewed{" "}
            {counts.unseen > 0 ? `(${counts.unseen})` : ""}
          </Text>
        </Pressable>
        <Pressable
          testID="tab-all"
          onPress={() => setTab("all")}
          style={[styles.tab, tab === "all" && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, tab === "all" && styles.tabTextActive]}
          >
            All flags ({counts.total})
          </Text>
        </Pressable>
      </View>

      <View style={styles.rerunRow}>
        <Text style={styles.rerunSub}>
          Auto-scans nightly at 3:00 AZ. Runs check ~60 dances per provider
          per pass; a full sweep takes several nights.
        </Text>
        <Pressable
          testID="rerun-scan"
          onPress={onRerun}
          disabled={rerunBusy}
          style={[styles.rerunBtn, rerunBusy && { opacity: 0.6 }]}
        >
          {rerunBusy ? (
            <ActivityIndicator size="small" color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="refresh" size={14} color={colors.onBrandPrimary} />
              <Text style={styles.rerunBtnText}>Rerun scan</Text>
            </>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
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
          {flags.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle" size={40} color={colors.brandPrimary} />
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyBody}>
                {tab === "unseen"
                  ? "No unreviewed drift right now. New flags will show up here after the next nightly scan."
                  : "The drift queue is empty. Rerun the scan or wait for tonight's pass."}
              </Text>
            </View>
          ) : (
            flags.map((f) => (
              <View
                key={`${f.dance_id}:${f.source}`}
                style={[styles.card, !f.seen && styles.cardUnseen]}
                testID={`drift-${f.source}-${f.dance_id}`}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {f.dance_name || f.dance_id}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      By {f.dance_choreographer || "Unknown"}
                      {f.dance_difficulty ? ` · ${f.dance_difficulty}` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.sourceBadge,
                      f.source === "copperknob"
                        ? styles.sourceCk
                        : styles.sourceBs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sourceBadgeText,
                        {
                          color:
                            f.source === "copperknob"
                              ? "#8A5323"
                              : "#3730A3",
                        },
                      ]}
                    >
                      {f.source === "copperknob" ? "CopperKnob" : "BootStepper"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.summary}>
                  {f.differs_count} field{f.differs_count === 1 ? "" : "s"} drifted
                  {f.drift_summary ? ` — ${f.drift_summary}` : ""}
                </Text>
                {f.fields.slice(0, 3).map((row) => (
                  <View key={row.field} style={styles.diffRow}>
                    <Text style={styles.diffLabel} numberOfLines={1}>
                      {FIELD_LABEL[row.field] || row.field}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.diffOurs} numberOfLines={1}>
                        <Text style={styles.diffOursLabel}>Ours </Text>
                        {row.ours || "—"}
                      </Text>
                      <Text style={styles.diffTheirs} numberOfLines={1}>
                        <Text style={styles.diffTheirsLabel}>Theirs </Text>
                        {row.theirs || "—"}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={styles.actionsRow}>
                  <Pressable
                    testID={`drift-review-${f.dance_id}`}
                    style={styles.reviewBtn}
                    onPress={() => router.push(`/dance/${f.dance_id}`)}
                  >
                    <Ionicons
                      name="open-outline"
                      size={14}
                      color={colors.onBrandPrimary}
                    />
                    <Text style={styles.reviewBtnText}>Review</Text>
                  </Pressable>
                  <Pressable
                    testID={`drift-dismiss-${f.dance_id}`}
                    style={styles.dismissBtn}
                    onPress={() => onDismiss(f)}
                  >
                    <Text style={styles.dismissBtnText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HeaderBar({ router, title }: { router: any; title: string }) {
  return (
    <View style={styles.headerBar}>
      <Pressable
        testID="drift-back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/profile");
        }}
        style={styles.backBtn}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 36 }} />
    </View>
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
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  rerunRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rerunSub: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  rerunBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
    justifyContent: "center",
  },
  rerunBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 12,
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
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
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
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  cardUnseen: {
    borderColor: colors.brandPrimary + "55",
    backgroundColor: colors.brandPrimary + "0A",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.onSurface,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sourceBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceCk: { backgroundColor: "#B87333" + "22" },
  sourceBs: { backgroundColor: "#4F46E5" + "22" },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  summary: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontStyle: "italic",
  },
  diffRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: 4,
  },
  diffLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    width: 80,
    marginTop: 2,
  },
  diffOurs: {
    fontSize: 12,
    color: colors.onSurface,
  },
  diffOursLabel: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 10,
  },
  diffTheirs: {
    fontSize: 12,
    color: colors.brandPrimary,
    marginTop: 2,
  },
  diffTheirsLabel: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 10,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
  },
  reviewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  reviewBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  dismissBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissBtnText: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 13,
  },
});
