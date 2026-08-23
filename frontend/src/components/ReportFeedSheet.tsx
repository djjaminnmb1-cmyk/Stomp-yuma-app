/**
 * ReportFeedSheet — the "flag this post" bottom sheet triggered by
 * long-pressing a feed card.
 *
 * Loads report reasons from ``/feed/report-reasons`` (cached at module
 * level so we only fetch once per session), lets the user pick one +
 * type an optional note, and submits to ``/feed/{id}/report``.
 *
 * On success we surface a discreet confirmation toast (Alert on native,
 * inline banner on web) so the reporter knows SGY got the flag.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

// Fallback in case the catalog fails to load — matches the backend.
const FALLBACK_REASONS = [
  { reason: "harassment", label: "Harassment / bullying" },
  { reason: "hate_speech", label: "Hate speech or slurs" },
  { reason: "spam", label: "Spam or scam" },
  { reason: "impersonation", label: "Impersonation" },
  { reason: "sexual_content", label: "Sexual or explicit content" },
  { reason: "other", label: "Something else" },
];

let cachedReasons: { reason: string; label: string }[] | null = null;

async function loadReasons(token: string) {
  if (cachedReasons) return cachedReasons;
  try {
    const r = await api.getReportReasons(token);
    cachedReasons = r.reasons || FALLBACK_REASONS;
  } catch {
    cachedReasons = FALLBACK_REASONS;
  }
  return cachedReasons;
}

export function ReportFeedSheet({
  visible,
  eventId,
  onClose,
  onReported,
}: {
  visible: boolean;
  eventId: string;
  onClose: () => void;
  onReported?: () => void;
}) {
  const { token } = useAuth();
  const [reasons, setReasons] = useState<{ reason: string; label: string }[]>(
    FALLBACK_REASONS
  );
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [inlineOk, setInlineOk] = useState(false);

  // Reset each time the sheet opens so a leftover note from another card
  // doesn't leak into the next flag.
  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setNote("");
    setInlineOk(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    loadReasons(token).then((r) => {
      if (!cancelled) setReasons(r);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const submit = useCallback(async () => {
    if (!token || !reason) return;
    setBusy(true);
    try {
      await api.reportFeedEvent(token, eventId, reason, note.trim() || undefined);
      onReported?.();
      // Native alert closes the sheet; web shows an inline banner.
      if (Platform.OS === "web") {
        setInlineOk(true);
        setTimeout(onClose, 1600);
      } else {
        Alert.alert(
          "Thanks — report sent",
          "Our team will review this within 48 hours. Thanks for keeping SGY a welcoming place.",
          [{ text: "OK", onPress: onClose }]
        );
      }
    } catch (e: any) {
      Alert.alert(
        "Couldn't send report",
        e?.message || "Please try again in a moment."
      );
    } finally {
      setBusy(false);
    }
  }, [token, reason, note, eventId, onClose, onReported]);

  const canSubmit = useMemo(() => !!reason && !busy, [reason, busy]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.tap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Report this post</Text>
              <Text style={styles.sub}>
                Your report goes to SGY moderators. We&apos;ll review it
                within 48 hours.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              testID="report-sheet-close"
              style={styles.iconBtn}
            >
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>What&apos;s wrong?</Text>
            {reasons.map((r) => {
              const active = reason === r.reason;
              return (
                <Pressable
                  key={r.reason}
                  onPress={() => setReason(r.reason)}
                  testID={`report-reason-${r.reason}`}
                  style={[styles.optRow, active && styles.optRowActive]}
                >
                  <View
                    style={[
                      styles.radio,
                      active && styles.radioActive,
                    ]}
                  >
                    {active ? (
                      <View style={styles.radioDot} />
                    ) : null}
                  </View>
                  <Text
                    style={[styles.optText, active && styles.optTextActive]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}

            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.sectionLabel}>
                Anything else? (optional)
              </Text>
              <TextInput
                testID="report-note-input"
                value={note}
                onChangeText={setNote}
                placeholder="Give the moderator context — what should they look at?"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                maxLength={600}
                style={styles.noteInput}
              />
              <Text style={styles.counter}>{note.length} / 600</Text>
            </View>

            {inlineOk ? (
              <View style={styles.okBanner}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.okBannerText}>
                  Report sent. Thanks for looking out for the community.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footRow}>
            <Pressable
              onPress={onClose}
              style={styles.cancelBtn}
              disabled={busy}
              testID="report-cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              testID="report-submit"
              style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
              disabled={!canSubmit}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="flag" size={14} color="#fff" />
                  <Text style={styles.submitText}>Send report</Text>
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
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  tap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
    paddingBottom: spacing.md,
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
    marginTop: 2,
    lineHeight: 17,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optRowActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary + "10",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.brandPrimary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
  },
  optText: { fontSize: 14, color: colors.onSurface, flex: 1 },
  optTextActive: { fontWeight: "700" },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    minHeight: 80,
    color: colors.onSurface,
    fontSize: 14,
    backgroundColor: colors.surface,
    textAlignVertical: "top",
  },
  counter: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
  okBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    backgroundColor: colors.success + "14",
    borderWidth: 1,
    borderColor: colors.success + "55",
  },
  okBannerText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  footRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: { color: colors.onSurface, fontWeight: "700" },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  submitText: { color: "#fff", fontWeight: "800" },
});

export default ReportFeedSheet;
