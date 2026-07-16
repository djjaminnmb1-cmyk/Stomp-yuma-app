import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Linking as RNLinking,
  Platform,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
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
  const { token, user } = useAuth();
  const [dance, setDance] = useState<Dance | null>(null);
  const [track, setTrack] = useState<Tracking | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState<null | "completed" | "wishlist" | "notes">(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheet, setEditSheet] = useState("");
  const [editImage, setEditImage] = useState<string>("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

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

  const saveStepSheet = async () => {
    if (!token || !dance) return;
    setSavingSheet(true);
    try {
      const updated = await api.updateDance(
        dance.id,
        {
          name: dance.name,
          choreographer: dance.choreographer,
          song: dance.song,
          artist: dance.artist,
          difficulty: dance.difficulty,
          bpm: dance.bpm,
          count: dance.count,
          youtube_url: dance.youtube_url,
          step_sheet: editSheet,
          step_sheet_image: editImage,
        },
        token
      );
      setDance(updated);
      setEditSheetOpen(false);
    } finally {
      setSavingSheet(false);
    }
  };

  const pickImage = async () => {
    setUploadingImg(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access to upload a step sheet image.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => RNLinking.openSettings() },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType || "image/jpeg";
      setEditImage(`data:${mime};base64,${b64}`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not pick image");
    } finally {
      setUploadingImg(false);
    }
  };

  const clearImage = () => setEditImage("");

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

        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.sectionTitle}>Step Sheet</Text>
            {(user?.is_admin || user?.is_instructor) ? (
              <Pressable
                testID="edit-step-sheet"
                onPress={() => {
                  setEditSheet(dance.step_sheet || "");
                  setEditImage(dance.step_sheet_image || "");
                  setEditSheetOpen(true);
                }}
                style={styles.editBtn}
              >
                <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.stepSheet}>
            {dance.step_sheet_image ? (
              <Image
                source={{ uri: dance.step_sheet_image }}
                style={styles.stepImage}
                resizeMode="contain"
              />
            ) : null}
            {dance.step_sheet ? (
              <Text style={styles.stepText}>{dance.step_sheet}</Text>
            ) : !dance.step_sheet_image ? (
              <Text style={styles.stepEmpty}>
                No step sheet yet. Watch the tutorial or ask Erin during class.
              </Text>
            ) : null}
            {dance.choreographer_country ? (
              <Text style={styles.stepMeta}>
                Choreographed in {dance.choreographer_country}
              </Text>
            ) : null}
          </View>
        </View>

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

      <Modal
        visible={editSheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditSheetOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Step Sheet</Text>
            <Pressable onPress={() => setEditSheetOpen(false)} testID="close-edit-sheet">
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            <Text style={styles.modalSub}>
              Paste in the full step sheet notation, or upload an image (screenshot / scan).
            </Text>

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.miniLabel}>Step sheet image</Text>
              {editImage ? (
                <View>
                  <Image
                    source={{ uri: editImage }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                  <Pressable
                    testID="clear-step-image"
                    onPress={clearImage}
                    style={styles.clearImgBtn}
                  >
                    <Ionicons name="trash" size={14} color="#fff" />
                    <Text style={styles.clearImgText}>Remove image</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  testID="upload-step-image"
                  onPress={pickImage}
                  disabled={uploadingImg}
                  style={styles.uploadBtn}
                >
                  {uploadingImg ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={22} color={colors.brandPrimary} />
                      <Text style={styles.uploadBtnText}>Upload image (PNG/JPG)</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <Text style={styles.miniLabel}>Step sheet text</Text>
            <TextInput
              testID="step-sheet-input"
              value={editSheet}
              onChangeText={setEditSheet}
              multiline
              placeholder="1-8 Grapevine right..."
              placeholderTextColor={colors.muted}
              style={styles.editArea}
            />
            <Pressable
              testID="save-step-sheet"
              onPress={saveStepSheet}
              disabled={savingSheet}
              style={[styles.saveBtn, savingSheet && { opacity: 0.6 }]}
            >
              {savingSheet ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Step Sheet</Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderRadius: radius.pill,
  },
  editBtnText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  stepSheet: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: 8,
  },
  stepText: {
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  stepEmpty: { color: colors.muted, fontStyle: "italic", fontSize: 13 },
  stepMeta: { color: colors.muted, fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
  },
  modalSub: { color: colors.muted, fontSize: 13 },
  editArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 260,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  stepImage: {
    width: "100%",
    height: 400,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  previewImage: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceSecondary,
  },
  uploadBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  clearImgBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  clearImgText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  miniLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
