import { useEffect, useRef, useState } from "react";
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
import { colors, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { downloadCertificate } from "@/src/lib/certificate";

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
// Orbit the logo a bit below the vertical middle so the greeting text at
// screen-center never gets covered by the logo pass at any orbit angle.
const ORBIT_CENTER_Y = SCREEN_H * 0.62;
const ORBIT_RADIUS = Math.min(SCREEN_W * 0.32, 130);
const LOGO_SIZE = 110;
const CIRCLE_MS = 2500;
const AUTO_DISMISS_MS = 9000; // Enough time for Certificate + Share + read the milestone.

export default function CelebrateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    danceName?: string;
    count?: string;
    danceId?: string;
  }>();
  const danceName = ((params.danceName as string) || "").trim();
  const danceId = ((params.danceId as string) || "").trim();
  const rawCount = parseInt((params.count as string) || "", 10);
  const totalCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : null;
  const { token } = useAuth();

  const t = useSharedValue(0);
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
    t.value = withDelay(
      120,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
    orbit.value = withTiming(1, {
      duration: CIRCLE_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    // Auto-dismiss back to the dance detail if the user doesn't tap Done.
    dismissTimerRef.current = setTimeout(() => goBack(), AUTO_DISMISS_MS);
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
            return;
          } catch (e: any) {
            if (e?.name === "AbortError") return; // user cancelled
            // Fall through to clipboard on any other error.
          }
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
          return;
        }
        Alert.alert("Shareable text", message);
        return;
      }

      // Native path
      await Share.share(
        { message, title: "Stompin' Ground Yuma" },
        { dialogTitle: "Share your dance" }
      );
    } catch {
      /* Silently ignore — sharing is a nice-to-have, never a blocker. */
    } finally {
      setSharing(false);
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
        token || ""
      );
      if (r.ok) {
        setCertOk(true);
        setTimeout(() => setCertOk(false), 2800);
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

  return (
    <ImageBackground
      source={require("../assets/images/welcome-bg.jpg")}
      resizeMode="cover"
      style={styles.c}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.scrim} pointerEvents="none" />

        <Animated.Image
          source={require("../assets/images/logo.png")}
          resizeMode="contain"
          style={[styles.logo, logoStyle]}
        />

        <View style={styles.content} pointerEvents="none">
          <Animated.Text style={[styles.eyebrow, subStyle]}>
            Nice work!
          </Animated.Text>
          <Animated.Text
            style={[styles.greeting, bigStyle]}
            numberOfLines={2}
            adjustsFontSizeToFit
            testID="celebrate-headline"
          >
            {danceName ? `You danced ${danceName}` : "You danced!"}
          </Animated.Text>
          {totalCount ? (
            <Animated.Text style={[styles.count, subStyle]}>
              {totalCount === 1
                ? "Your first completed dance 🎉"
                : `${totalCount} dances completed`}
            </Animated.Text>
          ) : (
            <Animated.Text style={[styles.count, subStyle]}>
              Boot-scoot on 💃
            </Animated.Text>
          )}
          {milestone ? (
            <Animated.Text style={[styles.milestone, subStyle]}>
              {milestone}
            </Animated.Text>
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
          <Pressable
            onPress={goBack}
            style={styles.doneBtn}
            testID="celebrate-done"
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
          </Pressable>
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
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    top: SCREEN_H * 0.14,
    height: SCREEN_H * 0.34,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 16,
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
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    marginTop: spacing.sm,
  },
  count: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFDF6",
    textAlign: "center",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    marginTop: spacing.md,
  },
  milestone: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F2A628",
    textAlign: "center",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginTop: 4,
  },
  doneWrap: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    left: spacing.lg,
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
