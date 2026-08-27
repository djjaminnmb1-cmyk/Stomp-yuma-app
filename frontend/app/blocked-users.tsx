/**
 * BlockedUsersScreen
 * ------------------
 * Reachable from Profile → "Blocked users". Lists every user the caller
 * has blocked, with:
 *
 *   • Avatar / name / email
 *   • "Unblock" button per row
 *   • Empty state that explains what blocking does (in plain English)
 *   • Pull-to-refresh
 *
 * We deliberately keep this its own screen — a bottom sheet would be
 * too shallow when a user has more than a few blocks and needs to
 * scroll.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
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
        Alert.alert(
          "Couldn't load blocks",
          e?.message || "Please try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
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
              setRows((prev) =>
                prev.filter((r) => r.blocked_id !== row.blocked_id)
              );
            } catch (e: any) {
              Alert.alert(
                "Couldn't unblock",
                e?.message || "Please try again."
              );
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
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
              <Text style={styles.helpCopy}>
                Blocking is mutual — neither of you sees the other&apos;s chat
                messages, activity posts, or reactions. Unblock anytime
                to restore visibility both ways.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={44}
                color={colors.brandPrimary}
              />
              <Text style={styles.emptyTitle}>No one blocked</Text>
              <Text style={styles.emptyBody}>
                Long-press a chat message or feed post to block a user.
                Blocking hides them from you and hides you from them,
                everywhere in the app.
              </Text>
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  emptyBody: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  helpCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
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
