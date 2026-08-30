/**
 * CopperKnob Search screen
 * ------------------------
 * Route: ``/copperknob/search`` — reachable from the Library "Can't
 * find it? Search CopperKnob" CTA and from the empty-state on library
 * search. Deep-linkable via ``?q=<initial query>`` so tapping the CTA
 * carries the user's current library search term over.
 *
 * Behaviour:
 *   • Debounced search (350ms) — CopperKnob caps at 50 results and
 *     enforces its own rate limits, so we deliberately avoid firing
 *     on every keystroke.
 *   • Type filter chips (All / Title / Music / Choreographer) map
 *     exactly to CopperKnob's ``type`` param.
 *   • Every result card is annotated by the backend with
 *     ``existing_dance`` so the UI can immediately show "Already in
 *     Library" without a second round-trip.
 *   • Attribution footer stays pinned below the list as required by
 *     CopperKnob's Terms of Use.
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
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, CopperKnobResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";
import {
  CopperKnobResultCard,
  CopperKnobAttributionFooter,
} from "@/src/components/CopperKnobResultCard";

type SearchType = "all" | "title" | "music" | "choreographer";

const TYPES: { key: SearchType; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: "grid" },
  { key: "title", label: "Title", icon: "text" },
  { key: "music", label: "Music", icon: "musical-notes" },
  { key: "choreographer", label: "Choreographer", icon: "person" },
];

export default function CopperKnobSearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [q, setQ] = useState((params.q as string) || "");
  const [type, setType] = useState<SearchType>("all");
  const [results, setResults] = useState<CopperKnobResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string>(
    "Dance information provided by CopperKnob"
  );

  // ---- Debounced search ----
  // The trailing edge fires ~350ms after the user stops typing.
  // Ref-guarded so we don't pile up N stale in-flight requests when
  // the user tears through the input quickly.
  const inflight = useRef(0);
  const runSearch = useCallback(
    async (query: string, kind: SearchType) => {
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
        const payload = await api.copperknobSearch(trimmed, kind, token);
        if (ticket !== inflight.current) return; // stale response
        setResults(payload.data);
        setAttribution(payload.attribution?.text || attribution);
      } catch (e: any) {
        if (ticket !== inflight.current) return;
        setError(
          e?.message ||
            "Couldn't reach CopperKnob right now. Please try again in a moment."
        );
        setResults([]);
      } finally {
        if (ticket === inflight.current) setLoading(false);
      }
    },
    [token, attribution]
  );

  useEffect(() => {
    const h = setTimeout(() => runSearch(q, type), 350);
    return () => clearTimeout(h);
  }, [q, type, runSearch]);

  // ---- Header / filter row ----
  const header = useMemo(
    () => (
      <View style={styles.headerBox}>
        <Text style={styles.attributionBanner}>{attribution}</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="ck-search-input"
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {TYPES.map((t) => {
            const active = type === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`ck-type-${t.key}`}
                onPress={() => setType(t.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={active ? "#fff" : colors.brandPrimary}
                />
                <Text
                  style={[
                    styles.chipText,
                    active && styles.chipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ),
    [q, type, attribution, params.q]
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
          <Text style={styles.emptyTitle}>Search CopperKnob</Text>
          <Text style={styles.emptyBody}>
            Type at least 2 characters to search the CopperKnob directory
            for line dances, songs, or choreographers.
          </Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t reach CopperKnob</Text>
          <Text style={styles.emptyBody}>{error}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="sad-outline" size={40} color={colors.muted} />
        <Text style={styles.emptyTitle}>No results</Text>
        <Text style={styles.emptyBody}>
          Try a different spelling or switch the filter above.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* In-app header — the root Stack runs with headerShown:false so
          we render our own back button + title, matching the pattern
          used by Community Guidelines / Terms / Leaderboard. Prevents
          the "no way back to the library" dead-end. */}
      <View style={styles.headerBar}>
        <Pressable
          testID="ck-search-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/library");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Search CopperKnob</Text>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.ref}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.md }}>
            <CopperKnobResultCard item={item} />
          </View>
        )}
        ListEmptyComponent={emptyState}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        ListFooterComponent={
          results.length > 0 ? <CopperKnobAttributionFooter /> : null
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
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
  },
  chipsRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: "transparent",
  },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },
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
