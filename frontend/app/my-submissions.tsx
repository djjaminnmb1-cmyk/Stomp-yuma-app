/**
 * My Submissions — /my-submissions
 * --------------------------------
 * The user-facing counterpart to the admin queue. Anyone can see
 * every dance they've submitted from CopperKnob or BootStepper along
 * with its current review status:
 *
 *   • Pending  — waiting for an admin
 *   • Approved — added to the library (button → dance page)
 *   • Rejected — admin's reason is shown inline
 *
 * Also renders a "N of 5 today" quota banner so users know how many
 * more submissions they can send today.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, PendingDance } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { usePendingSubmissions } from "@/src/context/pending-submissions-context";
import { colors, radius, spacing } from "@/src/theme";
import { t } from "@/src/i18n";

type Tab = "all" | "pending" | "approved" | "rejected";

const TABS: Tab[] = ["all", "pending", "approved", "rejected"];

export default function MySubmissionsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { quota, refresh: refreshCtx } = usePendingSubmissions();
  const [items, setItems] = useState<PendingDance[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.getMyPendingDances(token);
        setItems(res.items || []);
        // Keep the shared context (used by the search cards) fresh
        // whenever the user pulls to refresh here.
        if (isRefresh) await refreshCtx();
      } catch {
        // Swallow — the empty state handles it visually.
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, refreshCtx]
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((x) => x.status === tab);
  }, [items, tab]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("my_submissions.title")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("my_submissions.sign_in")}</Text>
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
        <Text style={styles.headerTitle}>{t("my_submissions.title")}</Text>
        <Pressable onPress={() => load(true)} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Quota banner */}
      {quota ? (
        <View
          style={[
            styles.quotaBanner,
            quota.remaining === 0 && styles.quotaBannerFull,
          ]}
        >
          <Ionicons
            name={quota.remaining === 0 ? "alert-circle" : "checkmark-circle"}
            size={18}
            color={quota.remaining === 0 ? "#8A5323" : "#16803C"}
          />
          <Text style={styles.quotaText}>
            {t("my_submissions.quota", {
              used: quota.used,
              limit: quota.limit,
              remaining: quota.remaining,
            })}
          </Text>
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((k) => {
          const active = tab === k;
          return (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              style={[styles.tab, active && styles.tabActive]}
              testID={`tab-${k}`}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t(`my_submissions.tab_${k}`)}
              </Text>
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
          data={filtered}
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
              <Ionicons
                name="cloud-upload-outline"
                size={48}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>
                {tab === "all"
                  ? t("my_submissions.empty_all")
                  : t(`my_submissions.empty_${tab}`)}
              </Text>
              {tab === "all" ? (
                <View style={styles.emptyCtas}>
                  <Pressable
                    onPress={() => router.push("/copperknob/search")}
                    style={[styles.btn, styles.btnPrimary]}
                    testID="cta-search-copperknob"
                  >
                    <Ionicons
                      name="search"
                      size={14}
                      color={colors.onBrandPrimary}
                    />
                    <Text style={styles.btnPrimaryText}>
                      {t("my_submissions.browse_copperknob")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/bootstepper/search")}
                    style={[styles.btn, styles.btnSecondary]}
                    testID="cta-search-bootstepper"
                  >
                    <Ionicons
                      name="search"
                      size={14}
                      color={colors.brandPrimary}
                    />
                    <Text style={styles.btnSecondaryText}>
                      {t("my_submissions.browse_bootstepper")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <SubmissionCard
              row={item}
              onOpenSource={() => item.url && Linking.openURL(item.url)}
              onOpenDance={() =>
                item.approved_dance_id &&
                router.push(`/dance/${item.approved_dance_id}`)
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function SubmissionCard({
  row,
  onOpenSource,
  onOpenDance,
}: {
  row: PendingDance;
  onOpenSource: () => void;
  onOpenDance: () => void;
}) {
  const src = row.source === "copperknob" ? "CopperKnob" : "BootStepper";
  const submittedAt = row.submitted_at
    ? new Date(row.submitted_at).toLocaleDateString()
    : "";

  const statusMeta =
    row.status === "approved"
      ? {
          icon: "checkmark-circle" as const,
          color: "#16803C",
          label: t("my_submissions.status_approved"),
          bg: "#D8F3E4",
          text: "#0F5027",
        }
      : row.status === "rejected"
        ? {
            icon: "close-circle" as const,
            color: "#8A1E1E",
            label: t("my_submissions.status_rejected"),
            bg: "#F8DADA",
            text: "#8A1E1E",
          }
        : {
            icon: "hourglass" as const,
            color: "#8A5323",
            label: t("my_submissions.status_pending"),
            bg: "#F5E4CE",
            text: "#8A5323",
          };

  return (
    <View style={styles.card} testID={`submission-${row.id}`}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {row.title || t("my_submissions.untitled")}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {t("my_submissions.by")} {row.choreographer || "—"}
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

      <View
        style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}
      >
        <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
        <Text style={[styles.statusText, { color: statusMeta.text }]}>
          {statusMeta.label}
        </Text>
        {submittedAt ? (
          <Text style={styles.statusDate}>· {submittedAt}</Text>
        ) : null}
      </View>

      {row.status === "rejected" && row.rejection_reason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>
            {t("my_submissions.reason_label")}
          </Text>
          <Text style={styles.reasonText}>{row.rejection_reason}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onOpenSource}
          style={[styles.btn, styles.btnSecondary]}
          testID={`open-src-${row.id}`}
        >
          <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
          <Text style={styles.btnSecondaryText}>
            {t("my_submissions.view_source", { source: src })}
          </Text>
        </Pressable>
        {row.status === "approved" && row.approved_dance_id ? (
          <Pressable
            onPress={onOpenDance}
            style={[styles.btn, styles.btnPrimary]}
            testID={`open-dance-${row.id}`}
          >
            <Ionicons name="library" size={14} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>
              {t("my_submissions.view_dance")}
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
  quotaBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "#D8F3E4",
  },
  quotaBannerFull: { backgroundColor: "#F5E4CE" },
  quotaText: { flex: 1, fontSize: 12, color: colors.onSurface, fontWeight: "600" },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexWrap: "wrap",
  },
  tab: {
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: "center" },
  emptyCtas: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: "wrap",
    justifyContent: "center",
  },
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
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: 12, fontWeight: "700" },
  statusDate: { fontSize: 11, color: colors.muted, marginLeft: 4 },
  reasonBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: "#FDE8E8",
    gap: 2,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8A1E1E",
    textTransform: "uppercase",
  },
  reasonText: { fontSize: 13, color: "#4A0F0F" },
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
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  btnSecondaryText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
});
