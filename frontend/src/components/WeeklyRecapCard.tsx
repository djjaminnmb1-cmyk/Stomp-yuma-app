/**
 * WeeklyRecapCard
 * ---------------
 * Cheerful summary of the current calendar week's dance activity —
 * shown on Home to celebrate momentum. Sundays get a special "🎉 Weekly
 * Recap" tone (per the original product ask); Mon–Sat it renders as a
 * "This week so far" progress card. Hidden entirely when the user has
 * zero activity this week (no need to shame a fresh start).
 *
 * Data source: ``/api/weekly-recap`` which merges Practice-Mode opens
 * (``practice_daily``) and completions (``tracking``) — the same two
 * signals the streak logic honours — so the card feels consistent with
 * the rest of the app.
 *
 * Interaction: tapping the card jumps into the Boot Scoot Board so
 * dancers can see how their week stacks up against the community.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { api, WeeklyRecap } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeeklyRecapCard() {
  const router = useRouter();
  const { token } = useAuth();
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.getWeeklyRecap(token);
      setRecap(r);
    } catch {
      setRecap(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !recap) return null;

  // Zero-week guard: don't render an empty celebration.
  if (recap.total === 0) return null;

  const isSunday = recap.today === recap.week_end;

  const bestDayLabel = recap.best_day
    ? new Date(recap.best_day.date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "long",
      })
    : "";

  return (
    <Pressable
      testID="home-weekly-recap"
      onPress={() => router.push("/leaderboard")}
      style={[styles.card, isSunday && styles.cardSunday]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconOrb, isSunday && styles.iconOrbSunday]}>
          <Ionicons
            name={isSunday ? "trophy" : "calendar"}
            size={20}
            color={isSunday ? colors.brandTertiary : colors.brandSecondary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {isSunday ? "🎉 Weekly Recap" : "This week so far"}
          </Text>
          <Text style={styles.sub}>
            {isSunday
              ? `You danced ${recap.total} time${recap.total === 1 ? "" : "s"} this week — nice work!`
              : `${recap.total} activit${recap.total === 1 ? "y" : "ies"} across ${recap.days_active} day${recap.days_active === 1 ? "" : "s"}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </View>

      <View style={styles.statsRow}>
        <Stat
          label="Practices"
          value={String(recap.practices)}
          icon="musical-notes"
          color={colors.brandPrimary}
        />
        <View style={styles.divider} />
        <Stat
          label="Completed"
          value={String(recap.completions)}
          icon="checkmark-done-circle"
          color={colors.success}
        />
        <View style={styles.divider} />
        <Stat
          label="Best day"
          value={bestDayLabel.slice(0, 3) || "—"}
          icon="ribbon"
          color={colors.brandTertiary}
        />
      </View>

      {/* Weekday dots — filled when the user was active on that day. */}
      <View style={styles.dotsRow}>
        {WEEK_LABELS.map((label, i) => {
          const day = recap.days[i];
          const filled = (day?.count || 0) > 0;
          const isToday = day?.date === recap.today;
          return (
            <View key={label} style={styles.dotWrap}>
              <View
                style={[
                  styles.dot,
                  filled && styles.dotFilled,
                  isToday && styles.dotToday,
                ]}
              />
              <Text
                style={[
                  styles.dotLabel,
                  isToday && { color: colors.brandPrimary, fontWeight: "800" },
                ]}
              >
                {label[0]}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

function Stat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary + "55",
    backgroundColor: colors.brandSecondary + "12",
    gap: spacing.sm,
  },
  cardSunday: {
    borderColor: colors.brandTertiary,
    backgroundColor: colors.brandTertiary + "1F",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandSecondary + "88",
  },
  iconOrbSunday: {
    borderColor: colors.brandTertiary,
    backgroundColor: colors.surface,
  },
  title: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sub: {
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.onSurface,
  },
  statLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  dotWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotFilled: {
    backgroundColor: colors.brandPrimary,
  },
  dotToday: {
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLabel: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: "700",
  },
});

export default WeeklyRecapCard;
