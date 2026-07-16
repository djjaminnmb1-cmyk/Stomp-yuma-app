import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Linking as RNLinking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { colors, spacing, radius, difficultyColor } from "../src/theme";
import { api, ClassSession, Dance } from "../src/api/client";
import { useAuth } from "../src/context/auth-context";

const DIFFICULTIES = ["Beginner", "Improver", "Intermediate", "Advanced"];

export default function InstructorScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"classes" | "dances">("dances");
  const [myClasses, setMyClasses] = useState<ClassSession[]>([]);
  const [myDances, setMyDances] = useState<Dance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDance, setEditDance] = useState<Dance | null>(null);
  const [newDanceOpen, setNewDanceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const all = await api.listClasses("all", 500);
      const mine = all.filter((c) => c.instructor_id === user.user_id);
      setMyClasses(mine);

      const uniqueDanceIds = Array.from(
        new Set(mine.flatMap((c) => c.dance_ids || []))
      );
      if (uniqueDanceIds.length) {
        const dances = await api.listDances();
        const set = new Set(uniqueDanceIds);
        setMyDances(dances.filter((d) => set.has(d.id)));
      } else {
        setMyDances([]);
      }
    } catch {}
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!user || (!user.is_admin && !user.is_instructor)) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.blockedText}>Instructors only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} testID="instructor-back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Instructor Dashboard</Text>
          <Text style={styles.subtitle}>Your classes & dances taught</Text>
        </View>
        <Pressable
          testID="new-dance-btn"
          onPress={() => setNewDanceOpen(true)}
          style={styles.newBtn}
        >
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          testID="instr-tab-dances"
          onPress={() => setTab("dances")}
          style={[styles.tabBtn, tab === "dances" && styles.tabBtnActive]}
        >
          <Ionicons
            name="musical-notes"
            size={14}
            color={tab === "dances" ? colors.onBrandPrimary : colors.onSurface}
          />
          <Text style={[styles.tabText, tab === "dances" && styles.tabTextActive]}>
            Dances I've Taught ({myDances.length})
          </Text>
        </Pressable>
        <Pressable
          testID="instr-tab-classes"
          onPress={() => setTab("classes")}
          style={[styles.tabBtn, tab === "classes" && styles.tabBtnActive]}
        >
          <Ionicons
            name="calendar"
            size={14}
            color={tab === "classes" ? colors.onBrandPrimary : colors.onSurface}
          />
          <Text style={[styles.tabText, tab === "classes" && styles.tabTextActive]}>
            My Classes ({myClasses.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : tab === "dances" ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {myDances.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={44} color={colors.muted} />
              <Text style={styles.emptyText}>
                No dances yet. Log a class in the Classes tab and the dances you taught will show up here.
              </Text>
            </View>
          ) : (
            myDances.map((d) => {
              const hasSheet = !!(d.step_sheet && d.step_sheet.trim()) || !!d.step_sheet_image;
              return (
                <View key={d.id} style={styles.danceCard}>
                  <Pressable
                    testID={`instr-open-${d.id}`}
                    onPress={() => router.push(`/dance/${d.id}`)}
                    style={{ flex: 1 }}
                  >
                    <Text style={styles.danceName}>{d.name}</Text>
                    <Text style={styles.danceMeta} numberOfLines={1}>
                      {d.song} · {d.choreographer}
                    </Text>
                    <View style={styles.danceRow}>
                      <View
                        style={[
                          styles.diffBadge,
                          { backgroundColor: difficultyColor(d.difficulty) },
                        ]}
                      >
                        <Text style={styles.diffBadgeText}>{d.difficulty}</Text>
                      </View>
                      <View
                        style={[
                          styles.sheetPill,
                          {
                            backgroundColor: hasSheet
                              ? colors.success + "22"
                              : colors.warning + "22",
                            borderColor: hasSheet ? colors.success : colors.warning,
                          },
                        ]}
                      >
                        <Ionicons
                          name={hasSheet ? "checkmark-circle" : "alert-circle"}
                          size={12}
                          color={hasSheet ? colors.success : colors.warning}
                        />
                        <Text
                          style={[
                            styles.sheetPillText,
                            { color: hasSheet ? colors.success : colors.warning },
                          ]}
                        >
                          {hasSheet ? "Sheet ready" : "Needs sheet"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    testID={`instr-edit-${d.id}`}
                    onPress={() => setEditDance(d)}
                    style={styles.editBtn}
                  >
                    <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
                    <Text style={styles.editBtnText}>Upload</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {myClasses.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={44} color={colors.muted} />
              <Text style={styles.emptyText}>
                You haven't logged any classes yet.
              </Text>
              <Pressable
                testID="go-classes"
                onPress={() => router.push("/classes")}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Go to Classes</Text>
              </Pressable>
            </View>
          ) : (
            myClasses.map((c) => (
              <Pressable
                key={c.id}
                testID={`instr-class-${c.id}`}
                onPress={() => router.push("/classes")}
                style={styles.classCard}
              >
                <View style={styles.classDate}>
                  <Text style={styles.classDateText}>{c.date}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.classTitle}>
                    {c.session_label || "Class session"}
                  </Text>
                  <Text style={styles.classMeta}>
                    {c.dances.length} dance{c.dances.length === 1 ? "" : "s"} · {c.dances.map((d) => d.name).join(", ")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <StepSheetModal
        dance={editDance}
        onClose={() => setEditDance(null)}
        onSaved={(updated) => {
          setEditDance(null);
          setMyDances((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
        }}
        token={token || ""}
      />

      <NewDanceModal
        visible={newDanceOpen}
        onClose={() => setNewDanceOpen(false)}
        onSaved={() => {
          setNewDanceOpen(false);
          load();
        }}
        token={token || ""}
      />
    </SafeAreaView>
  );
}

function StepSheetModal({
  dance,
  onClose,
  onSaved,
  token,
}: {
  dance: Dance | null;
  onClose: () => void;
  onSaved: (updated: Dance) => void;
  token: string;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (dance) {
      setText(dance.step_sheet || "");
      setImage(dance.step_sheet_image || "");
    }
  }, [dance]);

  if (!dance) return null;

  const pickImage = async () => {
    setUploading(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo access to upload a step sheet.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => RNLinking.openSettings() },
        ]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType || "image/jpeg";
      setImage(`data:${mime};base64,${b64}`);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
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
          step_sheet: text,
          step_sheet_image: image,
        },
        token
      );
      onSaved(updated);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!dance}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Step Sheet</Text>
            <Text style={styles.modalSub}>{dance.name}</Text>
          </View>
          <Pressable onPress={onClose} testID="close-sheet">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.miniLabel}>Image (PNG/JPG)</Text>
            {image ? (
              <View>
                <Image
                  source={{ uri: image }}
                  style={styles.preview}
                  resizeMode="contain"
                />
                <Pressable
                  onPress={() => setImage("")}
                  style={styles.clearImgBtn}
                  testID="clear-sheet-image"
                >
                  <Ionicons name="trash" size={14} color="#fff" />
                  <Text style={styles.clearImgText}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID="pick-sheet-image"
                onPress={pickImage}
                disabled={uploading}
                style={styles.uploadDrop}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={colors.brandPrimary} />
                    <Text style={styles.uploadText}>Upload image</Text>
                  </>
                )}
              </Pressable>
            )}

            <Text style={styles.miniLabel}>Text notation</Text>
            <TextInput
              testID="sheet-text"
              value={text}
              onChangeText={setText}
              multiline
              placeholder="1-8 Grapevine right..."
              placeholderTextColor={colors.muted}
              style={styles.editArea}
            />

            <Pressable
              testID="save-sheet"
              onPress={save}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Step Sheet</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function NewDanceModal({
  visible,
  onClose,
  onSaved,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [name, setName] = useState("");
  const [chor, setChor] = useState("");
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [bpm, setBpm] = useState("");
  const [count, setCount] = useState("");
  const [yt, setYt] = useState("");
  const [step, setStep] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    setUploading(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo access to upload a step sheet.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => RNLinking.openSettings() },
        ]);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType || "image/jpeg";
      setImage(`data:${mime};base64,${b64}`);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setName(""); setChor(""); setSong(""); setArtist(""); setDifficulty("Beginner");
    setBpm(""); setCount(""); setYt(""); setStep(""); setImage("");
  };

  const submit = async () => {
    if (!name.trim() || !chor.trim() || !song.trim()) {
      Alert.alert("Missing info", "Name, choreographer, and song are required.");
      return;
    }
    setSaving(true);
    try {
      await api.createDance(
        {
          name,
          choreographer: chor,
          song,
          artist,
          difficulty,
          bpm: bpm ? parseInt(bpm) : undefined,
          count,
          youtube_url: yt,
          step_sheet: step,
          step_sheet_image: image,
        },
        token
      );
      reset();
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Dance + Step Sheet</Text>
          <Pressable onPress={onClose} testID="close-new-dance">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              testID="nd-name"
              placeholder="Dance name *"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <TextInput
              testID="nd-chor"
              placeholder="Choreographer *"
              placeholderTextColor={colors.muted}
              value={chor}
              onChangeText={setChor}
              style={styles.input}
            />
            <TextInput
              testID="nd-song"
              placeholder="Song *"
              placeholderTextColor={colors.muted}
              value={song}
              onChangeText={setSong}
              style={styles.input}
            />
            <TextInput
              placeholder="Artist"
              placeholderTextColor={colors.muted}
              value={artist}
              onChangeText={setArtist}
              style={styles.input}
            />
            <View style={styles.chipsRow}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[styles.diffChip, difficulty === d && styles.diffChipActive]}
                >
                  <Text
                    style={[
                      styles.diffChipText,
                      difficulty === d && { color: colors.onBrandPrimary },
                    ]}
                  >
                    {d}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="BPM"
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
              value={bpm}
              onChangeText={setBpm}
              style={styles.input}
            />
            <TextInput
              placeholder="Count (e.g. 32 count, 4 wall)"
              placeholderTextColor={colors.muted}
              value={count}
              onChangeText={setCount}
              style={styles.input}
            />
            <TextInput
              placeholder="YouTube URL"
              placeholderTextColor={colors.muted}
              value={yt}
              onChangeText={setYt}
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.miniLabel}>Step sheet image</Text>
            {image ? (
              <View>
                <Image source={{ uri: image }} style={styles.preview} resizeMode="contain" />
                <Pressable onPress={() => setImage("")} style={styles.clearImgBtn}>
                  <Ionicons name="trash" size={14} color="#fff" />
                  <Text style={styles.clearImgText}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={pickImage}
                disabled={uploading}
                style={styles.uploadDrop}
                testID="nd-upload-image"
              >
                {uploading ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={22} color={colors.brandPrimary} />
                    <Text style={styles.uploadText}>Upload image</Text>
                  </>
                )}
              </Pressable>
            )}

            <Text style={styles.miniLabel}>Step sheet text</Text>
            <TextInput
              testID="nd-step"
              placeholder="1-8 Grapevine right..."
              placeholderTextColor={colors.muted}
              value={step}
              onChangeText={setStep}
              multiline
              style={styles.editArea}
            />

            <Pressable
              testID="nd-save"
              onPress={submit}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Dance</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.md,
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
  title: { fontFamily: "serif", fontSize: 24, fontWeight: "700", color: colors.onSurface },
  subtitle: { color: colors.muted, marginTop: 2, fontSize: 12 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  tabs: {
    flexDirection: "row",
    padding: 4,
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabBtnActive: { backgroundColor: colors.brandPrimary },
  tabText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: colors.onBrandPrimary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  danceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danceName: { fontFamily: "serif", fontSize: 16, fontWeight: "700", color: colors.onSurface },
  danceMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  danceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  diffBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  sheetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  sheetPillText: { fontSize: 10, fontWeight: "700" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "15",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  editBtnText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classDate: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  classDateText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  classTitle: { fontFamily: "serif", fontSize: 15, fontWeight: "700", color: colors.onSurface },
  classMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, textAlign: "center" },
  emptyBtn: {
    marginTop: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
  },
  emptyBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
  blocked: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  blockedText: { color: colors.muted, fontSize: 15 },
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
  miniLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  preview: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
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
  uploadDrop: {
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
  uploadText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  editArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 200,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 14,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  diffChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  diffChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  diffChipText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
