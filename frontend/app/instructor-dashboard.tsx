import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Alert,
  Platform,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  api,
  DashboardStudent,
  DashboardTopDance,
  DashboardRecentClass,
  InstructorDashboard,
} from "@/src/api/client";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";

/**
 * Instructor Dashboard
 * ---------------------------------------------------------------------------
 * Everything an instructor needs to see the health of the community at a
 * glance — activity, top dances, roster, recent class attendance. Also
 * offers a CSV export of the roster for offline record keeping / newsletters.
 */

type SortKey = "completed" | "attendance" | "last_active" | "name";

export default function InstructorDashboardScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [data, setData] = useState<InstructorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("completed");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api.getInstructorDashboard(token);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load dashboard");
      setData(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    if (!user || (!user.is_admin && !user.is_instructor)) {
      // Non-instructor bumped back — this route is admin/instructor only.
      router.replace("/");
      return;
    }
    load();
  }, [load, router, user]);

  // Filter + sort roster.
  const filteredStudents = useMemo(() => {
    if (!data?.students) return [] as DashboardStudent[];
    const q = query.trim().toLowerCase();
    const rows = q
      ? data.students.filter((s) => {
          const hay = `${s.name} ${s.email || ""}`.toLowerCase();
          return hay.includes(q);
        })
      : data.students;
    const sorted = [...rows];
    switch (sortBy) {
      case "completed":
        sorted.sort((a, b) => b.completed_count - a.completed_count);
        break;
      case "attendance":
        sorted.sort((a, b) => b.attendance_count - a.attendance_count);
        break;
      case "last_active":
        sorted.sort((a, b) =>
          (b.last_active_at || "").localeCompare(a.last_active_at || "")
        );
        break;
      case "name":
        sorted.sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );
        break;
    }
    return sorted;
  }, [data, query, sortBy]);

  const exportCsv = async () => {
    if (!data?.students?.length) return;
    // Only admins have the email field.
    const hasEmail = data.as_admin && data.students.some((s) => s.email);
    const header = [
      "name",
      ...(hasEmail ? ["email"] : []),
      "is_instructor",
      "completed_count",
      "wishlist_count",
      "attendance_count",
      "last_completed_at",
      "last_class_date",
      "last_active_at",
      "joined_at",
    ];
    const rows = filteredStudents.map((s) => [
      s.name,
      ...(hasEmail ? [s.email || ""] : []),
      s.is_instructor ? "1" : "0",
      String(s.completed_count),
      String(s.wishlist_count),
      String(s.attendance_count),
      s.last_completed_at || "",
      s.last_class_date || "",
      s.last_active_at || "",
      s.joined_at || "",
    ]);
    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const csv = [header, ...rows]
      .map((r) => r.map(escape).join(","))
      .join("\n");

    const today = new Date().toISOString().slice(0, 10);
    const fileName = `stompin-ground-roster-${today}.csv`;

    if (Platform.OS === "web") {
      // Browser download via blob URL — no permission prompts on web.
      try {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e: any) {
        Alert.alert("Export failed", e?.message || "Could not save CSV");
      }
      return;
    }

    // Native: hand the CSV text off to the system share sheet directly (no
    // filesystem writes needed for a small roster). Users can pipe it to
    // Mail, Notes, Files, etc., from the share sheet.
    try {
      await Share.share({
        message: csv,
        title: fileName,
      });
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export CSV");
    }
  };

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <LinearGradient
          colors={[colors.brandSecondary, colors.brandPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconBtn}
            testID="dash-back"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Instructor Insights</Text>
            <Text style={styles.title}>Dashboard</Text>
          </View>
          <Ionicons name="stats-chart" size={26} color="#fff" />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Ionicons name="warning" size={24} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          {/* Overview tiles */}
          <View style={styles.tileRow}>
            <StatTile
              label="Students"
              value={data?.overview.total_students ?? 0}
              icon="people"
              tint={colors.brandPrimary}
            />
            <StatTile
              label="Active (7d)"
              value={data?.overview.students_last_7d_active ?? 0}
              icon="flame"
              tint={colors.brandTertiary}
            />
          </View>
          <View style={styles.tileRow}>
            <StatTile
              label="Completions"
              value={data?.overview.completions_all_time ?? 0}
              icon="checkmark-done"
              tint={colors.brandSecondary}
            />
            <StatTile
              label="This week"
              value={data?.overview.completions_last_7d ?? 0}
              icon="sparkles"
              tint={colors.brandTertiary}
            />
          </View>
          <View style={styles.tileRow}>
            <StatTile
              label="Classes (30d)"
              value={data?.overview.classes_last_30d ?? 0}
              icon="calendar"
              tint={colors.brandSecondary}
            />
            <StatTile
              label="Attendance"
              value={data?.overview.attendance_records ?? 0}
              icon="clipboard"
              tint={colors.brandPrimary}
            />
          </View>

          {/* Top completed dances */}
          <SectionCard
            title="Top completed dances"
            subtitle="Community favourites — great candidates for your next class."
            icon="trophy"
          >
            {(data?.top_dances?.length ?? 0) === 0 ? (
              <EmptyLine text="No completions logged yet." />
            ) : (
              data!.top_dances.map((d, idx) => (
                <TopDanceRow key={d.dance_id} entry={d} rank={idx + 1} onPress={() => router.push(`/dance/${d.dance_id}`)} />
              ))
            )}
          </SectionCard>

          {/* Roster */}
          <SectionCard
            title={`Roster · ${filteredStudents.length}${
              data && filteredStudents.length !== data.students.length
                ? ` of ${data.students.length}`
                : ""
            }`}
            subtitle={
              data?.as_admin
                ? "Every registered account. Email is shown to admins only."
                : "Community members with any tracked activity."
            }
            icon="people-circle"
            trailing={
              <Pressable
                onPress={exportCsv}
                style={styles.exportBtn}
                testID="export-csv"
              >
                <Ionicons name="download" size={14} color={colors.brandPrimary} />
                <Text style={styles.exportText}>CSV</Text>
              </Pressable>
            }
          >
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="roster-search"
                placeholder="Search name or email"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery("")} hitSlop={12}>
                  <Ionicons name="close-circle" size={16} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {(
                [
                  ["completed", "Most completed", "checkmark-done"],
                  ["attendance", "Most attendance", "calendar"],
                  ["last_active", "Recently active", "time"],
                  ["name", "Name A→Z", "text"],
                ] as const
              ).map(([key, label, icon]) => {
                const on = sortBy === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSortBy(key)}
                    testID={`sort-${key}`}
                    style={[styles.sortChip, on && styles.sortChipOn]}
                  >
                    <Ionicons
                      name={icon}
                      size={12}
                      color={on ? "#fff" : colors.brandPrimary}
                    />
                    <Text style={[styles.sortText, on && styles.sortTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filteredStudents.length === 0 ? (
              <EmptyLine
                text={
                  query
                    ? "No students match that search."
                    : "No students on record yet."
                }
              />
            ) : (
              filteredStudents.map((s) => <StudentRow key={s.user_id} student={s} />)
            )}
          </SectionCard>

          {/* Recent classes */}
          <SectionCard
            title="Recent classes"
            subtitle="Latest scheduled sessions and how many folks came out."
            icon="calendar"
          >
            {(data?.recent_classes?.length ?? 0) === 0 ? (
              <EmptyLine text="No classes on the calendar yet." />
            ) : (
              data!.recent_classes.map((c) => (
                <RecentClassRow key={c.id} entry={c} onPress={() => router.push("/classes")} />
              ))
            )}
          </SectionCard>
        </ScrollView>
      )}
    </View>
  );
}

// ---------------- Presentational helpers ----------------

function StatTile({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: any;
  tint: string;
}) {
  return (
    <View style={[styles.tile, { borderColor: tint + "55" }]}>
      <View style={[styles.tileIconWrap, { backgroundColor: tint + "20" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.tileValue, { color: tint }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {icon ? (
              <Ionicons name={icon} size={16} color={colors.brandPrimary} />
            ) : null}
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {trailing}
      </View>
      <View style={{ gap: 8, marginTop: 12 }}>{children}</View>
    </View>
  );
}

function TopDanceRow({
  entry,
  rank,
  onPress,
}: {
  entry: DashboardTopDance;
  rank: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.topRow}>
      <View style={styles.rankPill}>
        <Text style={styles.rankPillText}>#{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.topName} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={styles.topMeta} numberOfLines={1}>
          {entry.choreographer || "—"}
          {entry.bpm ? ` · ${entry.bpm} BPM` : ""}
        </Text>
      </View>
      <View
        style={[
          styles.diffPill,
          { backgroundColor: difficultyColor(entry.difficulty) },
        ]}
      >
        <Text style={styles.diffPillText}>
          {(entry.difficulty || "").slice(0, 3).toUpperCase()}
        </Text>
      </View>
      <View style={styles.countCol}>
        <Text style={styles.countBig}>{entry.completions}</Text>
        <Text style={styles.countLbl}>done</Text>
      </View>
    </Pressable>
  );
}

function StudentRow({ student }: { student: DashboardStudent }) {
  const initial = (student.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <View style={styles.studentRow}>
      {student.picture ? (
        <Image source={{ uri: student.picture }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarInitial}>
          <Text style={styles.avatarInitialText}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.studentName} numberOfLines={1}>
            {student.name}
          </Text>
          {student.is_instructor ? (
            <View style={styles.instPill}>
              <Text style={styles.instPillText}>Instructor</Text>
            </View>
          ) : null}
        </View>
        {student.email ? (
          <Text style={styles.studentEmail} numberOfLines={1}>
            {student.email}
          </Text>
        ) : null}
        <Text style={styles.studentMeta} numberOfLines={1}>
          {student.completed_count}c · {student.wishlist_count}w ·{" "}
          {student.attendance_count} classes
          {student.last_active_at
            ? `  ·  ${formatDate(student.last_active_at)}`
            : ""}
        </Text>
      </View>
    </View>
  );
}

function RecentClassRow({
  entry,
  onPress,
}: {
  entry: DashboardRecentClass;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.classRow}>
      <View style={styles.classDate}>
        <Text style={styles.classDateText}>{formatDateShort(entry.date)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.className} numberOfLines={1}>
          {entry.label || "Class"}
        </Text>
        <Text style={styles.classMeta} numberOfLines={1}>
          {entry.dance_count} dance{entry.dance_count === 1 ? "" : "s"}
          {" · "}
          {entry.attendee_count} attendee{entry.attendee_count === 1 ? "" : "s"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <View style={styles.emptyLine}>
      <Text style={styles.emptyLineText}>{text}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}
function formatDateShort(iso: string): string {
  if (!iso) return "—";
  try {
    // Handle YYYY-MM-DD or ISO.
    const s = iso.length >= 10 ? iso.slice(0, 10) : iso;
    const [, mm, dd] = s.split("-");
    if (mm && dd) return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
    return iso;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerWrap: { paddingBottom: spacing.lg, overflow: "hidden" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    zIndex: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  title: {
    fontFamily: "serif",
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
  },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorCard: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  errorText: { color: colors.error, textAlign: "center" },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  retryText: { color: "#fff", fontWeight: "700" },

  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 48,
  },

  tileRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    gap: 4,
  },
  tileIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tileValue: {
    fontFamily: "serif",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  tileLabel: {
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "600",
  },

  section: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  sectionSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  exportText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.onSurface,
    fontSize: 14,
  },

  sortRow: { gap: 6, paddingVertical: 4 },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  sortChipOn: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  sortText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  sortTextOn: { color: "#fff" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  rankPill: {
    minWidth: 36,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  rankPillText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  topName: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  topMeta: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  diffPillText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  countCol: { alignItems: "center", minWidth: 46 },
  countBig: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.brandPrimary,
    lineHeight: 22,
  },
  countLbl: { fontSize: 9, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarInitial: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSecondary,
  },
  avatarInitialText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  studentName: { fontFamily: "serif", fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  studentEmail: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
  studentMeta: { fontSize: 11, color: colors.muted, marginTop: 2, letterSpacing: 0.3 },
  instPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: "rgba(29,59,135,0.1)",
  },
  instPillText: { color: colors.brandSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },

  classRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  classDate: {
    minWidth: 46,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.brandTertiary + "33",
    borderWidth: 1,
    borderColor: colors.brandTertiary,
  },
  classDateText: { fontFamily: "serif", fontWeight: "800", color: colors.brandPrimary, fontSize: 13 },
  className: { fontFamily: "serif", fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  classMeta: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },

  emptyLine: {
    padding: spacing.md,
    alignItems: "center",
  },
  emptyLineText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
  },
});
