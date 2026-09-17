/**
 * Admin Moderation Queue — /admin/moderation
 *
 * The unified UGC report queue required by Apple Guideline 1.2.
 * Every report of chat / feed / profile / dance / event lands here.
 *
 * Admin actions per report:
 *   • Remove content (unpublishes / soft-deletes the reported item)
 *   • Warn user
 *   • Suspend user (24h / 7d / 30d)
 *   • Permanent ban
 *   • Dismiss / mark resolved
 *
 * A red badge appears on the "Pending" tab and every report card
 * turns amber → red as it approaches the 24-hour SLA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, ModerationReport } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";

type Tab = "pending" | "actioned" | "dismissed" | "all";
const TABS: Tab[] = ["pending", "actioned", "dismissed", "all"];

const SUSPEND_OPTIONS: { hours: 24 | 168 | 720 | 999999; labelKey: string }[] = [
  { hours: 24, labelKey: "admin_mod.suspend_24h" },
  { hours: 168, labelKey: "admin_mod.suspend_7d" },
  { hours: 720, labelKey: "admin_mod.suspend_30d" },
  { hours: 999999, labelKey: "admin_mod.ban_permanent" },
];

const TARGET_TYPE_LABEL: Record<string, string> = {
  chat: "Chat",
  feed: "Feed",
  profile: "Profile",
  dance: "Dance",
  event: "Event",
  comment: "Comment",
};

export default function AdminModerationScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<ModerationReport[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFor, setActionFor] = useState<ModerationReport | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const isAllowed = !!(user?.is_admin || user?.is_instructor);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token || !isAllowed) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.adminListModerationReports(tab, token);
        setItems(res.items || []);
        setPendingCount(res.pending_count || 0);
      } catch (e: any) {
        Alert.alert(t("admin_mod.error_load"), e?.message || "");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, tab, isAllowed],
  );

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (row: ModerationReport) => {
    if (!token) return;
    try {
      await api.adminPatchModerationReport(row.id, { status: "dismissed" }, token);
      await load();
    } catch (e: any) {
      Alert.alert(t("admin_mod.error_action"), e?.message || "");
    }
  };

  const removeContent = async (row: ModerationReport) => {
    if (!token) return;
    Alert.alert(
      t("admin_mod.confirm_remove_title"),
      t("admin_mod.confirm_remove_body"),
      [
        { text: t("admin_mod.cancel"), style: "cancel" },
        {
          text: t("admin_mod.confirm_remove"),
          style: "destructive",
          onPress: async () => {
            try {
              await api.adminRemoveReportedContent(row.id, token);
              await load();
            } catch (e: any) {
              Alert.alert(t("admin_mod.error_action"), e?.message || "");
            }
          },
        },
      ],
    );
  };

  const suspend = async (row: ModerationReport, hours: 24 | 168 | 720 | 999999) => {
    if (!token || !row.target_user_id) return;
    try {
      if (hours === 999999) {
        await api.adminBanUser(row.target_user_id, suspendReason || "Community Guidelines violation", token);
      } else {
        await api.adminSuspendUser(row.target_user_id, hours, suspendReason || "Community Guidelines violation", token);
      }
      // Also mark the report as actioned so it leaves the queue.
      await api.adminPatchModerationReport(
        row.id,
        {
          status: "actioned",
          admin_note: `${hours === 999999 ? "banned" : `suspended_${hours}h`}${suspendReason ? `: ${suspendReason}` : ""}`,
        },
        token,
      );
      setActionFor(null);
      setSuspendReason("");
      await load();
    } catch (e: any) {
      Alert.alert(t("admin_mod.error_action"), e?.message || "");
    }
  };

  const warn = async (row: ModerationReport) => {
    if (!token || !row.target_user_id) return;
    Alert.prompt?.(
      t("admin_mod.warn_title"),
      t("admin_mod.warn_body"),
      async (reason?: string) => {
        if (!reason) return;
        try {
          await api.adminWarnUser(row.target_user_id!, reason, token);
          await api.adminPatchModerationReport(
            row.id,
            { status: "actioned", admin_note: `warned: ${reason}` },
            token,
          );
          await load();
        } catch (e: any) {
          Alert.alert(t("admin_mod.error_action"), e?.message || "");
        }
      },
      "plain-text",
    );
  };

  if (!isAllowed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("admin_mod.title")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("admin_mod.not_allowed")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("admin_mod.title")}</Text>
        <Pressable onPress={() => load(true)} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((k) => {
          const active = tab === k;
          const showBadge = k === "pending" && pendingCount > 0;
          return (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              style={[styles.tab, active && styles.tabActive]}
              testID={`tab-${k}`}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t(`admin_mod.tab_${k}`)}
              </Text>
              {showBadge ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.brandPrimary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="shield-checkmark-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>{t("admin_mod.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReportCard
              row={item}
              onDismiss={() => dismiss(item)}
              onRemove={() => removeContent(item)}
              onWarn={() => warn(item)}
              onSuspend={() => setActionFor(item)}
              onOpenUser={() =>
                item.target_user_id &&
                router.push(`/users/${item.target_user_id}`)
              }
            />
          )}
        />
      )}

      {/* Suspend / Ban action sheet */}
      <Modal
        transparent
        visible={!!actionFor}
        animationType="slide"
        onRequestClose={() => setActionFor(null)}
      >
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>
            <Text style={styles.sheetTitle}>
              {t("admin_mod.suspend_title")}
            </Text>
            <Text style={styles.sheetSub}>
              {actionFor?.target_user_id
                ? t("admin_mod.suspend_body", { name: actionFor?.reporter_name || "" })
                : t("admin_mod.no_target_user")}
            </Text>
            <TextInput
              placeholder={t("admin_mod.reason_placeholder")}
              placeholderTextColor={colors.muted}
              value={suspendReason}
              onChangeText={setSuspendReason}
              maxLength={500}
              style={styles.reasonInput}
              testID="suspend-reason"
            />
            {actionFor?.target_user_id ? (
              <ScrollView style={{ maxHeight: 260 }}>
                {SUSPEND_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.hours}
                    onPress={() => actionFor && suspend(actionFor, opt.hours)}
                    style={[
                      styles.sheetRow,
                      opt.hours === 999999 && styles.sheetRowDanger,
                    ]}
                    testID={`suspend-${opt.hours}`}
                  >
                    <Ionicons
                      name={
                        opt.hours === 999999 ? "close-circle" : "time-outline"
                      }
                      size={20}
                      color={opt.hours === 999999 ? "#8A1E1E" : colors.brandPrimary}
                    />
                    <Text
                      style={[
                        styles.sheetRowText,
                        opt.hours === 999999 && styles.sheetRowTextDanger,
                      ]}
                    >
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => {
                setActionFor(null);
                setSuspendReason("");
              }}
              testID="suspend-cancel"
            >
              <Text style={styles.btnGhostText}>{t("admin_mod.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ReportCard({
  row,
  onDismiss,
  onRemove,
  onWarn,
  onSuspend,
  onOpenUser,
}: {
  row: ModerationReport;
  onDismiss: () => void;
  onRemove: () => void;
  onWarn: () => void;
  onSuspend: () => void;
  onOpenUser: () => void;
}) {
  const elapsed = row.elapsed_seconds ?? 0;
  const hoursElapsed = elapsed / 3600;
  const isPending = row.status === "pending";
  const urgent = isPending && hoursElapsed >= 20;
  const stale = isPending && hoursElapsed >= 24;

  const reportedAt = row.reported_at
    ? new Date(row.reported_at).toLocaleString()
    : "";

  const elapsedLabel = useMemo(() => {
    if (!isPending) return "";
    if (hoursElapsed < 1) return `${Math.floor(elapsed / 60)}m`;
    if (hoursElapsed < 24) return `${Math.floor(hoursElapsed)}h`;
    return `${Math.floor(hoursElapsed / 24)}d`;
  }, [elapsed, hoursElapsed, isPending]);

  return (
    <View
      style={[
        styles.card,
        urgent && styles.cardUrgent,
        stale && styles.cardStale,
      ]}
      testID={`report-${row.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>
            {TARGET_TYPE_LABEL[row.target_type] || row.target_type}
          </Text>
        </View>
        <View style={styles.reasonBadge}>
          <Ionicons name="flag" size={12} color="#8A1E1E" />
          <Text style={styles.reasonBadgeText}>{row.reason}</Text>
        </View>
        {isPending ? (
          <View
            style={[
              styles.slaBadge,
              urgent && styles.slaBadgeUrgent,
              stale && styles.slaBadgeStale,
            ]}
          >
            <Ionicons
              name="time-outline"
              size={11}
              color={stale ? "#fff" : urgent ? "#fff" : colors.muted}
            />
            <Text
              style={[
                styles.slaBadgeText,
                (urgent || stale) && styles.slaBadgeTextInverse,
              ]}
            >
              {elapsedLabel}
            </Text>
          </View>
        ) : (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{row.status}</Text>
          </View>
        )}
      </View>

      {row.content_snapshot ? (
        <View style={styles.snapshot}>
          <Text style={styles.snapshotText} numberOfLines={4}>
            "{row.content_snapshot}"
          </Text>
        </View>
      ) : null}

      {row.note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>{t("admin_mod.reporter_note")}</Text>
          <Text style={styles.noteText}>{row.note}</Text>
        </View>
      ) : null}

      <Text style={styles.metaLine} numberOfLines={2}>
        {t("admin_mod.reported_by", { name: row.reporter_name || row.reporter_email })}
        {reportedAt ? ` · ${reportedAt}` : ""}
      </Text>

      {row.admin_note ? (
        <Text style={styles.adminNote}>
          {t("admin_mod.admin_action_prefix")} {row.admin_note}
        </Text>
      ) : null}

      {isPending ? (
        <View style={styles.actions}>
          <Pressable onPress={onOpenUser} style={[styles.actBtn, styles.actGhost]} testID={`open-user-${row.id}`}>
            <Ionicons name="person-circle-outline" size={14} color={colors.brandPrimary} />
            <Text style={styles.actGhostText}>{t("admin_mod.view_user")}</Text>
          </Pressable>
          <Pressable onPress={onDismiss} style={[styles.actBtn, styles.actGhost]} testID={`dismiss-${row.id}`}>
            <Ionicons name="close" size={14} color={colors.brandPrimary} />
            <Text style={styles.actGhostText}>{t("admin_mod.dismiss")}</Text>
          </Pressable>
          <Pressable onPress={onWarn} style={[styles.actBtn, styles.actWarn]} testID={`warn-${row.id}`}>
            <Ionicons name="warning-outline" size={14} color="#8A5323" />
            <Text style={styles.actWarnText}>{t("admin_mod.warn")}</Text>
          </Pressable>
          <Pressable onPress={onRemove} style={[styles.actBtn, styles.actDanger]} testID={`remove-${row.id}`}>
            <Ionicons name="trash" size={14} color="#fff" />
            <Text style={styles.actDangerText}>{t("admin_mod.remove_content")}</Text>
          </Pressable>
          <Pressable onPress={onSuspend} style={[styles.actBtn, styles.actDanger]} testID={`suspend-${row.id}`}>
            <Ionicons name="ban" size={14} color="#fff" />
            <Text style={styles.actDangerText}>{t("admin_mod.suspend_user")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexWrap: "wrap",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  tabText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: colors.onBrandPrimary },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 14 },
  listContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  cardUrgent: { borderLeftColor: "#F59E0B" },
  cardStale: { borderLeftColor: "#DC2626" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  typeBadge: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  typeBadgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 10, letterSpacing: 0.3 },
  reasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: "#FDE8E8",
  },
  reasonBadgeText: { color: "#8A1E1E", fontWeight: "700", fontSize: 10, textTransform: "uppercase" },
  slaBadge: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slaBadgeUrgent: { backgroundColor: "#F59E0B", borderColor: "#F59E0B" },
  slaBadgeStale: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  slaBadgeText: { color: colors.muted, fontWeight: "700", fontSize: 11 },
  slaBadgeTextInverse: { color: "#fff" },
  statusPill: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusPillText: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  snapshot: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.brandPrimary,
  },
  snapshotText: { color: colors.onSurface, fontSize: 13, fontStyle: "italic", lineHeight: 18 },
  noteBox: { padding: 6 },
  noteLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  noteText: { color: colors.onSurface, fontSize: 13 },
  metaLine: { color: colors.muted, fontSize: 11 },
  adminNote: { color: colors.muted, fontSize: 11, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 34,
  },
  actGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  actGhostText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 11 },
  actWarn: { backgroundColor: "#F5E4CE", borderWidth: 1, borderColor: "#E1BB86" },
  actWarnText: { color: "#8A5323", fontWeight: "700", fontSize: 11 },
  actDanger: { backgroundColor: "#8A1E1E" },
  actDangerText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  // Suspend action sheet styles
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
  },
  handleWrap: { alignItems: "center", paddingBottom: 6 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  reasonInput: {
    marginTop: spacing.sm,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    minHeight: 50,
    fontSize: 14,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  sheetRowDanger: { backgroundColor: "#FDE8E8" },
  sheetRowText: { flex: 1, color: colors.onSurface, fontWeight: "700" },
  sheetRowTextDanger: { color: "#8A1E1E" },
  btn: {
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.onSurface, fontWeight: "700" },
});
