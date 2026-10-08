/**
 * StreakSaveCard — a compact Home nudge that shows up WHEN:
 *
 *   • user is signed in
 *   • user has a DOTD streak worth saving (`current >= 1`)
 *   • user hasn't opened today's DOTD yet
 *   • their last credited open was EXACTLY yesterday
 *
 * The "exactly yesterday" check means we only pester the dancer on the
 * single day where opening today's DOTD would actually preserve the
 * streak. The day AFTER that, `last_day` is 2 days old, the next open
 * will reset to 1 anyway (per `services/dotd_streak.record_open`), so
 * showing a save-your-streak nudge would be a lie.
 *
 * Tap routes into the DOTD's dance detail page where the practice flow
 * credits a streak open. Fully localized across the 8 supported
 * languages via `home.streak_save_*` keys.
 *
 * Renders NOTHING when the backend hasn't produced an `at_risk=true`
 * signal — Home must never show a dead/stale card.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api, DanceOfTheDay, DotdStreak } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { useTranslation } from "@/src/i18n";

// Brand orange from the DOTD card's lit-flame pill so the Streak Save
// nudge visually links to the DOTD it's protecting. See
// `DanceOfTheDayCard.tsx:84-121` for the matching treatment.
const FLAME_ORANGE = "#D9502A";

export function StreakSaveCard() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [streak, setStreak] = useState<DotdStreak | null>(null);
  const [dotd, setDotd] = useState<DanceOfTheDay | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setStreak(null);
      return;
    }
    try {
      // Fetch streak + today's DOTD in parallel so the CTA button can
      // route straight into the right dance detail page. If either call
      // fails we silently leave the card hidden — a nudge card is a
      // nice-to-have, never a blocker.
      const [s, d] = await Promise.all([
        api.getDotdStreak(token),
        api.getDanceOfTheDay(token).catch(() => null),
      ]);
      setStreak(s);
      setDotd(d);
    } catch {
      setStreak(null);
      setDotd(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh on Home focus — if the dancer opened the DOTD elsewhere
  // and comes back, the nudge should disappear without a relaunch.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Hidden state: no token, no streak data, or streak isn't at risk.
  if (!token || !streak || !streak.at_risk) return null;

  const count = streak.current || 0;

  const handlePress = () => {
    const danceId = dotd?.dance?.id || "";
    try {
      if (danceId) {
        router.push(`/dance/${danceId}` as never);
      } else {
        // Fallback — library tab if we somehow don't know today's dance.
        router.push("/(tabs)/library" as never);
      }
    } catch {
      /* Silently ignore navigation flakes. */
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t("home.streak_save_title", { count })}. ${t("home.streak_save_body")}. ${t("home.streak_save_cta")}.`}
      testID="streak-save-card"
    >
      <View style={styles.iconBubble}>
        <Ionicons name="flame" size={22} color={FLAME_ORANGE} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {t("home.streak_save_title", { count })}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {t("home.streak_save_body")}
        </Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText} numberOfLines={1}>
          {t("home.streak_save_cta")}
        </Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: "#FFF4EE",     // warm ember-tinted panel so the
                                     // "at risk" state reads as urgent
                                     // without being alarming red.
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#F3C9B6",         // soft matching stroke.
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    shadowColor: FLAME_ORANGE,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFE0D1",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4A2A1E",
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: 12,
    color: "#6B4536",
    marginTop: 2,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: FLAME_ORANGE,
  },
  ctaText: {
    color: colors.onBrandPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
