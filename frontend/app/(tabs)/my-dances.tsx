import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { api, Dance, Tracking } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

type Row = { dance: Dance; track: Tracking };

export default function MyDances() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<"completed" | "wishlist">("completed");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [tracking, dances] = await Promise.all([
        api.myTracking(token),
        api.listDances(),
      ]);
      const map = new Map(dances.map((d) => [d.id, d]));
      const combined: Row[] = [];
      for (const t of tracking) {
        const d = map.get(t.dance_id);
        if (d) combined.push({ dance: d, track: t });
      }
      setRows(combined);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const filtered = rows.filter((r) => r.track.status === tab);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>My Tracker</Text>
        <Text style={styles.subtitle}>Keep tabs on your line dance journey</Text>
        <View style={styles.seg}>
          <Pressable
            testID="tab-completed"
            onPress={() => setTab("completed")}
            style={[styles.segBtn, tab === "completed" && styles.segBtnActive]}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={tab === "completed" ? colors.onBrandPrimary : colors.onSurface}
            />
            <Text style={[styles.segText, tab === "completed" && styles.segTextActive]}>
              Completed ({rows.filter((r) => r.track.status === "completed").length})
            </Text>
          </Pressable>
          <Pressable
            testID="tab-wishlist"
            onPress={() => setTab("wishlist")}
            style={[styles.segBtn, tab === "wishlist" && styles.segBtnActive]}
          >
            <Ionicons
              name="bookmark"
              size={16}
              color={tab === "wishlist" ? colors.onBrandPrimary : colors.onSurface}
            />
            <Text style={[styles.segText, tab === "wishlist" && styles.segTextActive]}>
              Wishlist ({rows.filter((r) => r.track.status === "wishlist").length})
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.dance.id}
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
              <Ionicons
                name={tab === "completed" ? "trophy-outline" : "bookmark-outline"}
                size={48}
                color={colors.muted}
              />
              <Text style={styles.emptyTitle}>
                {tab === "completed" ? "No dances completed yet" : "Wishlist is empty"}
              </Text>
              <Text style={styles.emptyText}>
                Head to the Library to find your next challenge!
              </Text>
              <Pressable
                testID="empty-browse-btn"
                onPress={() => router.push("/(tabs)/library")}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Browse Dances</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`tracked-card-${item.dance.id}`}
              onPress={() => router.push(`/dance/${item.dance.id}`)}
              style={styles.card}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.dance.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.dance.song} • {item.dance.choreographer}
                </Text>
                <View style={styles.rowRow}>
                  <View
                    style={[styles.diff, { backgroundColor: difficultyColor(item.dance.difficulty) }]}
                  >
                    <Text style={styles.diffText}>{item.dance.difficulty}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= (item.track.rating || 0) ? "star" : "star-outline"}
                        size={14}
                        color={colors.warning}
                      />
                    ))}
                  </View>
                </View>
                {item.track.notes ? (
                  <Text style={styles.notes} numberOfLines={2}>
                    "{item.track.notes}"
                  </Text>
                ) : null}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontFamily: "serif", fontSize: 30, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, marginTop: 2, fontSize: 13 },
  seg: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    marginTop: spacing.md,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  segBtnActive: { backgroundColor: colors.brandPrimary },
  segText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  segTextActive: { color: colors.onBrandPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  cardTitle: { fontFamily: "serif", fontSize: 17, fontWeight: "700", color: colors.onSurface },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 8 },
  diff: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  diffText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  notes: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 8, fontStyle: "italic" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  emptyText: { color: colors.muted, textAlign: "center" },
  emptyBtn: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
  },
  emptyBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
});
