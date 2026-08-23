/**
 * FollowButton
 * ------------
 * Compact reusable pill for follow / unfollow. Handles the async state
 * itself so callers just pass in the target user's id + the initial
 * follow state.
 *
 * Optional ``onFollowChange`` callback fires with the new state so the
 * parent can update follower-count badges or refresh a list.
 */
import React, { useState } from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  userId: string;
  isFollowing: boolean;
  onFollowChange?: (nowFollowing: boolean, followerDelta: number) => void;
  variant?: "solid" | "outline";
  size?: "sm" | "md";
};

export function FollowButton({
  userId,
  isFollowing: initial,
  onFollowChange,
  variant = "solid",
  size = "md",
}: Props) {
  const { token } = useAuth();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (!token || busy) return;
    setBusy(true);
    const wasFollowing = following;
    // Optimistic update
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) {
        await api.unfollowUser(token, userId);
        onFollowChange?.(false, -1);
      } else {
        await api.followUser(token, userId);
        onFollowChange?.(true, 1);
      }
    } catch {
      // Roll back on failure
      setFollowing(wasFollowing);
    } finally {
      setBusy(false);
    }
  };

  const isSolid = variant === "solid" && !following;
  const isSmall = size === "sm";

  return (
    <Pressable
      onPress={onPress}
      testID={`follow-btn-${userId}`}
      disabled={busy}
      style={[
        styles.btn,
        isSmall && styles.btnSm,
        isSolid ? styles.solid : styles.outline,
        following && styles.followingStyle,
        busy && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={isSolid ? "#fff" : colors.brandPrimary}
        />
      ) : (
        <>
          <Ionicons
            name={following ? "checkmark" : "person-add"}
            size={isSmall ? 12 : 14}
            color={isSolid ? "#fff" : colors.brandPrimary}
          />
          <Text
            style={[
              styles.label,
              isSmall && styles.labelSm,
              isSolid && styles.labelSolid,
            ]}
          >
            {following ? "Following" : "Follow"}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minWidth: 90,
    borderWidth: 1,
  },
  btnSm: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 76,
  },
  solid: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  outline: {
    backgroundColor: colors.surface,
    borderColor: colors.brandPrimary,
  },
  followingStyle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  label: {
    fontWeight: "800",
    fontSize: 13,
    color: colors.brandPrimary,
    letterSpacing: 0.2,
  },
  labelSm: { fontSize: 12 },
  labelSolid: { color: "#fff" },
});

export default FollowButton;
