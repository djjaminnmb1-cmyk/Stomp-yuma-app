/**
 * ReactorsSheet
 * -------------
 * Bottom sheet that appears on long-press of a reaction chip. Lists
 * everyone who reacted to the event so dancers can see who cheered
 * them on ("Erin, Jamin and 3 others…"). Filtered to a single kind
 * when triggered from a specific chip, or shows everyone when
 * triggered from the "+" button.
 *
 * Uses the ``/api/feed/{event_id}/reactors`` endpoint added in v2.7.
 * A tiny cache prevents refetching when the sheet is reopened quickly
 * for the same event/kind combo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, FeedReactionKind, FeedReactor } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { InstructorBadge } from "@/src/components/InstructorBadge";
import { colors, radius, spacing } from "@/src/theme";

export function ReactorsSheet({
  visible,
  onClose,
  eventId,
  kind,
  headerEmoji,
  headerLabel,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  kind?: FeedReactionKind;
  headerEmoji?: string;
  headerLabel?: string;
}) {
  const { token } = useAuth();
  const [reactors, setReactors] = useState<FeedReactor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !eventId) return;
    setLoading(true);
    try {
      const r = await api.getFeedReactors(token, eventId, { kind });
      setReactors(r.reactors || []);
    } catch {
      setReactors([]);
    } finally {
      setLoading(false);
    }
  }, [token, eventId, kind]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  // Build a friendly summary line: "Erin, Jamin and 3 others reacted."
  const summary = useMemo(() => {
    if (!reactors.length) return "No one has reacted yet.";
    const names = reactors.map((r) => (r.name || "Someone").split(" ")[0]);
    // De-dupe first names (Erin might have reacted with both dancer and heart).
    const uniq: string[] = [];
    for (const n of names) if (!uniq.includes(n)) uniq.push(n);
    if (uniq.length === 1) return `${uniq[0]} reacted.`;
    if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]} reacted.`;
    if (uniq.length === 3) return `${uniq[0]}, ${uniq[1]} and ${uniq[2]} reacted.`;
    const remaining = uniq.length - 2;
    return `${uniq[0]}, ${uniq[1]} and ${remaining} other${
      remaining === 1 ? "" : "s"
    } reacted.`;
  }, [reactors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.tap} onPress={onClose} />
        <View style={styles.sheet} testID="reactors-sheet">
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {headerEmoji ? `${headerEmoji} ` : ""}
                {headerLabel || "Reactions"}
              </Text>
              <Text style={styles.sub}>{summary}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.iconBtn}
              testID="reactors-close"
            >
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : reactors.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="hand-left" size={44} color={colors.muted} />
              <Text style={styles.emptyTitle}>Be the first!</Text>
              <Text style={styles.emptySub}>
                Tap a reaction below to cheer this on.
              </Text>
            </View>
          ) : (
            <FlatList
              data={reactors}
              keyExtractor={(item, i) => `${item.user_id}-${item.kind}-${i}`}
              contentContainerStyle={{
                padding: spacing.md,
                paddingBottom: spacing.xl,
              }}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              renderItem={({ item }) => (
                <View style={styles.row} testID={`reactor-${item.user_id}-${item.kind}`}>
                  <View style={styles.avatar}>
                    {item.picture ? (
                      <Image
                        source={{ uri: item.picture }}
                        style={StyleSheet.absoluteFillObject as any}
                        contentFit="cover"
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {(item.name || "?").charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name || "Someone"}
                      </Text>
                      {item.is_instructor ? <InstructorBadge size="xs" /> : null}
                    </View>
                  </View>
                  <Text style={styles.rowEmoji}>{item.emoji || ""}</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  tap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "70%",
    minHeight: 260,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  loading: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 4,
  },
  emptySub: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    maxWidth: 260,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  rowEmoji: {
    fontSize: 22,
  },
});

export default ReactorsSheet;
