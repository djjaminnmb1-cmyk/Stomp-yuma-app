/**
 * FeedEventCard
 * -------------
 * Renders a single row in the activity feed. Switches layout based on
 * the discriminated ``type`` field of ``FeedEvent``:
 *
 *  - ``completion``       — "<user> completed <dance>"
 *  - ``badge``            — "<user> earned <badge>"
 *  - ``streak_milestone`` — "<user> hit an <N>-day streak"
 *
 * Each card is tappable: completion cards deep-link into the dance detail,
 * badge cards navigate to the user's public profile, streak cards navigate
 * to the user's public profile. Users' avatars are always tappable to
 * jump to their profile.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { FeedEvent } from "@/src/api/client";
import { colors, radius, spacing, difficultyColor } from "@/src/theme";
import { FeedReactionsBar } from "@/src/components/FeedReactionsBar";
import { InstructorBadge } from "@/src/components/InstructorBadge";
import { ReportFeedSheet } from "@/src/components/ReportFeedSheet";
import { useAuth } from "@/src/context/auth-context";

export function FeedEventCard({ event }: { event: FeedEvent }) {
  const router = useRouter();
  const { user: me } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const openUser = () => router.push(`/users/${event.user.user_id}`);
  const onCardPress = () => {
    if (event.type === "completion") {
      router.push(`/dance/${event.dance.id}`);
    } else {
      openUser();
    }
  };
  const isMine = me?.user_id === event.user.user_id;
  // Users can flag anyone's post except their own — the backend
  // enforces the same rule but we also skip the long-press affordance
  // client-side so it doesn't feel broken.
  const onCardLongPress = () => {
    if (isMine) return;
    setReportOpen(true);
  };

  if (hidden) return null;

  return (
    <View style={styles.card} testID={`feed-event-${event.id}`}>
      <Pressable onPress={openUser} hitSlop={4}>
        <Avatar name={event.user.name} picture={event.user.picture} />
      </Pressable>

      <View style={{ flex: 1 }}>
        <Pressable
          onPress={onCardPress}
          onLongPress={onCardLongPress}
          delayLongPress={450}
          testID={`feed-event-body-${event.id}`}
        >
          <View style={styles.line1}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {event.user.name || "Anonymous"}
              </Text>
              {event.user.is_instructor ? (
                <InstructorBadge
                  size="xs"
                  testID={`feed-instructor-${event.id}`}
                />
              ) : null}
            </View>
            <Text style={styles.time}>{relTime(event.created_at)}</Text>
          </View>

          {event.type === "completion" ? (
            <View>
              <Text style={styles.actionText}>completed a dance</Text>
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.diffPip,
                    { backgroundColor: difficultyColor(event.dance.difficulty) },
                  ]}
                />
                <Text style={styles.detailTitle} numberOfLines={1}>
                  {event.dance.name}
                </Text>
              </View>
              <Text style={styles.detailMeta} numberOfLines={1}>
                {event.dance.choreographer}
                {event.dance.bpm ? ` · ${event.dance.bpm} BPM` : ""}
              </Text>
            </View>
          ) : null}

          {event.type === "badge" ? (
            <View>
              <Text style={styles.actionText}>earned a new badge</Text>
              <View style={styles.badgeChip}>
                <View
                  style={[
                    styles.badgeIconOrb,
                    { backgroundColor: event.badge.color },
                  ]}
                >
                  <Ionicons
                    name={event.badge.icon as any}
                    size={16}
                    color="#fff"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle} numberOfLines={1}>
                    {event.badge.title}
                  </Text>
                  <Text style={styles.detailMeta} numberOfLines={1}>
                    {event.badge.description}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {event.type === "streak_milestone" ? (
            <View>
              <Text style={styles.actionText}>hit a streak milestone</Text>
              <View style={styles.streakRow}>
                <Ionicons name="flame" size={20} color="#D9502A" />
                <Text style={styles.streakText}>
                  <Text style={styles.streakBig}>{event.days}</Text>
                  <Text> day{event.days === 1 ? "" : "s"} in a row!</Text>
                </Text>
              </View>
            </View>
          ) : null}
        </Pressable>

        <FeedReactionsBar
          eventId={event.id}
          reactions={event.reactions}
          testID={`feed-reactions-${event.id}`}
        />
      </View>

      <ReportFeedSheet
        visible={reportOpen}
        eventId={event.id}
        onClose={() => setReportOpen(false)}
        onReported={() => {
          // Hide the flagged card from the reporter's own feed so it
          // doesn't sit there awkwardly after they've spoken up.
          setHidden(true);
        }}
      />
    </View>
  );
}

function Avatar({ name, picture }: { name: string; picture: string }) {
  if (picture) {
    return (
      <Image
        source={{ uri: picture }}
        style={styles.avatar}
        contentFit="cover"
      />
    );
  }
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <View style={[styles.avatar, styles.avatarInitials]}>
      <Text style={styles.avatarText}>{initials || "?"}</Text>
    </View>
  );
}

function relTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
  },
  avatarInitials: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  line1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    flexShrink: 1,
  },
  time: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  actionText: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  diffPip: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
    flex: 1,
  },
  detailMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  badgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  badgeIconOrb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  streakText: {
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: "600",
  },
  streakBig: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: "#D9502A",
  },
});

export default FeedEventCard;
