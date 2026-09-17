/**
 * Safety Center — /safety
 *
 * Apple Guideline 1.2 requires easily-discoverable contact info + a
 * clear explanation of how safety features work. This is that
 * screen.
 *
 * Reachable from Profile → Safety row (see profile.tsx).
 */
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";

const SUPPORT_EMAIL = "whereyumalinesuptodance@stompingroundyuma.org";
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export default function SafetyScreen() {
  const router = useRouter();

  const emailSafety = () =>
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        "Safety concern",
      )}`,
    );

  const openTerms = () =>
    Linking.openURL(
      API_BASE ? `${API_BASE}/api/legal/terms` : "https://stompingroundyuma.org/terms",
    );
  const openGuidelines = () =>
    Linking.openURL(
      API_BASE
        ? `${API_BASE}/api/legal/community-guidelines`
        : "https://stompingroundyuma.org/community-guidelines",
    );
  const openPrivacy = () =>
    Linking.openURL(
      API_BASE ? `${API_BASE}/api/legal/privacy` : "https://stompingroundyuma.org/privacy",
    );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("safety.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Ionicons name="shield-checkmark" size={40} color={colors.brandPrimary} />
          <Text style={styles.h1}>{t("safety.hero_title")}</Text>
          <Text style={styles.heroBody}>{t("safety.hero_body")}</Text>
        </View>

        {/* Zero tolerance banner */}
        <View style={styles.zeroCard}>
          <Ionicons name="alert-circle" size={20} color="#8A1E1E" />
          <Text style={styles.zeroText}>{t("safety.zero_tolerance")}</Text>
        </View>

        {/* How to report */}
        <Text style={styles.h2}>{t("safety.report_title")}</Text>
        <Text style={styles.p}>{t("safety.report_body")}</Text>
        <View style={styles.stepList}>
          <Step n={1} text={t("safety.report_step1")} />
          <Step n={2} text={t("safety.report_step2")} />
          <Step n={3} text={t("safety.report_step3")} />
        </View>

        {/* How to block */}
        <Text style={styles.h2}>{t("safety.block_title")}</Text>
        <Text style={styles.p}>{t("safety.block_body")}</Text>
        <View style={styles.stepList}>
          <Step n={1} text={t("safety.block_step1")} />
          <Step n={2} text={t("safety.block_step2")} />
        </View>
        <Pressable
          onPress={() => router.push("/blocked-users")}
          style={styles.row}
          testID="safety-manage-blocks"
        >
          <Ionicons name="ban-outline" size={20} color={colors.brandPrimary} />
          <Text style={styles.rowText}>{t("safety.manage_blocked")}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        {/* Contact */}
        <Text style={styles.h2}>{t("safety.contact_title")}</Text>
        <Text style={styles.p}>{t("safety.contact_body")}</Text>
        <Pressable
          onPress={emailSafety}
          style={styles.contactCard}
          testID="safety-email-btn"
        >
          <Ionicons name="mail" size={22} color={colors.onBrandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactLabel}>{t("safety.email_us")}</Text>
            <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="open" size={18} color={colors.onBrandPrimary} />
        </Pressable>
        <Text style={styles.hint}>{t("safety.contact_sla")}</Text>

        {/* Legal links */}
        <Text style={styles.h2}>{t("safety.policies_title")}</Text>
        <View style={styles.linkGroup}>
          <Pressable onPress={openTerms} style={styles.row} testID="safety-terms">
            <Ionicons name="document-text-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>{t("safety.read_terms")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={openGuidelines} style={styles.row} testID="safety-guidelines">
            <Ionicons name="people-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>{t("safety.read_guidelines")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={openPrivacy} style={styles.row} testID="safety-privacy">
            <Ionicons name="lock-closed-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.rowText}>{t("safety.read_privacy")}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", padding: spacing.lg, gap: spacing.sm },
  h1: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
  heroBody: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  zeroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FDE8E8",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  zeroText: { flex: 1, color: "#4A0F0F", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  h2: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  p: { fontSize: 14, color: colors.onSurface, lineHeight: 20, marginBottom: spacing.sm },
  stepList: { gap: 6, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.sm,
  },
  rowText: { flex: 1, color: colors.onSurface, fontWeight: "600" },
  linkGroup: { gap: spacing.sm },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    marginTop: spacing.sm,
  },
  contactLabel: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  contactEmail: { color: colors.onBrandPrimary, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
});
