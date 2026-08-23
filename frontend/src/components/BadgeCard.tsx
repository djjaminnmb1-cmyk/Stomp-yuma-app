import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import type { Badge } from "@/src/api/client";

/**
 * Badge card used across Profile "Achievements" section, Home peek row,
 * and the full-list Achievements screen. Renders as either:
 *  - EARNED: solid tinted card, badge icon in color, subtle checkmark overlay
 *  - LOCKED: greyed card with progress bar (e.g. "7 / 10 dances")
 *
 * The `size="lg"` variant is used on the Achievements grid; the default
 * `size="md"` is used everywhere else.
 */
export function BadgeCard({
  badge,
  size = "md",
  onPress,
}: {
  badge: Badge;
  size?: "sm" | "md" | "lg";
  onPress?: () => void;
}) {
  const earned = badge.earned;
  const pct = Math.max(
    0,
    Math.min(1, badge.requirement > 0 ? badge.progress / badge.requirement : 0)
  );
  const iconSize = size === "lg" ? 34 : size === "sm" ? 22 : 28;
  const tint = earned ? badge.color : colors.muted;
  const bg = earned ? badge.color + "1F" : colors.surfaceSecondary;
  const border = earned ? badge.color + "88" : colors.border;

  const container = (
    <View
      style={[
        styles.card,
        size === "lg" && styles.cardLg,
        size === "sm" && styles.cardSm,
        { backgroundColor: bg, borderColor: border },
        !earned && styles.cardLocked,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: earned ? badge.color + "22" : colors.surface },
        ]}
      >
        <Ionicons
          name={badge.icon as any}
          size={iconSize}
          color={tint}
          style={!earned ? { opacity: 0.55 } : undefined}
        />
        {earned && (
          <View style={styles.checkmark}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>
      <Text
        style={[
          styles.title,
          size === "sm" && styles.titleSm,
          !earned && { color: colors.onSurfaceSecondary },
        ]}
        numberOfLines={2}
      >
        {badge.title}
      </Text>
      {size !== "sm" && (
        <Text style={styles.desc} numberOfLines={2}>
          {badge.description}
        </Text>
      )}
      {!earned && badge.requirement > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct * 100}%`, backgroundColor: badge.color },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.min(badge.progress, badge.requirement)} / {badge.requirement}{" "}
            {badge.unit}
          </Text>
        </View>
      )}
      {earned && size !== "sm" && (
        <Text style={styles.earnedLabel} numberOfLines={1}>
          {badge.earned_at
            ? `Earned ${formatEarnedDate(badge.earned_at)}`
            : "Earned"}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
        testID={`badge-${badge.id}`}
      >
        {container}
      </Pressable>
    );
  }
  return <View testID={`badge-${badge.id}`}>{container}</View>;
}

function formatEarnedDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
    // Default (md) variant used inside Profile's horizontal-scroll strip
    // — fixed width so the ScrollView doesn't clip long descriptions.
    width: 148,
    minHeight: 130,
  },
  // Large variant lives inside the Achievements 2-column grid where the
  // parent ``flexBasis: 48%`` handles width. We unset the fixed width so
  // the card fills its column, and only tune padding + minHeight.
  cardLg: {
    width: undefined,
    alignSelf: "stretch",
    minHeight: 168,
    padding: spacing.lg,
  },
  cardSm: { width: 108, minHeight: 84, padding: spacing.sm },
  cardLocked: { opacity: 0.92 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  checkmark: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  title: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: 4,
  },
  titleSm: { fontSize: 12, marginTop: 2 },
  desc: {
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    lineHeight: 15,
  },
  progressWrap: { marginTop: 4, gap: 3 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600",
  },
  earnedLabel: {
    fontSize: 10,
    color: colors.brandPrimary,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

export default BadgeCard;
