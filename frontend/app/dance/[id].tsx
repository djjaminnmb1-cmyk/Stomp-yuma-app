import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Linking as RNLinking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor, images } from "@/src/theme";
import { api, Dance, Tracking } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

export default function DanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [dance, setDance] = useState<Dance | null>(null);
  const [track, setTrack] = useState<Tracking | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState<null | "completed" | "wishlist" | "notes">(null);

  const load = useCallback(async () => {
    if (!id) return;
    const d = await api.getDance(id).catch(() => null);
    setDance(d);
    if (token) {
      const all = await api.myTracking(token).catch(() => []);
      const t = all.find((x) => x.dance_id === id) || null;
      setTrack(t);
      setNotes(t?.notes || "");
      setRating(t?.rating || 0);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (status: "completed" | "wishlist") => {
    if (!token || !id) return;
    setSaving(status);
    try {
      const t = await api.saveTracking(id, { status, rating, notes }, token);
      setTrack(t);
    } finally {
      setSaving(null);
    }
  };

  const saveNotesRating = async (newRating?: number) => {
    if (!token || !id || !track) return;
    setSaving("notes");
    try {
      const r = newRating ?? rating;
      const t = await api.saveTracking(id, { status: track.status, rating: r, notes }, token);
      setTrack(t);
      setRating(r);
    } finally {
      setSaving(null);
    }
  };

  const openYT = () => {
    if (dance?.youtube_url) RNLinking.openURL(dance.youtube_url).catch(() => {});
  };

  if (!dance) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const isCompleted = track?.status === "completed";
  const isWishlist = track?.status === "wishlist";

  return (
    <View style={styles.c}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.brandTertiary, colors.brandPrimary, colors.surfaceInverse]}
            style={StyleSheet.absoluteFillObject as any}
          />
          <SafeAreaView edges={["top"]} style={{ zIndex: 2 }}>
            <View style={styles.headerBar}>
              <Pressable onPress={() => router.back()} testID="detail-back" style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={24} color={colors.onSurfaceInverse} />
              </Pressable>
              {dance.youtube_url ? (
                <Pressable onPress={openYT} testID="open-youtube" style={styles.iconBtn}>
                  <Ionicons name="logo-youtube" size={22} color={colors.onSurfaceInverse} />
                </Pressable>
              ) : <View style={styles.iconBtn} />}
            </View>
          </SafeAreaView>
          <View style={styles.heroContent}>
            <View style={[styles.diffBig, { backgroundColor: difficultyColor(dance.difficulty) }]}>
              <Text style={styles.diffBigText}>{dance.difficulty}</Text>
            </View>
            <Text style={styles.title}>{dance.name}</Text>
            <Text style={styles.subtitle}>By {dance.choreographer || "Unknown"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <InfoBox icon="musical-notes" label="Song" value={dance.song || "—"} />
            <InfoBox icon="person" label="Artist" value={dance.artist || "—"} />
          </View>
          <View style={styles.infoRow}>
            <InfoBox icon="speedometer" label="BPM" value={dance.bpm ? String(dance.bpm) : "—"} />
            <InfoBox icon="grid" label="Count" value={dance.count || "—"} />
          </View>
        </View>

        {dance.youtube_url ? (
          <View style={styles.section}>
            <Pressable testID="watch-tutorial" onPress={openYT} style={styles.ytBtn}>
              <Ionicons name="logo-youtube" size={22} color="#fff" />
              <Text style={styles.ytBtnText}>Watch Tutorial on YouTube</Text>
            </Pressable>
          </View>
        ) : null}

        {track ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Rating & Notes</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable
                  key={s}
                  testID={`star-${s}`}
                  onPress={() => saveNotesRating(s)}
                >
                  <Ionicons
                    name={s <= rating ? "star" : "star-outline"}
                    size={32}
                    color={colors.warning}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="notes-input"
              placeholder="Add your notes... (e.g., 'Watch out for the pivot on 24')"
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              onBlur={() => saveNotesRating()}
              multiline
              style={styles.notes}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.hint}>
              <Ionicons name="information-circle" size={18} color={colors.brandSecondary} />
              <Text style={styles.hintText}>
                Add to your tracker to save personal notes and a star rating.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.stickyWrap}>
        <View style={styles.sticky}>
          <Pressable
            testID="wishlist-btn"
            onPress={() => setStatus("wishlist")}
            style={[styles.secBtn, isWishlist && styles.secBtnActive]}
            disabled={saving !== null}
          >
            <Ionicons
              name={isWishlist ? "bookmark" : "bookmark-outline"}
              size={18}
              color={isWishlist ? colors.onBrandPrimary : colors.brandPrimary}
            />
            <Text style={[styles.secBtnText, isWishlist && { color: colors.onBrandPrimary }]}>
              {isWishlist ? "In Wishlist" : "Wishlist"}
            </Text>
          </Pressable>
          <Pressable
            testID="complete-btn"
            onPress={() => setStatus("completed")}
            style={[styles.primBtn, isCompleted && { backgroundColor: colors.success }]}
            disabled={saving !== null}
          >
            {saving === "completed" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.primBtnText}>
                  {isCompleted ? "Completed" : "Mark Completed"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function InfoBox({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Ionicons name={icon} size={16} color={colors.brandPrimary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { minHeight: 280, paddingBottom: spacing.xl },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(43,29,22,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  diffBig: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  diffBigText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  title: {
    fontFamily: "serif",
    fontSize: 34,
    fontWeight: "700",
    color: colors.onSurfaceInverse,
    lineHeight: 40,
  },
  subtitle: { color: colors.onSurfaceInverse, opacity: 0.9, fontSize: 14 },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: { fontFamily: "serif", fontSize: 20, fontWeight: "700", color: colors.onSurface },
  infoRow: { flexDirection: "row", gap: spacing.md },
  infoBox: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  infoLabel: { fontSize: 11, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  infoValue: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  ytBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#c4302b",
    padding: 14,
    borderRadius: radius.md,
  },
  ytBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  stars: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", padding: spacing.md },
  notes: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 90,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 14,
    textAlignVertical: "top",
  },
  hint: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13 },
  stickyWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  sticky: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  secBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  secBtnActive: { backgroundColor: colors.brandPrimary },
  secBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  primBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  primBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
