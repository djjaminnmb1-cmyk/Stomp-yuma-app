/**
 * Batch Import Review screen
 * --------------------------
 * Route: ``/external-search/batch?payload=<JSON entries>``
 *
 * Behaviour:
 *   1. Parse the ``payload`` param into an array of ``{source, ref}``.
 *   2. POST to ``/api/dances/bulk-preview-external`` for a dry-run.
 *   3. Render a categorised list: **Ready** / **Already in Library** /
 *      **Error**. Only "Ready" rows are checkable.
 *   4. Publish toggle (default off) applies to every row.
 *   5. Tapping **Import selected** POSTs ``/bulk-from-external`` and
 *      renders the per-row result — admin sees exactly what went in.
 *   6. From the result screen, admin can jump into any newly-created
 *      dance or head back to the search.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  BulkImportEntry,
  BulkImportPreviewResponse,
  BulkImportResponse,
} from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, spacing, radius } from "@/src/theme";

export default function BatchReviewScreen() {
  const { payload } = useLocalSearchParams<{ payload?: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const isAdminOrEditor = !!(user?.is_admin || user?.is_instructor);
  const insets = useSafeAreaInsets();

  const initialEntries: BulkImportEntry[] = useMemo(() => {
    try {
      const p = JSON.parse((payload as string) || "[]");
      if (Array.isArray(p)) return p as BulkImportEntry[];
    } catch {}
    return [];
  }, [payload]);

  const [preview, setPreview] = useState<BulkImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, boolean>>({});
  const [publishAll, setPublishAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BulkImportResponse | null>(null);

  const rowKey = (r: { source: string; ref: string }) => `${r.source}:${r.ref}`;

  const loadPreview = useCallback(async () => {
    if (!token || initialEntries.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const p = await api.bulkPreviewExternal(initialEntries, token);
      setPreview(p);
      // Pre-tick every Ready row so "Import all ready" is one tap.
      const next: Record<string, boolean> = {};
      for (const r of p.resolved) {
        if (r.status === "ready") next[rowKey(r)] = true;
      }
      setPicks(next);
    } catch (e: any) {
      setLoadError(e?.message || "Couldn't preview the batch.");
    } finally {
      setLoading(false);
    }
  }, [token, initialEntries]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const readyRows = (preview?.resolved || []).filter((r) => r.status === "ready");
  const alreadyRows = (preview?.resolved || []).filter(
    (r) => r.status === "skipped_duplicate"
  );
  const errorRows = (preview?.resolved || []).filter((r) => r.status === "error");
  const pickedCount = Object.values(picks).filter(Boolean).length;

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      for (const r of readyRows) next[rowKey(r)] = true;
    }
    setPicks(next);
  };

  const onImport = async () => {
    if (!token) return;
    const entries = readyRows
      .filter((r) => picks[rowKey(r)])
      .map((r) => ({ source: r.source, ref: r.ref }) as BulkImportEntry);
    if (entries.length === 0) return;
    if (entries.length > 50) {
      Alert.alert(
        "Too many",
        "The server accepts a maximum of 50 imports per batch. Please split your selection."
      );
      return;
    }
    setImporting(true);
    try {
      const res = await api.bulkImportExternal(entries, publishAll, token);
      setResult(res);
    } catch (e: any) {
      Alert.alert("Import failed", e?.message || "Try again in a moment.");
    } finally {
      setImporting(false);
    }
  };

  // In-app header + back button — matches the CopperKnob / BootStepper
  // screens for parity.
  const HeaderBar = ({ title }: { title: string }) => (
    <View style={styles.headerBar}>
      <Pressable
        testID="batch-back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/library");
        }}
        style={styles.backBtn}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (!isAdminOrEditor) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Batch Import" />
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>Admins only</Text>
          <Text style={styles.errorBody}>
            Batch imports are limited to admins and instructors.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Reviewing batch" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.hintText}>
            Fetching {initialEntries.length} record
            {initialEntries.length === 1 ? "" : "s"}…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !preview || initialEntries.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Batch Import" />
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={40} color={colors.muted} />
          <Text style={styles.errorTitle}>
            {initialEntries.length === 0 ? "Nothing to import" : "Preview failed"}
          </Text>
          <Text style={styles.errorBody}>
            {loadError || "Head back to the search and select a few dances first."}
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>Back to search</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Post-import result view ----
  if (result) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <HeaderBar title="Batch complete" />
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        >
          <View style={[styles.summaryCard, styles.summaryOk]}>
            <Ionicons
              name="checkmark-done-circle"
              size={32}
              color={colors.brandPrimary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>
                {result.imported} added · {result.skipped_duplicates} skipped ·{" "}
                {result.errors} error{result.errors === 1 ? "" : "s"}
              </Text>
              <Text style={styles.summarySub}>
                {publishAll
                  ? "Published straight away — visible to all users."
                  : "Saved as drafts — publish them individually when you're ready."}
              </Text>
            </View>
          </View>

          {result.results.map((r, i) => (
            <View
              key={`${r.source}:${r.ref}:${i}`}
              style={[styles.resultRow, statusStyle(r.status)]}
              testID={`batch-result-${r.source}-${r.ref}`}
            >
              <Ionicons
                name={statusIcon(r.status)}
                size={18}
                color={statusColor(r.status)}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {r.dance_name || r.existing_dance_name || r.ref}
                </Text>
                <Text style={styles.resultMeta} numberOfLines={1}>
                  {r.source} · {r.ref} ·{" "}
                  {r.status === "imported"
                    ? r.is_published
                      ? "published"
                      : "draft"
                    : r.status === "skipped_duplicate"
                      ? "already in library"
                      : r.error || "error"}
                </Text>
              </View>
              {r.dance_id ? (
                <Pressable
                  onPress={() => router.push(`/dance/${r.dance_id}`)}
                  style={styles.resultOpenBtn}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.brandPrimary}
                  />
                </Pressable>
              ) : r.existing_dance_id ? (
                <Pressable
                  onPress={() => router.push(`/dance/${r.existing_dance_id}`)}
                  style={styles.resultOpenBtn}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.brandPrimary}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}

          <Pressable
            style={[styles.primaryBtn, { marginTop: spacing.xl }]}
            onPress={() => router.replace("/(tabs)/library")}
          >
            <Text style={styles.primaryBtnText}>Back to Library</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Pre-import preview view ----
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <HeaderBar title="Batch import preview" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }}
      >
        <View style={styles.summaryCard}>
          <Ionicons name="albums" size={24} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>
              {preview.total} record{preview.total === 1 ? "" : "s"} · {preview.ready_to_import} new
            </Text>
            <Text style={styles.summarySub}>
              {preview.already_in_library} already listed ·{" "}
              {preview.errors} couldn&apos;t load
            </Text>
          </View>
        </View>

        <View style={styles.publishRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.publishLabel}>Publish immediately</Text>
            <Text style={styles.publishHint}>
              Off = save as drafts. Turn on when you&apos;re happy with the metadata.
            </Text>
          </View>
          <Switch
            value={publishAll}
            onValueChange={setPublishAll}
            trackColor={{ true: colors.brandPrimary }}
            testID="batch-publish-toggle"
          />
        </View>

        {readyRows.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                Ready to import · {pickedCount}/{readyRows.length}
              </Text>
              <Pressable
                onPress={() => toggleAll(pickedCount !== readyRows.length)}
                testID="batch-toggle-all"
              >
                <Text style={styles.sectionAction}>
                  {pickedCount === readyRows.length ? "Uncheck all" : "Check all"}
                </Text>
              </Pressable>
            </View>
            {readyRows.map((r) => {
              const picked = !!picks[rowKey(r)];
              return (
                <Pressable
                  key={rowKey(r)}
                  testID={`batch-ready-${r.ref}`}
                  onPress={() =>
                    setPicks((p) => ({ ...p, [rowKey(r)]: !p[rowKey(r)] }))
                  }
                  style={[styles.previewRow, picked && styles.previewRowPicked]}
                >
                  <Ionicons
                    name={picked ? "checkbox" : "square-outline"}
                    size={20}
                    color={picked ? colors.brandPrimary : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {r.title || r.ref}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {r.choreographer || "Unknown"}
                      {r.level ? ` · ${r.level}` : ""}
                      {r.count ? ` · ${r.count} count` : ""}
                    </Text>
                  </View>
                  <View style={styles.rowBadge}>
                    <Text style={styles.rowBadgeText}>{r.source}</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : null}

        {alreadyRows.length > 0 ? (
          <>
            <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
              <Text style={styles.sectionTitle}>
                Already in library · {alreadyRows.length}
              </Text>
            </View>
            {alreadyRows.map((r) => (
              <View
                key={rowKey(r)}
                style={[styles.previewRow, styles.previewRowMuted]}
                testID={`batch-already-${r.ref}`}
              >
                <Ionicons name="checkmark-circle" size={20} color="#16803C" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.title || r.existing_dance_name || r.ref}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {r.choreographer || "Unknown"} · already in your library
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    r.existing_dance_id &&
                    router.push(`/dance/${r.existing_dance_id}`)
                  }
                  hitSlop={12}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.brandPrimary}
                  />
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        {errorRows.length > 0 ? (
          <>
            <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
              <Text style={styles.sectionTitle}>
                Couldn&apos;t load · {errorRows.length}
              </Text>
            </View>
            {errorRows.map((r) => (
              <View
                key={rowKey(r)}
                style={[styles.previewRow, styles.previewRowError]}
                testID={`batch-error-${r.ref}`}
              >
                <Ionicons name="alert-circle" size={20} color="#B45309" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {r.ref}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={2}>
                    {r.source} · {r.error || "Unknown error"}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Sticky bottom action bar */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(spacing.lg, insets.bottom + 4) },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.actionBarTitle}>
            {pickedCount} of {readyRows.length} selected
          </Text>
          <Text style={styles.actionBarSub}>
            {publishAll ? "Will publish immediately" : "Will save as drafts"}
          </Text>
        </View>
        <Pressable
          testID="batch-import-confirm"
          disabled={pickedCount === 0 || importing}
          onPress={onImport}
          style={[
            styles.actionBarBtn,
            (pickedCount === 0 || importing) && { opacity: 0.5 },
          ]}
        >
          {importing ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.actionBarBtnText}>
                Import {pickedCount ? pickedCount : ""}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}


function statusStyle(status: string) {
  if (status === "imported") return { borderLeftColor: colors.brandPrimary };
  if (status === "skipped_duplicate") return { borderLeftColor: "#16803C" };
  return { borderLeftColor: "#B45309" };
}
function statusIcon(status: string): any {
  if (status === "imported") return "add-circle";
  if (status === "skipped_duplicate") return "checkmark-circle";
  return "alert-circle";
}
function statusColor(status: string) {
  if (status === "imported") return colors.brandPrimary;
  if (status === "skipped_duplicate") return "#16803C";
  return "#B45309";
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  headerTitle: {
    fontFamily: Platform.select({ ios: "serif", default: undefined }),
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  errorBody: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
  },
  hintText: { color: colors.muted, fontSize: 13 },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandPrimary + "0F",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
    marginBottom: spacing.md,
  },
  summaryOk: {
    backgroundColor: "#D8F3E4",
    borderColor: "#16803C" + "55",
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  summarySub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  publishLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  publishHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionAction: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 6,
  },
  previewRowPicked: { backgroundColor: colors.brandPrimary + "18" },
  previewRowMuted: { opacity: 0.85 },
  previewRowError: {
    backgroundColor: "#FFF3D9",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowBadge: {
    backgroundColor: colors.brandPrimary + "22",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  rowBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brandPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
  resultTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  resultMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  resultOpenBtn: { padding: 6 },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  actionBarTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  actionBarSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  actionBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  actionBarBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignSelf: "center",
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
});
