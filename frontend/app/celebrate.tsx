import { useEffect } from "react";
import {
  View,
  StyleSheet,
  ImageBackground,
  Platform,
  Dimensions,
  Pressable,
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
const AUTO_DISMISS_MS = 3600; // Give the user an extra beat to read the name.

export default function CelebrateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ danceName?: string; count?: string }>();
  const danceName = ((params.danceName as string) || "").trim();
  const rawCount = parseInt((params.count as string) || "", 10);
  const totalCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : null;

  const t = useSharedValue(0);
  const orbit = useSharedValue(0);

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
    const timer = setTimeout(() => goBack(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
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
