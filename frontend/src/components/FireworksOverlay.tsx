import { useEffect, useRef } from "react";
import { StyleSheet, Dimensions, Pressable, View, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

/**
 * FireworksOverlay
 * ---------------------------------------------------------------------------
 * A short (~2.5s) fireworks celebration that renders on top of the screen
 * with `pointerEvents="box-none"` so it never blocks taps once the burst is
 * over. Cross-platform: uses plain `Animated.View` circles (no SVG dep) so
 * it works on iOS, Android, Expo Go and web.
 *
 * Usage:
 *   {showFireworks && (
 *     <FireworksOverlay onDone={() => setShowFireworks(false)} />
 *   )}
 *
 * onDone fires ~2.5s after mount (after every particle has faded).
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Confetti-firework colours. Kept warm + festive; picks are shuffled per particle.
const COLORS = [
  "#F2A628", // brand primary (studio orange)
  "#8B1A1A", // brand secondary (deep red)
  "#FFD54F", // gold
  "#FF7043", // sunset
  "#EF5350", // coral red
  "#4FC3F7", // sky
  "#AB47BC", // magenta
  "#66BB6A", // spring green
  "#FFFFFF", // white flash
];

const PARTICLES_PER_BURST = 14;
const BURST_COUNT = 5;
// Each burst = spawnDelay ms after mount. Staggered so it feels celebratory.
const BURST_DELAYS = [0, 250, 500, 800, 1150];
// How long each particle animates outward + fades
const PARTICLE_DURATION_MS = 1200;
// Whole show finishes shortly after the last burst finishes fading
const TOTAL_DURATION_MS = 1150 + PARTICLE_DURATION_MS + 250;

type Burst = {
  cx: number; // center x (0..1 of screen width)
  cy: number; // center y (0..1 of screen height, biased toward the top 2/3)
  delay: number;
  radius: number; // burst spread in px
};

// Precompute burst centers so each render is stable
function generateBursts(): Burst[] {
  return BURST_DELAYS.map((delay, i) => {
    // Spread bursts across the screen — alternate left/right, avoid the very
    // bottom (where the sign-in button lives).
    const col = i % 3;
    const cx =
      col === 0 ? 0.2 + Math.random() * 0.15
      : col === 1 ? 0.4 + Math.random() * 0.2
      : 0.65 + Math.random() * 0.15;
    const cy = 0.15 + (i / (BURST_COUNT - 1)) * 0.4 + Math.random() * 0.05;
    return {
      cx,
      cy,
      delay,
      radius: 110 + Math.random() * 60,
    };
  });
}

function ParticleView({
  burst,
  index,
}: {
  burst: Burst;
  index: number;
}) {
  const angle = (index / PARTICLES_PER_BURST) * Math.PI * 2 + Math.random() * 0.4;
  // Slightly random radius per particle for a natural burst shape
  const r = burst.radius * (0.75 + Math.random() * 0.35);
  const dx = Math.cos(angle) * r;
  const dy = Math.sin(angle) * r;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size = 6 + Math.floor(Math.random() * 6); // 6..11 px

  const startX = burst.cx * SCREEN_W;
  const startY = burst.cy * SCREEN_H;

  const t = useSharedValue(0); // 0 → 1

  useEffect(() => {
    t.value = withDelay(
      burst.delay,
      withTiming(1, {
        duration: PARTICLE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [burst.delay, t]);

  const style = useAnimatedStyle(() => {
    // Add a mild gravity so particles fall a touch as they fade
    const gravity = 40 * t.value * t.value;
    return {
      transform: [
        { translateX: dx * t.value },
        { translateY: dy * t.value + gravity },
        { scale: 1 - 0.35 * t.value },
      ],
      opacity: 1 - t.value,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: startX - size / 2,
          top: startY - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          // Nice glow-ish shadow so it reads as a firework spark
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9,
          shadowRadius: size,
          elevation: 6,
        },
        style,
      ]}
    />
  );
}

function BurstView({ burst }: { burst: Burst }) {
  // Also draw a bright core flash that appears and shrinks quickly
  const flash = useSharedValue(0);
  useEffect(() => {
    flash.value = withDelay(
      burst.delay,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) })
    );
  }, [burst.delay, flash]);
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value * (1 - flash.value) * 3.6,
    transform: [{ scale: 0.6 + flash.value * 1.4 }],
  }));
  const cx = burst.cx * SCREEN_W;
  const cy = burst.cy * SCREEN_H;
  return (
    <View pointerEvents="none">
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: cx - 26,
            top: cy - 26,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#fff",
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.95,
            shadowRadius: 22,
            elevation: 4,
          },
          flashStyle,
        ]}
      />
      {Array.from({ length: PARTICLES_PER_BURST }).map((_, i) => (
        <ParticleView key={i} burst={burst} index={i} />
      ))}
    </View>
  );
}

export function FireworksOverlay({
  onDone,
  message = "Welcome to Stompin' Ground Yuma!",
}: {
  onDone: () => void;
  message?: string;
}) {
  const bursts = useRef<Burst[]>(generateBursts()).current;
  const bannerT = useSharedValue(0);
  const doneCalled = useRef(false);

  useEffect(() => {
    // Slide the welcome banner in
    bannerT.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    // Auto-dismiss when the show is over
    const id = setTimeout(() => {
      if (!doneCalled.current) {
        doneCalled.current = true;
        onDone();
      }
    }, TOTAL_DURATION_MS);
    return () => clearTimeout(id);
  }, [bannerT, onDone]);

  // Allow tap-to-dismiss for impatient users
  const dismiss = () => {
    if (doneCalled.current) return;
    doneCalled.current = true;
    onDone();
  };

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: bannerT.value,
    transform: [{ translateY: (1 - bannerT.value) * 12 }],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID="fireworks-overlay"
    >
      {/* Subtle scrim so the fireworks pop against a bright login form */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.15)" }]}
        pointerEvents="none"
      />

      {bursts.map((b, i) => (
        <BurstView key={i} burst={b} />
      ))}

      {message ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.bannerWrap, bannerStyle]}
        >
          <Pressable onPress={dismiss} style={styles.banner} testID="fireworks-banner">
            <Text style={styles.bannerEmoji}>🎉</Text>
            <Text style={styles.bannerText}>{message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: "absolute",
    top: SCREEN_H * 0.35,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bannerEmoji: { fontSize: 22 },
  bannerText: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: "#8B1A1A",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});

export default FireworksOverlay;
