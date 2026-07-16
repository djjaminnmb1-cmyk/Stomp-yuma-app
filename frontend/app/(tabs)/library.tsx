import { useEffect, useState, useCallback } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { api, Dance } from "@/src/api/client";

const FILTERS = ["All", "Beginner", "Improver", "Intermediate", "Advanced"];

export default function Library() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState("All");
  const [items, setItems] = useState<Dance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listDances(q || undefined, diff);
      setItems(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [q, diff]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dance Library</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="library-search"
            placeholder="Search by name, song, choreographer"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chipsScroll}
        >
          {FILTERS.map((f) => {
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>No dances found. Try clearing your search.</Text>
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
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
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
  title: { fontFamily: "serif", fontSize: 30, fontWeight: "700", color: colors.onSurface },
  searchWrap: {
    marginTop: spacing.md,
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
  chipsScroll: { height: 56, marginTop: spacing.sm },
  chipsContent: { gap: spacing.sm, paddingRight: spacing.lg, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: 16,
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
});
