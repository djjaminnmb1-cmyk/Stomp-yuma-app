/**
 * ChoreographerFollowButton
 * -------------------------
 * Compact pill that follows / unfollows a choreographer (by name).
 * Reused on:
 *   • Dance detail (right of the "By <chor>" subtitle)
 *   • Choreographer list rows
 *   • Choreographer detail header
 *
 * Behaviour:
 *   • Fetches the initial follow state via GET /choreographers/{name}
 *     when the caller doesn't provide it — lets it be dropped anywhere
 *     without prop-drilling the current state.
 *   • Optimistic toggle: flips locally, rolls back on error.
 *   • Emits a haptic on native + surfaces a subtle toast on success so
 *     the follow / unfollow action feels tangible.
 *   • Renders NOTHING when the choreographer is empty / "Unknown" —
 *     following an anonymous choreographer would create orphan rows
 *     the notifier can't route.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  choreographer: string;
  /** When provided, skips the initial GET — used by list rows that
   *  already have the flag in memory. */
  initialFollowing?: boolean;
  /** Optional callback to bubble the new state up (e.g. update a
   *  parent list count when a row is toggled). */
  onChange?: (isFollowing: boolean, followerCount: number) => void;
  /** Render a compact icon-only pill (default false = pill with
   *  label). Icon-only saves horizontal space on tight rows. */
  compact?: boolean;
  testID?: string;
};

const UNKNOWN_NAMES = new Set(["", "unknown", "unknown choreographer"]);

export function ChoreographerFollowButton({
  choreographer,
  initialFollowing,
  onChange,
  compact,
  testID,
}: Props) {
  const { token } = useAuth();
  const [following, setFollowing] = useState<boolean | undefined>(initialFollowing);
  const [busy, setBusy] = useState(false);

  const trimmed = (choreographer || "").trim();
  const hidden = UNKNOWN_NAMES.has(trimmed.toLowerCase());

  // Lazy-load current follow state if the caller didn't pass one.
  useEffect(() => {
    if (initialFollowing !== undefined) {
      setFollowing(initialFollowing);
      return;
    }
    if (hidden || !token || !trimmed) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getChoreographerDetail(trimmed, token);
        if (!cancelled) setFollowing(!!d.is_following);
      } catch {
        // If the endpoint 404s (name not in library yet) the button
        // stays as "Follow" — the user can still try, and the server
        // will 404 with a friendly message.
        if (!cancelled) setFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialFollowing, hidden, trimmed, token]);

  const toggle = useCallback(async () => {
    if (!token || busy || hidden) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
      const res = next
        ? await api.followChoreographer(trimmed, token)
        : await api.unfollowChoreographer(trimmed, token);
      onChange?.(res.is_following, res.follower_count);
    } catch (e: any) {
      // Roll back on error — keeps the pill honest.
      setFollowing(!next);
      Alert.alert(
        next ? "Couldn't follow" : "Couldn't unfollow",
        e?.message || "Try again in a moment."
      );
    } finally {
      setBusy(false);
    }
  }, [token, busy, hidden, following, trimmed, onChange]);

  if (hidden) return null;

  // Awaiting initial fetch — show a tiny spinner so the row doesn't
  // collapse and then jump when the state resolves.
  if (following === undefined) {
    return (
      <View style={[styles.pill, compact && styles.pillCompact]}>
        <ActivityIndicator size="small" color={colors.brandPrimary} />
      </View>
    );
  }

  const label = following ? "Following" : "Follow";
  const icon = following ? "checkmark-circle" : "notifications-outline";

  return (
    <Pressable
      testID={testID || (following ? "chor-following" : "chor-follow")}
      onPress={toggle}
      disabled={busy}
      accessibilityLabel={
        following ? `Unfollow ${trimmed}` : `Follow ${trimmed}`
      }
      style={[
        styles.pill,
        compact && styles.pillCompact,
        following && styles.pillActive,
        busy && { opacity: 0.55 },
      ]}
    >
      <Ionicons
        name={icon as any}
        size={compact ? 14 : 15}
        color={following ? colors.brandPrimary : colors.onBrandPrimary}
      />
      {!compact ? (
        <Text
          style={[
            styles.pillText,
            following && styles.pillTextActive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minHeight: 30,
  },
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 30,
    gap: 0,
  },
  pillActive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  pillText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pillTextActive: {
    color: colors.brandPrimary,
  },
});
