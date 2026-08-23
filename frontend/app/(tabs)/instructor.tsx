import { useCallback, useEffect, useRef, useState } from "react";
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
  FlatList,
  Linking as RNLinking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { api, ClassSession, Dance, ChatMessage } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useDraftCount } from "@/src/context/draft-count-context";
import { parseCsv } from "@/src/lib/csv";

const DIFFICULTIES = ["Absolute Beginner", "Beginner", "Improver", "High Improver", "Intermediate", "Advanced"];

export default function InstructorTab() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { refresh: refreshDrafts } = useDraftCount();
  const [tab, setTab] = useState<"dances" | "classes" | "chat">("dances");
  const [myClasses, setMyClasses] = useState<ClassSession[]>([]);
  const [myDances, setMyDances] = useState<Dance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDance, setEditDance] = useState<Dance | null>(null);
  const [newDanceOpen, setNewDanceOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user || !token) return;
    setLoading(true);
    try {
      const [allClasses, mineDances] = await Promise.all([
        api.listClasses("all", 500),
        api.listDances(undefined, undefined, "mine", token),
      ]);
      const mine = allClasses.filter((c) => c.instructor_id === user.user_id);
      setMyClasses(mine);

      // Union: dances I've created (drafts + published) + unique dances I've taught in classes
      const taughtIds = new Set(mine.flatMap((c) => c.dance_ids || []));
      const missingTaught = Array.from(taughtIds).filter(
        (id) => !mineDances.find((d) => d.id === id)
      );
      let extras: Dance[] = [];
      if (missingTaught.length) {
        const all = await api.listDances();
        const set = new Set(missingTaught);
        extras = all.filter((d) => set.has(d.id));
      }
      setMyDances([...mineDances, ...extras]);
    } catch {}
    setLoading(false);
  }, [user, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const togglePublish = async (d: Dance) => {
    if (!token) return;
    setBusyId(d.id);
    try {
      const updated = d.is_published
        ? await api.unpublishDance(d.id, token)
        : await api.publishDance(d.id, token);
      setMyDances((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      refreshDrafts();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update publish state");
    } finally {
      setBusyId(null);
    }
  };

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
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>Instructor</Text>
          <Text style={styles.subtitle} numberOfLines={1}>Dances · Classes · Chat</Text>
        </View>
        <Pressable
          testID="open-dashboard"
          onPress={() => router.push("/instructor-dashboard")}
          style={styles.dashBtn}
          hitSlop={8}
        >
          <Ionicons name="stats-chart" size={14} color={colors.brandPrimary} />
        </Pressable>
        {tab === "dances" ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {user.can_edit_step_sheets ? (
              <Pressable
                testID="restore-dance-btn"
                onPress={() => setRestoreOpen(true)}
                style={styles.importBtn}
              >
                <Ionicons name="arrow-undo" size={16} color={colors.brandPrimary} />
                <Text style={styles.importBtnText}>Restore</Text>
              </Pressable>
            ) : null}
            <Pressable
              testID="import-csv-btn"
              onPress={() => setImportOpen(true)}
              style={styles.importBtn}
            >
              <Ionicons name="cloud-upload" size={16} color={colors.brandPrimary} />
              <Text style={styles.importBtnText}>CSV</Text>
            </Pressable>
            <Pressable
              testID="new-dance-btn"
              onPress={() => setNewDanceOpen(true)}
              style={styles.newBtn}
            >
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.newBtnText}>New</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <TabBtn
          label="Dances"
          icon="musical-notes"
          active={tab === "dances"}
          onPress={() => setTab("dances")}
          testID="instr-tab-dances"
        />
        <TabBtn
          label="Classes"
          icon="calendar"
          active={tab === "classes"}
          onPress={() => setTab("classes")}
          testID="instr-tab-classes"
        />
        <TabBtn
          label="Chat"
          icon="chatbubbles"
          active={tab === "chat"}
          onPress={() => setTab("chat")}
          testID="instr-tab-chat"
        />
      </View>

      {tab === "dances" && (
        loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
            <View style={styles.legend}>
              <Ionicons name="information-circle" size={16} color={colors.brandSecondary} />
              <Text style={styles.legendText}>
                New dances start as <Text style={{ fontWeight: "700" }}>Drafts</Text> — only you can see them. Tap <Text style={{ fontWeight: "700" }}>Publish</Text> to share with everyone in the app.
              </Text>
            </View>
            {myDances.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={44} color={colors.muted} />
                <Text style={styles.emptyText}>
                  No dances yet. Tap "+ New" to upload a dance with its step sheet, or log a class in the Classes tab.
                </Text>
              </View>
            ) : (
              myDances.map((d) => {
                const hasSheet = !!(d.step_sheet && d.step_sheet.trim()) || !!d.step_sheet_image;
                const isMine = d.created_by === user.user_id;
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
                            styles.pill,
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
                            size={11}
                            color={hasSheet ? colors.success : colors.warning}
                          />
                          <Text
                            style={[
                              styles.pillText,
                              { color: hasSheet ? colors.success : colors.warning },
                            ]}
                          >
                            {hasSheet ? "Sheet" : "No sheet"}
                          </Text>
                        </View>
                        {isMine ? (
                          <View
                            style={[
                              styles.pill,
                              {
                                backgroundColor: d.is_published
                                  ? colors.brandSecondary + "22"
                                  : colors.muted + "22",
                                borderColor: d.is_published
                                  ? colors.brandSecondary
                                  : colors.muted,
                              },
                            ]}
                          >
                            <Ionicons
                              name={d.is_published ? "eye" : "eye-off"}
                              size={11}
                              color={d.is_published ? colors.brandSecondary : colors.muted}
                            />
                            <Text
                              style={[
                                styles.pillText,
                                {
                                  color: d.is_published ? colors.brandSecondary : colors.muted,
                                },
                              ]}
                            >
                              {d.is_published ? "Published" : "Draft"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                    <View style={{ gap: 6 }}>
                      {user.can_edit_step_sheets ? (
                        <Pressable
                          testID={`instr-edit-${d.id}`}
                          onPress={() => setEditDance(d)}
                          style={styles.editBtn}
                        >
                          <Ionicons name="create-outline" size={13} color={colors.brandPrimary} />
                          <Text style={styles.editBtnText}>Sheet</Text>
                        </Pressable>
                      ) : null}
                      {isMine ? (
                        <Pressable
                          testID={`instr-publish-${d.id}`}
                          onPress={() => togglePublish(d)}
                          disabled={busyId === d.id}
                          style={[
                            styles.publishBtn,
                            d.is_published && { backgroundColor: colors.muted + "22", borderColor: colors.muted },
                          ]}
                        >
                          {busyId === d.id ? (
                            <ActivityIndicator size="small" color={colors.brandPrimary} />
                          ) : (
                            <>
                              <Ionicons
                                name={d.is_published ? "eye-off-outline" : "share-outline"}
                                size={13}
                                color={d.is_published ? colors.muted : colors.success}
                              />
                              <Text
                                style={[
                                  styles.publishText,
                                  {
                                    color: d.is_published ? colors.muted : colors.success,
                                  },
                                ]}
                              >
                                {d.is_published ? "Unpublish" : "Publish"}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )
      )}

      {tab === "classes" && (
        loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
            {myClasses.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={44} color={colors.muted} />
                <Text style={styles.emptyText}>
                  You haven't logged any classes yet.
                </Text>
                <Pressable onPress={() => router.push("/classes")} style={styles.emptyBtn}>
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
                    <Text style={styles.classMeta} numberOfLines={2}>
                      {c.dances.length} dance{c.dances.length === 1 ? "" : "s"} · {c.dances.map((d) => d.name).join(", ")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))
            )}
          </ScrollView>
        )
      )}

      {tab === "chat" && <ChatView token={token || ""} currentUserId={user.user_id} isAdmin={!!user.is_admin} />}

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
          refreshDrafts();
        }}
        token={token || ""}
      />

      <ImportCsvModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          load();
          refreshDrafts();
        }}
        token={token || ""}
      />

      <RestoreDancesModal
        visible={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onRestored={() => {
          load();
          refreshDrafts();
        }}
        token={token || ""}
      />
    </SafeAreaView>
  );
}

function TabBtn({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: any;
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
      <Ionicons name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ---------------- Chat ----------------
function ChatView({
  token,
  currentUserId,
  isAdmin,
}: {
  token: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const msgs = await api.listChat(token);
      setMessages(msgs);
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const msg = await api.postChat(t, token);
      setMessages((m) => [...m, msg]);
      setText("");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteChat(id, token);
      setMessages((m) => m.filter((x) => x.id !== id));
    } catch {}
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
      style={{ flex: 1 }}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>
                Instructor lounge — say hi 👋
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.user_id === currentUserId;
            return (
              <View
                style={[
                  styles.msgRow,
                  { alignItems: mine ? "flex-end" : "flex-start" },
                ]}
              >
                {!mine ? (
                  <Text style={styles.msgAuthor}>{item.user_name || "Instructor"}</Text>
                ) : null}
                <View
                  style={[
                    styles.msgBubble,
                    mine ? styles.msgBubbleMine : styles.msgBubbleOther,
                  ]}
                >
                  <Text style={[styles.msgText, mine && { color: colors.onBrandPrimary }]}>
                    {item.message}
                  </Text>
                  <Text
                    style={[
                      styles.msgTime,
                      mine
                        ? { color: colors.onBrandPrimary, opacity: 0.7 }
                        : { color: colors.muted },
                    ]}
                  >
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                {(mine || isAdmin) ? (
                  <Pressable
                    testID={`chat-delete-${item.id}`}
                    onPress={() => remove(item.id)}
                    style={styles.msgDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={11} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <View style={styles.chatInput}>
        <TextInput
          testID="chat-input"
          value={text}
          onChangeText={setText}
          placeholder="Message the instructors…"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.chatField}
        />
        <Pressable
          testID="chat-send"
          onPress={send}
          disabled={sending || !text.trim()}
          style={[styles.sendBtn, (sending || !text.trim()) && { opacity: 0.5 }]}
        >
          {sending ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------- Step Sheet modal ----------------
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
    <Modal visible={!!dance} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
                <Image source={{ uri: image }} style={styles.preview} resizeMode="contain" />
                <Pressable onPress={() => setImage("")} style={styles.clearImgBtn} testID="clear-sheet-image">
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

// ---------------- New Dance modal ----------------
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
  const [publishNow, setPublishNow] = useState(false);
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
    setBpm(""); setCount(""); setYt(""); setStep(""); setImage(""); setPublishNow(false);
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
          is_published: publishNow,
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
            <TextInput testID="nd-name" placeholder="Dance name *" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
            <TextInput testID="nd-chor" placeholder="Choreographer *" placeholderTextColor={colors.muted} value={chor} onChangeText={setChor} style={styles.input} />
            <TextInput testID="nd-song" placeholder="Song *" placeholderTextColor={colors.muted} value={song} onChangeText={setSong} style={styles.input} />
            <TextInput placeholder="Artist" placeholderTextColor={colors.muted} value={artist} onChangeText={setArtist} style={styles.input} />
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
            <TextInput placeholder="BPM" keyboardType="number-pad" placeholderTextColor={colors.muted} value={bpm} onChangeText={setBpm} style={styles.input} />
            <TextInput placeholder="Count (e.g. 32 count, 4 wall)" placeholderTextColor={colors.muted} value={count} onChangeText={setCount} style={styles.input} />
            <TextInput placeholder="YouTube URL" placeholderTextColor={colors.muted} value={yt} onChangeText={setYt} autoCapitalize="none" style={styles.input} />
            <Pressable
              testID="nd-yt-autofill"
              onPress={() => {
                if (!name.trim()) {
                  Alert.alert("Enter a name first", "Type the dance name so I can build the search.");
                  return;
                }
                const q = [name, chor, "line dance"].filter(Boolean).join(" ").trim();
                const url = `https://www.youtube.com/results?search_query=${q.split(/\s+/).join("+")}`;
                setYt(url);
              }}
              style={styles.ytAutoBtn}
            >
              <Ionicons name="logo-youtube" size={14} color="#c4302b" />
              <Text style={styles.ytAutoText}>Auto-fill YouTube search</Text>
            </Pressable>

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
              <Pressable onPress={pickImage} disabled={uploading} style={styles.uploadDrop} testID="nd-upload-image">
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
              testID="nd-publish-toggle"
              onPress={() => setPublishNow((v) => !v)}
              style={styles.publishToggle}
            >
              <Ionicons
                name={publishNow ? "checkbox" : "square-outline"}
                size={22}
                color={publishNow ? colors.brandPrimary : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.publishToggleTitle}>
                  Publish to everyone right away
                </Text>
                <Text style={styles.publishToggleSub}>
                  {publishNow
                    ? "Everyone will see this dance in the public library."
                    : "Save as draft — only you can see it until you publish."}
                </Text>
              </View>
            </Pressable>

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

// ---------------- Import CSV modal ----------------
function ImportCsvModal({
  visible,
  onClose,
  onImported,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
  token: string;
}) {
  const [csv, setCsv] = useState("");
  const [publishAll, setPublishAll] = useState(false);
  const [parsedCount, setParsedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!csv.trim()) {
      setParsedCount(0);
      return;
    }
    try {
      const rows = parseCsv(csv);
      setParsedCount(rows.length);
    } catch {
      setParsedCount(0);
    }
  }, [csv]);

  const submit = async () => {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      Alert.alert("Nothing to import", "Paste a CSV with a header row + at least one data row.");
      return;
    }
    const dances = rows.map((r) => ({
      name: r.name || r.dance || "",
      choreographer: r.choreographer || r.chor || "",
      song: r.song || "",
      artist: r.artist || "",
      difficulty: r.difficulty || r.level || "Beginner",
      bpm: r.bpm ? parseInt(r.bpm) || undefined : undefined,
      count: r.count || r.counts || "",
      youtube_url: r.youtube_url || r.youtube || r.url || "",
      step_sheet: r.step_sheet || r.steps || r.notation || "",
    })).filter((d) => d.name.trim().length > 0);

    if (dances.length === 0) {
      Alert.alert("Missing names", "Every row needs a 'name' column with a value.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.importDances({ dances, publish_all: publishAll }, token);
      Alert.alert(
        "Import complete",
        `Added ${res.imported} dance(s).\nSkipped ${res.skipped_duplicates} duplicate(s).${res.errors.length ? `\n${res.errors.length} row error(s).` : ""}`
      );
      setCsv("");
      setPublishAll(false);
      onImported();
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Could not import");
    } finally {
      setBusy(false);
    }
  };

  const loadSample = () => {
    setCsv(
      "name,choreographer,song,artist,difficulty,bpm,count,youtube_url,step_sheet\n" +
        'Sample Dance A,Erin Brown,Some Country Song,Artist A,Beginner,120,"32 count, 4 wall",,\n' +
        'Sample Dance B,Rob Fowler,Another Track,Artist B,Improver,128,"48 count, 4 wall",,"1-8 Grapevine right..."\n'
    );
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel", "*/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const asset = res.assets[0];
      let content = "";

      if (Platform.OS === "web") {
        // On web the picker returns a File object accessible via fetch(uri)
        const r = await fetch(asset.uri);
        content = await r.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
      if (!content.trim()) {
        Alert.alert("Empty file", "The selected file has no content.");
        return;
      }
      setCsv(content);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not read file");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Import from CSV</Text>
            <Text style={styles.modalSub}>Bulk-add dances to the library</Text>
          </View>
          <Pressable onPress={onClose} testID="close-import">
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
            <View style={styles.legend}>
              <Ionicons name="information-circle" size={16} color={colors.brandSecondary} />
              <Text style={styles.legendText}>
                Paste CSV text with a header row. Recognized columns:{" "}
                <Text style={{ fontWeight: "700" }}>
                  name, choreographer, song, artist, difficulty, bpm, count, youtube_url, step_sheet
                </Text>
                . Only <Text style={{ fontWeight: "700" }}>name</Text> is required. Duplicates (by name) are skipped.
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable
                testID="csv-pick-file"
                onPress={pickFile}
                style={[styles.importBtn, { flex: 1, justifyContent: "center", backgroundColor: colors.brandPrimary + "15" }]}
              >
                <Ionicons name="document-attach-outline" size={14} color={colors.brandPrimary} />
                <Text style={styles.importBtnText}>Choose CSV file</Text>
              </Pressable>
              <Pressable
                testID="csv-load-sample"
                onPress={loadSample}
                style={[styles.importBtn, { flex: 1, justifyContent: "center" }]}
              >
                <Ionicons name="clipboard-outline" size={14} color={colors.brandPrimary} />
                <Text style={styles.importBtnText}>Sample</Text>
              </Pressable>
              <Pressable
                testID="csv-clear"
                onPress={() => setCsv("")}
                style={[styles.importBtn, { justifyContent: "center", paddingHorizontal: 14 }]}
              >
                <Ionicons name="trash-outline" size={14} color={colors.brandPrimary} />
              </Pressable>
            </View>

            <TextInput
              testID="csv-input"
              value={csv}
              onChangeText={setCsv}
              multiline
              placeholder="name,choreographer,song,...\nDance 1,Erin,...,..."
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.editArea, { minHeight: 260 }]}
            />

            <Text style={styles.parsedCount}>
              {parsedCount > 0
                ? `Detected ${parsedCount} row${parsedCount === 1 ? "" : "s"}`
                : "Paste CSV to see a row count"}
            </Text>

            <Pressable
              testID="csv-publish-toggle"
              onPress={() => setPublishAll((v) => !v)}
              style={styles.publishToggle}
            >
              <Ionicons
                name={publishAll ? "checkbox" : "square-outline"}
                size={22}
                color={publishAll ? colors.brandPrimary : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.publishToggleTitle}>
                  Publish everything immediately
                </Text>
                <Text style={styles.publishToggleSub}>
                  {publishAll
                    ? "All imported dances will appear in the public library."
                    : "Save all as drafts — review then publish individually."}
                </Text>
              </View>
            </Pressable>

            <Pressable
              testID="csv-import-submit"
              onPress={submit}
              disabled={busy || parsedCount === 0}
              style={[styles.saveBtn, (busy || parsedCount === 0) && { opacity: 0.5 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>
                  Import {parsedCount > 0 ? `${parsedCount} dance${parsedCount === 1 ? "" : "s"}` : ""}
                </Text>
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
  title: { fontFamily: "serif", fontSize: 26, fontWeight: "700", color: colors.onSurface },
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
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  importBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  dashBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
    backgroundColor: colors.brandTertiary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  dashBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  titleWrap: { flexShrink: 1, minWidth: 0, marginRight: spacing.sm },
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
  legend: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
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
  danceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  diffBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: "700" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "15",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  editBtnText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.success + "15",
    borderWidth: 1,
    borderColor: colors.success,
  },
  publishText: { fontSize: 11, fontWeight: "700" },
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
    minHeight: 180,
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
  ytAutoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    marginTop: -6,
  },
  ytAutoText: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  parsedCount: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: -4,
  },
  publishToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  publishToggleTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  publishToggleSub: { fontSize: 11, color: colors.muted, marginTop: 2 },

  // Chat
  msgRow: { gap: 3 },
  msgAuthor: { fontSize: 11, color: colors.muted, fontWeight: "700", marginLeft: 4 },
  msgBubble: {
    maxWidth: "85%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 2,
  },
  msgBubbleMine: {
    backgroundColor: colors.brandPrimary,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: colors.surfaceSecondary,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgText: { color: colors.onSurface, fontSize: 14, lineHeight: 19 },
  msgTime: { fontSize: 10, marginTop: 2 },
  msgDeleteBtn: {
    padding: 4,
    marginTop: 2,
  },
  chatInput: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  chatField: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    maxHeight: 120,
    minHeight: 42,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  restoreName: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  restoreMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  restorePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  restorePillText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  restoreSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    margin: spacing.lg,
    marginBottom: 0,
  },
  restoreSearchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    paddingVertical: 0,
  },
  restoreCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
    overflow: "hidden",
  },
});

// ---- Restore Deleted Dance modal ----------------------------------------
// Whitelist editors (Erin + Jamin) can bring back any of the 297 dances
// that were removed by the LLM verification pass. Restoring re-inserts the
// dance from the pre-prune backup and removes it from `dance_blocklist.json`.
type RemovedDance = {
  id: string;
  name: string;
  choreographer: string;
  song: string;
  artist: string;
  difficulty: string;
  bpm?: number | null;
  count?: string;
  youtube_url?: string;
  choreographer_country?: string;
};

function RestoreDancesModal({
  visible,
  onClose,
  onRestored,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  onRestored: () => void;
  token: string;
}) {
  const [items, setItems] = useState<RemovedDance[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const rows = await api.listRemovedDances(token);
      setItems(rows as RemovedDance[]);
    } catch (e: any) {
      Alert.alert("Couldn't load", e?.message || "Try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) {
      setQ("");
      load();
    }
  }, [visible, load]);

  const filtered = q.trim()
    ? items.filter((d) => {
        const s = q.toLowerCase();
        return (
          d.name.toLowerCase().includes(s) ||
          (d.choreographer || "").toLowerCase().includes(s) ||
          (d.song || "").toLowerCase().includes(s) ||
          (d.artist || "").toLowerCase().includes(s)
        );
      })
    : items;

  const restore = async (name: string) => {
    setBusyName(name);
    try {
      await api.restoreDanceByName(name, token);
      setItems((prev) => prev.filter((d) => d.name !== name));
      onRestored();
    } catch (e: any) {
      Alert.alert("Couldn't restore", e?.message || "Try again.");
    } finally {
      setBusyName(null);
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
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Restore Removed Dances</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              {items.length} in the archive. Tap Restore to bring any back.
            </Text>
          </View>
          <Pressable onPress={onClose} testID="restore-close">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.restoreSearchWrap}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            testID="restore-search"
            placeholder="Search by dance, song, choreographer…"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.restoreSearchInput}
          />
          <Text style={styles.restoreCountBadge}>{filtered.length}</Text>
        </View>

        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.name}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ padding: spacing.xl, alignItems: "center", gap: spacing.md }}>
                <Ionicons name="checkmark-done" size={40} color={colors.muted} />
                <Text style={{ color: colors.muted, textAlign: "center" }}>
                  {q.trim() ? "No matches for your search." : "Nothing to restore."}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.restoreListRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.restoreName}>{item.name}</Text>
                  <Text style={styles.restoreMeta}>
                    {item.choreographer || "Unknown choreographer"}
                    {item.song ? ` · ${item.song}` : ""}
                    {item.artist ? ` — ${item.artist}` : ""}
                  </Text>
                </View>
                <Pressable
                  testID={`restore-${item.name}`}
                  onPress={() => restore(item.name)}
                  disabled={busyName === item.name}
                  style={[styles.restorePillBtn, busyName === item.name && { opacity: 0.5 }]}
                >
                  {busyName === item.name ? (
                    <ActivityIndicator color={colors.onBrandPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="arrow-undo" size={12} color={colors.onBrandPrimary} />
                      <Text style={styles.restorePillText}>Restore</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
