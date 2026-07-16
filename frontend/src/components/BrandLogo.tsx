import { View, Text, StyleSheet, Image } from "react-native";
import { colors } from "@/src/theme";

type Props = {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
};

const SIZES: Record<NonNullable<Props["size"]>, number> = {
  sm: 72,
  md: 120,
  lg: 180,
  xl: 240,
};

/**
 * Stompin' Ground Yuma official circular boot + desert logo.
 */
export function BrandLogo({ variant = "light", size = "lg", showTagline = false }: Props) {
  const px = SIZES[size];
  const fg = variant === "light" ? colors.onSurfaceInverse : colors.onSurface;

  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/images/logo.png")}
        style={{ width: px, height: px }}
        resizeMode="contain"
        testID="brand-logo"
      />
      {showTagline ? (
        <Text style={[styles.tagline, { color: fg }]}>
          All ages welcome · Grab your boots
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 10 },
  tagline: {
    fontSize: 13,
    opacity: 0.95,
    fontWeight: "600",
  },
});
