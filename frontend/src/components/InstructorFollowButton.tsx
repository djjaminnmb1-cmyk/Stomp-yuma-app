/**
 * InstructorFollowButton
 * ----------------------
 * One-tap pill that adds / removes an instructor from the caller's
 * push-alert graph. Companion to the social ``FollowButton``:
 *
 *   • FollowButton           → activity-feed following (`following`)
 *   • InstructorFollowButton → class/event push alerts (`instructor_ids`)
 *
 * A dancer can follow socially without receiving push alerts (or
 * vice-versa), so BOTH pills live on the instructor's public profile.
 *
 * Optimistic toggle with rollback on error, matching the pattern used
 * by ``ChoreographerFollowButton``.
 */
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, Alert, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  instructorId: string;
  instructorName?: string;
  initialFollowing: boolean;
  /** Bubble up the new state + fresh follower count for parent hydration. */
  onChange?: (isFollowing: boolean, followerCount: number) => void;
  compact?: boolean;
  testID?: string;
};

export function InstructorFollowButton({
  instructorId,
  instructorName,
  initialFollowing,
  onChange,
  compact,
  testID,
}: Props) {
  const { token, user: me } = useAuth();
  const [following, setFollowing] = useState<boolean>(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
      const res = next
        ? await api.followInstructor(instructorId, token)
        : await api.unfollowInstructor(instructorId, token);
      onChange?.(res.is_following, res.follower_count);
    } catch (e: any) {
      // Rollback so the pill state stays honest.
      setFollowing(!next);
      Alert.alert(
        next ? "Couldn't follow" : "Couldn't unfollow",
        e?.message ||
          "Try again in a moment. If this keeps happening, message us from Profile → Feedback."
      );
    } finally {
      setBusy(false);
    }
  }, [token, busy, following, instructorId, onChange]);

  // Guard: instructor viewing their own profile shouldn't see a
  // "follow yourself" pill. Callers should already gate on `is_self`
  // but be defensive. Guard AFTER hooks so the hook order stays
  // stable across renders (rules-of-hooks).
  if (!instructorId || instructorId === me?.user_id) return null;

  const label = following ? "Following" : "Get class alerts";
  const icon = following ? "notifications" : "notifications-outline";

  return (
    <Pressable
      testID={
        testID || (following ? "instructor-following" : "instructor-follow")
      }
      onPress={toggle}
      disabled={busy}
      accessibilityLabel={
        following
          ? `Stop receiving class alerts from ${instructorName || "this instructor"}`
          : `Get class alerts from ${instructorName || "this instructor"}`
      }
      style={[
        styles.pill,
        compact && styles.pillCompact,
        following ? styles.pillActive : styles.pillInactive,
        busy && { opacity: 0.6 },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={following ? colors.brandPrimary : colors.onBrandPrimary}
        />
      ) : (
        <>
          <Ionicons
            name={icon as any}
            size={compact ? 14 : 16}
            color={following ? colors.brandPrimary : colors.onBrandPrimary}
          />
          {!compact ? (
            <Text
              style={[
                styles.pillText,
                following ? styles.pillTextActive : styles.pillTextInactive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    minHeight: 40,
  },
  pillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    gap: 0,
  },
  pillInactive: {
    backgroundColor: colors.brandPrimary,
  },
  pillActive: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  pillTextInactive: { color: colors.onBrandPrimary },
  pillTextActive: { color: colors.brandPrimary },
});
