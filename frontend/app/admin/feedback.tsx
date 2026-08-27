/**
 * Admin Feedback screen — /admin/feedback
 *
 * Lists every feedback / bug report with the client diagnostics
 * (OTA update id, channel, app version, platform) attached so admins
 * can jump straight to the bundle a dancer was on when they hit a
 * bug. Filter by status + category. Tap a row to open a detail modal
 * with the full message and admin actions.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type FeedbackItem = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  category: string;
  message: string;
  screen: string;
  context: Record<string, unknown>;
  diagnostics: Record<string, string>;
  status: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_EMOJI: Record<string, string> = {
  bug: "🐞",
  feature_request: "💡",
  content_error: "📝",
  instructor_help: "🎓",
  other: "💬",
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "wontfix", label: "Won't fix" },
  { key: "", label: "All" },
];

export default function AdminFeedbackScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await api.listFeedback(token, {
        status: status || undefined,
        limit: 100,
      });
      setItems(r.items || []);
      setCounts(r.counts || {});
    } catch (e: any) {
      Alert.alert("Couldn't load feedback", e?.message || "Try again.");
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.title}>Admins only</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          testID="admin-feedback-back"
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Feedback</Text>
          <Text style={styles.subtitle}>
            {counts.open || 0} open · {counts.in_progress || 0} in progress ·{" "}
            {counts.resolved || 0} resolved
          </Text>
        </View>
        <Pressable onPress={load} style={styles.iconBtn} testID="admin-feedback-refresh">
          <Ionicons name="refresh" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {STATUS_TABS.map((tab) => {
          const active = tab.key === status;
          return (
            <Pressable
              key={tab.key || "all"}
              onPress={() => setStatus(tab.key)}
              style={[styles.tab, active && styles.tabActive]}
              testID={`admin-feedback-tab-${tab.key || "all"}`}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={44} color={colors.muted} />
          <Text style={styles.emptyTitle}>Inbox zero</Text>
          <Text style={styles.emptySub}>No feedback in this filter.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.md, gap: 8 }}
          renderItem={({ item }) => (
            <FeedbackRow item={item} onPress={() => setSelected(item)} />
          )}
        />
      )}

      <FeedbackDetail
        item={selected}
        token={token || ""}
        onClose={() => setSelected(null)}
        onChanged={(updated) => {
          setSelected(updated);
          setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }}
      />
    </SafeAreaView>
  );
}

function FeedbackRow({
  item,
  onPress,
}: {
  item: FeedbackItem;
  onPress: () => void;
}) {
  const emoji = CATEGORY_EMOJI[item.category] || "💬";
  const dt = new Date(item.created_at);
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      testID={`admin-feedback-row-${item.id}`}
    >
      <Text style={styles.rowEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.user_name || item.user_email || "Someone"}
          </Text>
          <Text style={styles.rowTime}>
            {isNaN(dt.getTime()) ? "" : dt.toLocaleDateString()}
          </Text>
        </View>
        <Text style={styles.rowMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>
            {item.diagnostics?.ota_channel || "embedded"} ·{" "}
            {item.diagnostics?.ota_update_id
              ? item.diagnostics.ota_update_id.slice(0, 8)
              : "no OTA"}{" "}
            · v{item.diagnostics?.app_version || "—"}
          </Text>
          <StatusPill status={item.status} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    open: { bg: colors.brandPrimary + "22", fg: colors.brandPrimary, label: "OPEN" },
    in_progress: { bg: colors.warning + "22", fg: colors.warning, label: "IN PROGRESS" },
    resolved: { bg: colors.success + "22", fg: colors.success, label: "RESOLVED" },
    wontfix: { bg: colors.muted + "22", fg: colors.muted, label: "WON'T FIX" },
  };
  const p = map[status] || map.open;
  return (
    <View style={[styles.pill, { backgroundColor: p.bg }]}>
      <Text style={[styles.pillText, { color: p.fg }]}>{p.label}</Text>
    </View>
  );
}

function FeedbackDetail({
  item,
  token,
  onClose,
  onChanged,
}: {
  item: FeedbackItem | null;
  token: string;
  onClose: () => void;
  onChanged: (i: FeedbackItem) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setNote(item.admin_note || "");
  }, [item]);

  const diag = useMemo(() => item?.diagnostics || {}, [item]);

  if (!item) return null;

  const setStatus = async (s: FeedbackItem["status"]) => {
    if (!token) return;
    setSaving(true);
    try {
      const r = await api.patchFeedback(token, item.id, {
        status: s as any,
        admin_note: note,
      });
      onChanged(r.feedback);
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {CATEGORY_EMOJI[item.category] || "💬"} {item.category.replace("_", " ")}
              </Text>
              <Text style={styles.subtitle}>
                From {item.user_name || item.user_email || "Anon"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            <View style={styles.msgBox}>
              <Text style={styles.msgText}>{item.message}</Text>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Diagnostics</Text>
              <View style={styles.diagBox}>
                <Text style={styles.diagLine}>
                  App v{diag.app_version || "—"} (build {diag.build_number || "—"})
                </Text>
                <Text style={styles.diagLine}>
                  Platform: {diag.platform || "—"} {diag.os_version || ""}
                </Text>
                <Text style={styles.diagLine}>
                  SDK: {diag.sdk_version || "—"} · Runtime: {diag.runtime_version || "—"}
                </Text>
                <Text style={styles.diagLine}>
                  OTA channel: {diag.ota_channel || "embedded"}
                </Text>
                <Text style={styles.diagLine}>
                  Update id: {diag.ota_update_id || "— (embedded launch)"}
                </Text>
                <Text style={styles.diagLine}>
                  Screen: {item.screen || "—"}
                </Text>
              </View>
            </View>

            <View>
              <Text style={styles.sectionTitle}>Admin note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Notes visible only to admins…"
                placeholderTextColor={colors.muted}
                style={styles.textarea}
              />
            </View>
          </ScrollView>

          <View style={styles.actionsRow}>
            <StatusBtn
              label="Open"
              active={item.status === "open"}
              disabled={saving}
              onPress={() => setStatus("open")}
            />
            <StatusBtn
              label="In progress"
              active={item.status === "in_progress"}
              disabled={saving}
              onPress={() => setStatus("in_progress")}
            />
            <StatusBtn
              label="Resolved"
              active={item.status === "resolved"}
              disabled={saving}
              onPress={() => setStatus("resolved")}
              tint={colors.success}
            />
            <StatusBtn
              label="Won't fix"
              active={item.status === "wontfix"}
              disabled={saving}
              onPress={() => setStatus("wontfix")}
              tint={colors.muted}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatusBtn({
  label,
  active,
  disabled,
  onPress,
  tint,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  tint?: string;
}) {
  const bg = active ? tint || colors.brandPrimary : colors.surfaceSecondary;
  const fg = active ? colors.onBrandPrimary : colors.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.statusBtn, { backgroundColor: bg, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={[styles.statusBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfacePrimary },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  title: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  tabsRow: { padding: spacing.md, gap: 6, alignItems: "center" },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary,
  },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  tabTextActive: { color: colors.onBrandPrimary },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 4,
  },
  emptySub: { color: colors.muted, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowEmoji: { fontSize: 22 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowName: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  rowTime: { color: colors.muted, fontSize: 11 },
  rowMessage: {
    color: colors.onSurface,
    fontSize: 13,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  rowMetaText: {
    color: colors.muted,
    fontSize: 10,
    flex: 1,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "88%",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  msgBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 13,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: 6,
  },
  diagBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diagLine: { color: colors.onSurface, fontSize: 11, marginVertical: 1 },
  textarea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlignVertical: "top",
  },
  actionsRow: {
    flexDirection: "row",
    padding: spacing.md,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBtnText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
