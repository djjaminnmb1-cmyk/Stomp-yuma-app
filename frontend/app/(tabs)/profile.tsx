import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, images } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, Badge, PracticeHistoryDay, Streak, Tracking } from "@/src/api/client";
import CertificateThemePicker from "@/src/components/CertificateThemePicker";
import { BadgeCard } from "@/src/components/BadgeCard";
import { StreakCard } from "@/src/components/StreakCard";
import { PracticeHistoryChart } from "@/src/components/PracticeHistoryChart";
import { SignInMethodsSection } from "@/src/components/SignInMethodsSection";
import { PickInstructorSheet } from "@/src/components/PickInstructorSheet";
import { useTranslation } from "@/src/i18n";
import { LOCALE_LABELS } from "@/src/i18n/translations";
import Constants from "expo-constants";
import * as Application from "expo-application";

// ---------- Social links ----------
// Each entry has:
//  - nativeUrl: platform-specific deep link that opens the native app if installed
//  - webUrl:    https fallback that opens in browser (also universal-links into
//               the native app on modern iOS/Android)
type SocialLink = {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
  bg: string;
  nativeUrl?: string;
  webUrl: string;
};

const SOCIAL_LINKS: SocialLink[] = [
  {
    key: "youtube",
    label: "YouTube",
    icon: "logo-youtube",
    iconColor: "#FFFFFF",
    bg: "#FF0000",
    nativeUrl: "vnd.youtube://www.youtube.com/@stompingroundyuma",
    webUrl: "https://www.youtube.com/@stompingroundyuma",
  },
  {
    key: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    iconColor: "#FFFFFF",
    bg: "#E1306C",
    nativeUrl: "instagram://user?username=stompingroundyuma",
    webUrl: "https://www.instagram.com/stompingroundyuma",
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "logo-tiktok",
    iconColor: "#FFFFFF",
    bg: "#000000",
    nativeUrl: "snssdk1233://user/profile/@stompin.ground.yu",
    webUrl: "https://www.tiktok.com/@stompin.ground.yu?_r=1&_t=ZT-98Ht5GKtSxB",
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "logo-facebook",
    iconColor: "#FFFFFF",
    bg: "#1877F2",
    nativeUrl: "fb://profile/61579203815172",
    webUrl: "https://www.facebook.com/profile.php?id=61579203815172",
  },
];

const SITE_LINK: SocialLink = {
  key: "website",
  label: "Website",
  icon: "globe-outline",
  iconColor: colors.brandPrimary,
  bg: "transparent",
  webUrl:
    "https://sites.google.com/stompingroundyuma.org/stompingroundyuma/home",
};

// Open a native app if we can, otherwise fall back to web.
//
// Critical: on web, the fallback MUST be a synchronous window.open() call from
// inside the user gesture — otherwise popup blockers silently swallow it. That
// is exactly the bug we hit before: `await canOpenURL(...)` yielded to the
// event loop, and the subsequent `openURL(webUrl)` happened outside the tap
// gesture, so nothing opened.
async function openSocial(s: SocialLink) {
  // ---------- Web ----------
  if (Platform.OS === "web") {
    // Use window.open synchronously (still inside the click handler stack).
    // React Native Web's Linking.openURL also calls window.open, but wrapping
    // it in try/catch and calling it directly gives us a reliable single call.
    try {
      const w = typeof window !== "undefined" ? window : null;
      if (w) {
        const opened = w.open(s.webUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          // Popup blocked → hard-navigate the current tab as a last resort.
          w.location.href = s.webUrl;
        }
        return;
      }
    } catch {}
    // Fallback: RN Linking (mainly for RN-Web polyfills without `window`)
    try {
      await Linking.openURL(s.webUrl);
    } catch {
      Alert.alert(`Unable to open ${s.label}`);
    }
    return;
  }

  // ---------- Native (iOS / Android) ----------
  // Try native URL scheme first (opens the app if installed), fall back to
  // https URL (universal linking still opens the app on modern OSes; if not
  // installed, it opens the browser).
  if (s.nativeUrl) {
    const canOpen = await Linking.canOpenURL(s.nativeUrl).catch(() => false);
    if (canOpen) {
      try {
        await Linking.openURL(s.nativeUrl);
        return;
      } catch {
        // fall through to https
      }
    }
  }
  try {
    await Linking.openURL(s.webUrl);
  } catch {
    Alert.alert(`Unable to open ${s.label}`);
  }
}

/**
 * ---------- Share the app ----------
 * Pre-written invite for both platforms. On native (iOS/Android) we
 * open the OS share sheet — recipients can pick Messages, WhatsApp,
 * Email, etc., and the app-store link becomes a rich preview in
 * most chat clients. On web we fall back to the native Web Share
 * API when available, then clipboard-copy as a final graceful
 * degradation so the user can paste manually.
 *
 * KEEP THE URL IN ONE PLACE: swap ``PLAY_STORE_URL`` in a single
 * spot if the Play Store listing ID ever changes.
 */
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.stompinyuma.app";

const SHARE_MESSAGE =
  `Join me on the Stompin' Ground Yuma app to find local dance ` +
  `classes, events, and community updates: ${PLAY_STORE_URL}`;

async function shareTheApp() {
  // ---------- Web ----------
  if (Platform.OS === "web") {
    const w = typeof window !== "undefined" ? window : null;
    const nav: any = (w as any)?.navigator;
    // Chrome/Edge on Android + Safari on iOS expose navigator.share.
    // Desktop browsers largely don't; we fall through to clipboard.
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({
          title: "Stompin' Ground Yuma",
          text: SHARE_MESSAGE,
          url: PLAY_STORE_URL,
        });
        return;
      } catch (e: any) {
        // User dismissed / share aborted — treat as a silent cancel.
        // Anything else falls through to clipboard as a safety net.
        if (e?.name === "AbortError") return;
      }
    }
    // Clipboard fallback for desktop browsers.
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(SHARE_MESSAGE);
        Alert.alert(
          "Copied to clipboard",
          "Invite text is on your clipboard — paste it into any chat or email."
        );
        return;
      } catch {}
    }
    Alert.alert(
      "Copy this to share",
      SHARE_MESSAGE
    );
    return;
  }

  // ---------- Native (iOS / Android) ----------
  try {
    // `url` is iOS-only; putting it in `message` too guarantees a
    // link on Android where the share intent ignores `url`.
    await Share.share(
      {
        title: "Stompin' Ground Yuma",
        message: SHARE_MESSAGE,
        url: PLAY_STORE_URL,
      },
      {
        // A friendlier picker title on Android.
        dialogTitle: "Share Stompin' Ground Yuma",
      }
    );
  } catch (e: any) {
    Alert.alert(
      "Couldn't open share sheet",
      e?.message || "Try copying the link from the browser instead."
    );
  }
}



export default function Profile() {
  const router = useRouter();
  const { user, token, signOut, updateUser } = useAuth();
  // i18n helpers — aliased so the JSX rows can just call ``i18nT(...)``
  // without colliding with the many local ``t`` / ``tracking`` names
  // this screen already uses.
  const { t: i18nT, tRaw: i18nTRaw, locale, override } = useTranslation();
  const i18nLocaleLabel =
    override === "system"
      ? i18nT("language.system_default")
      : LOCALE_LABELS[locale];
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgeStats, setBadgeStats] = useState<{ earned: number; total: number }>({
    earned: 0,
    total: 0,
  });
  const [streak, setStreak] = useState<Streak | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryDay[]>([]);
  const [practiceStats, setPracticeStats] = useState<{
    total: number;
    days_active: number;
    best: number;
  }>({ total: 0, days_active: 0, best: 0 });
  const [followCounts, setFollowCounts] = useState<{
    following: number;
    followers: number;
  }>({ following: 0, followers: 0 });
  const [savingActivityOptIn, setSavingActivityOptIn] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [savingCertTheme, setSavingCertTheme] = useState(false);
  const [mainInstructorName, setMainInstructorName] = useState("");
  const [showPickInstructor, setShowPickInstructor] = useState(false);

  // Resolve the main instructor's display name so the profile row reads
  // "Main instructor · Erin B." — critical UX: the user picked them,
  // seeing the name confirms the choice stuck.
  useEffect(() => {
    if (!token || !user?.main_instructor_id) {
      setMainInstructorName("");
      return;
    }
    let alive = true;
    api
      .getPublicProfile(token, user.main_instructor_id)
      .then((p) => {
        if (alive) setMainInstructorName(p?.name || "");
      })
      .catch(() => {
        if (alive) setMainInstructorName("");
      });
    return () => {
      alive = false;
    };
  }, [token, user?.main_instructor_id]);

  const submitInstructorCode = async () => {
    setCodeErr(null);
    if (!codeInput.trim()) {
      setCodeErr(i18nT("profile.enter_access_code"));
      return;
    }
    if (!token) return;
    setCodeBusy(true);
    try {
      const res = await api.setInstructor(codeInput.trim(), token);
      updateUser(res.user);
      setCodeInput("");
      setCodeOpen(false);
      Alert.alert(i18nT("profile.instructor_unlock_title"), i18nT("profile.instructor_unlock_msg"));
    } catch (e: any) {
      setCodeErr(e?.message || i18nT("profile.invalid_access_code"));
    } finally {
      setCodeBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const t = await api.myTracking(token);
      setTracking(t);
      const a = await api.myAttendance(token);
      setAttendanceCount(a.class_ids.length);
      const b = await api.getBadges(token);
      setBadges(b.badges);
      setBadgeStats({ earned: b.total_earned, total: b.total_badges });
      setStreak(b.streak);
      // Practice history for the 30-day sparkline
      try {
        const ph = await api.getPracticeHistory(token, 30);
        setPracticeHistory(ph.days);
        setPracticeStats({
          total: ph.total,
          days_active: ph.days_active,
          best: ph.best_day?.count || 0,
        });
      } catch {
        // Non-fatal — chart just shows empty state.
      }
      // Follow counts for the "Following & Followers" row
      try {
        const f = await api.getMyFollows(token);
        setFollowCounts(f.counts);
      } catch {}
    } catch {}
  }, [token]);

  const submitAccountDeletion = async () => {
    if (!token) return;
    setDeleteErr(null);
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteErr(i18nT("profile.delete_type_confirm"));
      return;
    }
    setDeleteBusy(true);
    try {
      await api.deleteAccount(token);
      setDeleteOpen(false);
      // Sign out locally + drop the token before we bounce to /auth
      try {
        await signOut();
      } catch {}
      Alert.alert(
        i18nT("profile.deleted_title"),
        i18nT("profile.deleted_msg"),
      );
      router.replace("/auth");
    } catch (e: any) {
      setDeleteErr(e?.message || i18nT("profile.deleted_generic_error"));
    } finally {
      setDeleteBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const completed = tracking.filter((t) => t.status === "completed").length;
  const wishlist = tracking.filter((t) => t.status === "wishlist").length;
  const rated = tracking.filter((t) => (t.rating || 0) > 0);
  const avgRating = rated.length
    ? (rated.reduce((a, b) => a + (b.rating || 0), 0) / rated.length).toFixed(1)
    : "—";

  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.cover}>
          <Image
            source={{ uri: images.profile_cover }}
            style={StyleSheet.absoluteFillObject as any}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(43,29,22,0.2)", "rgba(43,29,22,0.75)"]}
            style={StyleSheet.absoluteFillObject as any}
          />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.name} testID="profile-name">{user?.name || i18nT("profile.dancer_default")}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin ? (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.onBrandPrimary} />
              <Text style={styles.adminText}>{i18nT("profile.admin")}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-completed">{completed}</Text>
            <Text style={styles.statLabel}>{i18nT("profile.stat_completed")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-wishlist">{wishlist}</Text>
            <Text style={styles.statLabel}>{i18nT("profile.stat_wishlist")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-attended">{attendanceCount}</Text>
            <Text style={styles.statLabel}>{i18nT("profile.stat_classes")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{avgRating}</Text>
            <Text style={styles.statLabel}>{i18nT("profile.stat_avg_rating")}</Text>
          </View>
        </View>

        {/* -------- Achievements + Streak -------- */}
        <View style={styles.section}>
          <View style={styles.achievementsHead}>
            <Text style={styles.sectionTitle}>{i18nT("profile.section_achievements")}</Text>
            <Pressable
              onPress={() => router.push("/achievements")}
              testID="profile-achievements-see-all"
            >
              <Text style={styles.link}>
                {badgeStats.earned}/{badgeStats.total} · {i18nT("common.see_all")}
              </Text>
            </Pressable>
          </View>

          <StreakCard streak={streak} />

          {badges.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm }}
              testID="profile-badges-row"
            >
              {(() => {
                // Show earned first (most recent), then next 3 locked-with-most-progress
                const earned = badges
                  .filter((b) => b.earned)
                  .sort((a, b) =>
                    (b.earned_at || "").localeCompare(a.earned_at || "")
                  );
                const locked = badges
                  .filter((b) => !b.earned)
                  .sort(
                    (a, b) =>
                      b.progress / Math.max(b.requirement, 1) -
                      a.progress / Math.max(a.requirement, 1)
                  );
                const ordered = [...earned, ...locked].slice(0, 8);
                return ordered.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => router.push("/achievements")}
                  >
                    <BadgeCard badge={b} size="md" />
                  </Pressable>
                ));
              })()}
            </ScrollView>
          ) : null}
        </View>

        {/* -------- Practice History (30-day sparkline) -------- */}
        {practiceStats.total > 0 || practiceHistory.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18nT("profile.section_practice_history")}</Text>
            <View style={styles.historyCard} testID="practice-history-card">
              <View style={styles.historyStatsRow}>
                <View style={styles.historyStat}>
                  <Text style={styles.historyStatNum}>{practiceStats.total}</Text>
                  <Text style={styles.historyStatLabel}>{i18nT("profile.total_sessions")}</Text>
                </View>
                <View style={styles.historyStatDivider} />
                <View style={styles.historyStat}>
                  <Text style={styles.historyStatNum}>{practiceStats.days_active}</Text>
                  <Text style={styles.historyStatLabel}>{i18nT("profile.days_active")}</Text>
                </View>
                <View style={styles.historyStatDivider} />
                <View style={styles.historyStat}>
                  <Text style={styles.historyStatNum}>{practiceStats.best}</Text>
                  <Text style={styles.historyStatLabel}>{i18nT("profile.peak_day")}</Text>
                </View>
              </View>
              <View style={styles.historyChartWrap}>
                <PracticeHistoryChart
                  days={practiceHistory}
                  width={320}
                  height={110}
                />
              </View>
              <Text style={styles.historyFoot}>
                {i18nT("profile.history_foot")}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18nT("profile.section_account")}</Text>

          {(user?.is_admin || user?.is_instructor) ? (
            <Pressable
              testID="profile-instructor-btn"
              style={styles.row}
              onPress={() => router.push("/(tabs)/instructor")}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="school" size={22} color={colors.brandPrimary} />
                <Text style={styles.rowText}>{i18nT("profile.instructor_tab")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              testID="profile-become-instructor"
              style={[styles.row, styles.becomeInstructorRow]}
              onPress={() => {
                setCodeErr(null);
                setCodeInput("");
                setCodeOpen(true);
              }}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="school-outline" size={22} color={colors.brandPrimary} />
                <Text style={[styles.rowText, { color: colors.brandPrimary }]}>
                  {i18nT("profile.switch_to_instructor")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brandPrimary} />
            </Pressable>
          )}

          <Pressable
            testID="profile-classes-row"
            style={styles.row}
            onPress={() => router.push("/classes")}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="calendar" size={22} color={colors.brandSecondary} />
              <Text style={styles.rowText}>
                {user?.is_admin || user?.is_instructor ? i18nT("profile.log_a_class") : i18nT("profile.class_recap")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-suggest-row"
            style={styles.row}
            onPress={() => router.push("/suggest")}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="bulb" size={22} color={colors.brandTertiary} />
              <Text style={styles.rowText}>
                {user?.is_admin
                  ? i18nT("profile.review_suggestions")
                  : mainInstructorName
                    ? i18nT("profile.suggest_a_dance_to", { name: mainInstructorName.split(" ")[0] })
                    : i18nT("profile.suggest_a_dance")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* My instructors picker — dedicated row so dancers can
              manage who they follow and who receives their
              Suggest-a-Dance inbox at any time. */}
          <Pressable
            testID="profile-main-instructor-row"
            style={styles.row}
            onPress={() => setShowPickInstructor(true)}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="people-circle"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.my_instructors")}</Text>
                <Text style={styles.deleteSub}>
                  {(() => {
                    const count = user?.instructor_ids?.length || 0;
                    if (count === 0)
                      return i18nT("profile.instructors_hint_none");
                    const others = Math.max(0, count - 1);
                    if (mainInstructorName && others > 0) {
                      return i18nT("profile.instructors_hint_primary_more", { name: mainInstructorName, count: others });
                    }
                    if (mainInstructorName) {
                      return i18nT("profile.instructors_hint_primary", { name: mainInstructorName });
                    }
                    return i18nT("profile.instructors_hint_no_primary", { count });
                  })()}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* Follow-a-choreographer entry point — separate from the
              "My instructors" row above because it's a broader
              nudge-me-when-they-drop-new-content list, whereas the
              instructor picker drives Suggest-a-Dance routing. */}
          <Pressable
            testID="profile-followed-choreographers-row"
            style={styles.row}
            onPress={() => router.push("/choreographers")}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="notifications"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.followed_choreographers")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.followed_choreographers_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* @Mentions inbox — populated whenever an instructor tags
              this user in a chat message. Unread pill hydrates from
              the same endpoint. */}
          <MentionsProfileRow />

          {/* Notification preferences — per-category push mutes */}
          <Pressable
            testID="profile-notification-prefs-row"
            style={styles.row}
            onPress={() => router.push("/settings/notifications")}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="notifications-circle-outline"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.notification_prefs")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.notification_prefs_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* My Submissions — user's own CopperKnob/BootStepper dance
              requests: pending, approved, rejected. */}
          <Pressable
            testID="profile-my-submissions-row"
            style={styles.row}
            onPress={() => router.push("/my-submissions")}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="cloud-upload-outline"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>
                  {i18nT("my_submissions.title")}
                </Text>
                <Text style={styles.deleteSub}>
                  {i18nT("my_submissions.subtitle")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* Language — user chooses UI + notification language */}
          <Pressable
            testID="profile-language-row"
            style={styles.row}
            onPress={() => router.push("/settings/language")}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="language"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.language")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nLocaleLabel}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-leaderboard-row"
            style={styles.row}
            onPress={() => router.push("/leaderboard")}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trophy" size={22} color={colors.brandTertiary} />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.boot_scoot_board")}</Text>
                <Text style={styles.deleteSub}>
                  {user?.show_on_leaderboard
                    ? i18nT("profile.boot_scoot_visible")
                    : i18nT("profile.boot_scoot_hidden")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {/* -------- Social: follow lists + activity opt-in -------- */}
          <Pressable
            testID="profile-follows-row"
            style={styles.row}
            onPress={() => router.push("/follows")}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="people" size={22} color={colors.brandSecondary} />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.follows_row")}</Text>
                <Text style={styles.deleteSub}>
                  {followCounts.followers === 1
                    ? i18nT("profile.follows_row_sub", {
                        following: followCounts.following,
                        followers: followCounts.followers,
                      })
                    : i18nT("profile.follows_row_sub_plural", {
                        following: followCounts.following,
                        followers: followCounts.followers,
                      })}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-activity-feed-toggle"
            style={styles.row}
            onPress={async () => {
              if (!token || savingActivityOptIn) return;
              const next = !(user?.show_in_activity_feed ?? true);
              setSavingActivityOptIn(true);
              try {
                await api.setActivityOptIn(token, next);
                updateUser({ show_in_activity_feed: next });
              } catch (e: any) {
                Alert.alert(
                  i18nT("profile.couldnt_save"),
                  e?.message || i18nT("profile.please_try_again")
                );
              } finally {
                setSavingActivityOptIn(false);
              }
            }}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name={
                  (user?.show_in_activity_feed ?? true) ? "eye" : "eye-off"
                }
                size={22}
                color={
                  (user?.show_in_activity_feed ?? true)
                    ? colors.success
                    : colors.muted
                }
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.show_activity")}</Text>
                <Text style={styles.deleteSub}>
                  {(user?.show_in_activity_feed ?? true)
                    ? i18nT("profile.show_activity_on")
                    : i18nT("profile.show_activity_off")}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.switch,
                (user?.show_in_activity_feed ?? true) && styles.switchOn,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  (user?.show_in_activity_feed ?? true) && styles.switchThumbOn,
                ]}
              />
            </View>
          </Pressable>

          {/* Certificate theme — pick once, all future PDFs use it. */}
          <View style={styles.themeCard} testID="profile-cert-theme-card">
            <View style={styles.themeCardHead}>
              <Ionicons name="ribbon" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{i18nT("profile.certificate_theme")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.certificate_theme_sub")}
                </Text>
              </View>
            </View>
            <CertificateThemePicker
              layout="grid"
              value={user?.certificate_theme || "classic"}
              disabled={savingCertTheme}
              onChange={async (key) => {
                if (!token || key === user?.certificate_theme) return;
                setSavingCertTheme(true);
                try {
                  await api.setCertificateTheme(key, token);
                  updateUser({ certificate_theme: key });
                } catch (e: any) {
                  Alert.alert(
                    i18nT("profile.couldnt_update_theme"),
                    e?.message || i18nT("profile.please_try_again")
                  );
                } finally {
                  setSavingCertTheme(false);
                }
              }}
            />
          </View>

          <Pressable
            testID="logout-btn"
            style={styles.row}
            onPress={async () => {
              await signOut();
              router.replace("/auth");
            }}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="log-out" size={22} color={colors.error} />
              <Text style={[styles.rowText, { color: colors.error }]}>{i18nT("profile.sign_out")}</Text>
            </View>
          </Pressable>

          <Pressable
            testID="delete-account-btn"
            style={[styles.row, styles.deleteRow]}
            onPress={() => {
              setDeleteConfirmText("");
              setDeleteErr(null);
              setDeleteOpen(true);
            }}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="trash" size={22} color={colors.error} />
              <View>
                <Text style={[styles.rowText, { color: colors.error }]}>{i18nT("profile.delete_account")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.delete_account_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.error} />
          </Pressable>
        </View>

        {/* -------------------- Connect With Us -------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18nT("profile.section_connect")}</Text>
          <Text style={styles.connectSub}>
            {i18nT("profile.connect_sub")}
          </Text>

          <View style={styles.socialGrid}>
            {SOCIAL_LINKS.map((s) => (
              <Pressable
                key={s.key}
                testID={`profile-social-${s.key}`}
                onPress={() => openSocial(s)}
                style={({ pressed }) => [
                  styles.socialCard,
                  { backgroundColor: s.bg },
                  pressed && { opacity: 0.85 },
                ]}
                hitSlop={6}
              >
                <Ionicons name={s.icon as any} size={26} color={s.iconColor} />
                <Text style={[styles.socialCardLabel, { color: s.iconColor }]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            testID="profile-share-app-cta"
            onPress={shareTheApp}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="share-social-outline"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.share_app")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.share_app_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-website-cta"
            onPress={() => openSocial(SITE_LINK)}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="globe-outline" size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{i18nT("profile.visit_website")}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-privacy-cta"
            onPress={() => router.push("/privacy")}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{i18nT("profile.privacy_policy")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-terms-cta"
            onPress={() => router.push("/terms")}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{i18nT("profile.terms_of_service")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-community-cta"
            onPress={() => router.push("/community-guidelines")}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="people-outline" size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{i18nT("profile.community_guidelines")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-blocked-users-cta"
            onPress={() => router.push("/blocked-users")}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons
                name="hand-left-outline"
                size={22}
                color={colors.brandPrimary}
              />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.blocked_users")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.blocked_users_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="profile-feedback-cta"
            onPress={() => router.push("/feedback")}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.brandPrimary} />
              <View>
                <Text style={styles.rowText}>{i18nT("profile.send_feedback")}</Text>
                <Text style={styles.deleteSub}>
                  {i18nT("profile.send_feedback_sub")}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          <CurrentVersionRow />
        </View>

        <SignInMethodsSection />

        {user?.is_admin ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18nT("profile.sgy_admin")}</Text>
            <Pressable
              testID="profile-moderation-cta"
              onPress={() => router.push("/admin/reports")}
              style={styles.websiteRow}
            >
              <View style={styles.rowLeft}>
                <Ionicons
                  name="shield-half-outline"
                  size={22}
                  color={colors.brandPrimary}
                />
                <Text style={styles.rowText}>{i18nT("profile.moderation_queue")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              testID="profile-admin-feedback-cta"
              onPress={() => router.push("/admin/feedback")}
              style={styles.websiteRow}
            >
              <View style={styles.rowLeft}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={22}
                  color={colors.brandPrimary}
                />
                <Text style={styles.rowText}>{i18nT("profile.user_feedback")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              testID="profile-admin-pending-dances-cta"
              onPress={() => router.push("/admin/pending-dances")}
              style={styles.websiteRow}
            >
              <View style={styles.rowLeft}>
                <Ionicons
                  name="hourglass-outline"
                  size={22}
                  color={colors.brandPrimary}
                />
                <Text style={styles.rowText}>{i18nT("admin_pending.title")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <RefreshRecommendationsAdminRow />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18nT("profile.about_venue")}</Text>
          <Text style={styles.aboutText}>
            {i18nT("profile.about_venue_text")}
          </Text>
        </View>
      </ScrollView>

      <AdminAddModal
        visible={adminOpen}
        onClose={() => setAdminOpen(false)}
        onSaved={() => {
          setAdminOpen(false);
        }}
        token={token || ""}
      />

      {/* Instructor access code modal */}
      <Modal
        visible={codeOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCodeOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCodeOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.codeModalHeader}>
              <Ionicons
                name="school"
                size={26}
                color={colors.brandPrimary}
              />
              <Text style={styles.codeModalTitle}>{i18nT("profile.switch_to_instructor")}</Text>
            </View>
            <Text style={styles.modalSub}>
              {i18nT("profile.instructor_modal_sub")}
            </Text>

            <TextInput
              testID="profile-instructor-code-input"
              placeholder={i18nT("profile.instructor_code_placeholder")}
              placeholderTextColor={colors.muted}
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.modalInput}
            />

            {codeErr ? (
              <Text style={styles.modalErr}>{codeErr}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                testID="profile-instructor-cancel"
                onPress={() => setCodeOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>{i18nT("common.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="profile-instructor-submit"
                onPress={submitInstructorCode}
                disabled={codeBusy}
                style={[styles.modalPrimaryBtn, codeBusy && { opacity: 0.6 }]}
              >
                {codeBusy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.modalPrimaryText}>{i18nT("profile.unlock")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Account confirmation modal (Apple 5.1.1(v) compliance) */}
      <Modal
        visible={deleteOpen}
        animationType="fade"
        transparent
        onRequestClose={() => (deleteBusy ? null : setDeleteOpen(false))}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => (deleteBusy ? null : setDeleteOpen(false))}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.codeModalHeader}>
              <Ionicons name="warning" size={26} color={colors.error} />
              <Text style={[styles.codeModalTitle, { color: colors.error }]}>
                {i18nT("profile.delete_title")}
              </Text>
            </View>
            <Text style={styles.modalSub}>
              {i18nT("profile.delete_body")}
              {"\n\n"}
              <Text style={{ fontWeight: "700", color: colors.onSurface }}>
                {i18nT("profile.delete_cant_undone")}
              </Text>
            </Text>

            <Text style={styles.deleteConfirmLabel}>
              {(() => {
                // Use raw source so the literal ``{word}`` token
                // survives to be split around the bold "DELETE".
                const parts = i18nTRaw("profile.delete_confirm_label").split("{word}");
                return (
                  <>
                    {parts[0]}
                    <Text style={{ fontWeight: "800" }}>DELETE</Text>
                    {parts[1] || ""}
                  </>
                );
              })()}
            </Text>
            <TextInput
              testID="delete-account-confirm"
              placeholder="DELETE"
              placeholderTextColor={colors.muted}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.modalInput}
            />

            {deleteErr ? <Text style={styles.modalErr}>{deleteErr}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable
                testID="delete-account-cancel"
                onPress={() => setDeleteOpen(false)}
                disabled={deleteBusy}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>{i18nT("common.cancel")}</Text>
              </Pressable>
              <Pressable
                testID="delete-account-submit"
                onPress={submitAccountDeletion}
                disabled={deleteBusy}
                style={[styles.deletePrimaryBtn, deleteBusy && { opacity: 0.6 }]}
              >
                {deleteBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deletePrimaryText}>{i18nT("profile.delete_forever")}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <PickInstructorSheet
        visible={showPickInstructor}
        onClose={() => setShowPickInstructor(false)}
        title={mainInstructorName ? i18nT("profile.my_instructors") : i18nT("profile.pick_your_instructors")}
        onSaved={({ primary }) => {
          setShowPickInstructor(false);
          if (primary) setMainInstructorName(primary.name);
          else setMainInstructorName("");
        }}
      />
    </SafeAreaView>
  );
}

/**
 * CurrentVersionRow
 * -----------------
 * Honest "which build am I on?" affordance. OTA (self-serve JS updates)
 * is disabled today because Emergent's platform doesn't yet hand us a
 * managed EAS project ID. Showing the current app version + a one-liner
 * explaining how updates arrive keeps users informed without the
 * misleading "Check for updates" button that used to sit here and
 * always errored.
 */
/**
 * Small profile row that shows the user's unread-mention count.
 * Fetches ``/chat/mentions/me`` on mount (and every 30s afterwards
 * so a fresh @-mention popping in while the user sits on Profile
 * still lights up the pill). Deep-links into ``/mentions``.
 */
function MentionsProfileRow() {
  const { token } = useAuth();
  const router = useRouter();
  const { t: i18nT } = useTranslation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getMyMentions(token, 1);
        if (!cancelled) setUnread(r.unread_count || 0);
      } catch {
        // Silent — worst case the pill just doesn't render.
      }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [token]);
  return (
    <Pressable
      testID="profile-mentions-row"
      style={styles.row}
      onPress={() => router.push("/mentions")}
    >
      <View style={styles.rowLeft}>
        <Ionicons name="at" size={22} color={colors.brandPrimary} />
        <View>
          <Text style={styles.rowText}>{i18nT("profile.my_mentions")}</Text>
          <Text style={styles.deleteSub}>
            {unread > 0
              ? unread === 1
                ? i18nT("profile.mentions_unread_one")
                : i18nT("profile.mentions_unread", { count: unread })
              : i18nT("profile.mentions_default")}
          </Text>
        </View>
      </View>
      {unread > 0 ? (
        <View style={styles.mentionPill}>
          <Text style={styles.mentionPillText}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}


/**
 * Admin-only row that surfaces the number of drifted-metadata flags
 * still waiting for review. Uses the cheap /counts endpoint so it
 * doesn't blow the whole flag payload on a tab switch.
 */
function RefreshRecommendationsAdminRow() {
  const { token, user } = useAuth();
  const router = useRouter();
  const { t: i18nT } = useTranslation();
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    if (!token || !user?.is_admin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getRefreshRecommendationCounts(token);
        if (!cancelled) setUnseen(r.unseen || 0);
      } catch {
        // Silent — the row still works without the badge.
      }
    };
    load();
    // Cheaper interval than 30s — this list changes at nightly cadence.
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [token, user?.is_admin]);
  if (!user?.is_admin) return null;
  return (
    <Pressable
      testID="profile-admin-drift-cta"
      onPress={() => router.push("/admin/refresh-recommendations")}
      style={styles.websiteRow}
    >
      <View style={styles.rowLeft}>
        <Ionicons name="refresh-circle" size={22} color={colors.brandPrimary} />
        <View>
          <Text style={styles.rowText}>{i18nT("profile.refresh_recommendations")}</Text>
          <Text style={styles.deleteSub}>
            {unseen > 0
              ? unseen === 1
                ? i18nT("profile.refresh_recommendations_unseen_one")
                : i18nT("profile.refresh_recommendations_unseen", { count: unseen })
              : i18nT("profile.refresh_recommendations_none")}
          </Text>
        </View>
      </View>
      {unseen > 0 ? (
        <View style={styles.mentionPill}>
          <Text style={styles.mentionPillText}>
            {unseen > 99 ? "99+" : unseen}
          </Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}



function CurrentVersionRow() {
  const { t: i18nT } = useTranslation();
  if (Platform.OS === "web") return null;

  const version =
    (Constants.expoConfig?.version as string) ||
    (Application as any)?.nativeApplicationVersion ||
    "—";
  const build =
    Platform.OS === "ios"
      ? ((Application as any)?.nativeBuildVersion || "")
      : String((Application as any)?.nativeBuildVersion || "");

  return (
    <View style={styles.websiteRow}>
      <View style={styles.rowLeft}>
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={colors.brandPrimary}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowText}>
            {build
              ? i18nT("profile.app_version_with_build", { version, build })
              : i18nT("profile.app_version", { version })}
          </Text>
          <Text style={styles.deleteSub}>
            {i18nT("profile.updates_arrive")}
          </Text>
        </View>
      </View>
    </View>
  );
}


function AdminAddModal({
  visible,
  onClose,
  onSaved,
  token,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [name, setName] = useState("");
  const [choreographer, setChor] = useState("");
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [difficulty, setDiff] = useState("Beginner");
  const [bpm, setBpm] = useState("");
  const [count, setCount] = useState("");
  const [yt, setYt] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !choreographer || !song) return;
    setSaving(true);
    try {
      await api.createDance(
        {
          name,
          choreographer,
          song,
          artist,
          difficulty,
          bpm: bpm ? parseInt(bpm) : undefined,
          count,
          youtube_url: yt,
        },
        token
      );
      setName(""); setChor(""); setSong(""); setArtist("");
      setBpm(""); setCount(""); setYt("");
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Dance</Text>
          <Pressable onPress={onClose} testID="admin-close">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <TextInput testID="admin-input-name" placeholder="Dance name *" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
          <TextInput testID="admin-input-chor" placeholder="Choreographer *" placeholderTextColor={colors.muted} value={choreographer} onChangeText={setChor} style={styles.input} />
          <TextInput testID="admin-input-song" placeholder="Song *" placeholderTextColor={colors.muted} value={song} onChangeText={setSong} style={styles.input} />
          <TextInput placeholder="Artist" placeholderTextColor={colors.muted} value={artist} onChangeText={setArtist} style={styles.input} />
          <View style={styles.chipsRow}>
            {["Absolute Beginner", "Beginner", "Improver", "High Improver", "Intermediate", "Advanced"].map((d) => (
              <Pressable key={d} onPress={() => setDiff(d)} style={[styles.diffChip, difficulty === d && styles.diffChipActive]}>
                <Text style={[styles.diffChipText, difficulty === d && { color: colors.onBrandPrimary }]}>{d}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput placeholder="BPM" keyboardType="number-pad" placeholderTextColor={colors.muted} value={bpm} onChangeText={setBpm} style={styles.input} />
          <TextInput placeholder="Count (e.g. 32 count, 4 wall)" placeholderTextColor={colors.muted} value={count} onChangeText={setCount} style={styles.input} />
          <TextInput placeholder="YouTube URL" placeholderTextColor={colors.muted} value={yt} onChangeText={setYt} style={styles.input} autoCapitalize="none" />

          <Pressable testID="admin-save-btn" onPress={submit} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveBtnText}>Save Dance</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  cover: { height: 160, justifyContent: "flex-end", alignItems: "center" },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.surface,
    marginBottom: -48,
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 30, fontWeight: "700", fontFamily: "serif" },
  header: { alignItems: "center", paddingTop: 56, paddingHorizontal: spacing.lg, gap: 4 },
  name: { fontFamily: "serif", fontSize: 24, fontWeight: "700", color: colors.onSurface },
  email: { color: colors.muted, fontSize: 13 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  adminText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700" },
  stats: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "serif", fontSize: 30, fontWeight: "700", color: colors.brandPrimary },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: colors.divider },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  sectionTitle: { fontFamily: "serif", fontSize: 20, fontWeight: "700", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  achievementsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // ---- Practice History ----
  historyCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  historyStatsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyStat: {
    flex: 1,
    alignItems: "center",
  },
  historyStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.divider,
  },
  historyStatNum: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
  },
  historyStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 2,
  },
  historyChartWrap: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
  historyFoot: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
    fontStyle: "italic",
  },
  // ---- Switch (for activity-feed opt-in) ----
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: "center",
  },
  switchOn: { backgroundColor: colors.brandPrimary },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbOn: { transform: [{ translateX: 20 }] },
  connectSub: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: -2, marginBottom: spacing.xs },
  socialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  socialCard: {
    // 2-per-row on phones (min-touch 48pt+, gap-aware)
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 76,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  socialCardLabel: { fontSize: 14, fontWeight: "700" },
  websiteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  becomeInstructorRow: {
    borderWidth: 1,
    borderColor: colors.brandPrimary + "66",
    backgroundColor: colors.brandPrimary + "10",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  codeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  codeModalTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
  },
  modalSub: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.onSurface,
    fontSize: 15,
  },
  modalErr: { color: colors.error, fontSize: 13 },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
  },
  modalCancelText: { color: colors.onSurface, fontWeight: "600", fontSize: 15 },
  modalPrimaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
  },
  modalPrimaryText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  deletePrimaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.error,
    alignItems: "center",
  },
  deletePrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  deleteConfirmLabel: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: 4,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  deleteRow: {
    borderColor: colors.error + "44",
    backgroundColor: colors.error + "0D",
  },
  deleteSub: {
    color: colors.error + "cc",
    fontSize: 11,
    marginTop: 2,
    maxWidth: 240,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
  mentionPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  mentionPillText: {
    color: colors.onBrandPrimary,
    fontSize: 11,
    fontWeight: "800",
  },
  themeCard: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  themeCardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  aboutText: { color: colors.onSurfaceSecondary, lineHeight: 20, fontSize: 14 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: { fontFamily: "serif", fontSize: 22, fontWeight: "700", color: colors.onSurface },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 14,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  diffChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  diffChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  diffChipText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
});
