import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, Badge, Streak } from "@/src/api/client";
import { BadgeCard } from "@/src/components/BadgeCard";
import { StreakCard } from "@/src/components/StreakCard";

const CATEGORY_LABELS: Record<string, string> = {
  milestone: "Completion Milestones",
  streak: "Streak Rewards",
  class: "Class Attendance",
  practice: "Practice Sessions",
  variety: "Variety & Exploration",
};

const CATEGORY_ORDER: string[] = [
  "milestone",
  "streak",
  "class",
  "practice",
  "variety",
];

export default function Achievements() {
  const router = useRouter();
  const { token } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await api.getBadges(token);
        setBadges(res.badges);
        setStreak(res.streak);
        // Fire-and-forget: mark all earned badges as seen once user opens
        // the Achievements screen. No await so refresh is instant.
        if (res.unseen_count > 0) {
          api.markBadgesSeen(token).catch(() => {});
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, Badge[]> = {};
    for (const b of badges) {
      (g[b.category] ||= []).push(b);
    }
    return g;
  }, [badges]);

  const stats = useMemo(() => {
    const earned = badges.filter((b) => b.earned).length;
    return { earned, total: badges.length };
  }, [badges]);

  if (loading) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.c}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[colors.brandTertiary, colors.brandPrimary, colors.surfaceInverse]}
          style={StyleSheet.absoluteFillObject as any}
        />
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerBar}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconBtn}
              testID="badges-back"
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.heroTitle}>Achievements</Text>
            <View style={styles.iconBtn} />
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.heroCount}>
              {stats.earned} / {stats.total}
            </Text>
            <Text style={styles.heroSub}>badges unlocked</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load({ silent: true });
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        <StreakCard streak={streak} />

        {CATEGORY_ORDER.map((cat) => {
          const rows = grouped[cat] || [];
          if (!rows.length) return null;
          return (
            <View key={cat} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {CATEGORY_LABELS[cat] || cat}
              </Text>
              <View style={styles.grid}>
                {rows.map((b) => (
                  <View key={b.id} style={styles.gridItem}>
                    <BadgeCard badge={b} size="lg" />
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.footerNote}>
          <Ionicons name="information-circle" size={16} color={colors.muted} />
          <Text style={styles.footerNoteText}>
            Badges unlock automatically as you complete dances, attend classes,
            and practice regularly. Keep dancing to earn them all!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingBottom: spacing.xl },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(43,29,22,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
  },
  heroMeta: {
    alignItems: "center",
    gap: 4,
    paddingBottom: spacing.md,
  },
  heroCount: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 44,
    fontWeight: "800",
    lineHeight: 46,
  },
  heroSub: {
    color: "#FFF6DA",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  gridItem: {
    // 2 per row on phone. flexBasis compensates for the 8pt gap.
    flexBasis: "48%",
    flexGrow: 1,
  },
  footerNote: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerNoteText: {
    flex: 1,
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});
