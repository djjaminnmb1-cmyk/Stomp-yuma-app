/**
 * ReportFeedSheet — the "flag this post" bottom sheet triggered by
 * long-pressing a feed card.
 *
 * Loads report reasons from ``/feed/report-reasons`` (cached at module
 * level so we only fetch once per session), lets the user pick one +
 * type an optional note, and submits to ``/feed/{id}/report``.
 *
 * On success we surface a top-of-screen toast via the shared
 * ToastProvider so the reporter sees the 24-hour SLA promise without
 * a blocking modal.
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
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { t } from "@/src/i18n";
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
  reportedUser,
  onClose,
  onReported,
  onBlocked,
}: {
  visible: boolean;
  eventId: string;
  /** Optional — when provided, a "Also block this user" toggle is
   *  offered inline so a report + block is a single action rather
   *  than two menu trips. Own posts never render this toggle. */
  reportedUser?: { user_id?: string; name?: string };
  onClose: () => void;
  onReported?: () => void;
  /** Fired only when the user opted-in to the "Also block" toggle
   *  AND the block API call succeeded. Callers use this to hide
   *  the reported card locally + drop the poster from any other
   *  feed rows that were already on-screen. */
  onBlocked?: () => void;
}) {
  const { token, user: me } = useAuth();
  const toast = useToast();
  const [reasons, setReasons] = useState<{ reason: string; label: string }[]>(
    FALLBACK_REASONS
  );
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Default the "Also block" toggle to OFF — reporting a spammy post
  // is often not a personal issue, so we don't want to silently
  // convert a report into a block. The user has to opt in.
  const [alsoBlock, setAlsoBlock] = useState(false);

  // Only offer the block toggle if we know WHO to block AND it's
  // not the caller themselves.
  const canOfferBlock = !!(
    reportedUser?.user_id &&
    me?.user_id &&
    reportedUser.user_id !== me.user_id
  );

  // Reset each time the sheet opens so a leftover note from another card
  // doesn't leak into the next flag.
  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setNote("");
    setAlsoBlock(false);
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
    let blocked = false;
    let reportRef = "";
    try {
      const res = await api.reportFeedEvent(
        token,
        eventId,
        reason,
        note.trim() || undefined,
      );
      reportRef = res.ref || "";
      onReported?.();

      // Chain the block if the user opted-in. Report always succeeds
      // FIRST — that's the primary user intent. Block failure is
      // surfaced as a soft warning; the report still stands.
      if (alsoBlock && canOfferBlock && reportedUser?.user_id) {
        try {
          await api.blockUser({ user_id: reportedUser.user_id }, token);
          blocked = true;
          onBlocked?.();
        } catch (blockErr: any) {
          // Non-fatal — we already succeeded on the primary action.
          console.warn("Block after report failed:", blockErr?.message || blockErr);
        }
      }

      const label = reportedUser?.name?.trim() || "this user";
      // Cross-platform toast — 24 h SLA promise MUST match the Community
      // Guidelines page and Safety Center copy. Suffix with the human
      // ref so the reporter can quote it in an email to safety@.
      const refSuffix = reportRef ? ` · #${reportRef}` : "";
      if (blocked) {
        toast.success(
          `${t("report.ok_body")} ${label} won't see your activity and vice-versa.${refSuffix}`,
          { duration: 4800 },
        );
      } else {
        toast.success(`${t("report.ok_body")}${refSuffix}`, { duration: 4800 });
      }
      // Close the sheet immediately — the toast lives at the app root
      // so it stays visible even after the sheet slides out.
      onClose();
    } catch (e: any) {
      toast.error(
        e?.message || "Please try again in a moment.",
        { duration: 4200 }
      );
    } finally {
      setBusy(false);
    }
  }, [
    token,
    reason,
    note,
    eventId,
    onClose,
    onReported,
    alsoBlock,
    canOfferBlock,
    reportedUser?.user_id,
    reportedUser?.name,
    onBlocked,
    toast,
  ]);

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
                within 24 hours.
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
                    {/* Localize the label — backend returns English
                        only. Falls back to the server label when the
                        locale hasn't got a translation for this key. */}
                    {t(`report_reason.${r.reason}`, { defaultValue: r.label })}
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

            {canOfferBlock ? (
              <View style={styles.blockCard}>
                <View style={{ flex: 1 }}>
                  <View style={styles.blockTitleRow}>
                    <Ionicons
                      name="eye-off"
                      size={16}
                      color={colors.brandPrimary}
                    />
                    <Text style={styles.blockTitle}>
                      Also block {reportedUser?.name?.trim() || "this user"}?
                    </Text>
                  </View>
                  <Text style={styles.blockSub}>
                    You won&apos;t see each other&apos;s chat messages or activity
                    posts. Reversible from Profile → Blocked users.
                  </Text>
                </View>
                <Switch
                  testID="report-also-block-toggle"
                  value={alsoBlock}
                  onValueChange={setAlsoBlock}
                  trackColor={{ true: colors.brandPrimary }}
                />
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
                  <Text style={styles.submitText}>
                    {alsoBlock ? "Report + Block" : "Send report"}
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
  blockCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "44",
    backgroundColor: colors.brandPrimary + "0F",
  },
  blockTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.onSurface,
    flex: 1,
  },
  blockSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
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
