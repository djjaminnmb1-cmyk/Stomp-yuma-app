import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking as RNLinking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, radius } from "../src/theme";
import { api, Suggestion } from "../src/api/client";
import { useAuth } from "../src/context/auth-context";

const DIFFICULTIES = ["Absolute Beginner", "Beginner", "Improver", "High Improver", "Intermediate", "Advanced"];
const STATUSES = ["pending", "reviewed", "queued", "declined"];

const statusColor = (s: string) => {
  if (s === "queued") return colors.success;
  if (s === "reviewed") return colors.brandSecondary;
  if (s === "declined") return colors.error;
  return colors.warning;
};

export default function SuggestScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<"submit" | "mine" | "all">("submit");
  const [name, setName] = useState("");
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [yt, setYt] = useState("");
  const [stepSheetUrl, setStepSheetUrl] = useState("");
  const [stepSheetImage, setStepSheetImage] = useState("");
  const [pickingImage, setPickingImage] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmedOfficial, setConfirmedOfficial] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<Suggestion[]>([]);
  const [all, setAll] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const isReviewer = !!(user?.is_admin || user?.can_edit_step_sheets);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const m = await api.mySuggestions(token);
      setMine(m);
      if (isReviewer) {
        const a = await api.allSuggestions(token);
        setAll(a);
      }
    } catch {}
    setLoading(false);
  }, [token, isReviewer]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickStepSheet = async () => {
    setPickingImage(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== "web") {
        Alert.alert("Permission needed", "Allow photo access to attach a step sheet.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: false,
        quality: 1,
        base64: false,
        exif: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        Alert.alert("Couldn't read that image", "Please try another photo.");
        return;
      }
      // Resize + re-encode → safe base64 (max ~1.5 MB) regardless of input.
      const m = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!m.base64) {
        Alert.alert("Couldn't read that image", "Please try another photo.");
        return;
      }
      const dataUri = `data:image/jpeg;base64,${m.base64}`;
      if (dataUri.length > 5_500_000) {
        Alert.alert("Image too large", "Please pick a smaller photo (<5 MB after compression).");
        return;
      }
      setStepSheetImage(dataUri);
    } catch (e: any) {
      Alert.alert("Couldn't attach", e?.message || "Try again.");
    } finally {
      setPickingImage(false);
    }
  };

  const openLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: colors.brandPrimary,
        controlsColor: "#ffffff",
        dismissButtonStyle: "close",
      });
    } catch {
      RNLinking.openURL(url).catch(() => {});
    }
  };

  const submit = async () => {
    if (!token || !name.trim()) {
      Alert.alert("Missing info", "Please enter a dance name.");
      return;
    }
    const hasAttachment = !!(stepSheetUrl.trim() || stepSheetImage);
    if (hasAttachment && !confirmedOfficial) {
      Alert.alert(
        "Confirm official source",
        "Please tick the checkbox confirming that the link or image is the choreographer's official step sheet."
      );
      return;
    }
    setSaving(true);
    try {
      await api.submitSuggestion(
        {
          dance_name: name.trim(),
          song,
          artist,
          difficulty,
          youtube_url: yt,
          step_sheet_url: stepSheetUrl,
          step_sheet_image: stepSheetImage,
          notes,
        },
        token
      );
      setName(""); setSong(""); setArtist(""); setDifficulty(""); setYt("");
      setStepSheetUrl(""); setStepSheetImage(""); setNotes("");
      setConfirmedOfficial(false);
      Alert.alert("Suggestion sent!", "Erin will review your idea soon. Thank you!");
      setTab("mine");
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not submit");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!token) return;
    try {
      await api.updateSuggestionStatus(id, status, token);
      load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update");
    }
  };

  const remove = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteSuggestion(id, token);
      load();
    } catch {}
  };

  const renderItem = (s: Suggestion, isAdminView: boolean) => (
    <View key={s.id} style={styles.sugCard}>
      <View style={styles.sugHeader}>
        <Text style={styles.sugTitle}>{s.dance_name}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor(s.status) }]}>
          <Text style={styles.statusText}>{s.status.toUpperCase()}</Text>
        </View>
      </View>
      {(s.song || s.artist) ? (
        <Text style={styles.sugMeta}>
          {s.song}{s.artist ? ` — ${s.artist}` : ""}
        </Text>
      ) : null}
      {s.difficulty ? (
        <Text style={styles.sugMeta}>Suggested level: {s.difficulty}</Text>
      ) : null}
      {s.youtube_url ? (
        <Pressable
          testID={`sug-${s.id}-yt`}
          onPress={() => openLink(s.youtube_url)}
          style={styles.sugLinkRow}
        >
          <Ionicons name="logo-youtube" size={13} color={colors.brandSecondary} />
          <Text style={styles.sugLink} numberOfLines={1}>
            {s.youtube_url}
          </Text>
        </Pressable>
      ) : null}
      {s.step_sheet_url ? (
        <Pressable
          testID={`sug-${s.id}-ss-url`}
          onPress={() => openLink(s.step_sheet_url!)}
          style={styles.sugLinkRow}
        >
          <Ionicons name="document-text-outline" size={13} color={colors.brandSecondary} />
          <Text style={styles.sugLink} numberOfLines={1}>
            {s.step_sheet_url}
          </Text>
        </Pressable>
      ) : null}
      {s.step_sheet_image ? (
        <Image
          source={{ uri: s.step_sheet_image }}
          style={styles.sugImage}
          resizeMode="contain"
        />
      ) : null}
      {s.notes ? <Text style={styles.sugNotes}>“{s.notes}”</Text> : null}
      <Text style={styles.sugBy}>
        {isAdminView ? `From ${s.user_name || s.user_email}` : "Your suggestion"} · {new Date(s.created_at).toLocaleDateString()}
      </Text>

      {isAdminView ? (
        <View style={styles.actionRow}>
          {STATUSES.filter((x) => x !== s.status).map((st) => (
            <Pressable
              key={st}
              testID={`sug-${s.id}-set-${st}`}
              onPress={() => updateStatus(s.id, st)}
              style={styles.actionBtn}
            >
              <Text style={styles.actionText}>Mark {st}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable
          testID={`sug-${s.id}-delete`}
          onPress={() => remove(s.id)}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={14} color={colors.error} />
          <Text style={styles.deleteText}>Withdraw</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} testID="suggest-back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Suggest to Erin</Text>
          <Text style={styles.subtitle}>Got a dance idea? Erin &amp; Jamin will review it.</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabBtn label="New" active={tab === "submit"} onPress={() => setTab("submit")} testID="suggest-tab-new" />
        <TabBtn
          label={`Mine (${mine.length})`}
          active={tab === "mine"}
          onPress={() => setTab("mine")}
          testID="suggest-tab-mine"
        />
        {isReviewer ? (
          <TabBtn
            label={`All (${all.length})`}
            active={tab === "all"}
            onPress={() => setTab("all")}
            testID="suggest-tab-all"
          />
        ) : null}
      </View>

      {tab === "submit" ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.hint}>
              <Ionicons name="information-circle" size={18} color={colors.brandSecondary} />
              <Text style={styles.hintText}>
                Suggest a line dance you&apos;d love Erin to teach. She reviews these regularly to plan class lessons.
              </Text>
            </View>

            <Label text="Dance name *" />
            <TextInput
              testID="suggest-input-name"
              placeholder="e.g. Man! I Feel Like a Woman"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <Label text="Song" />
            <TextInput
              testID="suggest-input-song"
              placeholder="Song title"
              placeholderTextColor={colors.muted}
              value={song}
              onChangeText={setSong}
              style={styles.input}
            />
            <Label text="Artist" />
            <TextInput
              testID="suggest-input-artist"
              placeholder="Artist"
              placeholderTextColor={colors.muted}
              value={artist}
              onChangeText={setArtist}
              style={styles.input}
            />
            <Label text="Suggested difficulty" />
            <View style={styles.chipsRow}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d}
                  testID={`suggest-diff-${d.toLowerCase()}`}
                  onPress={() => setDifficulty(difficulty === d ? "" : d)}
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
            <Label text="YouTube tutorial (optional)" />
            <TextInput
              testID="suggest-input-yt"
              placeholder="https://youtube.com/..."
              placeholderTextColor={colors.muted}
              value={yt}
              onChangeText={setYt}
              autoCapitalize="none"
              style={styles.input}
            />

            <Label text="Choreographer's step sheet URL (optional)" />
            <TextInput
              testID="suggest-input-stepsheet-url"
              placeholder="Paste the CopperKnob / BootStepper / choreographer's own site URL"
              placeholderTextColor={colors.muted}
              value={stepSheetUrl}
              onChangeText={setStepSheetUrl}
              autoCapitalize="none"
              keyboardType="url"
              style={styles.input}
            />

            <Label text="Step sheet photo (optional)" />
            {stepSheetImage ? (
              <View>
                <Image
                  source={{ uri: stepSheetImage }}
                  style={styles.attachedImage}
                  resizeMode="contain"
                />
                <Pressable
                  testID="suggest-clear-image"
                  onPress={() => setStepSheetImage("")}
                  style={styles.removeImgBtn}
                >
                  <Ionicons name="trash" size={14} color="#fff" />
                  <Text style={styles.removeImgText}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID="suggest-attach-image"
                onPress={pickStepSheet}
                disabled={pickingImage}
                style={styles.attachBtn}
              >
                {pickingImage ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={20} color={colors.brandPrimary} />
                    <Text style={styles.attachBtnText}>Attach step sheet photo</Text>
                  </>
                )}
              </Pressable>
            )}

            {(stepSheetUrl.trim() || stepSheetImage) ? (
              <Pressable
                testID="suggest-confirm-official"
                onPress={() => setConfirmedOfficial((v) => !v)}
                style={styles.confirmRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    confirmedOfficial && styles.checkboxOn,
                  ]}
                >
                  {confirmedOfficial ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : null}
                </View>
                <Text style={styles.confirmText}>
                  I confirm this is the <Text style={{ fontWeight: "700" }}>choreographer&apos;s
                  official</Text> step sheet, not a copy or unofficial recreation.
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.copyrightBanner}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={colors.brandSecondary}
                style={{ marginTop: 1 }}
              />
              <Text style={styles.copyrightText}>
                Please only submit links or photos of the{" "}
                <Text style={{ fontWeight: "700" }}>choreographer&apos;s official
                step sheet</Text> — usually hosted on{" "}
                <Text style={styles.linkInline} onPress={() => openLink("https://www.copperknob.co.uk")}>
                  copperknob.co.uk
                </Text>
                ,{" "}
                <Text style={styles.linkInline} onPress={() => openLink("https://bootstepper.com")}>
                  bootstepper.com
                </Text>
                , or the choreographer&apos;s own website. This keeps us
                copyright-safe and helps Erin verify quickly.
              </Text>
            </View>

            <Label text="Notes for Erin" />
            <TextInput
              testID="suggest-input-notes"
              placeholder="Why this dance? Any details you want Erin to know..."
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
            />

            <Pressable
              testID="suggest-submit"
              onPress={submit}
              disabled={saving}
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <>
                  <Ionicons name="send" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.submitText}>Send to Erin</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <FlatList
          data={tab === "mine" ? mine : all}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="bulb-outline" size={40} color={colors.muted} />
                <Text style={styles.emptyText}>
                  {tab === "mine"
                    ? "You haven't sent any suggestions yet."
                    : "No suggestions yet."}
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => renderItem(item, tab === "all")}
        />
      )}
    </SafeAreaView>
  );
}

function TabBtn({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  tabs: {
    flexDirection: "row",
    padding: 4,
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.pill },
  tabBtnActive: { backgroundColor: colors.brandPrimary },
  tabText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: colors.onBrandPrimary },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: spacing.sm,
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
  submitBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  submitText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  hint: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  sugCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  sugHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sugTitle: { flex: 1, fontFamily: "serif", fontSize: 17, fontWeight: "700", color: colors.onSurface },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sugMeta: { fontSize: 13, color: colors.onSurfaceSecondary },
  sugLink: { fontSize: 12, color: colors.brandSecondary, marginTop: 2, flex: 1 },
  sugLinkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  sugImage: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
    marginTop: 8,
    backgroundColor: colors.surface,
  },
  attachedImage: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  removeImgBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  removeImgText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceSecondary,
  },
  attachBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  confirmRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    backgroundColor: colors.surface,
  },
  checkboxOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  confirmText: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    lineHeight: 17,
  },
  copyrightBanner: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary + "44",
    backgroundColor: colors.brandSecondary + "0D",
    marginTop: 4,
  },
  copyrightText: {
    flex: 1,
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  linkInline: { color: colors.brandSecondary, textDecorationLine: "underline" },
  sugNotes: { fontSize: 13, color: colors.onSurfaceSecondary, fontStyle: "italic", marginTop: 6 },
  sugBy: { fontSize: 11, color: colors.muted, marginTop: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  actionText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteText: { color: colors.error, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, textAlign: "center" },
});
