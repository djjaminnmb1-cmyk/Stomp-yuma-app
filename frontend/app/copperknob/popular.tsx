/**
 * Popular on CopperKnob screen
 * ----------------------------
 * Route: ``/copperknob/popular`` — reachable from a small "Popular on
 * CopperKnob" CTA on the Library screen. Shows CopperKnob's current
 * top-99 stepsheets, with every card annotated as "Already in Library"
 * (view local) or "View on CopperKnob" (regular) / "+ Add to Library"
 * (admin).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { api, CopperKnobResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing } from "@/src/theme";
import {
  CopperKnobResultCard,
  CopperKnobAttributionFooter,
} from "@/src/components/CopperKnobResultCard";

export default function CopperKnobPopularScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<CopperKnobResult[]>([]);
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
        const payload = await api.copperknobPopular(token);
        setItems(payload.data);
      } catch (e: any) {
        setError(
          e?.message ||
            "Couldn't reach CopperKnob right now. Please try again in a moment."
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ title: "Popular on CopperKnob" }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ title: "Popular on CopperKnob" }} />
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
          keyExtractor={(item, idx) => `${item.ref}_${idx}`}
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
                Dance information provided by CopperKnob
              </Text>
              <Text style={styles.subtitle}>
                CopperKnob&apos;s current top {items.length} stepsheets. Tap
                any card to view on CopperKnob, or open the local listing
                when we have it.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.md }}>
              <CopperKnobResultCard item={item} />
            </View>
          )}
          ListFooterComponent={<CopperKnobAttributionFooter />}
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
