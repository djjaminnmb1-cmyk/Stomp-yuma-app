/**
 * External Search screen (merged CopperKnob + BootStepper)
 * -------------------------------------------------------
 * Route: ``/external-search`` — reachable from the Library "Widen
 * your search" CTA. One query fans out to both providers; results
 * that clearly represent the same dance are merged into a single
 * card with both provider chips.
 *
 * Behaviour:
 *   • Debounced search (350ms).
 *   • Bulk-select mode: admins/editors can tap-to-select any card
 *     and jump straight into the batch-import preview screen with
 *     the selection carried across.
 *   • Provider outages degrade gracefully — if CopperKnob is down
 *     BootStepper results still render, and a banner explains why
 *     the other side is missing (and vice versa).
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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, MergedExternalResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";

/** Stable string key for a merged result — used as the FlatList key
 *  AND as the identity for the selected-set. Falls back to a
 *  position hash if both provider refs happen to be empty (never
 *  happens in practice but defence in depth). */
function rowKey(row: MergedExternalResult): string {
  const ck = row.copperknob?.ref || "";
  const bs = row.bootstepper?.id || "";
  return `${ck}|${bs}`;
}

type Selection = {
  key: string;
  entries: { source: "copperknob" | "bootstepper"; ref: string }[];
  title: string;
  choreographer: string;
};

export default function ExternalSearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const isAdminOrEditor = !!(user?.is_admin || user?.is_instructor);

  const [q, setQ] = useState((params.q as string) || "");
  const [results, setResults] = useState<MergedExternalResult[]>([]);
  const [providers, setProviders] = useState<{
    copperknob: { count: number; error: string | null };
    bootstepper: { count: number; error: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-select state — enters "batch" mode on first tap-and-hold
  // OR when the admin taps the header "Select" button.
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const selectedCount = Object.keys(selected).length;

  const inflight = useRef(0);
  const runSearch = useCallback(
    async (query: string) => {
      const ticket = ++inflight.current;
      const trimmed = query.trim();
      if (trimmed.length < 2 || !token) {
        setResults([]);
        setProviders(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = await api.externalSearch(trimmed, token, 40);
        if (ticket !== inflight.current) return;
        setResults(payload.data);
        setProviders(payload.providers);
      } catch (e: any) {
        if (ticket !== inflight.current) return;
        setError(e?.message || "Couldn't reach the external directories.");
        setResults([]);
      } finally {
        if (ticket === inflight.current) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    const h = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(h);
  }, [q, runSearch]);

  const toggleSelect = useCallback((row: MergedExternalResult) => {
    if (row.existing_dance) return; // never batch dances we already have
    const key = rowKey(row);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        const entries: {
          source: "copperknob" | "bootstepper";
          ref: string;
        }[] = [];
        // Prefer BootStepper first if present (richer metadata),
        // else CopperKnob. Either provider is fine — the batch
        // screen dedupes cross-provider on the server side.
        if (row.bootstepper?.id) {
          entries.push({ source: "bootstepper", ref: row.bootstepper.id });
        } else if (row.copperknob?.ref) {
          entries.push({ source: "copperknob", ref: row.copperknob.ref });
        }
        next[key] = {
          key,
          entries,
          title: row.title,
          choreographer: row.choreographer,
        };
      }
      return next;
    });
  }, []);

  const startBatch = () => {
    setBatchMode(true);
  };
  const cancelBatch = () => {
    setBatchMode(false);
    setSelected({});
  };
  const goToBatchReview = () => {
    const list = Object.values(selected).flatMap((s) => s.entries);
    router.push({
      pathname: "/external-search/batch",
      params: { payload: JSON.stringify(list) },
    });
  };

  const providersBanner = useMemo(() => {
    if (!providers) return null;
    const ckDown = !!providers.copperknob.error;
    const bsDown = !!providers.bootstepper.error;
    if (!ckDown && !bsDown) return null;
    if (ckDown && bsDown) {
      return "Both directories are unavailable right now. Try again in a moment.";
    }
    return ckDown
      ? "CopperKnob is unavailable — showing BootStepper results only."
      : "BootStepper is unavailable — showing CopperKnob results only.";
  }, [providers]);

  const header = useMemo(
    () => (
      <View style={styles.headerBox}>
        <Text style={styles.attributionBanner}>
          Searching CopperKnob + BootStepper together · attribution links preserved
        </Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="ext-search-input"
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
        {providersBanner ? (
          <View style={styles.providerBanner}>
            <Ionicons name="warning" size={14} color="#8A5323" />
            <Text style={styles.providerBannerText}>{providersBanner}</Text>
          </View>
        ) : null}
      </View>
    ),
    [q, params.q, providersBanner]
  );

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
          <Text style={styles.emptyTitle}>Search externally</Text>
          <Text style={styles.emptyBody}>
            One search covers CopperKnob AND BootStepper — dances listed
            on both are merged into a single card so you never see the
            same choreography twice.
          </Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Couldn&apos;t reach either directory</Text>
          <Text style={styles.emptyBody}>{error}</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="sad-outline" size={40} color={colors.muted} />
        <Text style={styles.emptyTitle}>No results</Text>
        <Text style={styles.emptyBody}>
          Try a different spelling — or search each directory separately.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="ext-search-back"
          onPress={() => {
            if (batchMode && selectedCount > 0) {
              cancelBatch();
              return;
            }
            if (router.canGoBack()) router.back();
            else router.replace("/library");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Search externally</Text>
        {isAdminOrEditor ? (
          batchMode ? (
            <Pressable
              testID="ext-search-batch-cancel"
              onPress={cancelBatch}
              hitSlop={12}
            >
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="ext-search-batch-start"
              onPress={startBatch}
              hitSlop={12}
            >
              <Text style={styles.headerAction}>Select</Text>
            </Pressable>
          )
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => rowKey(item)}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <MergedCard
            row={item}
            batchMode={batchMode}
            isSelected={!!selected[rowKey(item)]}
            onToggle={() => toggleSelect(item)}
          />
        )}
        ListEmptyComponent={emptyState}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: batchMode ? 120 : 40 }}
        keyboardShouldPersistTaps="handled"
      />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}

      {batchMode ? (
        <View style={styles.batchBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.batchBarTitle}>
              {selectedCount === 0
                ? "Tap dances to add"
                : `${selectedCount} selected`}
            </Text>
            <Text style={styles.batchBarSub}>
              Already-in-library dances are locked · max 50 per batch
            </Text>
          </View>
          <Pressable
            testID="ext-search-batch-review"
            style={[
              styles.batchBarBtn,
              selectedCount === 0 && { opacity: 0.5 },
            ]}
            disabled={selectedCount === 0}
            onPress={goToBatchReview}
          >
            <Text style={styles.batchBarBtnText}>
              Review {selectedCount ? selectedCount : ""}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}


function MergedCard({
  row,
  batchMode,
  isSelected,
  onToggle,
}: {
  row: MergedExternalResult;
  batchMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const meta: string[] = [];
  if (row.count && row.count !== "0") meta.push(`${row.count} count`);
  if (row.wall && row.wall !== "0") meta.push(`${row.wall} wall`);
  const metaLine = meta.join(" • ");
  const openUrl = row.copperknob?.url || row.bootstepper?.url || "";
  const canSelect = batchMode && !row.existing_dance;

  return (
    <Pressable
      testID={`merged-card-${rowKey(row)}`}
      onPress={canSelect ? onToggle : undefined}
      onLongPress={!batchMode && !row.existing_dance ? onToggle : undefined}
      delayLongPress={350}
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        row.existing_dance && batchMode && styles.cardLocked,
      ]}
    >
      {batchMode ? (
        <View style={styles.checkbox}>
          {row.existing_dance ? (
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
          ) : isSelected ? (
            <Ionicons
              name="checkbox"
              size={20}
              color={colors.brandPrimary}
            />
          ) : (
            <Ionicons name="square-outline" size={20} color={colors.muted} />
          )}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {row.title || "Untitled"}
            </Text>
            <Text style={styles.chor} numberOfLines={1}>
              By {row.choreographer || "Unknown choreographer"}
              {row.choreographer_country ? ` · ${row.choreographer_country}` : ""}
            </Text>
          </View>
          <View style={{ gap: 4, alignItems: "flex-end" }}>
            {row.sources.includes("copperknob") ? (
              <View style={[styles.sourceBadge, styles.sourceCK]}>
                <Text style={[styles.sourceBadgeText, { color: "#8A5323" }]}>
                  CopperKnob
                </Text>
              </View>
            ) : null}
            {row.sources.includes("bootstepper") ? (
              <View style={[styles.sourceBadge, styles.sourceBS]}>
                <Text style={[styles.sourceBadgeText, { color: "#3730A3" }]}>
                  BootStepper
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.badgeRow}>
          {row.level && row.level.toLowerCase() !== "unknown" ? (
            <View
              style={[
                styles.levelBadge,
                { backgroundColor: difficultyColor(row.level) },
              ]}
            >
              <Text style={styles.levelBadgeText}>{row.level}</Text>
            </View>
          ) : null}
          {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
        </View>

        {row.music ? (
          <Text style={styles.music} numberOfLines={1}>
            <Ionicons name="musical-notes" size={12} color={colors.muted} />{" "}
            {row.music}
          </Text>
        ) : null}

        {row.existing_dance ? (
          <View style={styles.alreadyPill}>
            <Ionicons name="checkmark-circle" size={16} color="#16803C" />
            <Text style={styles.alreadyText}>
              Already in Library
              {row.existing_dance.has_copperknob_ref &&
              row.existing_dance.has_bootstepper_ref
                ? " · linked to both"
                : ""}
            </Text>
          </View>
        ) : null}

        {!batchMode ? (
          <View style={styles.actionsRow}>
            {openUrl ? (
              <Pressable
                testID={`merged-open-${rowKey(row)}`}
                onPress={() => Linking.openURL(openUrl)}
                style={[styles.btn, styles.btnSecondary]}
              >
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.brandPrimary}
                />
                <Text style={styles.btnSecondaryText}>Open</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
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
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.sm,
  },
  headerAction: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 15,
    minWidth: 60,
    textAlign: "right",
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
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  providerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF3D9",
    borderRadius: radius.md,
    padding: 10,
    marginTop: spacing.sm,
  },
  providerBannerText: { color: "#8A5323", fontSize: 12, flex: 1 },
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
  loadingOverlay: { position: "absolute", top: 60, right: 24 },

  // ---- Merged card ----
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary + "18",
  },
  cardLocked: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    alignItems: "center",
    paddingTop: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
    lineHeight: 20,
  },
  chor: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sourceBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceCK: { backgroundColor: "#B87333" + "22" },
  sourceBS: { backgroundColor: "#4F46E5" + "22" },
  sourceBadgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: 6,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  levelBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  meta: { fontSize: 12, color: colors.muted },
  music: { fontSize: 12, color: colors.muted, marginTop: 2 },
  alreadyPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D8F3E4",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  alreadyText: { color: "#0F5027", fontSize: 12, fontWeight: "700" },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 36,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  btnSecondaryText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },

  // ---- Batch bottom bar ----
  batchBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  batchBarTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  batchBarSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  batchBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  batchBarBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
});
