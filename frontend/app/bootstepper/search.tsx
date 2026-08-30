/**
 * BootStepper Search screen
 * -------------------------
 * Route: ``/bootstepper/search`` — reachable from the Library "Can't
 * find it? Search BootStepper" CTA and from the empty-state on
 * library search. Deep-linkable via ``?q=<initial query>`` so tapping
 * the CTA carries the user's current library search term over.
 *
 * Behaviour:
 *   • Debounced search (350ms). BootStepper's API is fast but every
 *     request costs a quota unit, so we deliberately avoid firing on
 *     every keystroke.
 *   • Result cards are annotated by the backend with ``existing_dance``
 *     so the UI can immediately show "Already in Library" without a
 *     second round-trip; when a matched dance also has a CopperKnob
 *     ref, the pill notes that too — reassures the admin the two
 *     provider integrations aren't treading on each other.
 *   • Attribution footer stays pinned below the list per BootStepper
 *     Terms of Use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, BootStepperResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import {
  BootStepperResultCard,
  BootStepperAttributionFooter,
} from "@/src/components/BootStepperResultCard";


export default function BootStepperSearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [q, setQ] = useState((params.q as string) || "");
  const [results, setResults] = useState<BootStepperResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string>(
    "Dance information provided by BootStepper"
  );

  // ---- Debounced search ----
  // The trailing edge fires ~350ms after the user stops typing.
  // Ref-guarded so we don't pile up N stale in-flight requests when
  // the user tears through the input quickly.
  const inflight = useRef(0);
  const runSearch = useCallback(
    async (query: string) => {
      const ticket = ++inflight.current;
      const trimmed = query.trim();
      if (trimmed.length < 2 || !token) {
        setResults([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await api.bootstepperSearch(trimmed, 40, token);
        if (ticket !== inflight.current) return; // stale response
        setResults(payload.data);
        setAttribution(payload.attribution?.text || attribution);
      } catch (e: any) {
        if (ticket !== inflight.current) return;
        setError(
          e?.message ||
            "Couldn't reach BootStepper right now. Please try again in a moment."
        );
        setResults([]);
      } finally {
        if (ticket === inflight.current) setLoading(false);
      }
    },
    [token, attribution]
  );

  useEffect(() => {
    const h = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(h);
  }, [q, runSearch]);

  // ---- Header ----
  const header = useMemo(
    () => (
      <View style={styles.headerBox}>
        <Text style={styles.attributionBanner}>{attribution}</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="bs-search-input"
            placeholder="Search title, song, or choreographer"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            style={styles.searchInput}
            autoFocus={!params.q}
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ("")} hitSlop={12}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    ),
    [q, attribution, params.q]
  );

  // ---- List body ----
  const emptyState = () => {
    if (loading) return null;
    if (q.trim().length < 2) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons
            name="search-outline"
            size={48}
            color={colors.brandPrimary}
          />
          <Text style={styles.emptyTitle}>Search BootStepper</Text>
          <Text style={styles.emptyBody}>
            Type at least 2 characters to search BootStepper — the site
            covers songs, choreographers, and tutorial videos alongside
            each dance.
          </Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t reach BootStepper</Text>
          <Text style={styles.emptyBody}>{error}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="sad-outline" size={40} color={colors.muted} />
        <Text style={styles.emptyTitle}>No results</Text>
        <Text style={styles.emptyBody}>
          Try a different spelling or shorten the query.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* In-app header — the root Stack runs with headerShown:false so
          we render our own back button + title (parity with the
          CopperKnob screens). Without this the user has no way back. */}
      <View style={styles.headerBar}>
        <Pressable
          testID="bs-search-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/library");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Search BootStepper</Text>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.md }}>
            <BootStepperResultCard item={item} />
          </View>
        )}
        ListEmptyComponent={emptyState}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListFooterComponent={
          results.length > 0 ? <BootStepperAttributionFooter /> : null
        }
        keyboardShouldPersistTaps="handled"
      />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}
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
  headerBox: { marginBottom: spacing.md },
  attributionBanner: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
  },
  emptyBox: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  loadingOverlay: {
    position: "absolute",
    top: 12,
    right: 20,
  },
});
