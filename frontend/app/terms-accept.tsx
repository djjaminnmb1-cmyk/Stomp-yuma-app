/**
 * Terms Accept — /terms-accept
 *
 * Shown when the user is signed in but their `accepted_terms_version`
 * is missing or older than the current live version. Blocks access
 * to the rest of the app until they actively accept.
 *
 * Backend contract (see routes/legal.py):
 *   GET  /api/legal/terms-status  → { required_version, up_to_date }
 *   POST /api/legal/accept-terms  { version }
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";
import { TERMS_VERSION } from "@/src/lib/terms";

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export default function TermsAcceptScreen() {
  const router = useRouter();
  const { token, user, updateUser, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!token || !accepted) return;
    setBusy(true);
    try {
      await api.acceptTerms(TERMS_VERSION, token);
      updateUser({ accepted_terms_version: TERMS_VERSION });
      // Route back into the app. The root-layout gate will now let
      // this user through since their accepted version is current.
      router.replace("/");
    } catch (e: any) {
      Alert.alert(t("terms_accept.error_title"), e?.message || "");
    } finally {
      setBusy(false);
    }
  };

  const openTerms = () => {
    if (API_BASE) Linking.openURL(`${API_BASE}/api/legal/terms`);
    else router.push("/terms");
  };
  const openGuidelines = () => {
    if (API_BASE) Linking.openURL(`${API_BASE}/api/legal/community-guidelines`);
    else router.push("/community-guidelines");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={20} color={colors.brandPrimary} />
        <Text style={styles.headerTitle}>{t("terms_accept.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.h1}>{t("terms_accept.hero_title")}</Text>
        <Text style={styles.p}>
          {t("terms_accept.hero_body", { name: user?.name || "" })}
        </Text>

        <View style={styles.zeroCard}>
          <Ionicons name="alert-circle" size={18} color="#8A1E1E" />
          <Text style={styles.zeroText}>
            {t("terms_accept.zero_tolerance")}
          </Text>
        </View>

        <Text style={styles.h2}>{t("terms_accept.what_changed_title")}</Text>
        <View style={styles.bullets}>
          <Bullet text={t("terms_accept.bullet_zero_tolerance")} />
          <Bullet text={t("terms_accept.bullet_report")} />
          <Bullet text={t("terms_accept.bullet_block")} />
          <Bullet text={t("terms_accept.bullet_24h")} />
          <Bullet text={t("terms_accept.bullet_contact")} />
        </View>

        <View style={styles.links}>
          <Pressable
            onPress={openTerms}
            style={styles.linkRow}
            testID="terms-accept-open-terms"
          >
            <Ionicons name="document-text-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.linkText}>{t("terms_accept.read_terms")}</Text>
            <Ionicons name="open-outline" size={16} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={openGuidelines}
            style={styles.linkRow}
            testID="terms-accept-open-guidelines"
          >
            <Ionicons name="people-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.linkText}>
              {t("terms_accept.read_guidelines")}
            </Text>
            <Ionicons name="open-outline" size={16} color={colors.muted} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setAccepted((v) => !v)}
          style={styles.checkboxRow}
          testID="terms-accept-checkbox"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted ? (
              <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
            ) : null}
          </View>
          <Text style={styles.checkboxText}>
            {t("terms_accept.checkbox_label")}
          </Text>
        </Pressable>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(spacing.md, insets.bottom + 4) },
        ]}
      >
        <Pressable
          onPress={() => {
            Alert.alert(
              t("terms_accept.decline_title"),
              t("terms_accept.decline_body"),
              [
                { text: t("terms_accept.stay"), style: "cancel" },
                {
                  text: t("terms_accept.sign_out"),
                  style: "destructive",
                  onPress: async () => {
                    await signOut();
                    router.replace("/auth");
                  },
                },
              ],
            );
          }}
          style={[styles.btn, styles.btnGhost]}
          testID="terms-accept-decline"
        >
          <Text style={styles.btnGhostText}>{t("terms_accept.decline")}</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!accepted || busy}
          style={[
            styles.btn,
            styles.btnPrimary,
            (!accepted || busy) && styles.btnDisabled,
          ]}
          testID="terms-accept-continue"
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {t("terms_accept.continue")}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  body: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  h1: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  h2: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  p: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  zeroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FDE8E8",
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  zeroText: { flex: 1, color: "#4A0F0F", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  bullets: { gap: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletText: { flex: 1, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  links: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  linkText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.onSurface },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.brandPrimary },
  checkboxText: { flex: 1, fontSize: 14, color: colors.onSurface, lineHeight: 20, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
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
