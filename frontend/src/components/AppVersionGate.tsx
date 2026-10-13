/**
 * AppVersionGate
 * --------------
 * Reads the server's version policy (Admin → App Version) on launch and
 * every time the app returns to the foreground:
 *   - below ``min_version``    → full-screen, non-dismissible "Update
 *     required" screen with a store button (admins get the banner
 *     instead so a mis-set minimum can never lock them out of the
 *     Admin screen that fixes it).
 *   - below ``latest_version`` → dismissible "New version available"
 *     banner; dismissal is remembered per latest version.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, VersionPolicy } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useTranslation } from "@/src/i18n";
import { APP_VERSION, isOlder } from "@/src/lib/appVersion";
import { colors, radius, spacing } from "@/src/theme";

const DISMISS_KEY = "appVersion.dismissedLatest";

export function AppVersionGate() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [policy, setPolicy] = useState<VersionPolicy | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  // Logged-out admins can step past the blocking screen to sign in, so a
  // mis-set minimum never locks them out. Ignored once a user is signed
  // in (non-admins are blocked again straight after login).
  const [signInBypass, setSignInBypass] = useState(false);

  const refresh = useCallback(() => {
    api.getVersionPolicy().then(setPolicy).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    AsyncStorage.getItem(DISMISS_KEY).then(setDismissed).catch(() => {});
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!policy) return null;

  const storeUrl = Platform.OS === "ios" ? policy.ios_url : policy.android_url;
  const openStore = () => {
    Linking.openURL(storeUrl).catch(() => {});
  };
  const required = isOlder(APP_VERSION, policy.min_version);
  const latest = policy.latest_version;

  if (required && !user?.is_admin && !(signInBypass && !user)) {
    return (
      <Modal visible animationType="fade" onRequestClose={() => {}}>
        <View
          testID="update-required-screen"
          style={[
            styles.full,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <View style={styles.fullBody}>
            <View style={styles.bigOrb}>
              <Ionicons name="rocket-outline" size={44} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.fullTitle}>{t("update.required_title")}</Text>
            <Text style={styles.fullText}>{t("update.required_body")}</Text>
            <Text style={styles.versionLine}>
              {t("update.version_line", { current: APP_VERSION, latest: latest || policy.min_version })}
            </Text>
          </View>
          <Pressable
            testID="update-required-button"
            onPress={openStore}
            style={styles.primaryBtn}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.primaryBtnText}>{t("update.now")}</Text>
          </Pressable>
          {!user ? (
            <Pressable
              testID="update-required-admin-signin"
              onPress={() => setSignInBypass(true)}
              hitSlop={10}
              style={styles.adminLink}
            >
              <Text style={styles.adminLinkText}>{t("update.admin_signin")}</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal>
    );
  }

  const showBanner =
    !hidden && (required || (isOlder(APP_VERSION, latest) && dismissed !== latest));
  if (!showBanner) return null;

  const dismiss = () => {
    setHidden(true);
    if (latest) {
      setDismissed(latest);
      AsyncStorage.setItem(DISMISS_KEY, latest).catch(() => {});
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bannerWrap, { paddingTop: insets.top + 6 }]}
    >
      <View style={styles.banner} testID="update-available-banner">
        <View style={styles.orb}>
          <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>
            {required ? t("update.required_title") : t("update.available_title")}
          </Text>
          <Text style={styles.bannerSub} numberOfLines={2}>
            {required
              ? t("update.admin_bypass")
              : t("update.available_body", { version: latest })}
          </Text>
        </View>
        <Pressable onPress={openStore} style={styles.cta} testID="update-available-open">
          <Text style={styles.ctaText}>{t("update.now")}</Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          style={styles.close}
          testID="update-available-dismiss"
          accessibilityLabel={t("update.later")}
        >
          <Ionicons name="close" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: "space-between",
  },
  fullBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  bigOrb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  fullTitle: {
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "800",
    color: colors.onSurface,
    textAlign: "center",
  },
  fullText: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
  versionLine: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "800" },
  adminLink: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: spacing.sm },
  adminLinkText: { color: colors.muted, fontSize: 13, textDecorationLine: "underline" },
  bannerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    paddingHorizontal: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  orb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  bannerTitle: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  bannerSub: { color: colors.onBrandPrimary, opacity: 0.9, fontSize: 12, marginTop: 1 },
  cta: {
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  close: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
});
