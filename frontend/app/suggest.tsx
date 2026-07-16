import { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius } from "../src/theme";
import { api, Suggestion } from "../src/api/client";
import { useAuth } from "../src/context/auth-context";

const DIFFICULTIES = ["Beginner", "Improver", "Intermediate", "Advanced"];
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
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<Suggestion[]>([]);
  const [all, setAll] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const m = await api.mySuggestions(token);
      setMine(m);
      if (user?.is_admin) {
        const a = await api.allSuggestions(token);
        setAll(a);
      }
    } catch {}
    setLoading(false);
  }, [token, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    if (!token || !name.trim()) {
      Alert.alert("Missing info", "Please enter a dance name.");
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
          notes,
        },
        token
      );
      setName(""); setSong(""); setArtist(""); setDifficulty(""); setYt(""); setNotes("");
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
        <Text style={styles.sugLink} numberOfLines={1}>🎬 {s.youtube_url}</Text>
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
          <Text style={styles.subtitle}>Got a dance idea? Send it to instructor Erin Brown.</Text>
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
        {user?.is_admin ? (
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
                Suggest a line dance you'd love Erin to teach. She reviews these regularly to plan class lessons.
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
  sugLink: { fontSize: 12, color: colors.brandSecondary, marginTop: 2 },
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
