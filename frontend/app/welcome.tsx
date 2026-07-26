import { useEffect } from "react";
import { View, StyleSheet, ImageBackground, Platform, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { FireworksOverlay } from "@/src/components/FireworksOverlay";
import { colors, spacing } from "@/src/theme";

/**
 * Dedicated first-visit welcome screen. The auth screen navigates here with
 * `?name=<firstName>` after registration or the very first Google sign-in.
 *
 * Motion:
 *   - Logo floats along a 360° circular path around the greeting.
 *   - Greeting fades / slides in.
 *   - Fireworks burst on top.
 *   - Auto-navigates to /(tabs) after ~2.5s.
 */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CENTER_X = SCREEN_W / 2;
const CENTER_Y = SCREEN_H / 2;
// Keep the logo well inside the screen; leave room for greeting + safe area.
// Screens smaller than 360w reduce the orbit so the logo doesn't clip.
const ORBIT_RADIUS = Math.min(SCREEN_W * 0.35, 140);
const LOGO_SIZE = 120;
const CIRCLE_MS = 2500;    // one full lap in this many ms
const SHOW_MS = 2500;      // must match FireworksOverlay TOTAL_DURATION_MS

export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const first = ((params.name as string) || "").split(" ")[0] || "friend";
  const greeting = `Welcome, ${first}!`;
  const subtitle = "Let's get dancing 🥾";

  // 0..1 progress for greeting fade-in
  const t = useSharedValue(0);
  // 0..1 progress for the logo lap (0 = 12 o'clock, 1 = back to 12 o'clock)
  const orbit = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      120,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
    // Smooth ease-in-out so it doesn't jerk at the start/end
    orbit.value = withTiming(1, {
      duration: CIRCLE_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [t, orbit]);

  const bigStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 24 }, { scale: 0.92 + t.value * 0.08 }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: t.value * t.value,
    transform: [{ translateY: (1 - t.value) * 12 }],
  }));

  // Logo circular float: angle sweeps 0 → 2π starting from the top (12 o'clock).
  const logoStyle = useAnimatedStyle(() => {
    const angle = orbit.value * Math.PI * 2 - Math.PI / 2; // -π/2 = top
    const dx = Math.cos(angle) * ORBIT_RADIUS;
    const dy = Math.sin(angle) * ORBIT_RADIUS;
    // A subtle self-rotation adds character without dizzying the user
    const spin = orbit.value * 360;
    return {
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${spin}deg` },
      ],
    };
  });

  return (
    <ImageBackground
      source={require("../assets/images/welcome-bg.jpg")}
      resizeMode="cover"
      style={styles.c}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Soft scrim so the greeting stays legible over the artwork. */}
        <View style={styles.scrim} pointerEvents="none" />

        {/* Absolutely positioned logo — orbits the greeting each frame. */}
        <Animated.Image
          source={require("../assets/images/logo.png")}
          resizeMode="contain"
          style={[styles.logo, logoStyle]}
        />

        {/* Greeting sits fixed at screen center */}
        <View style={styles.content} pointerEvents="none">
          <Animated.Text style={[styles.greeting, bigStyle]} testID="welcome-greeting">
            {greeting}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, subStyle]}>{subtitle}</Animated.Text>
        </View>

        <FireworksOverlay
          message=""
          onDone={() => router.replace("/(tabs)")}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.brandPrimary },
  safe: { flex: 1 },
  // Semi-transparent dark scrim so the white greeting stays legible over the
  // colourful cowboy-hall artwork.
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  logo: {
    position: "absolute",
    // Anchor the logo box centered on the screen. Reanimated then translates
    // it along the circular orbit each frame.
    left: CENTER_X - LOGO_SIZE / 2,
    top: CENTER_Y - LOGO_SIZE / 2,
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
  greeting: {
    fontFamily: "serif",
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFDF6",
    textAlign: "center",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});

// Signal (silences ESLint if SHOW_MS ever becomes unused elsewhere).
void SHOW_MS;
