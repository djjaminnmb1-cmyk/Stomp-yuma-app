/**
 * CopperKnobCompareSheet
 * ----------------------
 * Admin-only bottom sheet used from the dance detail page:
 * "Check CopperKnob data". Pulls the current CopperKnob record for
 * this dance's ``copperknob_ref`` and diffs it, field-by-field,
 * against what we have stored. The admin ticks which fields (if any)
 * to import via a plain PUT and taps Apply.
 *
 * Nothing is written until Apply. No field is silently overwritten.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, Dance } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

type CompareField = {
  field: string;
  ours: string;
  copperknob: string;
  differs: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  choreographer: "Choreographer",
  song: "Song",
  artist: "Artist",
  difficulty: "Difficulty",
  count: "Count / walls",
  copperknob_url: "CopperKnob URL",
};

export function CopperKnobCompareSheet({
  visible,
  dance,
  onClose,
  onApplied,
}: {
  visible: boolean;
  dance: Dance;
  onClose: () => void;
  onApplied: (updated: Partial<Dance>) => void;
}) {
  const { token } = useAuth();
  const [fields, setFields] = useState<CompareField[] | null>(null);
  const [refId, setRefId] = useState<string>("");
  const [ckUrl, setCkUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !token) return;
    setLoading(true);
    setError(null);
    setPicks({});
    try {
      const c = await api.compareCopperKnob(dance.id, token);
      setFields(c.fields);
      setRefId(c.ref);
      setCkUrl(c.copperknob_url);
      // Pre-tick every diffing field so the common case "yes, refresh
      // them all" is one tap.
      const initial: Record<string, boolean> = {};
      for (const f of c.fields) initial[f.field] = f.differs;
      setPicks(initial);
    } catch (e: any) {
      setError(e?.message || "Couldn't fetch CopperKnob data.");
    } finally {
      setLoading(false);
    }
  }, [dance.id, token, visible]);

  useEffect(() => {
    load();
  }, [load]);

  const anyPicked = useMemo(
    () => Object.values(picks).some(Boolean),
    [picks]
  );

  const onApply = async () => {
    if (!token || !fields) return;
    // Build a delta PUT — every ticked field gets CopperKnob's value.
    const delta: Record<string, any> = {
      // Existing dance payload for a PUT — the server merges by key,
      // so we must include the un-editable fields as-is to keep them.
      name: dance.name,
      choreographer: dance.choreographer,
      song: dance.song,
      artist: dance.artist,
      difficulty: dance.difficulty,
      count: dance.count || "",
      bpm: dance.bpm,
      youtube_url: dance.youtube_url || "",
      step_sheet: dance.step_sheet || "",
      step_sheet_image: dance.step_sheet_image || "",
      description: dance.description || "",
      tags: dance.tags || [],
      is_published: dance.is_published,
      copperknob_url: dance.copperknob_url || "",
      bootstepper_url: dance.bootstepper_url || "",
      copperknob_ref: dance.copperknob_ref || refId,
    };
    for (const f of fields) {
      if (picks[f.field]) delta[f.field] = f.copperknob;
    }
    setApplying(true);
    try {
      const updated = await api.updateDance(dance.id, delta as any, token);
      onApplied(updated);
      Alert.alert("Updated", "Selected fields refreshed from CopperKnob.");
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't apply", e?.message || "Try again in a moment.");
    } finally {
      setApplying(false);
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
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Check CopperKnob data</Text>
              <Text style={styles.subtitle}>
                Ref{" "}
                <Text style={styles.mono}>{refId || dance.copperknob_ref}</Text>
                {" · "}
                <Text
                  style={styles.link}
                  onPress={() => ckUrl && Linking.openURL(ckUrl)}
                >
                  open on CopperKnob
                </Text>
              </Text>
            </View>
            <Pressable onPress={onClose} testID="ck-compare-close" hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons
                name="cloud-offline-outline"
                size={40}
                color={colors.muted}
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.confirmBtn} onPress={load}>
                <Text style={styles.confirmText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 460 }}>
              {(fields || []).map((f) => {
                const label = FIELD_LABELS[f.field] || f.field;
                const picked = !!picks[f.field];
                return (
                  <View
                    key={f.field}
                    style={[
                      styles.fieldCard,
                      f.differs && styles.fieldCardDiff,
                    ]}
                    testID={`ck-cmp-${f.field}`}
                  >
                    <View style={styles.fieldHead}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      {f.differs ? (
                        <Pressable
                          onPress={() =>
                            setPicks((p) => ({ ...p, [f.field]: !p[f.field] }))
                          }
                          style={styles.pickBtn}
                          testID={`ck-cmp-toggle-${f.field}`}
                        >
                          <Ionicons
                            name={picked ? "checkbox" : "square-outline"}
                            size={16}
                            color={picked ? colors.brandPrimary : colors.muted}
                          />
                          <Text
                            style={[
                              styles.pickText,
                              picked && { color: colors.brandPrimary },
                            ]}
                          >
                            {picked ? "Use CopperKnob" : "Keep current"}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.matchPill}>
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color="#16803C"
                          />
                          <Text style={styles.matchPillText}>Match</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.compareRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.colHead}>Current</Text>
                        <Text style={styles.colVal}>{f.ours || "—"}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.colHead}>CopperKnob</Text>
                        <Text
                          style={[
                            styles.colVal,
                            f.differs && { color: colors.brandPrimary },
                          ]}
                        >
                          {f.copperknob || "—"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.attribution}>
                Dance information provided by CopperKnob
              </Text>
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onApply}
              disabled={!anyPicked || applying}
              style={[
                styles.confirmBtn,
                (!anyPicked || applying) && { opacity: 0.5 },
              ]}
              testID="ck-compare-apply"
            >
              {applying ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.confirmText}>Apply selected</Text>
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
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  mono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    color: colors.onSurface,
  },
  link: { color: colors.brandPrimary, textDecorationLine: "underline" },
  center: {
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
  },
  errorText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  fieldCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 8,
  },
  fieldCardDiff: {
    borderWidth: 1,
    borderColor: colors.brandPrimary + "44",
  },
  fieldHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pickText: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  matchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#D8F3E4",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  matchPillText: { color: "#0F5027", fontSize: 11, fontWeight: "700" },
  compareRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  colHead: {
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  colVal: { fontSize: 13, color: colors.onSurface },
  attribution: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
    padding: spacing.md,
    fontStyle: "italic",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  cancelText: { color: colors.muted, fontWeight: "700" },
  confirmBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  confirmText: { color: colors.onBrandPrimary, fontWeight: "700" },
});
