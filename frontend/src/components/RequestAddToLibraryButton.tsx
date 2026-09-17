/**
 * RequestAddToLibraryButton
 * -------------------------
 * The regular-user counterpart to admin's "+ Add to Library" button
 * on CopperKnob / BootStepper result cards.
 *
 * States (visual + interaction):
 *   • idle          → "+ Request to Add" (primary Pressable)
 *   • submitting    → "Submitting..." + spinner (disabled)
 *   • pending       → "Pending Review" pill (disabled)
 *   • approved      → "In Library" (routes to /dance/{id})
 *   • rejected      → "Rejected — reason" pill (tap to see reason)
 *   • limit_reached → "5/5 used — try tomorrow" pill (disabled)
 *
 * We keep the component tiny — it wraps the pending-submissions
 * context and asks the parent card for `source` + `ref` only.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";
import { usePendingSubmissions } from "@/src/context/pending-submissions-context";
import { t } from "@/src/i18n";

type Props = {
  source: "copperknob" | "bootstepper";
  ref_: string;
  /** Optional testID — cards pass their unique id. */
  testID?: string;
};

export function RequestAddToLibraryButton({
  source,
  ref_,
  testID,
}: Props) {
  const router = useRouter();
  const { getStatus, submit, quota } = usePendingSubmissions();
  const status = getStatus(source, ref_);
  const [busy, setBusy] = useState(false);

  const outOfQuota = !status && quota && quota.remaining <= 0;

  const onPress = async () => {
    if (busy) return;
    if (status?.status === "approved" && status.approved_dance_id) {
      router.push(`/dance/${status.approved_dance_id}`);
      return;
    }
    if (status?.status === "pending") {
      Alert.alert(
        t("pending_dance.pending_title"),
        t("pending_dance.pending_body")
      );
      return;
    }
    if (status?.status === "rejected") {
      Alert.alert(
        t("pending_dance.rejected_title"),
        status.rejection_reason?.trim()
          ? `${t("pending_dance.rejected_body")}\n\n${status.rejection_reason}`
          : t("pending_dance.rejected_body")
      );
      return;
    }
    if (outOfQuota) {
      Alert.alert(
        t("pending_dance.limit_title"),
        t("pending_dance.limit_body")
      );
      return;
    }

    setBusy(true);
    try {
      const res = await submit(source, ref_);
      Alert.alert(
        t("pending_dance.submitted_title"),
        t("pending_dance.submitted_body", {
          used: res.quota.used,
          limit: res.quota.limit,
        })
      );
    } catch (e: any) {
      // The `req()` helper throws Error with `.message` = server body
      // JSON stringified, or the plain message when server sent a
      // string. Detect our shaped errors defensively.
      const msg = e?.message || "";
      let title = t("pending_dance.error_title");
      let body = t("pending_dance.error_body");
      try {
        const parsed = JSON.parse(msg);
        const detail = parsed?.detail ?? parsed;
        if (detail?.code === "daily_limit_reached") {
          title = t("pending_dance.limit_title");
          body = t("pending_dance.limit_body");
        } else if (detail?.code === "already_pending") {
          title = t("pending_dance.dup_title");
          body = t("pending_dance.dup_pending_body");
        } else if (detail?.code === "already_in_library") {
          title = t("pending_dance.dup_title");
          body = t("pending_dance.dup_library_body");
        } else if (typeof detail === "string") {
          body = detail;
        } else if (detail?.message) {
          body = detail.message;
        }
      } catch {
        if (msg) body = msg;
      }
      Alert.alert(title, body);
    } finally {
      setBusy(false);
    }
  };

  // --------- Render ---------
  if (status?.status === "approved") {
    return (
      <Pressable
        testID={testID}
        style={[styles.btn, styles.btnPrimary]}
        onPress={onPress}
      >
        <Ionicons name="library" size={16} color={colors.onBrandPrimary} />
        <Text style={styles.btnPrimaryText}>
          {t("pending_dance.btn_in_library")}
        </Text>
      </Pressable>
    );
  }

  if (status?.status === "pending") {
    return (
      <Pressable
        testID={testID}
        style={[styles.btn, styles.btnPending]}
        onPress={onPress}
      >
        <Ionicons name="hourglass-outline" size={14} color="#8A5323" />
        <Text style={styles.btnPendingText}>
          {t("pending_dance.btn_pending")}
        </Text>
      </Pressable>
    );
  }

  if (status?.status === "rejected") {
    return (
      <Pressable
        testID={testID}
        style={[styles.btn, styles.btnRejected]}
        onPress={onPress}
      >
        <Ionicons name="close-circle-outline" size={14} color="#8A1E1E" />
        <Text style={styles.btnRejectedText}>
          {t("pending_dance.btn_rejected")}
        </Text>
      </Pressable>
    );
  }

  if (outOfQuota) {
    return (
      <View style={[styles.btn, styles.btnLimit]}>
        <Ionicons name="alert-circle-outline" size={14} color="#8A5323" />
        <Text style={styles.btnPendingText}>
          {t("pending_dance.btn_limit", { limit: quota?.limit ?? 5 })}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.onBrandPrimary} />
      ) : (
        <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
      )}
      <Text style={styles.btnPrimaryText}>
        {busy
          ? t("pending_dance.btn_submitting")
          : t("pending_dance.btn_request")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 36,
  },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  btnDisabled: { opacity: 0.6 },
  btnPending: {
    backgroundColor: "#F5E4CE",
    borderWidth: 1,
    borderColor: "#E1BB86",
  },
  btnPendingText: { color: "#8A5323", fontWeight: "700", fontSize: 12 },
  btnRejected: {
    backgroundColor: "#F8DADA",
    borderWidth: 1,
    borderColor: "#E5A0A0",
  },
  btnRejectedText: { color: "#8A1E1E", fontWeight: "700", fontSize: 12 },
  btnLimit: {
    backgroundColor: "#F5E4CE",
    borderWidth: 1,
    borderColor: "#E1BB86",
  },
});
