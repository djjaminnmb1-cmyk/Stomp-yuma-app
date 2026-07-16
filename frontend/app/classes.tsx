import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor } from "../src/theme";
import { api, ClassSession, Dance } from "../src/api/client";
import { useAuth } from "../src/context/auth-context";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ClassesScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [items, setItems] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listClasses(100);
      setItems(data);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canAdd = !!user && (user.is_admin || user.is_instructor);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} testID="classes-back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Class Recap</Text>
          <Text style={styles.subtitle}>Dances taught by our instructors</Text>
        </View>
        {canAdd ? (
          <Pressable
            testID="new-class-btn"
            onPress={() => setFormOpen(true)}
            style={styles.newBtn}
          >
            <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.newBtnText}>Log Class</Text>
          </Pressable>
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
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={44} color={colors.muted} />
              <Text style={styles.emptyText}>
                No classes logged yet. {canAdd ? "Tap 'Log Class' to add one." : ""}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.dateChip}>
                  <Text style={styles.dateChipText}>
                    {formatDate(item.date)}
                  </Text>
                </View>
                {item.session_label ? (
                  <Text style={styles.sessionLabel}>{item.session_label}</Text>
                ) : null}
              </View>
              <Text style={styles.instructor}>
                Taught by {item.instructor_name || "Instructor"}
              </Text>
              <View style={styles.dancesWrap}>
                {item.dances.map((d) => (
                  <Pressable
                    key={d.id}
                    testID={`class-${item.id}-dance-${d.id}`}
                    onPress={() => router.push(`/dance/${d.id}`)}
                    style={styles.danceRow}
                  >
                    <View
                      style={[
                        styles.diffDot,
                        { backgroundColor: difficultyColor(d.difficulty) },
                      ]}
                    />
                    <Text style={styles.danceName}>{d.name}</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
              {item.notes ? (
                <Text style={styles.classNotes}>“{item.notes}”</Text>
              ) : null}

              {(user?.is_admin || user?.user_id === item.instructor_id) && token ? (
                <Pressable
                  testID={`delete-class-${item.id}`}
                  onPress={async () => {
                    await api.deleteClass(item.id, token);
                    load();
                  }}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={12} color={colors.error} />
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      <ClassFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
        token={token || ""}
      />
    </SafeAreaView>
  );
}

function formatDate(iso: string) {
  try {
    const [y, m, d] = iso.split("-").map((s) => parseInt(s));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ClassFormModal({
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
  const [date, setDate] = useState(todayISO());
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [q, setQ] = useState("");
  const [dances, setDances] = useState<Dance[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    api.listDances(q || undefined).then(setDances).catch(() => {});
  }, [q, visible]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (!token) return;
    if (!date) {
      Alert.alert("Missing date", "Enter a date (YYYY-MM-DD).");
      return;
    }
    if (selected.length === 0) {
      Alert.alert("Pick dances", "Select at least one dance taught.");
      return;
    }
    setSaving(true);
    try {
      await api.createClass(
        { date, session_label: label, dance_ids: selected, notes },
        token
      );
      setDate(todayISO());
      setLabel("");
      setNotes("");
      setSelected([]);
      setQ("");
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not save class");
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
          <Text style={styles.modalTitle}>Log Class</Text>
          <Pressable onPress={onClose} testID="close-class-form">
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
            <Label text="Date (YYYY-MM-DD) *" />
            <TextInput
              testID="class-date"
              value={date}
              onChangeText={setDate}
              placeholder="2026-02-14"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={styles.input}
            />

            <Label text="Session label" />
            <TextInput
              testID="class-label"
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Friday Night, Beginner Class"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Label text="Notes" />
            <TextInput
              testID="class-notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Any highlights from the class..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            />

            <Label text={`Dances taught (${selected.length} selected) *`} />
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="class-dance-search"
                value={q}
                onChangeText={setQ}
                placeholder="Filter dances by name/song/choreographer"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
              />
            </View>

            <View style={{ maxHeight: 320 }}>
              <ScrollView nestedScrollEnabled>
                {dances.map((d) => {
                  const sel = selected.includes(d.id);
                  return (
                    <Pressable
                      key={d.id}
                      testID={`class-pick-${d.id}`}
                      onPress={() => toggle(d.id)}
                      style={[styles.pickRow, sel && styles.pickRowSel]}
                    >
                      <View
                        style={[
                          styles.diffDot,
                          { backgroundColor: difficultyColor(d.difficulty) },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickName}>{d.name}</Text>
                        <Text style={styles.pickMeta} numberOfLines={1}>
                          {d.choreographer} · {d.difficulty}
                        </Text>
                      </View>
                      <Ionicons
                        name={sel ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={sel ? colors.brandPrimary : colors.muted}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              testID="save-class"
              onPress={submit}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Class</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  dateChip: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dateChipText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  sessionLabel: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
  },
  instructor: { color: colors.muted, fontSize: 12 },
  dancesWrap: { gap: 4, marginTop: 4 },
  danceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  danceName: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  classNotes: { color: colors.onSurfaceSecondary, fontStyle: "italic", fontSize: 13, marginTop: 6 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  deleteText: { color: colors.error, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyText: { color: colors.muted, textAlign: "center" },
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
  label: {
    fontSize: 11,
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: { flex: 1, padding: 10, color: colors.onSurface, fontSize: 14 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
    backgroundColor: colors.surface,
  },
  pickRowSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary + "22" },
  pickName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  pickMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
