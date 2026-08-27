/**
 * useBlockUser — small hook that turns "block this user" into a
 * one-liner from any surface (chat bubble, feed card, profile view).
 *
 * Contract:
 *   const { confirmBlock } = useBlockUser();
 *   confirmBlock({ user_id, name, onBlocked });
 *
 * The confirmation is a 2-step native ``Alert`` so a mistaken long-press
 * can't silently nuke someone's chat visibility. We deliberately
 * over-explain what "block" does in the second alert since blocks in
 * this app are MUTUAL (both parties become invisible to each other).
 */
import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

export type BlockConfirmArgs = {
  user_id?: string;
  email?: string;
  name?: string;
  /** Called once the block succeeds — usually to hide UI locally. */
  onBlocked?: () => void;
};

export function useBlockUser() {
  const { token, user: me } = useAuth();

  const confirmBlock = useCallback(
    (args: BlockConfirmArgs) => {
      const label = args.name?.trim() || args.email || "this user";
      if (!token) return;
      // Guard: can't block yourself.
      if (args.user_id && me?.user_id && args.user_id === me.user_id) return;

      const doBlock = async () => {
        try {
          await api.blockUser(
            { user_id: args.user_id, email: args.email },
            token
          );
          args.onBlocked?.();
          Alert.alert(
            "Blocked",
            `${label} won't see your messages or activity, and you won't see theirs. You can unblock anytime from Profile → Blocked users.`
          );
        } catch (e: any) {
          Alert.alert(
            "Couldn't block",
            e?.message ||
              "Please try again in a moment — your connection may have dropped."
          );
        }
      };

      Alert.alert(
        `Block ${label}?`,
        Platform.select({
          ios: `You won't see each other's chat messages or activity posts. This is reversible — manage from Profile → Blocked users.`,
          default: `You won't see each other's chat messages or activity posts. Reversible from Profile → Blocked users.`,
        }),
        [
          { text: "Cancel", style: "cancel" },
          { text: "Block", style: "destructive", onPress: doBlock },
        ]
      );
    },
    [token, me?.user_id]
  );

  return { confirmBlock };
}
