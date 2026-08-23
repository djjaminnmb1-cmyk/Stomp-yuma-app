/**
 * PickInstructorSheet — multi-select instructor picker with follow.
 *
 * Bottom sheet that lets a dancer:
 *   • Pick every instructor whose class they attend (multi-select).
 *   • Mark ONE of them as their "Primary" (receives Suggest-a-Dance
 *     submissions and unlocks the personalised header on Suggest).
 *   • Toggle "Follow when I save" to auto-follow the picks in one tap
 *     (default on — the biggest reason to build multi-select was so
 *     dancers can subscribe to every teacher whose class they attend).
 *
 * Persistence is atomic via ``PUT /api/auth/me/instructors``. A tiny
 * toast informs the user of net-new follows the save created.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, User } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { InstructorBadge } from "@/src/components/InstructorBadge";
import { colors, radius, spacing } from "@/src/theme";

type Instructor = {
  user_id: string;
  name: string;
  picture: string;
  city: string;
  state: string;
};

export function PickInstructorSheet({
  visible,
  onClose,
  onSaved,
  title = "Your instructors",
  subtitle = "Pick every instructor whose class you attend. Ideas you send from Suggest-a-Dance route to your Primary pick.",
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: (result: { user: User; new_follows: number; primary?: Instructor }) => void;
  title?: string;
  subtitle?: string;
}) {
  const { token, user, updateUser } = useAuth();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");
  const [follow, setFollow] = useState(true);

  // Reset local draft from the freshly-loaded user every time the
  // sheet opens so the current picks are reflected without stale
  // state from a previous session.
  useEffect(() => {
    if (!visible) return;
    setSelected(user?.instructor_ids && user.instructor_ids.length > 0
      ? [...user.instructor_ids]
      : user?.main_instructor_id
        ? [user.main_instructor_id]
        : []);
    setPrimary(user?.main_instructor_id || "");
    setQ("");
    setFollow(true);
  }, [visible, user?.instructor_ids, user?.main_instructor_id]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.listInstructors(token);
      setInstructors(r.instructors || []);
    } catch {
      setInstructors([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return instructors;
    const needle = q.trim().toLowerCase();
    return instructors.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.city || "").toLowerCase().includes(needle) ||
        (i.state || "").toLowerCase().includes(needle)
    );
  }, [q, instructors]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        // If we just un-picked the current primary, promote the next
        // remaining one (or clear if none left).
        setPrimary((p) => (p === id ? next[0] || "" : p));
        return next;
      }
      // Newly-picked → auto-promote if no primary set yet.
      setPrimary((p) => p || id);
      return [...prev, id];
    });
  }, []);

  const makePrimary = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPrimary(id);
  }, []);

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await api.saveInstructors(token, {
        instructor_ids: selected,
        main_instructor_id: primary || undefined,
        follow,
      });
      // Mirror the fresh user back into auth state so downstream
      // screens (Home, Suggest, Profile) reflect the change without a
      // reload.
      updateUser(res.user);
      const primaryObj = instructors.find((i) => i.user_id === primary);
      onSaved?.({
        user: res.user,
        new_follows: res.new_follows,
        primary: primaryObj,
      });
      // Warm toast when we actually created new follows — no toast
      // when the user only rearranged existing picks.
      if (res.new_follows > 0) {
        Alert.alert(
          "Saved",
          res.new_follows === 1
            ? "You're now following 1 more instructor."
            : `You're now following ${res.new_follows} more instructors.`
        );
      }
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }, [token, selected, primary, follow, instructors, updateUser, onSaved, onClose]);

  const clearAll = useCallback(() => {
    setSelected([]);
    setPrimary("");
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.tap} onPress={onClose} />
        <View style={styles.sheet} testID="pick-instructor-sheet">
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.sub}>{subtitle}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.iconBtn}
              testID="pick-instructor-close"
            >
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search by name or city"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCorrect={false}
              testID="pick-instructor-search"
            />
            {selected.length > 0 ? (
              <Pressable
                onPress={clearAll}
                hitSlop={6}
                testID="pick-instructor-clear"
              >
                <Text style={styles.clearBtn}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Follow toggle + selection count */}
          <View style={styles.metaBar}>
            <Text style={styles.metaText}>
              {selected.length === 0
                ? "None picked"
                : `${selected.length} picked${
                    primary ? " · Primary set" : ""
                  }`}
            </Text>
            <Pressable
              onPress={() => setFollow((v) => !v)}
              style={styles.followToggleRow}
              testID="pick-instructor-follow-toggle"
              hitSlop={6}
            >
              <View style={[styles.checkbox, follow && styles.checkboxOn]}>
                {follow ? (
                  <Ionicons name="checkmark" size={13} color="#fff" />
                ) : null}
              </View>
              <Text style={styles.followLabel}>Follow when I save</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search" size={44} color={colors.muted} />
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptySub}>
                Try clearing the search or scroll for other instructors.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.user_id}
              contentContainerStyle={{
                paddingHorizontal: spacing.md,
                paddingTop: 4,
                paddingBottom: 120,
              }}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              renderItem={({ item }) => {
                const isPicked = selected.includes(item.user_id);
                const isPrimary = primary === item.user_id;
                return (
                  <Pressable
                    onPress={() => toggle(item.user_id)}
                    style={[
                      styles.row,
                      isPicked && styles.rowActive,
                      isPrimary && styles.rowPrimary,
                    ]}
                    testID={`pick-instructor-${item.user_id}`}
                  >
                    {/* Selection checkbox */}
                    <View
                      style={[styles.checkbox, isPicked && styles.checkboxOn]}
                    >
                      {isPicked ? (
                        <Ionicons name="checkmark" size={13} color="#fff" />
                      ) : null}
                    </View>

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
                          {item.name || "Instructor"}
                        </Text>
                        <InstructorBadge size="xs" />
                        {isPrimary ? (
                          <View style={styles.primaryPill}>
                            <Ionicons
                              name="star"
                              size={9}
                              color={colors.onBrandPrimary}
                            />
                            <Text style={styles.primaryPillText}>
                              PRIMARY
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {item.city || item.state ? (
                        <View style={styles.metaRow}>
                          <Ionicons
                            name="location"
                            size={11}
                            color={colors.muted}
                          />
                          <Text style={styles.metaSub} numberOfLines={1}>
                            {[item.city, item.state]
                              .filter(Boolean)
                              .join(", ")}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Star icon for setting primary — only shown when
                        the row is picked and NOT already the primary. */}
                    {isPicked && !isPrimary ? (
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          makePrimary(item.user_id);
                        }}
                        hitSlop={8}
                        style={styles.starBtn}
                        testID={`pick-instructor-star-${item.user_id}`}
                      >
                        <Ionicons
                          name="star-outline"
                          size={18}
                          color={colors.brandTertiary}
                        />
                      </Pressable>
                    ) : isPrimary ? (
                      <Ionicons
                        name="star"
                        size={18}
                        color={colors.brandTertiary}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={styles.footerCancel}
              testID="pick-instructor-cancel"
            >
              <Text style={styles.footerCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[styles.footerSave, saving && { opacity: 0.6 }]}
              testID="pick-instructor-save"
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={colors.onBrandPrimary}
                  />
                  <Text style={styles.footerSaveText}>
                    {selected.length === 0
                      ? "Save (none)"
                      : `Save ${selected.length} pick${
                          selected.length === 1 ? "" : "s"
                        }`}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
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
    height: "85%",
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
  },
  clearBtn: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 4,
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  followToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  followLabel: {
    fontSize: 12,
    color: colors.onSurface,
    fontWeight: "700",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxOn: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
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
  rowActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary + "10",
  },
  rowPrimary: {
    borderColor: colors.brandTertiary,
    backgroundColor: colors.brandTertiary + "18",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSecondary,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  name: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  primaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.brandPrimary,
    marginLeft: 2,
  },
  primaryPillText: {
    color: colors.onBrandPrimary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  metaSub: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  starBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerCancel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  footerCancelText: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 14,
  },
  footerSave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  footerSaveText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 14,
  },
});

export default PickInstructorSheet;
