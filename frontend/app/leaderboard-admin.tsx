/**
 * Leaderboard admin console.
 *
 * Admin-only screen linked from the gear icon on `/leaderboard`. Three tabs:
 *   1) Prizes  — edit the 3 prize slots for the current range (week/month/all).
 *              Each slot has a title, description, and optional image.
 *   2) Users   — full roster with actions: hide/unhide from board, reset their
 *              completion count (destructive; requires confirm).
 *   3) Season  — start a new season (all-time board resets, past top 10 is
 *              archived) or clear the season pointer.
 *
 * Non-destructive by default; every destructive action shows a confirm alert
 * with the target name and a clear description of what's about to happen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { colors, spacing, radius } from "@/src/theme";
import {
  api,
  LeaderboardPrize,
  LeaderboardRange,
  DashboardStudent,
} from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";

const RANGES: { key: LeaderboardRange; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

type TabKey = "prizes" | "users" | "season";
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "prizes", label: "Prizes", icon: "gift" },
  { key: "users", label: "Users", icon: "people" },
  { key: "season", label: "Season", icon: "refresh" },
];

export default function LeaderboardAdmin() {
  const router = useRouter();
  const params = useLocalSearchParams<{ range?: string }>();
  const { token, user, loading: authLoading } = useAuth();

  const initialRange: LeaderboardRange =
    (params.range as LeaderboardRange) === "week" ||
    (params.range as LeaderboardRange) === "month"
      ? (params.range as LeaderboardRange)
      : "all";

  const [range, setRange] = useState<LeaderboardRange>(initialRange);
  const [tab, setTab] = useState<TabKey>("prizes");

  // ---- Prizes state ----
  const [prizes, setPrizes] = useState<LeaderboardPrize[]>([]);
  const [loadingPrizes, setLoadingPrizes] = useState(true);

  // ---- Users state ----
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userQuery, setUserQuery] = useState("");

  // ---- Season state ----
  const [seasonCurrent, setSeasonCurrent] = useState<{
    started_at?: string;
    label?: string;
    started_by?: string;
  }>({});
  const [seasonPast, setSeasonPast] = useState<
    {
      id: string;
      label: string;
      started_at: string;
      ended_at: string;
      top: { rank: number; name: string; count: number; picture: string }[];
    }[]
  >([]);
  const [newSeasonLabel, setNewSeasonLabel] = useState("");
  const [loadingSeason, setLoadingSeason] = useState(true);

  const loadPrizes = useCallback(async () => {
    setLoadingPrizes(true);
    try {
      const p = await api.listPrizes(range);
      setPrizes(p.prizes || []);
    } finally {
      setLoadingPrizes(false);
    }
  }, [range]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const [d, hidden] = await Promise.all([
        api.getInstructorDashboard(token),
        api.adminListHiddenUsers(token).catch(() => ({ hidden_user_ids: [] as string[], users: [] })),
      ]);
      setStudents(d.students || []);
      setHiddenIds(new Set(hidden.hidden_user_ids || []));
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  const loadSeason = useCallback(async () => {
    if (!token) return;
    setLoadingSeason(true);
    try {
      const s = await api.adminGetSeason(token);
      setSeasonCurrent(s.current || {});
      setSeasonPast(s.past || []);
    } finally {
      setLoadingSeason(false);
    }
  }, [token]);

  useEffect(() => {
    loadPrizes();
  }, [loadPrizes]);
  useEffect(() => {
    if (tab === "users") loadUsers();
  }, [tab, loadUsers]);
  useEffect(() => {
    if (tab === "season") loadSeason();
  }, [tab, loadSeason]);

  // While auth is still bootstrapping, show a spinner rather than the
  // "Admin only" gate — otherwise a direct URL open flashes the gate then
  // pops into the console once the token is restored from storage.
  if (authLoading) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.notAdmin}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!user?.is_admin) {
    // Should never reach here (gear icon only shows for admins) but guard.
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.notAdmin}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={styles.notAdminText}>Admin only.</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <LinearGradient
          colors={[colors.brandTertiary, colors.brandPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject as any}
        />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            testID="lba-back"
            style={styles.iconBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Admin Console</Text>
            <Text style={styles.headerTitle}>Manage Leaderboard</Text>
          </View>
          <Ionicons name="settings-sharp" size={22} color="#fff" />
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`lba-tab-${t.key}`}
                onPress={() => setTab(t.key)}
                style={[styles.tabChip, on && styles.tabChipOn]}
              >
                <Ionicons
                  name={t.icon}
                  size={13}
                  color={on ? colors.brandPrimary : "#fff"}
                />
                <Text
                  style={[styles.tabChipText, on && styles.tabChipTextOn]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      {/* Range switcher (applies to Prizes tab) */}
      {tab === "prizes" ? (
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const on = range === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                testID={`lba-range-${r.key}`}
                style={[styles.rangeChip, on && styles.rangeChipOn]}
              >
                <Text
                  style={[styles.rangeChipText, on && styles.rangeChipTextOn]}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
        {tab === "prizes" ? (
          <PrizesEditor
            prizes={prizes}
            range={range}
            loading={loadingPrizes}
            token={token || ""}
            onChange={loadPrizes}
          />
        ) : null}

        {tab === "users" ? (
          <UsersEditor
            students={students}
            hiddenIds={hiddenIds}
            loading={loadingUsers}
            token={token || ""}
            userQuery={userQuery}
            setUserQuery={setUserQuery}
            onHideToggle={(uid, next) => {
              const s = new Set(hiddenIds);
              if (next) s.add(uid);
              else s.delete(uid);
              setHiddenIds(s);
            }}
            onReset={loadUsers}
          />
        ) : null}

        {tab === "season" ? (
          <SeasonEditor
            current={seasonCurrent}
            past={seasonPast}
            loading={loadingSeason}
            token={token || ""}
            newLabel={newSeasonLabel}
            setNewLabel={setNewSeasonLabel}
            onChange={loadSeason}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ============================================================
// Prizes Editor
// ============================================================
function PrizesEditor({
  prizes,
  range,
  loading,
  token,
  onChange,
}: {
  prizes: LeaderboardPrize[];
  range: LeaderboardRange;
  loading: boolean;
  token: string;
  onChange: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.helper}>
        Set what dancers can win. Leave a slot blank to hide it from the leaderboard.
      </Text>
      {prizes.map((p) => (
        <PrizeSlotCard key={p.rank} prize={p} range={range} token={token} onSaved={onChange} />
      ))}
    </View>
  );
}

function PrizeSlotCard({
  prize,
  range,
  token,
  onSaved,
}: {
  prize: LeaderboardPrize;
  range: LeaderboardRange;
  token: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(prize.title);
  const [description, setDescription] = useState(prize.description);
  const [image, setImage] = useState(prize.image);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setTitle(prize.title);
    setDescription(prize.description);
    setImage(prize.image);
  }, [prize.title, prize.description, prize.image]);

  const dirty =
    title !== prize.title ||
    description !== prize.description ||
    image !== prize.image;

  const rankLabel = prize.rank === 1 ? "1st Place" : prize.rank === 2 ? "2nd Place" : "3rd Place";
  const badgeColor =
    prize.rank === 1 ? "#F2A628" : prize.rank === 2 ? "#B0B0B0" : "#C08040";

  const pickImage = async () => {
    // Request media library permission (image picker requires it).
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          "Photos permission needed",
          "Enable photos access in Settings to attach a prize image.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Platform.OS !== "web" && Linking.openSettings() },
          ]
        );
      }
      return;
    }
    setUploading(true);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        quality: 0.7,
        base64: false,
      });
      if (r.canceled || !r.assets?.length) return;
      const asset = r.assets[0];
      // Read as base64 to embed (payload capped server-side at ~2MB).
      let dataUrl = "";
      if (Platform.OS === "web") {
        // ImagePicker on web returns a data URL directly in asset.uri
        dataUrl = asset.uri;
      } else {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mime = asset.mimeType || "image/jpeg";
        dataUrl = `data:${mime};base64,${b64}`;
      }
      setImage(dataUrl);
    } catch (e: any) {
      Alert.alert("Couldn't attach image", e?.message || "Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.upsertPrize(prize.rank as 1 | 2 | 3, range, { title, description, image }, token);
      onSaved();
    } catch (e: any) {
      Alert.alert("Couldn't save prize", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const clearPrize = () => {
    Alert.alert("Clear this prize?", `Remove the ${rankLabel} prize for this range.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await api.deletePrize(prize.rank as 1 | 2 | 3, range, token);
            setTitle("");
            setDescription("");
            setImage("");
            onSaved();
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.prizeCard}>
      <View style={styles.prizeCardHead}>
        <View style={[styles.rankPill, { backgroundColor: badgeColor }]}>
          <Text style={styles.rankPillText}>{rankLabel}</Text>
        </View>
        {(title || description || image) && (
          <Pressable onPress={clearPrize} hitSlop={10} testID={`prize-clear-${prize.rank}`}>
            <Ionicons name="trash" size={18} color={colors.danger} />
          </Pressable>
        )}
      </View>

      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Title (e.g. Gift Card)"
        placeholderTextColor={colors.muted}
        maxLength={120}
        testID={`prize-title-${prize.rank}`}
      />
      <TextInput
        style={[styles.input, styles.inputMulti]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (e.g. $50 Amazon gift card)"
        placeholderTextColor={colors.muted}
        multiline
        numberOfLines={2}
        maxLength={400}
        testID={`prize-desc-${prize.rank}`}
      />

      <View style={styles.imageRow}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumbBig} />
        ) : (
          <View style={[styles.thumbBig, styles.thumbPh]}>
            <Ionicons name="image-outline" size={26} color={colors.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <Pressable
            onPress={pickImage}
            disabled={uploading}
            style={[styles.smallBtn, uploading && { opacity: 0.6 }]}
            testID={`prize-img-${prize.rank}`}
          >
            {uploading ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : (
              <>
                <Ionicons
                  name={image ? "swap-horizontal" : "image"}
                  size={14}
                  color={colors.brandPrimary}
                />
                <Text style={styles.smallBtnText}>
                  {image ? "Replace image" : "Add image"}
                </Text>
              </>
            )}
          </Pressable>
          {image ? (
            <Pressable
              onPress={() => setImage("")}
              style={[styles.smallBtn, styles.smallBtnMuted]}
              testID={`prize-img-remove-${prize.rank}`}
            >
              <Ionicons name="close" size={14} color={colors.muted} />
              <Text style={[styles.smallBtnText, { color: colors.muted }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={save}
        disabled={saving || !dirty}
        style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.55 }]}
        testID={`prize-save-${prize.rank}`}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.saveBtnText}>
              {dirty ? "Save changes" : "Saved"}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// ============================================================
// Users Editor (hide + reset)
// ============================================================
function UsersEditor({
  students,
  hiddenIds,
  loading,
  token,
  userQuery,
  setUserQuery,
  onHideToggle,
  onReset,
}: {
  students: DashboardStudent[];
  hiddenIds: Set<string>;
  loading: boolean;
  token: string;
  userQuery: string;
  setUserQuery: (v: string) => void;
  onHideToggle: (uid: string, hidden: boolean) => void;
  onReset: () => void;
}) {
  const filtered = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    const base = students.slice().sort((a, b) => b.completed_count - a.completed_count);
    if (!q) return base;
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [students, userQuery]);

  const toggleHide = async (uid: string, name: string, currentlyHidden: boolean) => {
    const label = currentlyHidden ? "Show" : "Hide";
    Alert.alert(
      `${label} ${name}?`,
      currentlyHidden
        ? "Bring this dancer back to the public board."
        : "This dancer will disappear from the public leaderboard, but their tracking data is preserved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: label,
          style: currentlyHidden ? "default" : "destructive",
          onPress: async () => {
            try {
              if (currentlyHidden) {
                await api.adminUnhideFromLeaderboard(uid, token);
                onHideToggle(uid, false);
              } else {
                await api.adminHideFromLeaderboard(uid, token);
                onHideToggle(uid, true);
              }
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Please try again.");
            }
          },
        },
      ]
    );
  };

  const resetUser = async (uid: string, name: string, count: number) => {
    Alert.alert(
      `Reset ${name}'s completions?`,
      `This deletes ${count} completed-dance record${count === 1 ? "" : "s"} for this dancer. Their wishlist and attendance are preserved. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              const r = await api.adminResetUserCount(uid, token);
              Alert.alert(
                "Done",
                `Removed ${r.removed_completions} completion${r.removed_completions === 1 ? "" : "s"}.`
              );
              onReset();
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Please try again.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          placeholderTextColor={colors.muted}
          value={userQuery}
          onChangeText={setUserQuery}
          testID="lba-user-search"
        />
        {userQuery ? (
          <Pressable onPress={() => setUserQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.helper}>
        {filtered.length} dancer{filtered.length === 1 ? "" : "s"} shown.
      </Text>

      {filtered.map((s) => {
        const hidden = hiddenIds.has(s.user_id);
        return (
          <View key={s.user_id} style={styles.userRow}>
            <View style={styles.userAvatar}>
              {s.picture ? (
                <Image source={{ uri: s.picture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <Text style={styles.userAvatarText}>
                  {(s.name || "?").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{s.name}</Text>
              {s.email ? (
                <Text style={styles.userMeta} numberOfLines={1}>{s.email}</Text>
              ) : null}
              <Text style={styles.userMeta}>
                {s.completed_count} completed · {s.attendance_count} classes
                {hidden ? " · hidden" : ""}
              </Text>
            </View>
            <View style={styles.userActions}>
              <Pressable
                testID={`lba-user-hide-${s.user_id}`}
                onPress={() => toggleHide(s.user_id, s.name, hidden)}
                style={styles.userActionBtn}
                accessibilityLabel={hidden ? "Show on board" : "Hide from board"}
              >
                <Ionicons
                  name={hidden ? "eye" : "eye-off"}
                  size={16}
                  color={hidden ? colors.success : colors.muted}
                />
              </Pressable>
              <Pressable
                testID={`lba-user-reset-${s.user_id}`}
                onPress={() => resetUser(s.user_id, s.name, s.completed_count)}
                style={[styles.userActionBtn, s.completed_count === 0 && { opacity: 0.4 }]}
                disabled={s.completed_count === 0}
                accessibilityLabel="Reset completions"
              >
                <Ionicons name="refresh-circle" size={18} color={colors.danger} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================
// Season Editor
// ============================================================
function SeasonEditor({
  current,
  past,
  loading,
  token,
  newLabel,
  setNewLabel,
  onChange,
}: {
  current: { started_at?: string; label?: string; started_by?: string };
  past: {
    id: string;
    label: string;
    started_at: string;
    ended_at: string;
    top: { rank: number; name: string; count: number; picture: string }[];
  }[];
  loading: boolean;
  token: string;
  newLabel: string;
  setNewLabel: (v: string) => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  const startSeason = async () => {
    Alert.alert(
      "Start a new season?",
      "The All-Time board will show only completions from this moment forward. The current top 10 will be archived so you can look at it later. This can't be undone (but you can clear the season pointer if needed).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start season",
          onPress: async () => {
            setBusy(true);
            try {
              await api.adminResetSeason(newLabel, token);
              setNewLabel("");
              onChange();
              Alert.alert("Season started", "The board has been rolled over.");
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Please try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const clearSeason = async () => {
    Alert.alert(
      "Clear the season?",
      "The All-Time board goes back to showing completions since the beginning of time. Past-season archives are preserved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await api.adminClearSeason(token);
              onChange();
            } catch (e: any) {
              Alert.alert("Failed", e?.message || "Please try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const started = current?.started_at;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current season</Text>
        {started ? (
          <>
            <Text style={styles.cardBody}>
              {(current.label || "Untitled") + " · started " + formatDate(started)}
            </Text>
            {current.started_by ? (
              <Text style={styles.cardMuted}>Started by {current.started_by}</Text>
            ) : null}
            <Pressable
              onPress={clearSeason}
              disabled={busy}
              style={[styles.smallBtn, styles.smallBtnMuted, { alignSelf: "flex-start", marginTop: 6 }]}
              testID="lba-season-clear"
            >
              <Ionicons name="close" size={14} color={colors.muted} />
              <Text style={[styles.smallBtnText, { color: colors.muted }]}>Clear season</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.cardBody}>
            No active season. The All-Time board shows every completion since day one.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start a new season</Text>
        <Text style={styles.cardMuted}>
          Optional label (e.g. &ldquo;Summer 2026&rdquo;). The current top 10 will be archived.
        </Text>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="Season label (optional)"
          placeholderTextColor={colors.muted}
          maxLength={64}
          testID="lba-season-label"
        />
        <Pressable
          onPress={startSeason}
          disabled={busy}
          style={[styles.saveBtn, { marginTop: 10 }]}
          testID="lba-season-start"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flag" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Start new season</Text>
            </>
          )}
        </Pressable>
      </View>

      {past.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Past seasons</Text>
          {past.map((s) => (
            <View key={s.id} style={styles.pastSeason}>
              <Text style={styles.pastSeasonLabel}>{s.label || "Untitled season"}</Text>
              <Text style={styles.cardMuted}>
                {formatDate(s.started_at)} → {formatDate(s.ended_at)}
              </Text>
              {s.top.slice(0, 3).map((t) => (
                <Text key={t.rank} style={styles.pastSeasonRow}>
                  {t.rank}. {t.name} — {t.count} completed
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: spacing.md,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  eyebrow: {
    color: "#fff",
    fontSize: 12,
    letterSpacing: 0.6,
    fontWeight: "600",
    opacity: 0.9,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  tabRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  tabChipOn: { backgroundColor: "#fff", borderColor: "#fff" },
  tabChipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  tabChipTextOn: { color: colors.brandPrimary },

  rangeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    padding: spacing.md,
    paddingBottom: 0,
  },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeChipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  rangeChipText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  rangeChipTextOn: { color: colors.onBrandPrimary },

  helper: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  center: { alignItems: "center", padding: spacing.xl },

  // Prize slot card
  prizeCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  prizeCardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rankPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  rankPillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
  },
  inputMulti: { minHeight: 60, textAlignVertical: "top" },
  imageRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  thumbBig: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumbPh: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "18",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
  },
  smallBtnMuted: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  smallBtnText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // Users list
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { color: "#fff", fontWeight: "800" },
  userName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  userMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  userActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Season
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.onSurface,
  },
  cardBody: {
    fontSize: 13,
    color: colors.onSurface,
  },
  cardMuted: {
    fontSize: 11,
    color: colors.muted,
  },
  pastSeason: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 3,
  },
  pastSeasonLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
  },
  pastSeasonRow: {
    fontSize: 12,
    color: colors.onSurface,
  },

  notAdmin: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: spacing.xl,
  },
  notAdminText: { color: colors.muted, fontSize: 14 },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  backBtnText: { color: "#fff", fontWeight: "700" },
});
