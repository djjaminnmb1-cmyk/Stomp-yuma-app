/**
 * UpdateBanner
 * ------------
 * Sticky banner that appears at the top of the app when a new JS
 * bundle has been downloaded via expo-updates. Tapping "Reload"
 * calls ``Updates.reloadAsync()`` which flips the app to the new
 * bundle.
 *
 * Deliberately kept as a full-width, non-blocking banner instead of a
 * modal or Alert.alert(): dancers hate having their tap-flow
 * interrupted mid-practice. If they don't act, the update stays
 * pending and applies naturally the next time the app cold-starts.
 */
import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOTAUpdates } from "@/src/hooks/useOTAUpdates";
import { colors, radius, spacing } from "@/src/theme";

export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const ota = useOTAUpdates({ checkOnMount: true, checkOnForeground: true });

  useEffect(() => {
    if (ota.status === "ready") {
      // Log for build-time diagnostics — helpful when a dancer
      // reports "no updates".
      console.log(
        "[OTA] Update downloaded and ready to install. Channel:",
        ota.channel,
        "Runtime:",
        ota.runtimeVersion
      );
    }
  }, [ota.status, ota.channel, ota.runtimeVersion]);

  if (Platform.OS === "web") return null;
  if (ota.status !== "ready" && ota.status !== "downloading") return null;

  const downloading = ota.status === "downloading";
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: insets.top + 6 }]}
      testID="ota-update-banner"
    >
      <View style={styles.banner}>
        <View style={styles.iconOrb}>
          {downloading ? (
            <ActivityIndicator color={colors.onBrandPrimary} size="small" />
          ) : (
            <Ionicons
              name="cloud-download"
              size={18}
              color={colors.onBrandPrimary}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {downloading ? "Downloading update…" : "Update ready"}
          </Text>
          <Text style={styles.sub}>
            {downloading
              ? "We're grabbing the latest fixes in the background."
              : "Reload now to boot into the newest version."}
          </Text>
        </View>
        {!downloading ? (
          <Pressable
            onPress={ota.applyReady}
            style={styles.cta}
            testID="ota-update-banner-reload"
          >
            <Text style={styles.ctaText}>Reload</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  iconOrb: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  title: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 14,
  },
  sub: {
    color: colors.onBrandPrimary,
    opacity: 0.9,
    fontSize: 11,
    marginTop: 1,
  },
  cta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  ctaText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.3,
  },
});

export default UpdateBanner;
