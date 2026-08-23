/**
 * InstructorBadge — a small verified-instructor checkmark shown next to
 * an instructor's name across the app.
 *
 * Used from the activity feed, follow lists, event detail, chat, and
 * public profiles so dancers can tell at a glance who a real host is.
 * The look is a filled brand-blue circle with a white checkmark —
 * intentionally close to the "verified" pattern users know from other
 * social apps but re-colored so it feels native to SGY, not lifted from
 * Twitter/X.
 */
import { View, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type Size = "xs" | "sm" | "md";

const SIZES: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 18,
};

export function InstructorBadge({
  size = "sm",
  showLabel = false,
  testID,
}: {
  size?: Size;
  showLabel?: boolean;
  testID?: string;
}) {
  const dim = SIZES[size];
  const iconSize = dim - 4;
  return (
    <View
      testID={testID || "instructor-badge"}
      style={[styles.wrap, showLabel && styles.wrapLabel]}
    >
      <View
        style={[
          styles.dot,
          { width: dim, height: dim, borderRadius: dim / 2 },
        ]}
      >
        <Ionicons name="checkmark" size={iconSize} color="#fff" />
      </View>
      {showLabel ? <Text style={styles.label}>Instructor</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wrapLabel: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.brandSecondary + "22",
  },
  dot: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSecondary,
  },
  label: {
    color: colors.brandSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

export default InstructorBadge;
