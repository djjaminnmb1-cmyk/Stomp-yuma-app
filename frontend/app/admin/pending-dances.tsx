/**
 * Admin — Pending Dances queue
 * ----------------------------
 * URL: /admin/pending-dances
 *
 * Lists every user-submitted CopperKnob/BootStepper dance awaiting
 * approval. Admins (and step-sheet editors) can:
 *   • Approve → server creates a real `dances` row using the same
 *     helpers as the direct admin import, credits the submitter.
 *   • Reject → server marks the row rejected with an optional
 *     reason (surfaced back to the user).
 *
 * Tabs: Pending (default) / Approved / Rejected / All — the
 * "Pending" badge shows the current count so admins know there's
 * work to do without opening the screen.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, PendingDance } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";

type Tab = "pending" | "approved" | "rejected" | "all";

const TABS: Tab[] = ["pending", "approved", "rejected", "all"];

export default function AdminPendingDancesScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<PendingDance[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectFor, setRejectFor] = useState<PendingDance | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const isAllowed = !!(user?.is_admin || user?.is_instructor);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token || !isAllowed) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.adminListPendingDances(tab, token);
        setItems(res.items || []);
        setPendingCount(res.pending_count || 0);
      } catch (e: any) {
        Alert.alert(t("admin_pending.error_load"), e?.message || "");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, tab, isAllowed]
  );

  useEffect(() => {
    load();
  }, [load]);

  const setBusy = (id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const approve = async (row: PendingDance) => {
    if (!token) return;
    setBusy(row.id, true);
    try {
      const res = await api.adminApprovePendingDance(row.id, token);
      if (res.already_in_library) {
        Alert.alert(
          t("admin_pending.approve_dup_title"),
          t("admin_pending.approve_dup_body")
        );
      } else {
        Alert.alert(t("admin_pending.approve_ok_title"), row.title);
      }
      await load();
    } catch (e: any) {
      Alert.alert(t("admin_pending.approve_fail"), e?.message || "");
    } finally {
      setBusy(row.id, false);
    }
  };

  const openReject = (row: PendingDance) => {
    setRejectFor(row);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!token || !rejectFor) return;
    setBusy(rejectFor.id, true);
    try {
      await api.adminRejectPendingDance(rejectFor.id, rejectReason.trim(), token);
      setRejectFor(null);
      setRejectReason("");
      await load();
    } catch (e: any) {
      Alert.alert(t("admin_pending.reject_fail"), e?.message || "");
    } finally {
      if (rejectFor) setBusy(rejectFor.id, false);
    }
  };

  if (!isAllowed) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("admin_pending.title")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t("admin_pending.not_allowed")}</Text>
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
        <Text style={styles.headerTitle}>{t("admin_pending.title")}</Text>
        <Pressable onPress={() => load(true)} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Tabs */}
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
                {t(`admin_pending.tab_${k}`)}
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
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>
                {tab === "pending"
                  ? t("admin_pending.empty_pending")
                  : t("admin_pending.empty_generic")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PendingCard
              row={item}
              busy={busyIds.has(item.id)}
              onApprove={() => approve(item)}
              onReject={() => openReject(item)}
              onOpenSource={() => item.url && Linking.openURL(item.url)}
              onOpenDance={() =>
                item.approved_dance_id &&
                router.push(`/dance/${item.approved_dance_id}`)
              }
            />
          )}
        />
      )}

      {/* Rejection reason modal */}
      <Modal
        transparent
        visible={!!rejectFor}
        animationType="fade"
        onRequestClose={() => setRejectFor(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t("admin_pending.reject_modal_title")}
            </Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              {rejectFor?.title}
            </Text>
            <TextInput
              placeholder={t("admin_pending.reject_placeholder")}
              placeholderTextColor={colors.muted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={500}
              style={styles.reasonInput}
              testID="reject-reason"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setRejectFor(null)}
              >
                <Text style={styles.modalBtnSecondaryText}>
                  {t("admin_pending.cancel")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={confirmReject}
                testID="confirm-reject"
              >
                <Text style={styles.modalBtnDangerText}>
                  {t("admin_pending.confirm_reject")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PendingCard({
  row,
  busy,
  onApprove,
  onReject,
  onOpenSource,
  onOpenDance,
}: {
  row: PendingDance;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenSource: () => void;
  onOpenDance: () => void;
}) {
  const src = row.source === "copperknob" ? "CopperKnob" : "BootStepper";
  const submittedAt = row.submitted_at
    ? new Date(row.submitted_at).toLocaleString()
    : "";
  const reviewedAt = row.reviewed_at
    ? new Date(row.reviewed_at).toLocaleString()
    : "";

  return (
    <View style={styles.card} testID={`pending-${row.id}`}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {row.title || t("admin_pending.untitled")}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {t("admin_pending.by")} {row.choreographer || "—"}
            {row.choreographer_country ? ` · ${row.choreographer_country}` : ""}
          </Text>
        </View>
        <View
          style={[
            styles.sourcePill,
            row.source === "copperknob"
              ? styles.sourcePillCK
              : styles.sourcePillBS,
          ]}
        >
          <Text style={styles.sourcePillText}>{src}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {row.level ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{row.level}</Text>
          </View>
        ) : null}
        {row.count ? (
          <Text style={styles.metaText}>{row.count} count</Text>
        ) : null}
        {row.wall ? (
          <Text style={styles.metaText}>{row.wall} wall</Text>
        ) : null}
      </View>

      {row.music ? (
        <Text style={styles.music} numberOfLines={1}>
          <Ionicons name="musical-notes" size={12} color={colors.muted} />{" "}
          {row.music}
        </Text>
      ) : null}

      <View style={styles.submitterRow}>
        <Ionicons name="person-circle-outline" size={14} color={colors.muted} />
        <Text style={styles.submitterText} numberOfLines={1}>
          {row.user_name || row.user_email || "—"}
          {submittedAt ? ` · ${submittedAt}` : ""}
        </Text>
      </View>

      {row.status === "rejected" && row.rejection_reason ? (
        <View style={styles.rejReason}>
          <Text style={styles.rejReasonLabel}>
            {t("admin_pending.rejected_reason")}
          </Text>
          <Text style={styles.rejReasonText}>{row.rejection_reason}</Text>
          {row.reviewed_by_name ? (
            <Text style={styles.rejReasonMeta}>
              {row.reviewed_by_name}
              {reviewedAt ? ` · ${reviewedAt}` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      {row.status === "approved" && row.approved_dance_id ? (
        <View style={styles.approvedRow}>
          <Ionicons name="checkmark-circle" size={16} color="#16803C" />
          <Text style={styles.approvedText}>
            {t("admin_pending.status_approved")}
          </Text>
          {row.reviewed_by_name ? (
            <Text style={styles.approvedMeta}>
              {row.reviewed_by_name}
              {reviewedAt ? ` · ${reviewedAt}` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onOpenSource}
          style={[styles.btn, styles.btnGhost]}
          testID={`open-src-${row.id}`}
        >
          <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
          <Text style={styles.btnGhostText}>
            {t("admin_pending.view_source", { source: src })}
          </Text>
        </Pressable>
        {row.status === "pending" ? (
          <>
            <Pressable
              onPress={onReject}
              style={[styles.btn, styles.btnReject]}
              disabled={busy}
              testID={`reject-${row.id}`}
            >
              <Ionicons name="close" size={14} color="#8A1E1E" />
              <Text style={styles.btnRejectText}>
                {t("admin_pending.reject")}
              </Text>
            </Pressable>
            <Pressable
              onPress={onApprove}
              style={[styles.btn, styles.btnApprove, busy && styles.btnDisabled]}
              disabled={busy}
              testID={`approve-${row.id}`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onBrandPrimary} />
              ) : (
                <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} />
              )}
              <Text style={styles.btnApproveText}>
                {t("admin_pending.approve")}
              </Text>
            </Pressable>
          </>
        ) : row.status === "approved" && row.approved_dance_id ? (
          <Pressable
            onPress={onOpenDance}
            style={[styles.btn, styles.btnPrimary]}
            testID={`open-dance-${row.id}`}
          >
            <Ionicons name="library" size={14} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>
              {t("admin_pending.view_dance")}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
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
  tabText: {
    color: colors.muted,
    fontWeight: "600",
    fontSize: 13,
  },
  tabTextActive: { color: colors.onBrandPrimary },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.muted, fontSize: 14 },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  cardMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sourcePill: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourcePillCK: { backgroundColor: "#B87333" + "22" },
  sourcePillBS: { backgroundColor: "#2A5CAA" + "22" },
  sourcePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#5A3A18",
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.onSurface },
  metaText: { fontSize: 12, color: colors.muted },
  music: { fontSize: 12, color: colors.muted, marginTop: 2 },
  submitterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  submitterText: { fontSize: 11, color: colors.muted, flex: 1 },
  rejReason: {
    marginTop: 8,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#FDE8E8",
    gap: 2,
  },
  rejReasonLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8A1E1E",
    textTransform: "uppercase",
  },
  rejReasonText: { fontSize: 13, color: "#4A0F0F" },
  rejReasonMeta: { fontSize: 10, color: "#8A1E1E", marginTop: 2 },
  approvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  approvedText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16803C",
    flex: 1,
  },
  approvedMeta: { fontSize: 10, color: colors.muted },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 36,
  },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  btnGhostText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  btnApprove: { backgroundColor: "#16803C" },
  btnApproveText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  btnReject: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#8A1E1E",
  },
  btnRejectText: { color: "#8A1E1E", fontWeight: "700", fontSize: 12 },
  btnDisabled: { opacity: 0.6 },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  modalSub: { fontSize: 13, color: colors.muted },
  reasonInput: {
    minHeight: 90,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    textAlignVertical: "top",
    backgroundColor: colors.surfaceSecondary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  modalBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnSecondaryText: { color: colors.onSurface, fontWeight: "700" },
  modalBtnDanger: { backgroundColor: "#8A1E1E" },
  modalBtnDangerText: { color: "#fff", fontWeight: "700" },
});
