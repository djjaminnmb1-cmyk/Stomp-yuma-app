/**
 * Popular on BootStepper screen
 * -----------------------------
 * Route: ``/bootstepper/popular`` — reachable from a small "Popular
 * on BootStepper" CTA on the Library screen. Shows the top-N dances
 * on BootStepper sorted by their ``videoCount`` field (their closest
 * proxy for community popularity), with every card annotated as
 * "Already in Library" (view local) or "View on BootStepper" /
 * "+ Add to Library" (admin).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, BootStepperResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing } from "@/src/theme";
import {
  BootStepperResultCard,
  BootStepperAttributionFooter,
} from "@/src/components/BootStepperResultCard";

export default function BootStepperPopularScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<BootStepperResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { pull?: boolean }) => {
      if (!token) return;
      if (opts?.pull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const payload = await api.bootstepperPopular(token, 40);
        setItems(payload.data);
      } catch (e: any) {
        setError(
          e?.message ||
            "Couldn't reach BootStepper right now. Please try again in a moment."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  // In-app header for parity with Search / Import — the root Stack
  // hides its own header, so without this the user has no back
  // button and gets stranded on the BootStepper branch.
  const HeaderBar = () => (
    <View style={styles.headerBar}>
      <Pressable
        testID="bs-popular-back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/library");
        }}
        style={styles.backBtn}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>Popular on BootStepper</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <HeaderBar />
      {error && items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color={colors.muted}
          />
          <Text style={styles.errorTitle}>Couldn&apos;t load Popular</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.id}_${idx}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ pull: true })}
              tintColor={colors.brandPrimary}
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.md }}>
              <Text style={styles.attributionBanner}>
                Dance information provided by BootStepper
              </Text>
              <Text style={styles.subtitle}>
                Ranked by the number of tutorial + demo videos on
                BootStepper. Tap any card to open on BootStepper, or
                open the local listing when we have it.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.md }}>
              <BootStepperResultCard item={item} />
            </View>
          )}
          ListFooterComponent={<BootStepperAttributionFooter />}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: 40,
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  headerTitle: {
    fontFamily: Platform.select({ ios: "serif", default: undefined }),
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  attributionBanner: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  errorBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});
