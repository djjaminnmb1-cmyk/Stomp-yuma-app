/**
 * Home-screen card listing upcoming classes + events from the
 * instructors the signed-in dancer follows (via "My instructors"
 * picker on Profile → `users.instructor_ids`).
 *
 * Hidden when:
 *   - User isn't signed in (no token)
 *   - User follows nobody yet (`has_follows=false`)
 *   - Backing endpoint returns zero items
 *
 * Rows are tappable — tap routes to the class list (shared screen)
 * or the specific event detail page.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api, FollowedUpcomingItem } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import { useTranslation } from "@/src/i18n";

const MAX_ROWS = 4;

function formatDay(
  iso: string,
  today: string,
  t: (k: string, p?: any) => string
): string {
  if (!iso) return "";
  if (iso === today) return t("home.hub_date_today");
  try {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    const tomorrow = new Date(today + "T00:00:00Z");
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowYmd = tomorrow.toISOString().slice(0, 10);
    if (iso === tomorrowYmd) return t("home.hub_date_tomorrow");
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function Row({
  item,
  today,
  onPress,
}: {
  item: FollowedUpcomingItem;
  today: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isClass = item.kind === "class";
  const dateLabel = formatDay(item.date, today, t);
  const subBits: string[] = [item.instructor_name].filter(Boolean);
  if (item.start_time) subBits.push(item.start_time);
  if (item.venue_name) {
    subBits.push(item.venue_name);
  } else if (item.city) {
    subBits.push(item.city);
  }
  if (isClass && item.dance_count > 0) {
    subBits.push(
      item.dance_count === 1
        ? t("home.hub_class_dances_one")
        : t("home.hub_class_dances", { count: item.dance_count })
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${dateLabel}, ${item.instructor_name}`}
    >
      <View
        style={[
          styles.pill,
          { backgroundColor: isClass ? colors.brandTertiary : colors.brandSecondary },
        ]}
      >
        <Text style={styles.pillText}>
          {isClass ? t("home.hub_class_pill") : t("home.hub_event_pill")}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subBits.join(" · ")}
        </Text>
      </View>
      <View style={styles.rowDate}>
        <Text style={styles.rowDateText} numberOfLines={1}>
          {dateLabel}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </Pressable>
  );
}

export function FollowedInstructorHub() {
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<FollowedUpcomingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasFollows, setHasFollows] = useState(false);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setItems([]);
      setTotal(0);
      setHasFollows(false);
      return;
    }
    try {
      const r = await api.getFollowedUpcoming(token, MAX_ROWS + 1);
      setItems(r.items || []);
      setTotal(r.total || 0);
      setHasFollows(!!r.has_follows);
      setToday(r.today || "");
    } catch {
      // Silent — a hub failure must never ruin Home. The card just
      // doesn't appear.
      setItems([]);
      setHasFollows(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh on Home focus so a brand-new follow or a brand-new class
  // from an instructor shows up without a full app relaunch.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Hidden state: not signed in, no follows yet, or no upcoming items.
  // We intentionally render NOTHING rather than a "nudge" card — the
  // picker lives one tap away from Profile already, and Home has
  // plenty of other content for first-run users.
  if (!token || !hasFollows || items.length === 0) {
    return null;
  }

  const shown = items.slice(0, MAX_ROWS);
  const extra = total - shown.length;

  return (
    <View style={styles.card} testID="followed-hub">
      <View style={styles.header}>
        <Ionicons
          name="people-circle"
          size={22}
          color={colors.brandPrimary}
          style={{ marginRight: spacing.sm }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("home.hub_title")}</Text>
          <Text style={styles.sub}>{t("home.hub_sub")}</Text>
        </View>
      </View>
      <View style={styles.list}>
        {shown.map((item) => (
          <Row
            key={`${item.kind}:${item.id}`}
            item={item}
            today={today}
            onPress={() => router.push(item.deeplink as never)}
          />
        ))}
      </View>
      {extra > 0 ? (
        <Pressable
          testID="followed-hub-view-all"
          onPress={() => router.push("/(tabs)/instructor" as never)}
          style={({ pressed }) => [
            styles.viewAll,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.viewAllText}>
            {t("home.hub_more", { count: extra })}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.brandPrimary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  sub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  list: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    opacity: 0.5,
  },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    minWidth: 54,
    alignItems: "center",
  },
  pillText: {
    color: colors.onBrandPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.onSurface,
  },
  rowSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  rowDate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  rowDateText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  viewAllText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
    marginRight: 2,
  },
});
