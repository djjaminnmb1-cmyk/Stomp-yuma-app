import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import type { Badge } from "@/src/api/client";

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * BadgeUnlockedOverlay
 * --------------------
 * A vertically-stacked cascade of "Badge earned!" cards that slide up from
 * the bottom of the screen and gently rest on top of the celebration
 * screen fireworks. Each card fades out after a short display window;
 * a chorus of newly-earned badges plays out in sequence so users
 * always see every one they unlocked in a single tap.
 *
 * Design goals:
 * - Non-blocking: uses pointerEvents="box-none" so the underlying "Done"
 *   button on Celebrate stays tappable.
 * - Delightful: each card gets a mini pop-in + accent-colored trophy.
 * - Accessible: cards can be dismissed by tap.
 *
 * Usage:
 *   {newBadges.length > 0 && (
 *     <BadgeUnlockedOverlay badges={newBadges} onAllDismissed={...} />
 *   )}
 */
export function BadgeUnlockedOverlay({
  badges,
  onAllDismissed,
}: {
  badges: Badge[];
  onAllDismissed?: () => void;
}) {
  if (!badges.length) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="badge-overlay">
      {badges.map((b, i) => (
        <BadgeCardAnim
          key={b.id}
          badge={b}
          index={i}
          isLast={i === badges.length - 1}
          onDismiss={i === badges.length - 1 ? onAllDismissed : undefined}
        />
      ))}
    </View>
  );
}

function BadgeCardAnim({
  badge,
  index,
  isLast,
  onDismiss,
}: {
  badge: Badge;
  index: number;
  isLast: boolean;
  onDismiss?: () => void;
}) {
  const t = useSharedValue(0);
  const settle = useSharedValue(0);

  useEffect(() => {
    // Stagger each card by 500ms so they don't overlap on entrance.
    const delay = 400 + index * 500;
    t.value = withDelay(
      delay,
      withTiming(1, { duration: 550, easing: Easing.out(Easing.back(1.2)) })
    );
    // Give the LAST badge more display time; fade all out after their
    // window so users can absorb every unlock.
    settle.value = withDelay(
      delay + 550,
      withSequence(
        withTiming(1, { duration: 2000 + (isLast ? 800 : 0) }),
        withTiming(
          0,
          { duration: 500, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished && onDismiss) {
              runOnJS(onDismiss)();
            }
          }
        )
      )
    );
  }, [t, settle, index, isLast, onDismiss]);

  const style = useAnimatedStyle(() => {
    // slide-up + scale + fade
    const dy = (1 - t.value) * 48;
    const scale = 0.85 + t.value * 0.15;
    // settle: full opacity during middle, fade after
    // (opacity goes 0 → 1 during pop, then via settle.value handles fade)
    let opacity = t.value;
    // once settled to 1, fade based on the tail of the timing
    // (settle goes 0→1→fade back through 0)
    if (settle.value > 0) {
      // during the "fade back" section, settle.value shrinks past 1 back to 0
      // We treat it as opacity for the tail
      opacity = Math.min(opacity, settle.value);
    }
    return { transform: [{ translateY: dy }, { scale }], opacity };
  });

  return (
    <Animated.View style={[styles.card, style]}>
      <Pressable
        style={styles.cardInner}
        onPress={() => onDismiss?.()}
        testID={`badge-earned-${badge.id}`}
      >
        <View style={[styles.iconOrb, { backgroundColor: badge.color }]}>
          <Ionicons name={badge.icon as any} size={26} color="#fff" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.eyebrow}>Badge Unlocked!</Text>
          <Text style={styles.title} numberOfLines={1}>
            {badge.title}
          </Text>
          <Text style={styles.desc} numberOfLines={2}>
            {badge.description}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const CARD_W = Math.min(SCREEN_W - 40, 380);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: "26%",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
    // Anchor near top-middle where the "Nice work!" text lives so cards
    // cascade DOWN below the celebration headline, above the buttons.
  },
  card: {
    width: CARD_W,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  iconOrb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  textCol: { flex: 1 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#F2A628",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "800",
    color: "#2B1D16",
  },
  desc: {
    fontSize: 12,
    color: "#4A3528",
    marginTop: 2,
    lineHeight: 16,
  },
});

export default BadgeUnlockedOverlay;
