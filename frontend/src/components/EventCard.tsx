/**
 * EventCard — one row in the events / classes search list.
 *
 * Handles both ``kind: "event"`` and ``kind: "class"`` via the same
 * layout — the only visual difference is a small "Class" pill on the
 * top-right for recurring class rows so the user knows it's their
 * regular studio session, not a one-off workshop.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing, difficultyColor } from "@/src/theme";
import type { EventItem } from "@/src/api/client";

const TYPE_LABEL: Record<string, string> = {
  class: "Class",
  workshop: "Workshop",
  social: "Social",
  private_party: "Private party",
};

const TYPE_COLOR: Record<string, string> = {
  class: colors.brandSecondary,
  workshop: colors.brandPrimary,
  social: "#8B2E1E",
  private_party: "#7A3EA3",
};

export function EventCard({ event }: { event: EventItem }) {
  const router = useRouter();
  const onPress = () => {
    if (event.kind === "event") {
      router.push(`/events/${event.id}`);
    } else {
      // Class rows deep-link to the class-detail screen (implemented on
      // the Instructor tab). No dedicated public class page today — we
      // just open the search results context.
      router.push("/classes");
    }
  };

  const dateLabel = formatDate(
    event.date,
    event.start_time,
    event.end_date,
  );
  const locLabel = [event.venue_name, event.city, event.state]
    .filter(Boolean)
    .join(" · ");
  const distLabel =
    typeof event.distance_miles === "number"
      ? `${event.distance_miles.toFixed(1)} mi away`
      : "";
  const typeKey = String(event.event_type || event.kind || "workshop");

  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      testID={`event-card-${event.id}`}
    >
      {event.cover_image ? (
        <Image
          source={{ uri: event.cover_image }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.coverFallback,
            { backgroundColor: TYPE_COLOR[typeKey] || colors.brandTertiary },
          ]}
        >
          <Ionicons
            name={
              typeKey === "workshop"
                ? "school"
                : typeKey === "social"
                  ? "wine"
                  : typeKey === "private_party"
                    ? "gift"
                    : "calendar"
            }
            size={28}
            color="#fff"
          />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <View style={styles.row1}>
          <View
            style={[
              styles.typePill,
              { backgroundColor: TYPE_COLOR[typeKey] || colors.brandTertiary },
            ]}
          >
            <Text style={styles.typePillText}>
              {TYPE_LABEL[typeKey] || "Event"}
            </Text>
          </View>
          {event.skill_level && event.skill_level !== "All levels" ? (
            <View
              style={[
                styles.levelPill,
                { borderColor: difficultyColor(event.skill_level) },
              ]}
            >
              <View
                style={[
                  styles.levelDot,
                  { backgroundColor: difficultyColor(event.skill_level) },
                ]}
              />
              <Text style={styles.levelPillText}>{event.skill_level}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {event.name}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="calendar" size={12} color={colors.muted} />
          <Text style={styles.metaText}>{dateLabel}</Text>
        </View>

        {locLabel ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={12} color={colors.muted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {locLabel}
            </Text>
          </View>
        ) : null}

        {distLabel || event.price ? (
          <View style={styles.footRow}>
            {distLabel ? (
              <Text style={styles.distText}>{distLabel}</Text>
            ) : null}
            {event.price ? (
              <Text style={styles.priceText}>{event.price}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatDate(iso: string, time?: string, endIso?: string): string {
  if (!iso) return "Date TBA";
  try {
    const d = new Date(iso + "T00:00:00");
    const dateStr = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    // Multi-day event: collapse to "Sep 14–15" when same month, else
    // "Sep 14–Oct 2". Time is only shown for single-day events since a
    // "start time" doesn't make sense across a range.
    if (endIso && endIso !== iso) {
      try {
        const e = new Date(endIso + "T00:00:00");
        const sameMonth =
          e.getMonth() === d.getMonth() && e.getFullYear() === d.getFullYear();
        if (sameMonth) {
          return `${dateStr} – ${e.getDate()}`;
        }
        const endStr = e.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        return `${dateStr} – ${endStr}`;
      } catch {
        // fall through to single-day formatting on parse failure
      }
    }
    return time ? `${dateStr} · ${prettyTime(time)}` : dateStr;
  } catch {
    return iso;
  }
}

function prettyTime(t: string): string {
  // "19:30" → "7:30 PM"
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  const h24 = parseInt(m[1]!, 10);
  const min = m[2];
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${min} ${ampm}`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  coverFallback: {
    width: 76,
    height: 76,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  row1: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: 4,
    flexWrap: "wrap",
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typePillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  name: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    flex: 1,
  },
  footRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  distText: {
    fontSize: 11,
    color: colors.brandPrimary,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  priceText: {
    fontSize: 12,
    color: colors.brandTertiary,
    fontWeight: "800",
  },
});

export default EventCard;
