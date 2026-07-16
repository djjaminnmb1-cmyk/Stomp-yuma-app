import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type Props = {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
};

/**
 * Stompin' Ground Yuma wordmark.
 * Renders a compact icon + typographic logo since no raster asset was provided.
 * - variant="light" for use on dark backgrounds (hero, auth)
 * - variant="dark"  for use on light backgrounds
 */
export function BrandLogo({ variant = "light", size = "lg", showTagline = false }: Props) {
  const isLight = variant === "light";
  const fg = isLight ? colors.onSurfaceInverse : colors.onSurface;
  const accent = isLight ? colors.brandTertiary : colors.brandPrimary;

  const scale = size === "sm" ? 0.55 : size === "md" ? 0.8 : 1;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={[styles.line, { backgroundColor: accent }]} />
        <Ionicons name="star" size={12 * scale} color={accent} />
        <View style={[styles.line, { backgroundColor: accent }]} />
      </View>

      <Text
        style={[
          styles.stompin,
          { color: fg, fontSize: 20 * scale, letterSpacing: 5 * scale },
        ]}
      >
        STOMPIN' GROUND
      </Text>

      <View style={styles.yumaRow}>
        <MaterialCommunityIcons
          name="horseshoe"
          size={30 * scale}
          color={accent}
          style={{ transform: [{ rotate: "-15deg" }] }}
        />
        <Text
          style={[
            styles.yuma,
            { color: fg, fontSize: 68 * scale },
          ]}
        >
          YUMA
        </Text>
        <MaterialCommunityIcons
          name="horseshoe"
          size={30 * scale}
          color={accent}
          style={{ transform: [{ rotate: "15deg" }, { scaleX: -1 }] }}
        />
      </View>

      <View style={styles.bottomRow}>
        <View style={[styles.line, { backgroundColor: accent, flex: 0, width: 30 * scale }]} />
        <Text style={[styles.est, { color: accent, fontSize: 10 * scale }]}>
          ARIZONA · LINE DANCE
        </Text>
        <View style={[styles.line, { backgroundColor: accent, flex: 0, width: 30 * scale }]} />
      </View>

      {showTagline ? (
        <Text style={[styles.tagline, { color: fg }]}>
          All ages welcome · Grab your boots
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "70%",
    justifyContent: "center",
  },
  line: { flex: 1, height: 1 },
  stompin: {
    fontFamily: "serif",
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
  },
  yumaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: -2 },
  yuma: {
    fontFamily: "serif",
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 68,
    includeFontPadding: false,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  est: {
    fontWeight: "700",
    letterSpacing: 2,
  },
  tagline: {
    marginTop: 10,
    fontSize: 13,
    opacity: 0.9,
  },
});
