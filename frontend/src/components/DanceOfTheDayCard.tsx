/**
 * Dance Of The Day — hero card at the top of the Home screen.
 *
 * Shows one featured dance per user per day. The pick is deterministic
 * (same user+day = same dance) so the card doesn't flip while the
 * dancer scrolls. Taps route into ``/dance/{id}`` and the practice
 * tracking kicks in from there.
 *
 * Priority of the pick (server-side in services/dance_of_the_day.py):
 *  1. Dances the user has NOT practiced (fresh content)
 *  2. If caught up on everything, rotate the whole library
 *
 * We only render the card when the API returned a dance — a brand-new
 * install with an empty library (or an unauthenticated viewer) silently
 * drops the card so Home never looks like it's missing a loading spinner.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api, DanceOfTheDay } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { useTranslation } from "@/src/i18n";

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner: "#00A86B",
  "Easy Intermediate": "#2E7CD6",
  Intermediate: "#D97706",
  "Int/Adv": "#B45309",
  Advanced: "#D62828",
  Expert: "#6B21A8",
};

export function DanceOfTheDayCard() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<DanceOfTheDay | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api.getDanceOfTheDay(token);
      setData(r);
    } catch {
      // Non-fatal — hide the card on error, home doesn't need to shout.
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Signed-out users don't see the hero — nothing to track against,
  // and the empty state would be awkward above the welcome strip.
  if (!token) return null;

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingInner}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </View>
    );
  }

  // Dance Of The Day is unavailable (empty library, API error, etc) —
  // render NOTHING so Home flow stays clean.
  if (!data?.dance) return null;

  const dance = data.dance;
  const diffColor =
    DIFFICULTY_COLORS[dance.difficulty] ?? colors.brandSecondary;

  // Caught-up badge: a subtle "You've practiced everything — fresh
  // rotation" tag so power users feel acknowledged.
  const caughtUp = data.source === "caught_up";

  return (
    <Pressable
      testID="home-dotd-card"
      onPress={() => router.push(`/dance/${dance.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${t("home.dance_of_the_day")}: ${dance.name}`}
    >
      <View style={styles.header}>
        <View style={styles.labelPill}>
          <Ionicons name="sparkles" size={14} color={colors.onBrandPrimary} />
          <Text style={styles.labelPillText}>
            {t("home.dance_of_the_day")}
          </Text>
        </View>
        {caughtUp && (
          <View style={styles.caughtUpPill}>
            <Ionicons name="checkmark-circle" size={12} color="#00A86B" />
            <Text style={styles.caughtUpText}>
              {t("home.dotd_caught_up")}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.danceName} numberOfLines={2}>
        {dance.name}
      </Text>

      <Text style={styles.danceMeta} numberOfLines={1}>
        {dance.choreographer}
        {dance.song ? ` · ${dance.song}` : ""}
      </Text>

      <View style={styles.footer}>
        <View style={[styles.diffPill, { backgroundColor: `${diffColor}22` }]}>
          <Text style={[styles.diffText, { color: diffColor }]}>
            {dance.difficulty}
          </Text>
        </View>
        {dance.bpm ? (
          <View style={styles.bpmPill}>
            <Ionicons name="pulse" size={12} color={colors.muted} />
            <Text style={styles.bpmText}>{dance.bpm} BPM</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={styles.practiceBtn}>
          <Text style={styles.practiceBtnText}>
            {t("home.practice_now")}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={16}
            color={colors.onBrandPrimary}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.brandPrimary + "0F",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
  loadingInner: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  labelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  labelPillText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  caughtUpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#E6F7EF",
  },
  caughtUpText: {
    color: "#00A86B",
    fontWeight: "700",
    fontSize: 10,
  },
  danceName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 2,
  },
  danceMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  diffPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  diffText: {
    fontSize: 11,
    fontWeight: "700",
  },
  bpmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  bpmText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  practiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  practiceBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
});
