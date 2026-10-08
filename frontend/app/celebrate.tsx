import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Platform,
  Dimensions,
  Pressable,
  Share,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { FireworksOverlay } from "@/src/components/FireworksOverlay";
import { BadgeUnlockedOverlay } from "@/src/components/BadgeUnlockedOverlay";
import { colors, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { downloadCertificate } from "@/src/lib/certificate";
import CertificateThemePicker from "@/src/components/CertificateThemePicker";
import { api, Badge } from "@/src/api/client";
import { useToast } from "@/src/context/toast-context";

/**
 * Celebration screen shown when a user marks a dance completed. Same visual
 * language as /welcome (background + orbiting logo + fireworks) so it feels
 * unmistakably part of the same "you did something great" moment.
 *
 * Deep-linked from the dance-detail sticky Mark-Completed button with:
 *   /celebrate?danceName=<name>&count=<total-completed-so-far>
 *
 * After the fireworks finish (~2.5s) we auto-navigate back to the caller
 * unless the user taps "Done" first.
 */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CENTER_X = SCREEN_W / 2;
// Orbit the logo in the UPPER band so it never touches the bottom panel
// (and so after the one-time sweep settles, the logo rests above the
// hero column instead of inside it where it would compete with the
// "You completed …" message). Settle angle = -π/2 → directly above
// ORBIT_CENTER_Y, which lives behind the eyebrow/headline shadow.
const ORBIT_CENTER_Y = SCREEN_H * 0.72;
const ORBIT_RADIUS = Math.min(SCREEN_W * 0.26, 110);
const LOGO_SIZE = 88;
const CIRCLE_MS = 2500;
const AUTO_DISMISS_MS = 9000; // Enough time for Certificate + Share + read the milestone.
const AUTO_DISMISS_WITH_BADGES_MS = 14000; // Extra time so users can absorb each earned badge.

export default function CelebrateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    danceName?: string;
    count?: string;
    danceId?: string;
    // JSON-encoded array of Badge objects for badges earned by this action.
    badges?: string;
  }>();
  const danceName = ((params.danceName as string) || "").trim();
  const danceId = ((params.danceId as string) || "").trim();
  const rawCount = parseInt((params.count as string) || "", 10);
  const totalCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : null;
  const { token, user, updateUser } = useAuth();
  // Toast for the "Thanks for spreading the word!" moment after Share.
  // Called defensively — in some test harnesses the provider isn't
  // mounted so handleShare wraps the call in try/catch.
  const toast = useToast();
  const [selectedTheme, setSelectedTheme] = useState<string>(
    user?.certificate_theme || "classic"
  );

  // Parse earned-badges JSON param defensively. Empty array on any error.
  const earnedBadges = useMemo<Badge[]>(() => {
    const raw = (params.badges as string) || "";
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Badge[];
    } catch {
      /* ignore malformed */
    }
    return [];
  }, [params.badges]);

  const [showBadges, setShowBadges] = useState<boolean>(earnedBadges.length > 0);

  // Start the hero at the end-state (opacity 1, no offset) so the
  // text is visible on web even if the Reanimated web adapter
  // doesn't fire withDelay/withTiming cleanly. On native, the
  // useEffect below re-sets to 0 and animates in — the brief
  // start-at-visible is imperceptible there (one frame). On web,
  // we skip the entry animation entirely so content never gets
  // stuck invisible.
  const t = useSharedValue(Platform.OS === "web" ? 1 : 0);
  const orbit = useSharedValue(0);
  // Auto-dismiss timer handle — kept in a ref so Share can cancel it.
  const dismissTimerRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [certOk, setCertOk] = useState(false);

  const cancelAutoDismiss = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  useEffect(() => {
    // Only play the entry animation on native where Reanimated is
    // reliable. On web the shared value already defaults to 1 so
    // content is visible immediately.
    if (Platform.OS !== "web") {
      t.value = 0;
      t.value = withDelay(
        120,
        withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
      );
    }
    orbit.value = withTiming(1, {
      duration: CIRCLE_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    // Auto-dismiss back to the dance detail if the user doesn't tap Done.
    // Extra time if we're playing the badge cascade animation.
    const timeout =
      earnedBadges.length > 0 ? AUTO_DISMISS_WITH_BADGES_MS : AUTO_DISMISS_MS;
    dismissTimerRef.current = setTimeout(() => goBack(), timeout);
    return () => cancelAutoDismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => {
    try {
      if ((router as any).canGoBack?.()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      router.replace("/(tabs)");
    }
  };

  /**
   * Compose a short shareable message and hand it off to the platform.
   *
   * - Native (iOS/Android): the RN `Share` API opens the standard system
   *   sheet (SMS / Messages / iMessage / Twitter / Instagram / etc.).
   * - Web: prefer the browser's Web Share API when available (mobile
   *   browsers + Safari); fall back to writing to clipboard with a small
   *   inline "Copied!" state so users still get *something* useful on
   *   desktop where system share dialogs don't exist.
   */
  const handleShare = async () => {
    if (sharing) return;
    cancelAutoDismiss(); // Never dismiss underneath the user while sharing.
    setSharing(true);
    // Track whether the share actually reached the OS sheet / clipboard
    // so we can show the gratitude toast ONLY when the dancer followed
    // through — not on silent failures or user-cancels.
    let shared = false;
    try {
      const label = danceName ? `"${danceName}"` : "a new dance";
      const milestoneLine =
        totalCount === 1
          ? " That's my first one 🎉"
          : totalCount && totalCount > 1
            ? ` That makes ${totalCount} dances down!`
            : "";
      const message =
        `I just learned ${label} at Stompin' Ground Yuma! 🤠${milestoneLine}\n` +
        `— come line dance with us in Yuma, AZ.`;

      if (Platform.OS === "web") {
        const nav = (globalThis as any).navigator;
        if (nav?.share) {
          try {
            await nav.share({ title: "Stompin' Ground Yuma", text: message });
            shared = true;
            return;
          } catch (e: any) {
            if (e?.name === "AbortError") return; // user cancelled — no toast
            // Fall through to clipboard on any other error.
          }
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
          shared = true;
          return;
        }
        Alert.alert("Shareable text", message);
        shared = true;
        return;
      }

      // Native path — Share.share resolves with {action} that tells us
      // whether the OS sheet was used or dismissed. action === "dismissedAction"
      // means the user tapped Cancel — don't gush at them in that case.
      const res = await Share.share(
        { message, title: "Stompin' Ground Yuma" },
        { dialogTitle: "Share your dance" }
      );
      shared = res?.action !== Share.dismissedAction;
    } catch {
      /* Silently ignore — sharing is a nice-to-have, never a blocker. */
    } finally {
      setSharing(false);
      if (shared) {
        // Gratitude toast — a brief "we saw you spread the word" moment
        // that lives above the celebration until it auto-dismisses.
        try {
          toast.success("Thanks for spreading the word! 🎉", {
            duration: 2600,
          });
        } catch {
          /* Toast context missing in some test envs — safe no-op */
        }
      }
    }
  };

  /**
   * Fetch the PDF certificate from the backend and trigger the platform's
   * native download / share flow. Non-blocking — quietly logs failures and
   * shows a small in-line "Downloaded" checkmark on success so users get
   * feedback without an interrupting alert.
   */
  const handleCertificate = async () => {
    if (certLoading || !danceId) return;
    cancelAutoDismiss();
    setCertLoading(true);
    setCertOk(false);
    try {
      const r = await downloadCertificate(
        danceId,
        danceName || "dance",
        token || "",
        selectedTheme
      );
      if (r.ok) {
        setCertOk(true);
        setTimeout(() => setCertOk(false), 2800);
        // Persist the picked theme to the user's profile so future
        // certificates default to it (fire-and-forget; UI already succeeded).
        if (token && selectedTheme && selectedTheme !== user?.certificate_theme) {
          api
            .setCertificateTheme(selectedTheme, token)
            .then(() => updateUser({ certificate_theme: selectedTheme }))
            .catch(() => {
              /* Non-fatal — the download already happened in the picked theme. */
            });
        }
      } else if (r.message) {
        Alert.alert("Couldn't download certificate", r.message);
      }
    } finally {
      setCertLoading(false);
    }
  };

  const bigStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: (1 - t.value) * 24 },
      { scale: 0.92 + t.value * 0.08 },
    ],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: t.value * t.value,
    transform: [{ translateY: (1 - t.value) * 12 }],
  }));

  const logoStyle = useAnimatedStyle(() => {
    const angle = orbit.value * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(angle) * ORBIT_RADIUS;
    const dy = Math.sin(angle) * ORBIT_RADIUS;
    const spin = orbit.value * 360;
    return {
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${spin}deg` },
      ],
    };
  });

  const milestone = getMilestoneLabel(totalCount);

  // Compact secondary line under the headline. Replaces the old
  // "{count} dances completed" + milestone double-stack that competed
  // for attention with the main message. Picks the richest single
  // string available: milestone > count > motivational default.
  const secondaryLine =
    milestone ||
    (totalCount === 1
      ? "Your first completed dance 🎉"
      : totalCount && totalCount > 1
        ? `Dance #${totalCount}`
        : "Boot-scoot on 💃");

  // Headline — one clear, present-tense sentence. If the backend lost
  // the dance name (deeplink missing param) we fall back to a generic
  // "You completed a dance!" rather than something ambiguous.
  const headline = danceName
    ? `You completed ${danceName}!`
    : "You completed a dance!";

  return (
    <ImageBackground
      source={require("../assets/images/welcome-bg.jpg")}
      resizeMode="cover"
      style={styles.c}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.scrim} pointerEvents="none" />

        {/* Orbiting logo as a background flourish. Positioned below the
            headline/badge stack so it never covers the main message
            after the one-time 2.5s sweep settles. */}
        <Animated.Image
          source={require("../assets/images/logo.png")}
          resizeMode="contain"
          style={[styles.logo, logoStyle]}
        />

        {/* ONE clear hero section: eyebrow → headline → compact
            secondary line → inline badge cascade. Everything laid out
            in normal flex-flow so the badge can never overlap the
            headline (the pre-2026-10-05 bug the UX review flagged). */}
        <View style={styles.hero} pointerEvents="box-none">
          <Animated.Text style={[styles.eyebrow, subStyle]}>
            Nice work!
          </Animated.Text>
          <Animated.Text
            style={[styles.greeting, bigStyle]}
            numberOfLines={3}
            adjustsFontSizeToFit
            testID="celebrate-headline"
          >
            {headline}
          </Animated.Text>
          <Animated.Text style={[styles.secondary, subStyle]} numberOfLines={1}>
            {secondaryLine}
          </Animated.Text>

          {/* Newly-earned badges cascade in BELOW the headline — no
              more top-of-screen float that covered the message. */}
          {showBadges && earnedBadges.length > 0 ? (
            <BadgeUnlockedOverlay
              badges={earnedBadges}
              inline
              onAllDismissed={() => setShowBadges(false)}
            />
          ) : null}
        </View>

        <FireworksOverlay
          message=""
          onDone={() => {
            /* handled by the AUTO_DISMISS_MS timer + tap-anywhere below */
          }}
        />

        {/* Tap anywhere on the screen (outside the logo) to dismiss early.
            The fireworks overlay itself uses pointerEvents="box-none" so
            taps pass through to this Pressable underneath. */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={goBack}
          testID="celebrate-dismiss"
        />

        {/* Certificate theme picker + button row — stacked in a single
            bottom panel so the button row can never overlap the pills, no
            matter how many buttons wrap or how narrow the device is. */}
        <View style={styles.bottomPanel} pointerEvents="box-none">
          {danceId && token ? (
            <View style={styles.themeRow} pointerEvents="box-none">
              <Text style={styles.themeLabel}>Certificate theme</Text>
              <CertificateThemePicker
                value={selectedTheme}
                onChange={(k) => {
                  cancelAutoDismiss();
                  setSelectedTheme(k);
                }}
              />
            </View>
          ) : null}

          <View style={styles.doneWrap} pointerEvents="box-none">
            {danceId && token ? (
              <Pressable
                onPress={handleCertificate}
                onPressIn={cancelAutoDismiss}
                disabled={certLoading}
                style={[styles.shareBtn, certLoading && { opacity: 0.6 }]}
                testID="celebrate-certificate"
                accessibilityLabel="Download certificate of completion"
              >
                <Ionicons
                  name={certOk ? "checkmark-circle" : "document-text"}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.shareBtnText}>
                  {certOk
                    ? "Downloaded!"
                    : certLoading
                      ? "Preparing…"
                      : "Certificate"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleShare}
              onPressIn={cancelAutoDismiss}
              disabled={sharing}
              style={[styles.shareBtn, sharing && { opacity: 0.6 }]}
              testID="celebrate-share"
              accessibilityLabel="Share your win"
            >
              <Ionicons
                name={copied ? "checkmark" : "share-social"}
                size={18}
                color="#fff"
              />
              <Text style={styles.shareBtnText}>
                {copied
                  ? "Copied!"
                  : sharing
                    ? "Opening…"
                    : "Share your win"}
              </Text>
            </Pressable>
            {/* "Choose your next dance" — fast-path to the Library tab so
                dancers can roll straight into their next practice without
                dismissing back through dance detail. */}
            <Pressable
              onPress={() => {
                cancelAutoDismiss();
                try {
                  router.replace("/(tabs)/library");
                } catch {
                  router.push("/(tabs)/library" as never);
                }
              }}
              style={styles.shareBtn}
              testID="celebrate-next-dance"
              accessibilityLabel="Choose your next dance"
            >
              <Ionicons name="musical-notes" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Choose your next dance</Text>
            </Pressable>
            <Pressable
              onPress={goBack}
              style={styles.doneBtn}
              testID="celebrate-done"
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function getMilestoneLabel(count: number | null): string | null {
  if (!count) return null;
  const milestones: [number, string][] = [
    [1, "First one down!"],
    [5, "5 dances strong — you're finding your groove!"],
    [10, "10 dances — you're officially a regular!"],
    [25, "25 dances — that's a proper repertoire!"],
    [50, "50 dances — dance-floor royalty!"],
    [100, "💯 A century! Legendary."],
  ];
  for (const [milestone, label] of milestones) {
    if (count === milestone) return label;
  }
  // Every 25 after 50 gets a shoutout too.
  if (count > 50 && count % 25 === 0) return `${count} dances — keep it goin'!`;
  return null;
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.brandPrimary },
  safe: { flex: 1 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  // Hero column — eyebrow, headline, compact secondary, and (optionally)
  // the inline badge cascade. Everything flows top-down with gaps so
  // nothing overlaps the main message. Positioned in the top ~55% of
  // the screen with alignItems: center so wide phones still center it.
  hero: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_H * 0.1,
    maxHeight: SCREEN_H * 0.55,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  logo: {
    position: "absolute",
    left: CENTER_X - LOGO_SIZE / 2,
    top: ORBIT_CENTER_Y - LOGO_SIZE / 2,
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    ...(Platform.OS === "web"
      ? {}
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 18,
        }),
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF6DA",
    letterSpacing: 3,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  greeting: {
    fontFamily: "serif",
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    marginTop: 4,
  },
  // Compact single-line subtitle. Takes over the role of the old
  // `count` + `milestone` double-stack, which was two competing
  // "large background lettering" lines that fought the headline.
  secondary: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F2A628",
    textAlign: "center",
    letterSpacing: 0.6,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    marginTop: 4,
    textTransform: "uppercase",
  },
  // ---- Bottom panel (theme picker + action buttons stacked) ----
  // Absolutely-pinned to the bottom of the screen so the fireworks and
  // "Nice work!" copy above always sit on top of the celebration art.
  // Uses `flexDirection: column` with a small gap so the buttons row can
  // never render on top of the theme picker regardless of button wrapping.
  bottomPanel: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  themeRow: {
    alignItems: "flex-start",
    gap: 4,
  },
  themeLabel: {
    color: "#FFF8E0",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  doneWrap: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  shareBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  doneBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 6,
  },
});
