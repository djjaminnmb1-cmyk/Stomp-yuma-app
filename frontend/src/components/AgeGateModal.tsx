/**
 * AgeGateModal — one-tap "I'm 13 or older" confirmation on first launch.
 *
 * Behavior
 *  - Mounted at the app root; reads `age_gate_ack_at` from AsyncStorage
 *    on mount.
 *  - If the key is missing (never confirmed), the modal is shown as an
 *    uncloseable overlay until the user either taps the primary
 *    "I'm 13 or older" button or the secondary "I'm under 13" link.
 *  - Tapping the primary button stores an ISO timestamp so the user is
 *    never re-prompted on the same device.
 *  - Tapping "I'm under 13" swaps the sheet to a friendly message
 *    telling the child to use SGY with an adult; the flow stops there
 *    (they can't proceed into the app on this launch).
 *
 * Rationale
 *  - Apple / Google both look for an age-gate signal when your app has
 *    social features. A soft acknowledgement is the lightest thing that
 *    satisfies review without breaking family usage — parents can
 *    supervise per the on-screen message and the primary button becomes
 *    a "yes, my parent said it's OK" moment.
 */
import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing, images } from "@/src/theme";
import { useTranslation } from "@/src/i18n";

const KEY = "age_gate_ack_at";

export function AgeGateModal() {
  const router = useRouter();
  const { t, tRaw } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"gate" | "under13">("gate");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const val = await storage.getItem(KEY, "");
      if (!alive) return;
      // Missing / empty means we've never seen a confirmation on this
      // device.
      if (!val) {
        setVisible(true);
      }
      setChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const confirmAdult = async () => {
    const now = new Date().toISOString();
    await storage.setItem(KEY, now);
    setVisible(false);
  };

  const declineChild = () => {
    setStep("under13");
  };

  // Don't render anything until we've read from storage — avoids the
  // modal flashing for repeat users while AsyncStorage resolves.
  if (!checked) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        // Intentionally not dismissable via Android back button — the
        // user must make a choice.
      }}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="age-gate-modal">
          <View style={styles.heroWrap}>
            <Image
              source={images.home_hero_local}
              style={StyleSheet.absoluteFillObject as any}
              contentFit="cover"
              contentPosition="top"
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.55)"]}
              style={StyleSheet.absoluteFillObject as any}
            />
            <View style={styles.heroContent}>
              <Ionicons name="shield-checkmark" size={38} color="#fff" />
              <Text style={styles.heroTitle}>{t("age_gate.hero_title")}</Text>
              <Text style={styles.heroSub}>
                {t("age_gate.hero_sub")}
              </Text>
            </View>
          </View>

          {step === "gate" ? (
            <View style={styles.body}>
              <Text style={styles.title}>
                {t("age_gate.title_line1")}{" "}
                <Text style={styles.emph}>{t("age_gate.title_years")}</Text>.
              </Text>
              <Text style={styles.copy}>
                {t("age_gate.body_copy")}
              </Text>

              <Pressable
                testID="age-gate-adult"
                onPress={confirmAdult}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>{t("age_gate.adult_button")}</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </Pressable>

              <Pressable
                testID="age-gate-child"
                onPress={declineChild}
                hitSlop={8}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t("age_gate.child_button")}</Text>
              </Pressable>

              {(() => {
                // Split "By tapping {emph} you agree to our {terms} and {privacy}."
                // preserving the interpolated links. We use tRaw() to get
                // the un-rewritten source string so the literal ``{terms}``
                // / ``{privacy}`` tokens are still present to split on.
                const raw = tRaw("age_gate.legal");
                const [beforeEmph, rest1] = raw.split("{emph}");
                const [beforeTerms, rest2] = (rest1 || "").split("{terms}");
                const [betweenTermsPrivacy, afterPrivacy] = (rest2 || "").split("{privacy}");
                return (
                  <Text style={styles.legal}>
                    {beforeEmph}
                    <Text style={{ fontWeight: "700" }}>{t("age_gate.legal_emph")}</Text>
                    {beforeTerms}
                    <Text
                      testID="age-gate-terms"
                      onPress={() => {
                        setVisible(false);
                        router.push("/terms");
                      }}
                      style={styles.link}
                    >
                      {t("auth.terms")}
                    </Text>
                    {betweenTermsPrivacy}
                    <Text
                      testID="age-gate-privacy"
                      onPress={() => {
                        setVisible(false);
                        router.push("/privacy");
                      }}
                      style={styles.link}
                    >
                      {t("auth.privacy_policy")}
                    </Text>
                    {afterPrivacy}
                  </Text>
                );
              })()}
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={styles.title}>{t("age_gate.under13_title")}</Text>
              <Text style={styles.copy}>
                {t("age_gate.under13_copy")}
              </Text>
              <Pressable
                testID="age-gate-under13-back"
                onPress={() => setStep("gate")}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>{t("age_gate.back")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
    // Subtle lift so the modal doesn't feel painted onto the backdrop.
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 12,
  },
  heroWrap: {
    height: 160,
    backgroundColor: colors.brandTertiary,
    overflow: "hidden",
  },
  heroContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: spacing.lg,
    gap: 4,
  },
  heroTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  heroSub: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  body: { padding: spacing.lg, gap: spacing.md },
  title: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "800",
    color: colors.onSurface,
    lineHeight: 23,
  },
  emph: { color: colors.brandPrimary },
  copy: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 19,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    marginTop: 4,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  secondaryText: {
    color: colors.onSurfaceSecondary,
    fontWeight: "700",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  legal: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
    ...(Platform.OS === "web" ? { userSelect: "text" as any } : {}),
  },
  link: {
    color: colors.brandPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});

export default AgeGateModal;
