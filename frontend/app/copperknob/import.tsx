/**
 * CopperKnob Import Review screen
 * -------------------------------
 * Route: ``/copperknob/import?ref=XCZW7BV`` — admin-only.
 *
 * Behaviour:
 *   1. Fetches the CopperKnob record via our proxy.
 *   2. If the backend already flagged a match in our library, we bail
 *      out to the local dance detail page (belt-and-suspenders — the
 *      search cards already hide "+ Add to Library" for those, but
 *      someone deep-linking here shouldn't create a duplicate).
 *   3. Pre-fills an editable form with CopperKnob's values mapped
 *      into our own vocabulary (difficulty enum, "N count, M wall"
 *      string, split song/artist).
 *   4. Admin reviews / edits / toggles publish → we POST to
 *      ``/api/dances/from-copperknob``.
 *   5. Success → route to the newly-created dance detail page.
 *
 * Server-side authorisation is enforced separately in the route; the
 * client-side gate here is just for UX (non-admins bounce back).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, CopperKnobResult } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

const DIFFICULTIES = [
  "Absolute Beginner",
  "Beginner",
  "Improver",
  "High Improver",
  "Intermediate",
  "Advanced",
];

function difficultyFromLevel(level: string): string {
  const s = (level || "").toLowerCase();
  if (s.includes("absolute beginner")) return "Absolute Beginner";
  if (s.includes("beginner")) return "Beginner";
  if (s.includes("improver") && s.includes("high")) return "High Improver";
  if (s.includes("improver")) return "Improver";
  if (s.includes("advanced")) return "Advanced";
  if (s.includes("intermediate")) return "Intermediate";
  return "Improver";
}

function countString(item: CopperKnobResult): string {
  const parts: string[] = [];
  if (item.count) parts.push(`${item.count} count`);
  if (item.wall) parts.push(`${item.wall} wall`);
  return parts.join(", ");
}


export default function CopperKnobImportScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const isAdminOrEditor = !!(user?.is_admin || user?.is_instructor);

  const [item, setItem] = useState<CopperKnobResult | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable form state — starts from CopperKnob but every field is
  // editable so the admin can polish typos, adjust our own
  // difficulty vocabulary, or split music strings that CopperKnob
  // encodes atypically.
  const [name, setName] = useState("");
  const [choreographer, setChoreographer] = useState("");
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [difficulty, setDifficulty] = useState<string>("Improver");
  const [count, setCount] = useState("");
  const [bpm, setBpm] = useState("");
  const [description, setDescription] = useState("");
  const [publish, setPublish] = useState(false);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && !!ref && !!token && !saving && !existingId,
    [name, ref, token, saving, existingId]
  );

  const load = useCallback(async () => {
    if (!ref || !token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api.copperknobByRef(ref as string, token);
      const d = r.data;
      setItem(d);
      setExistingId(r.existing_dance?.id || null);

      // Pre-fill from CopperKnob → our vocabulary
      setName(d.title || "");
      setChoreographer(d.choreographer || "");
      setSong(d.song || "");
      setArtist(d.artist || "");
      setDifficulty(difficultyFromLevel(d.level));
      setCount(countString(d));
    } catch (e: any) {
      setLoadError(e?.message || "Couldn't load stepsheet from CopperKnob.");
    } finally {
      setLoading(false);
    }
  }, [ref, token]);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async () => {
    if (!token || !ref || !isAdminOrEditor) return;
    setSaving(true);
    try {
      const res = await api.createDanceFromCopperKnob(
        {
          ref: ref as string,
          name: name.trim(),
          choreographer: choreographer.trim(),
          song: song.trim(),
          artist: artist.trim(),
          difficulty,
          count: count.trim(),
          bpm: bpm ? Number(bpm) : null,
          description: description.trim(),
          is_published: publish,
        },
        token
      );
      Alert.alert(
        "Added to Library",
        publish
          ? "The dance is now live for all users."
          : "Saved as a DRAFT — publish it whenever you're ready.",
        [
          {
            text: "View dance",
            onPress: () => router.replace(`/dance/${res.dance.id}`),
          },
          {
            text: "Back to search",
            onPress: () => router.back(),
            style: "cancel",
          },
        ]
      );
    } catch (e: any) {
      // The server also enforces duplicate detection; a race can still
      // land us here so surface the friendly conflict message.
      const msg = e?.message || "Save failed.";
      if (msg.toLowerCase().includes("already")) {
        Alert.alert(
          "Already in Library",
          "This CopperKnob record was just added to the library by someone else."
        );
        load();
      } else {
        Alert.alert("Save failed", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Consistent in-app header + back button (the root Stack hides its
  // own header — without this the admin has no way back to the search
  // results after landing here).
  const HeaderBar = ({ title }: { title: string }) => (
    <View style={styles.headerBar}>
      <Pressable
        testID="ck-import-back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/library");
        }}
        style={styles.backBtn}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  // Client-side gate — the server also enforces this, but bouncing
  // regular users early is a better UX than a confused 403 toast.
  if (!isAdminOrEditor) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Add from CopperKnob" />
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Admins only</Text>
          <Text style={styles.errorBody}>
            Adding a dance to the Library is limited to admins and
            instructors. Regular users can search and open CopperKnob
            directly.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Add from CopperKnob" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !item) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Add from CopperKnob" />
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Couldn&apos;t load stepsheet</Text>
          <Text style={styles.errorBody}>
            {loadError || "Unknown error"}
          </Text>
          <Pressable style={styles.primaryBtn} onPress={load}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (existingId) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Already in Library" />
        <View style={styles.center}>
          <Ionicons
            name="checkmark-circle-outline"
            size={48}
            color="#16803C"
          />
          <Text style={styles.errorTitle}>Already listed</Text>
          <Text style={styles.errorBody}>
            &quot;{item.title}&quot; is already in the Dance Library.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace(`/dance/${existingId}`)}
          >
            <Text style={styles.primaryBtnText}>View dance</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <HeaderBar title="Add from CopperKnob" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sourceCard}>
            <Text style={styles.sourceLabel}>SOURCE (READ-ONLY)</Text>
            <Text style={styles.sourceTitle}>{item.title}</Text>
            <Text style={styles.sourceMeta}>
              CopperKnob ref: <Text style={styles.mono}>{item.ref}</Text>
            </Text>
            <Pressable
              onPress={() => item.url && Linking.openURL(item.url)}
              style={styles.sourceLink}
            >
              <Ionicons
                name="open-outline"
                size={14}
                color={colors.brandPrimary}
              />
              <Text style={styles.sourceLinkText}>
                Open original on CopperKnob
              </Text>
            </Pressable>
            <Text style={styles.attribution}>
              Dance information provided by CopperKnob
            </Text>
          </View>

          <Text style={styles.sectionLabel}>DANCE DETAILS</Text>
          <Field
            label="Dance name"
            value={name}
            onChangeText={setName}
            testID="ck-import-name"
          />
          <Field
            label="Choreographer"
            value={choreographer}
            onChangeText={setChoreographer}
            testID="ck-import-choreographer"
          />
          <Field
            label="Song"
            value={song}
            onChangeText={setSong}
            testID="ck-import-song"
          />
          <Field
            label="Artist"
            value={artist}
            onChangeText={setArtist}
            testID="ck-import-artist"
          />
          <Field
            label="Count (e.g. 32 count, 4 wall)"
            value={count}
            onChangeText={setCount}
            testID="ck-import-count"
          />
          <Field
            label="BPM (optional)"
            value={bpm}
            onChangeText={setBpm}
            keyboardType="number-pad"
            testID="ck-import-bpm"
          />

          <Text style={styles.fieldLabel}>Difficulty</Text>
          <View style={styles.diffRow}>
            {DIFFICULTIES.map((d) => {
              const active = difficulty === d;
              return (
                <Pressable
                  key={d}
                  testID={`ck-import-diff-${d}`}
                  onPress={() => setDifficulty(d)}
                  style={[styles.diffChip, active && styles.diffChipActive]}
                >
                  <Text
                    style={[
                      styles.diffChipText,
                      active && styles.diffChipTextActive,
                    ]}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="Notes (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            testID="ck-import-description"
          />

          <View style={styles.publishRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.publishLabel}>Publish immediately</Text>
              <Text style={styles.publishHint}>
                Off = save as draft. On = visible to all users.
              </Text>
            </View>
            <Switch
              value={publish}
              onValueChange={setPublish}
              trackColor={{ true: colors.brandPrimary }}
              testID="ck-import-publish"
            />
          </View>

          <Pressable
            testID="ck-import-save"
            onPress={onSave}
            disabled={!canSubmit}
            style={[
              styles.primaryBtn,
              !canSubmit && { opacity: 0.5 },
              { marginTop: spacing.xl, minWidth: 240 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.primaryBtnText}>Add to Library</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.footNote}>
            Adding this dance stores metadata + a link back to CopperKnob.
            SGY does not claim ownership of third-party choreography or
            stepsheets — the full step-by-step instructions remain on
            CopperKnob.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad";
  testID?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType || "default"}
        style={[styles.input, multiline && { minHeight: 80 }]}
        placeholderTextColor={colors.muted}
        testID={testID}
      />
    </View>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  sourceCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 4,
  },
  sourceLabel: {
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  sourceTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  sourceMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  mono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    color: colors.onSurface,
  },
  sourceLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  sourceLinkText: {
    color: colors.brandPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  attribution: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
    fontStyle: "italic",
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.onSurface,
    fontSize: 15,
    minHeight: 42,
  },
  diffRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  diffChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  diffChipActive: { backgroundColor: colors.brandPrimary },
  diffChipText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  diffChipTextActive: { color: "#fff" },
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  publishLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  publishHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignSelf: "center",
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  errorBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  footNote: {
    marginTop: spacing.xl,
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    fontStyle: "italic",
  },
});
