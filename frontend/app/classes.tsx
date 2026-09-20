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
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor } from "../src/theme";
import { api, ClassSession, Dance } from "../src/api/client";
import { useAuth } from "../src/context/auth-context";

import { localTodayISO } from "@/src/utils/date";

// Kept for backwards-compat — reads LOCAL calendar day, not UTC, so
// events posted "today" in Arizona / MST still land in "upcoming".
const todayISO = () => localTodayISO();

export default function ClassesScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [scope, setScope] = useState<"upcoming" | "past">("past");
  const [items, setItems] = useState<ClassSession[]>([]);
  const [attended, setAttended] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listClasses(scope, 200, todayISO());
      setItems(data);
      if (token) {
        const att = await api.myAttendance(token);
        setAttended(new Set(att.class_ids));
      }
    } catch {}
    setLoading(false);
  }, [scope, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canAdd = !!user && (user.is_admin || user.is_instructor);

  const toggleAttend = async (classId: string) => {
    if (!token) return;
    setBusy(classId);
    try {
      const isAttended = attended.has(classId);
      if (isAttended) {
        await api.unattend(classId, token);
        const next = new Set(attended);
        next.delete(classId);
        setAttended(next);
      } else {
        await api.attend(classId, token);
        const next = new Set(attended);
        next.add(classId);
        setAttended(next);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => {
            // If we have back stack use it, otherwise route straight to home
            // (fixes deep-links / hard-loads where router.back() is a no-op).
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          testID="classes-back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Classes</Text>
          <Text style={styles.subtitle}>Upcoming schedule & past recaps</Text>
        </View>
        {canAdd ? (
          <Pressable
            testID="new-class-btn"
            onPress={() => setFormOpen(true)}
            style={styles.newBtn}
          >
            <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.newBtnText}>Log</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <Pressable
          testID="tab-upcoming"
          onPress={() => setScope("upcoming")}
          style={[styles.tabBtn, scope === "upcoming" && styles.tabBtnActive]}
        >
          <Ionicons
            name="calendar"
            size={14}
            color={scope === "upcoming" ? colors.onBrandPrimary : colors.onSurface}
          />
          <Text style={[styles.tabText, scope === "upcoming" && styles.tabTextActive]}>
            Upcoming
          </Text>
        </Pressable>
        <Pressable
          testID="tab-past"
          onPress={() => setScope("past")}
          style={[styles.tabBtn, scope === "past" && styles.tabBtnActive]}
        >
          <Ionicons
            name="time"
            size={14}
            color={scope === "past" ? colors.onBrandPrimary : colors.onSurface}
          />
          <Text style={[styles.tabText, scope === "past" && styles.tabTextActive]}>
            Past Recap
          </Text>
        </Pressable>
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
              <Ionicons
                name={scope === "upcoming" ? "calendar-outline" : "time-outline"}
                size={44}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>
                {scope === "upcoming"
                  ? "No upcoming classes scheduled yet."
                  : "No past classes logged yet."}
                {canAdd ? " Tap 'Log' to add one." : ""}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isPast = scope === "past";
            const isAttended = attended.has(item.id);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View
                    style={[
                      styles.dateChip,
                      { backgroundColor: isPast ? colors.brandPrimary : colors.brandSecondary },
                    ]}
                  >
                    <Text style={styles.dateChipText}>{formatDate(item.date)}</Text>
                  </View>
                  {item.session_label ? (
                    <Text style={styles.sessionLabel}>{item.session_label}</Text>
                  ) : null}
                </View>
                <Text style={styles.instructor}>
                  {isPast ? "Taught by" : "With"} {item.instructor_name || "Instructor"}
                </Text>
                {item.flyer_image ? (
                  <Pressable
                    testID={`class-flyer-${item.id}`}
                    onPress={() => setFlyerPreview(item.flyer_image || null)}
                  >
                    <Image
                      source={{ uri: item.flyer_image }}
                      style={styles.flyerCardImage}
                      resizeMode="contain"
                    />
                    <View style={styles.flyerTapHint}>
                      <Ionicons name="expand-outline" size={12} color="#fff" />
                      <Text style={styles.flyerTapHintText}>Tap to enlarge</Text>
                    </View>
                  </Pressable>
                ) : null}
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

                <View style={styles.cardActions}>
                  {isPast && token ? (
                    <Pressable
                      testID={`attend-${item.id}`}
                      onPress={() => toggleAttend(item.id)}
                      disabled={busy === item.id}
                      style={[styles.attendBtn, isAttended && styles.attendBtnActive]}
                    >
                      {busy === item.id ? (
                        <ActivityIndicator size="small" color={isAttended ? "#fff" : colors.success} />
                      ) : (
                        <>
                          <Ionicons
                            name={isAttended ? "checkmark-circle" : "add-circle-outline"}
                            size={16}
                            color={isAttended ? "#fff" : colors.success}
                          />
                          <Text
                            style={[
                              styles.attendText,
                              isAttended && { color: "#fff" },
                            ]}
                          >
                            {isAttended ? "I was there" : "Mark I was here"}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  {(user?.is_admin ||
                    user?.can_edit_step_sheets ||
                    user?.user_id === item.instructor_id) && token ? (
                    <>
                      <Pressable
                        testID={`edit-class-${item.id}`}
                        onPress={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                        style={styles.editBtn}
                      >
                        <Ionicons name="create-outline" size={12} color={colors.brandPrimary} />
                        <Text style={styles.editText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        testID={`delete-class-${item.id}`}
                        onPress={() => {
                          Alert.alert(
                            "Delete class?",
                            `Remove "${item.session_label || formatDate(item.date)}"? This can't be undone.`,
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: async () => {
                                  try {
                                    await api.deleteClass(item.id, token);
                                    load();
                                  } catch (e: any) {
                                    Alert.alert("Error", e?.message || "Could not delete");
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        style={styles.deleteBtn}
                      >
                        <Ionicons name="trash-outline" size={12} color={colors.error} />
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <ClassFormModal
        visible={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          load();
        }}
        token={token || ""}
        canUploadFlyer={!!user?.can_edit_step_sheets}
        editing={editing}
      />

      {/* Full-screen flyer preview when a card image is tapped */}
      <Modal
        visible={!!flyerPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setFlyerPreview(null)}
      >
        <Pressable style={styles.flyerModal} onPress={() => setFlyerPreview(null)}>
          {flyerPreview ? (
            <Image
              source={{ uri: flyerPreview }}
              style={styles.flyerModalImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            testID="flyer-close"
            onPress={() => setFlyerPreview(null)}
            style={styles.flyerClose}
            hitSlop={10}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
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
  canUploadFlyer,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  token: string;
  canUploadFlyer: boolean;
  editing: ClassSession | null;
}) {
  const [date, setDate] = useState(todayISO());
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [flyerImage, setFlyerImage] = useState("");
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [q, setQ] = useState("");
  const [dances, setDances] = useState<Dance[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Pre-fill or reset when opening the modal (edit vs create)
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setDate(editing.date || todayISO());
      setLabel(editing.session_label || "");
      setNotes(editing.notes || "");
      setFlyerImage(editing.flyer_image || "");
      setSelected(editing.dance_ids || []);
    } else {
      setDate(todayISO());
      setLabel("");
      setNotes("");
      setFlyerImage("");
      setSelected([]);
    }
    setQ("");
  }, [editing, visible]);

  useEffect(() => {
    if (!visible) return;
    api.listDances(q || undefined).then(setDances).catch(() => {});
  }, [q, visible]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const pickFlyer = async () => {
    setFlyerBusy(true);
    try {
      // Request permission (no-op on web)
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== "web") {
        Alert.alert(
          "Permission needed",
          "Allow photo access to attach a flyer image."
        );
        return;
      }
      // Use the new mediaTypes array (MediaTypeOptions is deprecated in SDK 54).
      // Skip the built-in editor — some devices drop base64 when the cropper runs.
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

      // Downscale + re-encode so ANY input becomes a safe, ~<1.5MB JPEG.
      // Long edge capped at 1400px, JPEG @ 0.75 quality.
      let manipulated;
      try {
        manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1400 } }],
          {
            compress: 0.75,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );
      } catch (mErr) {
        // Fallback: try to read the raw uri via fetch on web/native
        try {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onloadend = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(blob);
          });
          if (dataUrl && dataUrl.startsWith("data:")) {
            setFlyerImage(dataUrl);
            return;
          }
        } catch {}
        Alert.alert(
          "Couldn't process that flyer",
          (mErr as any)?.message || "Try a different photo."
        );
        return;
      }

      if (!manipulated?.base64) {
        Alert.alert("Couldn't read that image", "Please try another photo.");
        return;
      }
      const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;
      // Safety net: hard cap ~4 MB post-compression
      if (dataUri.length > 4_500_000) {
        Alert.alert(
          "Image too large",
          "Even after compression, that flyer is over 4 MB. Please pick a smaller image."
        );
        return;
      }
      setFlyerImage(dataUri);
    } catch (e: any) {
      Alert.alert("Couldn't attach flyer", e?.message || "Try again.");
    } finally {
      setFlyerBusy(false);
    }
  };

  const submit = async () => {
    if (!token) return;
    if (!date) {
      Alert.alert("Missing date", "Enter a date (YYYY-MM-DD).");
      return;
    }
    if (selected.length === 0) {
      Alert.alert("Pick dances", "Select at least one dance.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date,
        session_label: label,
        dance_ids: selected,
        notes,
        // Only send flyer when the caller is a whitelist editor
        flyer_image: canUploadFlyer ? flyerImage : undefined,
      };
      if (editing) {
        await api.updateClass(editing.id, payload, token);
      } else {
        await api.createClass(payload, token);
      }
      setDate(todayISO());
      setLabel("");
      setNotes("");
      setFlyerImage("");
      setSelected([]);
      setQ("");
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
          <Text style={styles.modalTitle}>{editing ? "Edit Class" : "Log Class"}</Text>
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
            <Text style={styles.hint}>
              Use today&apos;s date (or earlier) to post a recap. Use a future date to publish an upcoming class.
            </Text>
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
              placeholder="Any highlights or preview info..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            />

            {canUploadFlyer && (
              <>
                <Label text="Flyer image (optional)" />
                {flyerImage ? (
                  <View style={styles.flyerPreviewWrap}>
                    <Image source={{ uri: flyerImage }} style={styles.flyerPreview} resizeMode="contain" />
                    <View style={styles.flyerActions}>
                      <Pressable
                        testID="class-flyer-replace"
                        onPress={pickFlyer}
                        style={styles.flyerBtnLight}
                        disabled={flyerBusy}
                      >
                        <Ionicons name="swap-horizontal" size={16} color={colors.brandPrimary} />
                        <Text style={styles.flyerBtnLightText}>Replace</Text>
                      </Pressable>
                      <Pressable
                        testID="class-flyer-remove"
                        onPress={() => setFlyerImage("")}
                        style={styles.flyerBtnLight}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                        <Text style={[styles.flyerBtnLightText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    testID="class-flyer-add"
                    onPress={pickFlyer}
                    disabled={flyerBusy}
                    style={styles.flyerAdd}
                  >
                    {flyerBusy ? (
                      <ActivityIndicator color={colors.brandPrimary} />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={22} color={colors.brandPrimary} />
                        <Text style={styles.flyerAddText}>Attach a flyer image</Text>
                        <Text style={styles.flyerHint}>Shown to everyone viewing this class</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </>
            )}

            <Label text={`Dances (${selected.length} selected) *`} />
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="class-dance-search"
                value={q}
                onChangeText={setQ}
                placeholder="Filter dances"
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
                <Text style={styles.saveBtnText}>{editing ? "Update Class" : "Save Class"}</Text>
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
  tabText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.onBrandPrimary },
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
  dateChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  dateChipText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  sessionLabel: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
  },
  instructor: { color: colors.muted, fontSize: 12 },
  dancesWrap: { gap: 4, marginTop: 4 },
  flyerCardImage: {
    width: "100%",
    height: 320,
    borderRadius: radius.md,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.divider,
  },
  flyerTapHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  flyerTapHintText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  flyerPreviewWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: spacing.sm,
  },
  flyerPreview: { width: "100%", height: 300, backgroundColor: colors.divider },
  flyerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  flyerBtnLight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  flyerBtnLightText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  flyerAdd: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "66",
    borderStyle: "dashed",
    backgroundColor: colors.brandPrimary + "0A",
    marginBottom: spacing.sm,
    gap: 4,
  },
  flyerAddText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  flyerHint: { color: colors.muted, fontSize: 12 },
  flyerModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  flyerModalImage: { width: "94%", height: "80%" },
  flyerClose: {
    position: "absolute",
    top: 44,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  cardActions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 8, flexWrap: "wrap" },
  attendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  attendBtnActive: { backgroundColor: colors.success, borderColor: colors.success },
  attendText: { color: colors.success, fontSize: 12, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  deleteText: { color: colors.error, fontSize: 12, fontWeight: "600" },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
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
  hint: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
