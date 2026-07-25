import { useEffect } from "react";
import { View, StyleSheet, Image, Platform } from "react-native";
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
 * The screen renders a warm, brand-coloured background, a big animated
 * greeting, and the FireworksOverlay on top. After the show finishes (~2.5s)
 * we auto-navigate to `/(tabs)` and the user lands on the home feed.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const first = ((params.name as string) || "").split(" ")[0] || "friend";
  const greeting = `Welcome, ${first}!`;
  const subtitle = "Let's get dancing 🥾";

  // Animate the greeting in
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      120,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
  }, [t]);

  const bigStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 24 }, { scale: 0.92 + t.value * 0.08 }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: t.value * t.value,
    transform: [{ translateY: (1 - t.value) * 12 }],
  }));

  return (
    <SafeAreaView style={styles.c} edges={["top", "bottom"]}>
      {/* Warm brand gradient-ish background — simple stacked bands so we
          don't need a gradient dependency. */}
      <View style={[StyleSheet.absoluteFill, styles.bandTop]} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, styles.bandBottom]} pointerEvents="none" />

      <View style={styles.content}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Animated.Text style={[styles.greeting, bigStyle]} testID="welcome-greeting">
          {greeting}
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, subStyle]}>{subtitle}</Animated.Text>
      </View>

      <FireworksOverlay
        // The overlay renders its own banner too, but on this dedicated
        // screen the big greeting is our headline — so we suppress its
        // banner by passing an empty message.
        message=""
        onDone={() => router.replace("/(tabs)")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.brandPrimary },
  bandTop: {
    backgroundColor: colors.brandPrimary,
    opacity: 1,
  },
  // Simple duotone: bottom half of the screen goes deeper red for that
  // dance-hall stage feel.
  bandBottom: {
    top: "55%",
    backgroundColor: colors.brandSecondary,
    opacity: 0.85,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: spacing.md,
    ...(Platform.OS === "web"
      ? {}
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 14,
        }),
  },
  greeting: {
    fontFamily: "serif",
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFDF6",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
