/**
 * Admin Announcements screen — /admin/announcements
 *
 * Admins compose a short "pin" (title + body) and tap "Send" to
 * broadcast a push notification to every opted-in user. The history
 * list below the composer shows every announcement with a tiny
 * trash-can so an admin can retract a mistake.
 *
 * Opt-out: every user controls these via Profile → Notifications →
 * "Admin announcements". The server respects the pref at fan-out time
 * so a muted user still sees nothing, but admins never have to think
 * about recipient targeting.
 *
 * Access: ``POST /admin/announcements`` + ``DELETE /admin/announcements/{id}``
 * are both admin-gated server-side (``require_admin``). The client
 * also hides the entry from the Profile for non-admins — defence in
 * depth, not the authoritative check.
 */
import { useCallback, useEffect, useState } from "react";
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

import { api, Announcement } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export default function AdminAnnouncementsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.listAnnouncements(token, 50);
      setItems(r.items || []);
    } catch {
      // Non-fatal — show empty list, the user can pull-to-refresh.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(async () => {
    if (!token) return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setSendError("Add both a title and a message before sending.");
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      const r = await api.createAnnouncement(token, t, b);
      // Prepend the new row so admins see it at the top immediately —
      // no second GET required.
      if (r.announcement) {
        setItems((prev) => [r.announcement, ...prev]);
      }
      setTitle("");
      setBody("");
      Alert.alert(
        "Announcement sent",
        "Every dancer with Announcements turned on will get a push.",
      );
    } catch (e: any) {
      setSendError(
        e?.message || "Couldn't send — check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [token, title, body]);

  const confirmDelete = useCallback(
    (ann: Announcement) => {
      Alert.alert(
        "Delete announcement?",
        `"${ann.title}" will disappear from everyone's feed. (The push already sent isn't recalled.)`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (!token) return;
              try {
                await api.deleteAnnouncement(token, ann.id);
                setItems((prev) => prev.filter((x) => x.id !== ann.id));
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
    [token],
  );

  // Non-admin fallthrough (shouldn't happen because the Profile hides
  // the entry, but belt-and-braces).
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
            <Text style={styles.sectionLabel}>New announcement</Text>
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

            <Pressable
              testID="ann-send-btn"
              onPress={send}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            >
              {sending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="megaphone"
                    size={18}
                    color={colors.onPrimary}
                  />
                  <Text style={styles.sendBtnText}>Send announcement</Text>
                </>
              )}
            </Pressable>
          </View>

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
          ) : items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="megaphone-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyText}>
                No announcements yet. Your first pin lands here.
              </Text>
            </View>
          ) : (
            items.map((ann) => (
              <View
                key={ann.id}
                style={styles.annRow}
                testID={`ann-row-${ann.id}`}
              >
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.annTitle}>{ann.title}</Text>
                  <Text style={styles.annBody} numberOfLines={6}>
                    {ann.body}
                  </Text>
                  <Text style={styles.annMeta}>
                    {ann.created_by_name || "Admin"} ·{" "}
                    {new Date(ann.created_at).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  testID={`ann-del-${ann.id}`}
                  onPress={() => confirmDelete(ann)}
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
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
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
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
