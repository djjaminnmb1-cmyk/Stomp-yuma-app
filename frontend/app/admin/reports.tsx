/**
 * Admin — Feed Moderation Queue
 * ------------------------------
 * SGY admins land here to review reports on activity-feed posts. The
 * screen is reachable from the Profile → Moderation row (admin-only)
 * and lives under a distinct top-level route so we can gate the whole
 * subtree behind an is_admin check.
 *
 * Actions per report
 *   • Open the reported dancer's profile
 *   • Delete the flagged post (moderator delete) — takes the underlying
 *     activity_event down for every dancer
 *   • Set the report status: Actioned (post removed) / Resolved (no
 *     action needed) / Dismissed (false alarm)
 *
 * A status filter chip row at the top lets admins jump between the
 * open queue and the audit trail of already-handled reports.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api, AdminFeedReport } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type Tab = "open" | "actioned" | "resolved" | "dismissed" | "all";

const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Actioned" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

const REASON_LABEL: Record<string, string> = {
  harassment: "Harassment / bullying",
  hate_speech: "Hate speech or slurs",
  spam: "Spam or scam",
  impersonation: "Impersonation",
  sexual_content: "Sexual or explicit content",
  other: "Something else",
};

export default function AdminReportsScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("open");
  const [reports, setReports] = useState<AdminFeedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (soft = false) => {
      if (!token) return;
      if (!soft) setLoading(true);
      try {
        const r = await api.getAdminFeedReports(token, {
          status: tab,
          limit: 100,
        });
        setReports(r.reports || []);
      } catch (e: any) {
        Alert.alert(
          "Couldn't load reports",
          e?.message || "Try again in a moment.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, tab],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  // Non-admins should never see this screen. If they somehow reach it
  // (deep link, cached tab), bounce them back to the tab root.
  useEffect(() => {
    if (user && !user.is_admin) {
      router.replace("/(tabs)");
    }
  }, [user, router]);

  const setStatus = async (
    r: AdminFeedReport,
    next: "actioned" | "resolved" | "dismissed",
  ) => {
    if (!token) return;
    setBusyId(r.report_id);
    try {
      await api.updateAdminFeedReport(token, r.report_id, next);
      // Optimistically drop it from the current tab (except "all").
      if (tab !== "all") {
        setReports((prev) => prev.filter((x) => x.report_id !== r.report_id));
      } else {
        setReports((prev) =>
          prev.map((x) =>
            x.report_id === r.report_id ? { ...x, status: next } : x,
          ),
        );
      }
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message || "Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const doDeletePost = (r: AdminFeedReport) => {
    Alert.alert(
      "Take this post down?",
      "The flagged activity post will be removed from every dancer's feed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Take it down",
          style: "destructive",
          onPress: async () => {
            if (!token) return;
            setBusyId(r.report_id);
            try {
              await api.adminDeleteFeedEvent(token, r.event_id);
              // Automatically mark the report as actioned since we
              // just, well, actioned it.
              await api.updateAdminFeedReport(
                token,
                r.report_id,
                "actioned",
                "Post removed by moderator.",
              );
              setReports((prev) =>
                tab === "all"
                  ? prev.map((x) =>
                      x.report_id === r.report_id
                        ? { ...x, status: "actioned", event_exists: false }
                        : x,
                    )
                  : prev.filter((x) => x.report_id !== r.report_id),
              );
            } catch (e: any) {
              Alert.alert(
                "Couldn't delete",
                e?.message || "The post may already be gone.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="admin-reports-back"
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Moderation</Text>
          <Text style={styles.sub}>Feed reports from the community</Text>
        </View>
      </View>

      {/* Status tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabChip, active && styles.tabChipActive]}
              testID={`admin-reports-tab-${t.key}`}
            >
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark" size={60} color={colors.success} />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptySub}>
            No {tab === "all" ? "" : tab} reports right now.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          {reports.map((r) => (
            <ReportRow
              key={r.report_id}
              report={r}
              busy={busyId === r.report_id}
              onOpenUser={() => router.push(`/users/${r.reported_user_id}`)}
              onDelete={() => doDeletePost(r)}
              onAction={() => setStatus(r, "actioned")}
              onResolve={() => setStatus(r, "resolved")}
              onDismiss={() => setStatus(r, "dismissed")}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ReportRow({
  report,
  busy,
  onOpenUser,
  onDelete,
  onAction,
  onResolve,
  onDismiss,
}: {
  report: AdminFeedReport;
  busy: boolean;
  onOpenUser: () => void;
  onDelete: () => void;
  onAction: () => void;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.card} testID={`admin-report-${report.report_id}`}>
      <View style={styles.cardHead}>
        <View style={styles.reasonPill}>
          <Text style={styles.reasonPillText}>
            {REASON_LABEL[report.reason] || report.reason}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            report.status === "open" && styles.statusOpen,
            report.status === "actioned" && styles.statusActioned,
            report.status === "resolved" && styles.statusResolved,
            report.status === "dismissed" && styles.statusDismissed,
          ]}
        >
          <Text style={styles.statusText}>{report.status}</Text>
        </View>
      </View>

      <Text style={styles.reporter}>
        <Text style={styles.reporterName}>
          {report.reporter_name || "Someone"}
        </Text>
        <Text style={styles.reporterSub}> flagged </Text>
        <Text style={styles.reporterName}>
          {report.reported_user_name || "a post"}
        </Text>
      </Text>

      {report.event_exists ? (
        <View style={styles.snippetBox}>
          <Ionicons name="chatbubble" size={14} color={colors.muted} />
          <Text style={styles.snippet} numberOfLines={2}>
            {report.event_snippet || "activity post"}
          </Text>
        </View>
      ) : (
        <View style={[styles.snippetBox, styles.snippetGone]}>
          <Ionicons name="close-circle" size={14} color={colors.error} />
          <Text style={[styles.snippet, { color: colors.error }]}>
            Post no longer exists
          </Text>
        </View>
      )}

      {report.note ? (
        <Text style={styles.note}>“{report.note}”</Text>
      ) : null}

      {report.resolution_note ? (
        <Text style={styles.resNote}>
          <Text style={{ fontWeight: "700" }}>Mod note: </Text>
          {report.resolution_note}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenUser}
          style={styles.actionBtnGhost}
          testID={`admin-report-open-user-${report.report_id}`}
          hitSlop={6}
        >
          <Ionicons name="person" size={14} color={colors.brandPrimary} />
          <Text style={styles.actionBtnGhostText}>Open dancer</Text>
        </Pressable>
        {report.event_exists ? (
          <Pressable
            onPress={onDelete}
            style={styles.actionBtnDanger}
            disabled={busy}
            testID={`admin-report-delete-${report.report_id}`}
            hitSlop={6}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash" size={14} color="#fff" />
                <Text style={styles.actionBtnDangerText}>Take down</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {report.status === "open" ? (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onResolve}
            style={styles.actionBtnGhost}
            disabled={busy}
            testID={`admin-report-resolve-${report.report_id}`}
          >
            <Text style={styles.actionBtnGhostText}>Resolve</Text>
          </Pressable>
          <Pressable
            onPress={onDismiss}
            style={styles.actionBtnGhost}
            disabled={busy}
            testID={`admin-report-dismiss-${report.report_id}`}
          >
            <Text style={styles.actionBtnGhostText}>Dismiss</Text>
          </Pressable>
          <Pressable
            onPress={onAction}
            style={styles.actionBtnPrimary}
            disabled={busy}
            testID={`admin-report-action-${report.report_id}`}
          >
            <Text style={styles.actionBtnPrimaryText}>Mark actioned</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  title: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabRow: {
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  tabText: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  tabTextActive: { color: "#fff" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: spacing.lg,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 4,
  },
  emptySub: { color: colors.muted, fontSize: 13, textAlign: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  reasonPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.error + "18",
    borderWidth: 1,
    borderColor: colors.error + "55",
  },
  reasonPillText: {
    color: colors.error,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusOpen: {
    backgroundColor: colors.warning + "22",
    borderColor: colors.warning,
  },
  statusActioned: {
    backgroundColor: colors.brandPrimary + "22",
    borderColor: colors.brandPrimary,
  },
  statusResolved: {
    backgroundColor: colors.success + "22",
    borderColor: colors.success,
  },
  statusDismissed: {
    backgroundColor: colors.muted + "22",
    borderColor: colors.muted,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.onSurface,
  },
  reporter: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  reporterName: {
    fontWeight: "700",
    color: colors.onSurface,
  },
  reporterSub: { color: colors.muted },
  snippetBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  snippetGone: {
    backgroundColor: colors.error + "0F",
  },
  snippet: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  note: {
    fontStyle: "italic",
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  resNote: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  actionBtnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
    backgroundColor: colors.surface,
  },
  actionBtnGhostText: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  actionBtnDanger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  actionBtnDangerText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  actionBtnPrimary: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  actionBtnPrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
});
