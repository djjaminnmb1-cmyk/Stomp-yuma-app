import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import type { Streak } from "@/src/api/client";

/**
 * StreakCard
 * ----------
 * Compact card showing the user's current & longest practice streak.
 * Renders subtly-tinted when current == 0 (never dance-shamed users into
 * feeling bad about not practicing today).
 *
 * Placement: Home tab (below Howdy greeting) + Profile Achievements section.
 */
export function StreakCard({
  streak,
  compact = false,
}: {
  streak: Streak | null;
  compact?: boolean;
}) {
  const current = streak?.current ?? 0;
  const longest = streak?.longest ?? 0;
  const active = current > 0;

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        active ? styles.cardActive : styles.cardDormant,
      ]}
      testID="streak-card"
    >
      <View
        style={[
          styles.flameOrb,
          { backgroundColor: active ? "#D9502A" : colors.muted },
        ]}
      >
        <Ionicons name="flame" size={compact ? 20 : 24} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, active && { color: "#D9502A" }]}>
          {active ? "Practice Streak" : "Start a Streak"}
        </Text>
        <Text style={styles.stats}>
          <Text style={styles.big}>{current}</Text>
          <Text style={styles.days}>
            {" "}
            day{current === 1 ? "" : "s"} in a row
          </Text>
        </Text>
        {longest > 0 && longest > current ? (
          <Text style={styles.sub}>Personal best · {longest} days</Text>
        ) : (
          <Text style={styles.sub}>
            {active
              ? "Come back tomorrow to keep it going!"
              : "Practice today to spark your first streak."}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cardCompact: { padding: spacing.sm, gap: spacing.sm },
  cardActive: {
    backgroundColor: "#FFF3E7",
    borderColor: "#F2A62888",
  },
  cardDormant: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
  },
  flameOrb: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  stats: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "500",
  },
  big: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
  },
  days: { fontSize: 13, color: colors.onSurfaceSecondary },
  sub: {
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
    fontStyle: "italic",
  },
});

export default StreakCard;
