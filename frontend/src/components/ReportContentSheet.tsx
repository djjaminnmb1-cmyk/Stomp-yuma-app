/**
 * ReportContentSheet
 * ------------------
 * The universal "Report" modal shared across every user-generated
 * surface (chat, feed, user profile, dance, event). Apple Guideline
 * 1.2 requires a report action on every UGC item — this component is
 * the single source of truth for how it looks and what it sends.
 *
 * Usage:
 *   const [rep, setRep] = useState<Target | null>(null);
 *   <ReportContentSheet
 *     visible={!!rep}
 *     target={rep}
 *     onClose={() => setRep(null)}
 *   />
 *
 * Where `target` is { target_type, target_id, target_user_id? }.
 *
 * The sheet loads canonical reason list from the server so any tweak
 * to the vocabulary is a single-file change on the backend.
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";

export type ReportTarget = {
  target_type: "feed" | "chat" | "profile" | "comment" | "dance" | "event";
  target_id: string;
  target_user_id?: string;
};

type Props = {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
  onReported?: () => void;
};

export function ReportContentSheet({
  visible,
  target,
  onClose,
  onReported,
}: Props) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [reasons, setReasons] = useState<{ key: string; label: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load reasons once per session — server holds the canonical list.
  useEffect(() => {
    if (!visible || !token || reasons.length > 0) return;
    setLoading(true);
    api
      .getReportReasons(token)
      .then((r) => setReasons(r.reasons))
      .catch(() => {
        // Silent fallback — offline / server hiccup shouldn't block
        // the modal. Use the locally-hardcoded list from the spec.
        setReasons([
          { key: "harassment", label: t("report.reason_harassment") },
          { key: "hate_abuse", label: t("report.reason_hate") },
          { key: "sexual", label: t("report.reason_sexual") },
          { key: "threats", label: t("report.reason_threats") },
          { key: "spam", label: t("report.reason_spam") },
          { key: "impersonation", label: t("report.reason_impersonation") },
          { key: "copyright", label: t("report.reason_copyright") },
          { key: "other", label: t("report.reason_other") },
        ]);
      })
      .finally(() => setLoading(false));
  }, [visible, token, reasons.length]);

  const reset = () => {
    setSelected("");
    setNote("");
  };

  const submit = async () => {
    if (!target || !token || !selected) return;
    setBusy(true);
    try {
      const res = await api.reportContent(
        {
          target_type: target.target_type,
          target_id: target.target_id,
          target_user_id: target.target_user_id,
          reason: selected,
          note: note.trim(),
        },
        token,
      );
      if (res.already_reported) {
        Alert.alert(t("report.dup_title"), t("report.dup_body"));
      } else {
        Alert.alert(t("report.ok_title"), t("report.ok_body"));
      }
      reset();
      onReported?.();
      onClose();
    } catch (e: any) {
      Alert.alert(t("report.fail_title"), e?.message || "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>{t("report.title")}</Text>
          <Text style={styles.sub}>{t("report.subtitle")}</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.brandPrimary} />
          ) : (
            <ScrollView
              style={styles.reasonList}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
            >
              {reasons.map((r) => {
                const active = selected === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setSelected(r.key)}
                    style={[styles.reasonRow, active && styles.reasonRowActive]}
                    testID={`report-reason-${r.key}`}
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
                      style={[
                        styles.reasonLabel,
                        active && styles.reasonLabelActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
              <TextInput
                testID="report-note"
                placeholder={t("report.note_placeholder")}
                placeholderTextColor={colors.muted}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={1000}
                style={styles.note}
              />
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => {
                reset();
                onClose();
              }}
              testID="report-cancel"
            >
              <Text style={styles.btnGhostText}>{t("report.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                (!selected || busy) && styles.btnDisabled,
              ]}
              onPress={submit}
              disabled={!selected || busy}
              testID="report-submit"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onBrandPrimary} />
              ) : (
                <Ionicons name="flag" size={14} color={colors.onBrandPrimary} />
              )}
              <Text style={styles.btnPrimaryText}>{t("report.submit")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    maxHeight: "85%",
  },
  handleWrap: { alignItems: "center", paddingBottom: 6 },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: 4,
  },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  reasonList: { marginTop: spacing.md, maxHeight: 400 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  reasonRowActive: { backgroundColor: colors.surfaceSecondary },
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
  reasonLabel: {
    fontSize: 15,
    color: colors.onSurface,
    flex: 1,
  },
  reasonLabelActive: { fontWeight: "700" },
  note: {
    marginTop: spacing.sm,
    minHeight: 80,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    textAlignVertical: "top",
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "flex-end",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
    minWidth: 100,
    justifyContent: "center",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhostText: { color: colors.onSurface, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: colors.onBrandPrimary, fontWeight: "700" },
  btnDisabled: { opacity: 0.55 },
});
