/**
 * BootStepperLinkSheet
 * --------------------
 * Admin-only bottom sheet used from the dance detail page:
 * "Link BootStepper record". Lets the admin search BootStepper, pick
 * the record that matches, and attach its id (+ optionally its URL)
 * to the existing dance WITHOUT overwriting anything else we already
 * store — choreographer name, difficulty, custom count, YouTube
 * link, step-sheet image, CopperKnob ref/url etc. all stay exactly
 * as they are.
 *
 * A single local dance may end up carrying BOTH a ``copperknob_ref``
 * and a ``bootstepper_ref`` after this flow — that's intentional and
 * enforced by the backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, BootStepperResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

export function BootStepperLinkSheet({
  visible,
  danceId,
  danceName,
  danceChoreographer,
  onClose,
  onLinked,
}: {
  visible: boolean;
  danceId: string;
  danceName: string;
  danceChoreographer: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BootStepperResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overwriteUrl, setOverwriteUrl] = useState(true);
  const [linking, setLinking] = useState(false);

  // Seed the query with the local dance's name so the admin sees
  // likely matches immediately — saves them retyping.
  useEffect(() => {
    if (visible) {
      setQ(danceName || "");
      setResults([]);
      setSelectedId(null);
    }
  }, [visible, danceName]);

  const inflight = useRef(0);
  const runSearch = useCallback(
    async (query: string) => {
      const ticket = ++inflight.current;
      const trimmed = query.trim();
      if (trimmed.length < 2 || !token) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const payload = await api.bootstepperSearch(trimmed, 25, token);
        if (ticket !== inflight.current) return;
        setResults(payload.data);
      } catch {
        if (ticket !== inflight.current) return;
        setResults([]);
      } finally {
        if (ticket === inflight.current) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!visible) return;
    const h = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(h);
  }, [q, visible, runSearch]);

  const onConfirm = async () => {
    if (!selectedId || !token) return;
    setLinking(true);
    try {
      await api.linkBootStepper(danceId, selectedId, overwriteUrl, token);
      Alert.alert(
        "Linked",
        "Your existing dance now has a BootStepper reference attached. None of your other data — including any CopperKnob link — was changed."
      );
      onLinked();
      onClose();
    } catch (e: any) {
      Alert.alert(
        "Couldn't link",
        e?.message ||
          "That reference might already be attached to another dance. Try a different match."
      );
    } finally {
      setLinking(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Link BootStepper record</Text>
              <Pressable onPress={onClose} testID="bs-link-close" hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Attaching an id does NOT overwrite {danceChoreographer || "your"}
              &apos;s data or any CopperKnob link — it just stores the
              BootStepper id for future refresh checks.
            </Text>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search BootStepper"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={styles.searchInput}
                testID="bs-link-search"
              />
              {q ? (
                <Pressable onPress={() => setQ("")} hitSlop={12}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.overwriteRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.overwriteLabel}>
                  Use BootStepper&apos;s canonical URL
                </Text>
                <Text style={styles.overwriteHint}>
                  Off = keep the URL currently pinned here.
                </Text>
              </View>
              <Switch
                value={overwriteUrl}
                onValueChange={setOverwriteUrl}
                trackColor={{ true: colors.brandPrimary }}
              />
            </View>

            {loading ? (
              <ActivityIndicator
                color={colors.brandPrimary}
                style={{ marginVertical: spacing.md }}
              />
            ) : null}

            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                !loading && q.trim().length >= 2 ? (
                  <Text style={styles.emptyText}>
                    No matches on BootStepper.
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                const isSelected = selectedId === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedId(item.id)}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    testID={`bs-link-pick-${item.id}`}
                  >
                    <View
                      style={[
                        styles.radio,
                        isSelected && styles.radioSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {item.choreographer} · {item.level || "—"} ·{" "}
                        {item.count || "?"} count
                      </Text>
                      {item.existing_dance ? (
                        <Text style={styles.rowConflict}>
                          Already linked to another dance in the library.
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.refBadge}>{item.id}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.footer}>
              <Pressable
                onPress={onClose}
                style={styles.cancelBtn}
                testID="bs-link-cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={!selectedId || linking}
                style={[
                  styles.confirmBtn,
                  (!selectedId || linking) && { opacity: 0.5 },
                ]}
                testID="bs-link-confirm"
              >
                {linking ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.confirmText}>Attach reference</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 42,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
  },
  overwriteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  overwriteLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
  },
  overwriteHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  rowSelected: {
    backgroundColor: colors.brandPrimary + "22",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.brandPrimary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowConflict: {
    fontSize: 11,
    color: "#B45309",
    marginTop: 2,
    fontStyle: "italic",
  },
  refBadge: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 11,
    color: colors.muted,
    maxWidth: 90,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  cancelText: { color: colors.muted, fontWeight: "700" },
  confirmBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  confirmText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
  },
});
