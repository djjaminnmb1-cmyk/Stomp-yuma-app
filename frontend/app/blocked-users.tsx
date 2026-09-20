/**
 * BlockedUsersScreen
 * ------------------
 * Reachable from Profile → "Blocked users". Lists every user the caller
 * has blocked, with:
 *
 *   • Header count badge — "3 blocked" so the user always knows how
 *     many people they've hidden even before scrolling.
 *   • Friendly, illustration-style empty state that reads like a
 *     compliment ("You're all clear") instead of a system message.
 *   • Avatar / name / email / unblock button per row.
 *   • Pull-to-refresh + optimistic UI on unblock.
 *   • Non-blocking toast confirmations (Report flow parity).
 *
 * We deliberately keep this its own screen — a bottom sheet would be
 * too shallow when a user has more than a few blocks and needs to
 * scroll.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { colors, radius, spacing } from "@/src/theme";

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  blocked_email: string;
  blocked_name: string;
  blocked_picture?: string;
  created_at: string;
};

export default function BlockedUsersScreen() {
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { pull?: boolean }) => {
      if (!token) return;
      if (opts?.pull) setRefreshing(true);
      else setLoading(true);
      try {
        const r = await api.listBlocks(token);
        setRows(r.blocks || []);
      } catch (e: any) {
        toast.error(e?.message || "Couldn't load your blocked list.", {
          duration: 4200,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onUnblock = (row: BlockRow) => {
    if (!token) return;
    const label = row.blocked_name?.trim() || row.blocked_email || "this user";
    Alert.alert(
      `Unblock ${label}?`,
      "You'll start seeing their messages and activity again. They'll also be able to see yours.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(row.blocked_id);
            try {
              await api.unblockUser(row.blocked_id, token);
              // Optimistic remove — the row disappears before the toast
              // fires so the count badge and empty state both update
              // in a single frame.
              setRows((prev) =>
                prev.filter((r) => r.blocked_id !== row.blocked_id)
              );
              toast.success(`${label} has been unblocked.`, {
                duration: 3200,
              });
            } catch (e: any) {
              toast.error(
                e?.message || "Couldn't unblock — please try again.",
                { duration: 4200 }
              );
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  // Human-friendly count phrase — "1 blocked" not "1 blockeds".
  const countPhrase = useMemo(() => {
    if (rows.length === 0) return "";
    return `${rows.length} blocked`;
  }, [rows.length]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen
        options={{
          title: "Blocked users",
          headerBackTitle: "Profile",
        }}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.blocked_id}
          contentContainerStyle={
            rows.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ pull: true })}
              tintColor={colors.brandPrimary}
            />
          }
          ListHeaderComponent={
            rows.length ? (
              <View style={styles.headerBlock}>
                <View style={styles.countPill}>
                  <Ionicons
                    name="shield-outline"
                    size={14}
                    color={colors.brandPrimary}
                  />
                  <Text style={styles.countPillText}>{countPhrase}</Text>
                </View>
                <Text style={styles.helpCopy}>
                  Blocking is mutual — neither of you sees the other&apos;s
                  chat messages, activity posts, or reactions. Unblock
                  anytime to restore visibility both ways.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              {/* Friendly illustration circle — larger + softer than
                  the previous single Ionicon. Reads more like a
                  "you're all set" card than a system message. */}
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name="heart-outline"
                  size={44}
                  color={colors.brandPrimary}
                />
              </View>
              <Text style={styles.emptyTitle}>You&apos;re all clear</Text>
              <Text style={styles.emptyBody}>
                No one blocked yet — nice. The community is here for
                you. If someone ever crosses the line, here&apos;s how
                to shut it down:
              </Text>

              <View style={styles.tipsWrap}>
                <Tip
                  icon="chatbubble-ellipses-outline"
                  text="Long-press their message → Block."
                />
                <Tip
                  icon="person-circle-outline"
                  text="Tap ⋯ on their profile → Block user."
                />
                <Tip
                  icon="flag-outline"
                  text="Flag serious violations — we review within 24 hours."
                />
              </View>

              <Pressable
                onPress={() => router.push("/safety")}
                style={styles.emptyCta}
                testID="blocked-empty-safety-link"
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={colors.brandPrimary}
                />
                <Text style={styles.emptyCtaText}>
                  Learn more in the Safety Center
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`blocked-row-${item.blocked_id}`}>
              <Avatar
                name={item.blocked_name}
                picture={item.blocked_picture}
              />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.blocked_name || "—"}
                </Text>
                {item.blocked_email ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.blocked_email}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => onUnblock(item)}
                disabled={unblockingId === item.blocked_id}
                style={[
                  styles.unblockBtn,
                  unblockingId === item.blocked_id && { opacity: 0.5 },
                ]}
                testID={`blocked-unblock-${item.blocked_id}`}
              >
                {unblockingId === item.blocked_id ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.brandPrimary}
                  />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Tip({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View style={styles.tipRow}>
      <Ionicons name={icon} size={16} color={colors.brandPrimary} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function Avatar({ name, picture }: { name: string; picture?: string }) {
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
      <Text style={styles.avatarInitialsText}>{initials || "?"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  emptyContainer: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: "center",
  },
  emptyBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandPrimary + "18",
    alignItems: "center",
    justifyContent: "center",
    // Soft outline ring so the icon feels like an illustration, not
    // just a floating glyph.
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  emptyBody: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  tipsWrap: {
    marginTop: spacing.md,
    width: "100%",
    maxWidth: 340,
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
  },
  emptyCtaText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  headerBlock: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  countPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "18",
  },
  countPillText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  helpCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  rowMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitials: {
    backgroundColor: colors.brandPrimary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  unblockBtn: {
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minWidth: 76,
    alignItems: "center",
  },
  unblockText: {
    color: colors.brandPrimary,
    fontWeight: "600",
    fontSize: 13,
  },
});
