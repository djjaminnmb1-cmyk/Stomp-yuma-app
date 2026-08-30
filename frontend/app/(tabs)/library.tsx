import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { api, Dance } from "@/src/api/client";
import DanceFilterModal, {
  BPM_BANDS,
  SORT_OPTIONS,
  type BpmBand,
  type SortKey,
} from "@/src/components/DanceFilterModal";
import {
  filterAndSortDances,
  countActiveFilters,
} from "@/src/lib/dance-filter";

const DIFFICULTIES = ["All", "Absolute Beginner", "Beginner", "Improver", "High Improver", "Intermediate", "Advanced"];

export default function Library() {
  const router = useRouter();
  // ---------- Filter/sort state ----------
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState("All");
  const [bpmBand, setBpmBand] = useState<BpmBand>("Any");
  const [chor, setChor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("name-asc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ---------- Data ----------
  const [all, setAll] = useState<Dance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Client-side filtering — fetch the entire published catalogue once so
      // filtering and sorting is instant even at 200+ dances.
      const data = await api.listDances();
      setAll(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sorted list of choreographers by frequency for the filter modal.
  const choreographers = useMemo<[string, number][]>(() => {
    const map = new Map<string, number>();
    all.forEach((d) => {
      const c = (d.choreographer || "").trim();
      if (c) map.set(c, (map.get(c) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const items = useMemo(
    () => filterAndSortDances(all, { q, diff, bpmBand, chor, sortBy }),
    [all, q, diff, bpmBand, chor, sortBy]
  );

  const activeSecondaryCount = countActiveFilters({ bpmBand, chor, sortBy });
  const bpmLabel =
    BPM_BANDS.find((b) => b.key === bpmBand)?.label ?? "Any";
  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Name";

  const resetAll = () => {
    setQ("");
    setDiff("All");
    setBpmBand("Any");
    setChor(null);
    setSortBy("name-asc");
  };

  const anyFilter = q.length > 0 || diff !== "All" || activeSecondaryCount > 0;

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>Stompin&apos; Ground Yuma</Text>
            <Text style={styles.brandSub}>Line dance library</Text>
          </View>
          <Text style={styles.countBadge}>{items.length}</Text>
        </View>

        {/* Search + Filter button */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="library-search"
              placeholder="Search name, song, artist, choreographer"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {q.length > 0 ? (
              <Pressable
                onPress={() => setQ("")}
                testID="clear-search"
                hitSlop={12}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setFiltersOpen(true)}
            testID="open-filters"
            style={[styles.filterBtn, activeSecondaryCount > 0 && styles.filterBtnActive]}
          >
            <Ionicons
              name="options"
              size={20}
              color={activeSecondaryCount > 0 ? "#fff" : colors.brandPrimary}
            />
            {activeSecondaryCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeSecondaryCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Inline difficulty chips (primary filter) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {DIFFICULTIES.map((f) => {
            const active = diff === f;
            return (
              <Pressable
                key={f}
                testID={`filter-chip-${f.toLowerCase()}`}
                onPress={() => setDiff(f)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Active secondary-filter chips (removable) */}
        {activeSecondaryCount > 0 || q.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeChipsContent}
            style={styles.activeChipsScroll}
          >
            {bpmBand !== "Any" ? (
              <ActiveChip
                icon="speedometer"
                label={bpmLabel}
                onRemove={() => setBpmBand("Any")}
                testID="active-chip-bpm"
              />
            ) : null}
            {chor ? (
              <ActiveChip
                icon="person"
                label={chor}
                onRemove={() => setChor(null)}
                testID="active-chip-chor"
              />
            ) : null}
            {sortBy !== "name-asc" ? (
              <ActiveChip
                icon="swap-vertical"
                label={sortLabel}
                onRemove={() => setSortBy("name-asc")}
                testID="active-chip-sort"
              />
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brandPrimary}
            />
          }
          // CopperKnob discovery CTAs — always visible so admins &
          // dancers know they can widen the search. When our own
          // library returned zero hits the footer stays; the empty
          // state also carries a Search CopperKnob link.
          ListFooterComponent={
            items.length > 0 ? (
              <View style={styles.ckFooter}>
                <Text style={styles.ckFooterHint}>
                  Can&apos;t find what you&apos;re looking for?
                </Text>
                <View style={styles.ckFooterRow}>
                  <Pressable
                    testID="library-search-copperknob"
                    onPress={() =>
                      router.push({
                        pathname: "/copperknob/search",
                        params: q ? { q } : {},
                      })
                    }
                    style={styles.ckSecondaryBtn}
                  >
                    <Ionicons
                      name="search"
                      size={14}
                      color={colors.brandPrimary}
                    />
                    <Text style={styles.ckSecondaryText}>
                      Search CopperKnob
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="library-popular-copperknob"
                    onPress={() => router.push("/copperknob/popular")}
                    style={styles.ckSecondaryBtn}
                  >
                    <Ionicons
                      name="flame"
                      size={14}
                      color={colors.brandPrimary}
                    />
                    <Text style={styles.ckSecondaryText}>
                      Popular on CopperKnob
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>
                No dances match these filters.
              </Text>
              {anyFilter ? (
                <Pressable
                  onPress={resetAll}
                  testID="empty-reset"
                  style={styles.emptyResetBtn}
                >
                  <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
                  <Text style={styles.emptyResetText}>Reset filters</Text>
                </Pressable>
              ) : null}
              {/* Bigger, high-contrast CTA when our own library
                  came up empty — this is exactly when CopperKnob is
                  most useful. */}
              <Pressable
                testID="empty-search-copperknob"
                onPress={() =>
                  router.push({
                    pathname: "/copperknob/search",
                    params: q ? { q } : {},
                  })
                }
                style={styles.ckPrimaryBtn}
              >
                <Ionicons name="search" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.ckPrimaryText}>
                  Search CopperKnob{q ? ` for "${q}"` : ""}
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`dance-card-${item.id}`}
              onPress={() => router.push(`/dance/${item.id}`)}
              style={styles.card}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {item.song}
                  {item.artist ? ` — ${item.artist}` : ""}
                </Text>
                <Text style={styles.cardChor}>By {item.choreographer || "Unknown"}</Text>
                <View style={styles.cardRow}>
                  <View
                    style={[
                      styles.diffBadge,
                      { backgroundColor: difficultyColor(item.difficulty) },
                    ]}
                  >
                    <Text style={styles.diffBadgeText}>{item.difficulty}</Text>
                  </View>
                  {item.bpm ? <Text style={styles.metaSmall}>{item.bpm} BPM</Text> : null}
                  {item.count ? <Text style={styles.metaSmall}>{item.count}</Text> : null}
                </View>
              </View>
              {/* Subtle source badge — makes it clear at a glance which
                  cards are our own listings vs. the CopperKnob ones the
                  user finds when they widen the search. Muted so it
                  never competes with the primary metadata. */}
              <View style={styles.sourceBadgeCol}>
                <View style={styles.sourceBadgeLocal}>
                  <Text style={styles.sourceBadgeText}>Dance Library</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.muted}
                />
              </View>
            </Pressable>
          )}
        />
      )}

      <DanceFilterModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        bpmBand={bpmBand}
        setBpmBand={setBpmBand}
        chor={chor}
        setChor={setChor}
        sortBy={sortBy}
        setSortBy={setSortBy}
        choreographers={choreographers}
        resultCount={items.length}
        onReset={() => {
          setBpmBand("Any");
          setChor(null);
          setSortBy("name-asc");
        }}
      />
    </SafeAreaView>
  );
}

function ActiveChip({
  icon,
  label,
  onRemove,
  testID,
}: {
  icon: any;
  label: string;
  onRemove: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onRemove}
      testID={testID}
      style={styles.activeChip}
      hitSlop={4}
    >
      <Ionicons name={icon} size={12} color={colors.onSurface} />
      <Text style={styles.activeChipText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="close" size={14} color={colors.onSurfaceSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.sm,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  brandLogo: { width: 44, height: 44 },
  brandName: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  brandSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  countBadge: {
    backgroundColor: colors.brandPrimary,
    color: colors.onBrandPrimary,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: { flex: 1, padding: 12, color: colors.onSurface, fontSize: 14 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  filterBtnActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  filterBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  chipsScroll: { height: 46, marginTop: spacing.sm },
  chipsContent: { gap: spacing.sm, paddingRight: spacing.lg, alignItems: "center" },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.onBrandPrimary },

  activeChipsScroll: { marginTop: spacing.sm, maxHeight: 36 },
  activeChipsContent: { gap: 6, alignItems: "center", paddingRight: spacing.lg },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 180,
  },
  activeChipText: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontFamily: "serif", fontSize: 18, fontWeight: "700", color: colors.onSurface },
  cardMeta: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  cardChor: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 10 },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  diffBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  metaSmall: { fontSize: 11, color: colors.muted },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, textAlign: "center" },
  emptyResetBtn: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  emptyResetText: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },

  // CopperKnob discovery CTAs (footer + empty-state)
  ckFooter: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    gap: spacing.sm,
  },
  ckFooterHint: {
    color: colors.muted,
    fontSize: 13,
  },
  ckFooterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  ckSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ckSecondaryText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  ckPrimaryBtn: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  ckPrimaryText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },

  // Subtle source-of-truth badge on library result cards.
  // Sits in a small right-aligned column above the chevron.
  sourceBadgeCol: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginLeft: 4,
  },
  sourceBadgeLocal: {
    backgroundColor: colors.brandPrimary + "18",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brandPrimary,
    letterSpacing: 0.3,
  },
});
