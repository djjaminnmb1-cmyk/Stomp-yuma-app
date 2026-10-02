/**
 * Admin Announcements screen — /admin/announcements
 *
 * Admins compose a short "pin" (title + body) and tap either:
 *   • "Send now"           — broadcast a push immediately, OR
 *   • "Schedule for later" — pick a future date/time; the backend
 *                            scheduler fires the push at that minute.
 *
 * Two history lists sit below the composer:
 *   • Scheduled (editable + cancellable) — surfaces upcoming drafts.
 *   • Sent (deletable; retract clears the row but doesn't recall the
 *     push already received on dancers' phones).
 *
 * Access is admin-gated server-side (``require_admin``) on every
 * mutating endpoint; the client additionally hides non-admins with a
 * lock-screen fallback.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { api, Announcement, AnnouncementAudience } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { AudiencePicker } from "@/src/components/AudiencePicker";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

type Mode = "now" | "schedule";

function formatSchedule(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}


function audienceLabel(a: AnnouncementAudience | null | undefined): string {
  if (!a || a.scope === "everyone") return "Everyone";
  const parts: string[] = [];
  const insts = a.instructor_user_ids?.length ?? 0;
  const tiers = a.difficulty_tiers?.length ?? 0;
  if (insts > 0) parts.push(`${insts} inst.`);
  if (tiers > 0) parts.push(a.difficulty_tiers!.join(", "));
  return parts.length > 0 ? parts.join(" · ") : "Everyone";
}


function AudienceTag({
  audience,
}: {
  audience?: AnnouncementAudience | null;
}) {
  const label = audienceLabel(audience);
  const custom = audience && audience.scope === "custom";
  return (
    <View style={[styles.audTag, custom && styles.audTagCustom]}>
      <Ionicons
        name={custom ? "funnel" : "people"}
        size={10}
        color={custom ? colors.brandPrimary : colors.muted}
      />
      <Text
        style={[styles.audTagText, custom && styles.audTagTextCustom]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}


export default function AdminAnnouncementsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [sentItems, setSentItems] = useState<Announcement[]>([]);
  const [scheduledItems, setScheduledItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<Mode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    // Default to "an hour from now" so the picker lands on a sensible
    // future slot rather than "same minute" which would broadcast
    // immediately anyway.
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Audience state — defaults to "everyone". Preserved on edit so
  // tapping the pencil on a scheduled pin re-loads whatever filter
  // was on it.
  const [audience, setAudience] = useState<AnnouncementAudience>(
    { scope: "everyone" },
  );

  // Edit state — null = creating new; set = editing existing scheduled
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sent, scheduled] = await Promise.all([
        api.listAnnouncements(token, 50),
        api.listScheduledAnnouncements(token).catch(() => ({ items: [] })),
      ]);
      setSentItems(sent.items || []);
      setScheduledItems(scheduled.items || []);
    } catch {
      // Non-fatal — show whatever we have.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const resetComposer = useCallback(() => {
    setTitle("");
    setBody("");
    setMode("now");
    setEditingId(null);
    setAudience({ scope: "everyone" });
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    setScheduledAt(d);
    setSendError(null);
  }, []);

  const beginEdit = useCallback((ann: Announcement) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setBody(ann.body);
    setMode("schedule");
    if (ann.scheduled_for) {
      try {
        setScheduledAt(new Date(ann.scheduled_for));
      } catch {
        // keep default
      }
    }
    // Restore the saved audience so an edit doesn't silently widen
    // the fan-out from "Erin's followers" to "everyone".
    if (ann.audience) {
      setAudience({
        scope: ann.audience.scope ?? "everyone",
        instructor_user_ids: ann.audience.instructor_user_ids ?? [],
        difficulty_tiers: ann.audience.difficulty_tiers ?? [],
      });
    } else {
      setAudience({ scope: "everyone" });
    }
    setSendError(null);
  }, []);

  const scheduledInPast = useMemo(() => {
    if (mode !== "schedule") return false;
    return scheduledAt.getTime() <= Date.now();
  }, [mode, scheduledAt]);

  const send = useCallback(async () => {
    if (!token) return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setSendError("Add both a title and a message before sending.");
      return;
    }
    if (mode === "schedule" && scheduledInPast) {
      setSendError(
        "Pick a time in the future, or switch to Send now.",
      );
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      const sched =
        mode === "schedule" ? scheduledAt.toISOString() : null;

      if (editingId) {
        // Patching an existing scheduled draft.
        const r = await api.updateAnnouncement(token, editingId, {
          title: t,
          body: b,
          scheduled_for: sched,
          audience,
        });
        if (r.announcement) {
          setScheduledItems((prev) =>
            prev.map((x) =>
              x.id === editingId ? r.announcement : x,
            ),
          );
        }
        Alert.alert("Scheduled pin updated");
        resetComposer();
        return;
      }

      const r = await api.createAnnouncement(token, t, b, sched, audience);
      const newAnn = r.announcement;
      if (newAnn) {
        if (newAnn.broadcasted_at) {
          // Immediate send — prepend to sent list.
          setSentItems((prev) => [newAnn, ...prev]);
          Alert.alert(
            "Announcement sent",
            "Every dancer with Announcements turned on will get a push.",
          );
        } else {
          // Scheduled — prepend to scheduled list, sorted by soonest.
          setScheduledItems((prev) =>
            [newAnn, ...prev].sort((a, b) =>
              (a.scheduled_for || "").localeCompare(b.scheduled_for || ""),
            ),
          );
          Alert.alert(
            "Pin scheduled",
            `Your announcement will go out ${formatSchedule(
              newAnn.scheduled_for,
            )}.`,
          );
        }
      }
      resetComposer();
    } catch (e: any) {
      setSendError(
        e?.message || "Couldn't send — check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [
    token,
    title,
    body,
    mode,
    scheduledAt,
    scheduledInPast,
    editingId,
    audience,
    resetComposer,
  ]);

  const confirmDelete = useCallback(
    (ann: Announcement, isScheduled: boolean) => {
      Alert.alert(
        isScheduled ? "Cancel scheduled pin?" : "Delete announcement?",
        isScheduled
          ? `"${ann.title}" will NOT be sent. Dancers never see it.`
          : `"${ann.title}" will disappear from everyone's feed. (The push already sent isn't recalled.)`,
        [
          { text: "Keep", style: "cancel" },
          {
            text: isScheduled ? "Cancel pin" : "Delete",
            style: "destructive",
            onPress: async () => {
              if (!token) return;
              try {
                await api.deleteAnnouncement(token, ann.id);
                if (isScheduled) {
                  setScheduledItems((prev) =>
                    prev.filter((x) => x.id !== ann.id),
                  );
                } else {
                  setSentItems((prev) => prev.filter((x) => x.id !== ann.id));
                }
                // If we were editing this one, clear the composer.
                if (editingId === ann.id) resetComposer();
              } catch (e: any) {
                Alert.alert(
                  "Couldn't delete",
                  e?.message ||
                    "Server was unreachable. Try again in a moment.",
                );
              }
            },
          },
        ],
      );
    },
    [token, editingId, resetComposer],
  );

  // Non-admin fallthrough.
  if (user && !user.is_admin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.headerBar}>
          <Pressable
            testID="ann-back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/profile");
            }}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.onSurface}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Announcements</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Admins only</Text>
          <Text style={styles.errorBody}>
            Only Stompin&apos; Ground Yuma admins can send announcements.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const titleRemaining = TITLE_MAX - title.length;
  const bodyRemaining = BODY_MAX - body.length;
  const canSend =
    !sending && title.trim().length > 0 && body.trim().length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="ann-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile");
          }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Announcements</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 72 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.composer} testID="ann-composer">
            <Text style={styles.sectionLabel}>
              {editingId ? "Edit scheduled pin" : "New announcement"}
            </Text>
            <Text style={styles.helper}>
              Everyone with &quot;Announcements&quot; on in their notification
              settings will receive a push.
            </Text>

            <TextInput
              testID="ann-title-input"
              style={styles.titleInput}
              placeholder="Short title (e.g. 'July 4th class moved to Friday')"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
              returnKeyType="next"
              maxLength={TITLE_MAX}
            />
            <Text style={styles.counter}>{titleRemaining} chars left</Text>

            <TextInput
              testID="ann-body-input"
              style={styles.bodyInput}
              placeholder="Full message — what you want everyone to know"
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
              multiline
              textAlignVertical="top"
              maxLength={BODY_MAX}
            />
            <Text style={styles.counter}>{bodyRemaining} chars left</Text>

            {/* Mode picker */}
            <View style={styles.modeRow} testID="ann-mode-picker">
              <Pressable
                testID="ann-mode-now"
                onPress={() => setMode("now")}
                style={[
                  styles.modeBtn,
                  mode === "now" && styles.modeBtnActive,
                ]}
              >
                <Ionicons
                  name="flash"
                  size={14}
                  color={
                    mode === "now"
                      ? colors.onBrandPrimary
                      : colors.onSurface
                  }
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "now" && styles.modeBtnTextActive,
                  ]}
                >
                  Send now
                </Text>
              </Pressable>
              <Pressable
                testID="ann-mode-schedule"
                onPress={() => setMode("schedule")}
                style={[
                  styles.modeBtn,
                  mode === "schedule" && styles.modeBtnActive,
                ]}
              >
                <Ionicons
                  name="time"
                  size={14}
                  color={
                    mode === "schedule"
                      ? colors.onBrandPrimary
                      : colors.onSurface
                  }
                />
                <Text
                  style={[
                    styles.modeBtnText,
                    mode === "schedule" && styles.modeBtnTextActive,
                  ]}
                >
                  Schedule for later
                </Text>
              </Pressable>
            </View>

            {/* Date/time pickers only visible when scheduling */}
            {mode === "schedule" ? (
              <View style={styles.schedulePickers} testID="ann-schedule-pickers">
                <Pressable
                  testID="ann-schedule-date"
                  style={styles.datePill}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons
                    name="calendar"
                    size={16}
                    color={colors.brandPrimary}
                  />
                  <Text style={styles.datePillText}>
                    {scheduledAt.toLocaleDateString()}
                  </Text>
                </Pressable>
                <Pressable
                  testID="ann-schedule-time"
                  style={styles.datePill}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Ionicons
                    name="time"
                    size={16}
                    color={colors.brandPrimary}
                  />
                  <Text style={styles.datePillText}>
                    {scheduledAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </Pressable>
                {scheduledInPast ? (
                  <Text style={styles.pastWarn}>
                    ⚠ This time is in the past.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {showDatePicker && (
              <DateTimePicker
                value={scheduledAt}
                mode="date"
                minimumDate={new Date()}
                onChange={(ev, selected) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selected) {
                    const next = new Date(scheduledAt);
                    next.setFullYear(
                      selected.getFullYear(),
                      selected.getMonth(),
                      selected.getDate(),
                    );
                    setScheduledAt(next);
                  }
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={scheduledAt}
                mode="time"
                onChange={(ev, selected) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (selected) {
                    const next = new Date(scheduledAt);
                    next.setHours(
                      selected.getHours(),
                      selected.getMinutes(),
                      0,
                      0,
                    );
                    setScheduledAt(next);
                  }
                }}
              />
            )}

            {/* Audience picker — Everyone / Followers / Difficulty.
                Lives below the schedule picker so admins fix WHEN
                first, then WHO. */}
            <AudiencePicker value={audience} onChange={setAudience} />

            {sendError ? (
              <View style={styles.errBanner} testID="ann-send-error">
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={colors.error}
                />
                <Text style={styles.errBannerText}>{sendError}</Text>
              </View>
            ) : null}

            <View style={styles.sendBtnRow}>
              {editingId ? (
                <Pressable
                  testID="ann-cancel-edit"
                  onPress={resetComposer}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel edit</Text>
                </Pressable>
              ) : null}
              <Pressable
                testID="ann-send-btn"
                onPress={send}
                disabled={!canSend}
                style={[
                  styles.sendBtn,
                  !canSend && styles.sendBtnDisabled,
                  editingId ? { flex: 1 } : {},
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons
                      name={
                        editingId
                          ? "save"
                          : mode === "schedule"
                            ? "time"
                            : "megaphone"
                      }
                      size={18}
                      color={colors.onPrimary}
                    />
                    <Text style={styles.sendBtnText}>
                      {editingId
                        ? "Save changes"
                        : mode === "schedule"
                          ? "Schedule pin"
                          : "Send announcement"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Scheduled section */}
          {scheduledItems.length > 0 ? (
            <>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionLabel}>
                  Scheduled ({scheduledItems.length})
                </Text>
              </View>
              {scheduledItems.map((ann) => (
                <View
                  key={ann.id}
                  style={[styles.annRow, styles.scheduledRow]}
                  testID={`ann-scheduled-${ann.id}`}
                >
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <View style={styles.scheduledHeaderRow}>
                      <Ionicons
                        name="time"
                        size={14}
                        color={colors.brandPrimary}
                      />
                      <Text style={styles.scheduledWhen}>
                        {formatSchedule(ann.scheduled_for)}
                      </Text>
                      <AudienceTag audience={ann.audience} />
                    </View>
                    <Text style={styles.annTitle}>{ann.title}</Text>
                    <Text style={styles.annBody} numberOfLines={4}>
                      {ann.body}
                    </Text>
                  </View>
                  <View style={styles.rowActionsCol}>
                    <Pressable
                      testID={`ann-edit-${ann.id}`}
                      onPress={() => beginEdit(ann)}
                      hitSlop={10}
                      style={styles.actionBtn}
                    >
                      <Ionicons
                        name="pencil"
                        size={16}
                        color={colors.brandPrimary}
                      />
                    </Pressable>
                    <Pressable
                      testID={`ann-sched-del-${ann.id}`}
                      onPress={() => confirmDelete(ann, true)}
                      hitSlop={10}
                      style={styles.actionBtn}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={colors.error}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          {/* Sent section */}
          <View style={styles.historyHeader}>
            <Text style={styles.sectionLabel}>Recent announcements</Text>
            <Pressable
              testID="ann-refresh"
              onPress={load}
              hitSlop={10}
              style={styles.refreshBtn}
            >
              <Ionicons name="refresh" size={18} color={colors.brandPrimary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : sentItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons
                name="megaphone-outline"
                size={32}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>
                No announcements yet. Your first pin lands here.
              </Text>
            </View>
          ) : (
            sentItems.map((ann) => (
              <View
                key={ann.id}
                style={styles.annRow}
                testID={`ann-row-${ann.id}`}
              >
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <View style={styles.sentHeaderRow}>
                    <AudienceTag audience={ann.audience} />
                  </View>
                  <Text style={styles.annTitle}>{ann.title}</Text>
                  <Text style={styles.annBody} numberOfLines={6}>
                    {ann.body}
                  </Text>
                  <Text style={styles.annMeta}>
                    {ann.created_by_name || "Admin"} ·{" "}
                    {new Date(
                      ann.broadcasted_at || ann.created_at,
                    ).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  testID={`ann-del-${ann.id}`}
                  onPress={() => confirmDelete(ann, false)}
                  hitSlop={10}
                  style={styles.deleteBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.error}
                  />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.onSurface,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    minHeight: 160,
  },
  errorTitle: {
    marginTop: spacing.md,
    fontSize: 16,
    fontWeight: "600",
    color: colors.onSurface,
  },
  errorBody: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 320,
  },
  composer: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  helper: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.onSurface,
  },
  bodyInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    minHeight: 140,
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 12,
    color: colors.muted,
    marginTop: -spacing.xs,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  modeBtnActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  modeBtnText: {
    fontWeight: "700",
    fontSize: 13,
    color: colors.onSurface,
  },
  modeBtnTextActive: {
    color: colors.onBrandPrimary,
  },
  schedulePickers: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "14",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "40",
  },
  datePillText: {
    color: colors.onSurface,
    fontWeight: "600",
    fontSize: 13,
  },
  pastWarn: {
    marginLeft: spacing.xs,
    fontSize: 12,
    color: colors.error,
    fontWeight: "600",
    width: "100%",
  },
  errBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.error}20`,
    borderWidth: 1,
    borderColor: `${colors.error}60`,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  errBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
  },
  sendBtnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  cancelBtnText: {
    fontWeight: "700",
    fontSize: 14,
    color: colors.onSurface,
  },
  sendBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: colors.onPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 260,
  },
  annRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  scheduledRow: {
    backgroundColor: colors.brandPrimary + "0A",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
  },
  scheduledHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  sentHeaderRow: {
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  audTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    marginLeft: 4,
    maxWidth: 180,
  },
  audTagCustom: {
    backgroundColor: colors.brandPrimary + "14",
  },
  audTagText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "700",
  },
  audTagTextCustom: {
    color: colors.brandPrimary,
  },
  scheduledWhen: {
    fontSize: 12,
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  annTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 4,
  },
  annBody: {
    fontSize: 14,
    color: colors.onSurface,
    lineHeight: 20,
  },
  annMeta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  rowActionsCol: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
