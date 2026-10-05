import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { colors, spacing, radius, images } from "@/src/theme";
import { api, FeedEvent, LeaderboardEntry, Streak } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { StreakCard } from "@/src/components/StreakCard";
import { FeedEventCard } from "@/src/components/FeedEventCard";
import { PickInstructorSheet } from "@/src/components/PickInstructorSheet";
import { WeeklyRecapCard } from "@/src/components/WeeklyRecapCard";
import { DanceOfTheDayCard } from "@/src/components/DanceOfTheDayCard";
import { FollowedInstructorHub } from "@/src/components/FollowedInstructorHub";
import { useTranslation } from "@/src/i18n";

export default function Home() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [topDancers, setTopDancers] = useState<LeaderboardEntry[]>([]);
  const [practiced, setPracticed] = useState<
    { dance: { id: string; name: string; choreographer: string; difficulty: string; bpm: number | null }; status: string; last_activity_at: string }[]
  >([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [unseenBadges, setUnseenBadges] = useState(0);
  const [feedPreview, setFeedPreview] = useState<FeedEvent[]>([]);
  const [mainInstructorName, setMainInstructorName] = useState<string>("");
  const [showPickInstructor, setShowPickInstructor] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    api
      .getLeaderboard("all", 3, token || undefined)
      .then((lb) => setTopDancers(lb.entries || []))
      .catch(() => {});
    if (token) {
      api
        .recentlyPracticed(token, 8)
        .then((r) => setPracticed(r.items || []))
        .catch(() => {});
    } else {
      setPracticed([]);
      setStreak(null);
      setUnseenBadges(0);
      setFeedPreview([]);
    }
  }, [token]);

  // Refresh streak + badge + feed indicators on every Home focus so users
  // see the effect of completing dances immediately when they navigate back.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      api.getBadges(token).then((r) => {
        setStreak(r.streak);
        setUnseenBadges(r.unseen_count);
      }).catch(() => {});
      api.getFeed(token, 3).then((r) => {
        setFeedPreview(r.events || []);
      }).catch(() => {});
      api
        .getUnreadNotificationCount(token)
        .then((r) => setUnreadNotifs(r.unread))
        .catch(() => {});
    }, [token])
  );

  // Resolve the main instructor's display name whenever the caller's
  // ``main_instructor_id`` changes so the Suggest a Dance card can
  // read "Suggest a Dance for [Name]".
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

  const handleSuggestPress = useCallback(() => {
    // If they haven't picked an instructor yet, show the picker first —
    // then route into /suggest so their first idea lands correctly.
    if (!user?.main_instructor_id) {
      setShowPickInstructor(true);
      return;
    }
    router.push("/suggest");
  }, [user?.main_instructor_id, router]);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Community poster hero — full designed piece with logo, tagline,
            and community-values icons already baked in. We size the hero
            to the image's ~2:3 portrait aspect ratio so nothing is
            cropped and the entire poster is visible on first paint.
            No overlay text is added here (the poster provides its own). */}
        <View style={styles.hero}>
          <Image
            source={images.home_hero_local}
            style={StyleSheet.absoluteFillObject as any}
            contentFit="cover"
            contentPosition="top"
          />
          {/* Floating bell icon with unread badge — sits over the hero
              so it's reachable with one thumb above the first scroll.
              Only renders for signed-in users. */}
          {token ? (
            <Pressable
              testID="home-notif-bell"
              onPress={() => router.push("/notifications")}
              style={styles.bellBtn}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                unreadNotifs > 0
                  ? `Notifications, ${unreadNotifs} unread`
                  : "Notifications"
              }
            >
              <Ionicons
                name="notifications"
                size={22}
                color={colors.onBrandPrimary}
              />
              {unreadNotifs > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadNotifs > 99 ? "99+" : unreadNotifs}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {/* Dance Of The Day — one featured dance each day, prioritising
            unpracticed library content. Hero sized card that lives
            above every other section so it's the first thing dancers
            see when they open the app in the morning. */}
        <DanceOfTheDayCard />

        {/* Followed-Instructor Hub — upcoming classes + events from
            every instructor the signed-in dancer follows, pulled
            from `users.instructor_ids` server-side. Renders nothing
            at all for signed-out users / dancers with zero follows
            / weeks with no upcoming items, so Home doesn't gain a
            dead card. */}
        <FollowedInstructorHub />

        <View style={styles.section}>
          <Text style={styles.helloText}>
            {user?.name
              ? t("home.hello", { name: user.name.split(" ")[0] })
              : t("home.hello_no_name")}
          </Text>
          <Text style={styles.subHello}>{t("home.subhello")}</Text>

          {token ? (
            <>
              <WeeklyRecapCard />
              <StreakCard streak={streak} />
              <Pressable
                testID="home-achievements-cta"
                onPress={() => router.push("/achievements")}
                style={styles.achievementsRow}
              >
                <View style={styles.achievementsIcon}>
                  <Ionicons
                    name="ribbon"
                    size={22}
                    color={colors.brandTertiary}
                  />
                  {unseenBadges > 0 && (
                    <View style={styles.badgeDot}>
                      <Text style={styles.badgeDotText}>{unseenBadges}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestTitle}>{t("home.achievements_title")}</Text>
                  <Text style={styles.suggestSub}>
                    {unseenBadges > 0
                      ? unseenBadges === 1
                        ? t("home.achievements_sub_unseen_one")
                        : t("home.achievements_sub_unseen", { count: unseenBadges })
                      : t("home.achievements_sub_default")}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            </>
          ) : null}

          <Pressable
            testID="home-browse-cta"
            onPress={() => router.push("/(tabs)/library")}
            style={styles.ctaBtn}
          >
            <Text style={styles.ctaBtnText}>{t("home.browse_cta")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        {/* -------- Activity Feed preview -------- */}
        {token ? (
          <View style={styles.section} testID="home-feed-section">
            <View style={styles.sectionHeader}>
              <Text
                style={[styles.sectionTitle, styles.sectionTitleFlex]}
                numberOfLines={1}
              >
                {t("home.community_activity")}
              </Text>
              <Pressable
                onPress={() => router.push("/feed")}
                testID="home-feed-see-all"
              >
                <Text style={styles.link}>{t("common.see_all")}</Text>
              </Pressable>
            </View>
            {feedPreview.length === 0 ? (
              <Pressable
                onPress={() => router.push("/feed")}
                style={styles.feedEmpty}
                testID="home-feed-empty"
              >
                <Ionicons
                  name="people"
                  size={22}
                  color={colors.brandTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestTitle}>
                    {t("home.feed_empty_title")}
                  </Text>
                  <Text style={styles.suggestSub}>
                    {t("home.feed_empty_sub")}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            ) : (
              feedPreview.map((e) => <FeedEventCard key={e.id} event={e} />)
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              style={[styles.sectionTitle, styles.sectionTitleFlex]}
              numberOfLines={1}
            >
              {t("home.fresh_on_floor")}
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/library")} testID="home-see-all">
              <Text style={styles.link}>{t("common.see_all")}</Text>
            </Pressable>
          </View>

          {token && practiced.length > 0 && (
            <View style={styles.practicedWrap}>
              <View style={styles.practicedHeader}>
                <View style={styles.practicedTitleRow}>
                  <Ionicons name="time" size={16} color={colors.brandPrimary} />
                  <Text style={styles.practicedTitle} numberOfLines={1}>
                    {t("home.recently_practiced")}
                  </Text>
                </View>
                <Text
                  style={styles.practicedHint}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {t("home.pick_up")}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {practiced.map((p) => (
                  <Pressable
                    key={p.dance.id}
                    testID={`home-practiced-${p.dance.id}`}
                    onPress={() => router.push(`/dance/${p.dance.id}`)}
                    style={styles.practicedCard}
                  >
                    <View style={styles.practicedIconBox}>
                      <Ionicons
                        name={p.status === "completed" ? "checkmark-done-circle" : "musical-notes"}
                        size={20}
                        color={p.status === "completed" ? colors.success : colors.brandPrimary}
                      />
                    </View>
                    <Text style={styles.practicedCardTitle} numberOfLines={2}>
                      {p.dance.name}
                    </Text>
                    <Text style={styles.practicedCardMeta} numberOfLines={1}>
                      {p.dance.difficulty}
                      {p.dance.bpm ? ` · ${p.dance.bpm} BPM` : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Pressable
            testID="home-leaderboard-cta"
            onPress={() => router.push("/leaderboard")}
            style={styles.leaderboardCard}
          >
            <View style={styles.leaderboardIcon}>
              <Ionicons name="trophy" size={22} color={colors.brandTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>{t("home.leaderboard_title")}</Text>
              {topDancers.length > 0 ? (
                <Text style={styles.suggestSub} numberOfLines={1}>
                  {topDancers
                    .map((d, i) => `${i + 1}. ${d.name.split(" ")[0]} (${d.count})`)
                    .join("  ·  ")}
                </Text>
              ) : (
                <Text style={styles.suggestSub}>
                  {t("home.leaderboard_default_sub")}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="home-events-cta"
            onPress={() => router.push("/events")}
            style={styles.eventsCard}
          >
            <View style={styles.eventsIcon}>
              <Ionicons name="compass" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>{t("home.events_title")}</Text>
              <Text style={styles.suggestSub}>
                {t("home.events_sub")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="home-classes-cta"
            onPress={() => router.push("/classes")}
            style={styles.classesCard}
          >
            <View style={styles.classesIcon}>
              <Ionicons name="calendar" size={22} color={colors.brandSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>{t("home.classes_title")}</Text>
              <Text style={styles.suggestSub}>
                {t("home.classes_sub")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="home-suggest-cta"
            onPress={handleSuggestPress}
            style={styles.suggestCard}
          >
            <View style={styles.suggestIcon}>
              <Ionicons name="bulb" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>
                {mainInstructorName
                  ? t("home.suggest_title_for", { name: mainInstructorName.split(" ")[0] })
                  : t("home.suggest_title")}
              </Text>
              <Text style={styles.suggestSub}>
                {mainInstructorName
                  ? t("home.suggest_sub_for", { name: mainInstructorName })
                  : t("home.suggest_sub_default")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.about_title")}</Text>
          <View style={styles.aboutCard}>
            <Ionicons name="location" size={18} color={colors.brandPrimary} />
            <Text style={styles.aboutText}>
              {t("home.about_text")}
            </Text>
          </View>
          <View style={styles.rowIcons}>
            <View style={styles.iconItem}>
              <View style={styles.iconOrb}>
                <Ionicons name="people" size={22} color={colors.brandSecondary} />
              </View>
              <Text
                style={styles.iconLabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t("home.icon_all_ages")}
              </Text>
            </View>
            <View style={styles.iconItem}>
              <View style={[styles.iconOrb, { backgroundColor: "#FFF3D9" }]}>
                <Ionicons name="sparkles" size={22} color={colors.warning} />
              </View>
              <Text
                style={styles.iconLabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t("home.icon_beginners")}
              </Text>
            </View>
            <View style={styles.iconItem}>
              <View style={[styles.iconOrb, { backgroundColor: "#FCE6DF" }]}>
                <Ionicons name="heart" size={22} color={colors.brandPrimary} />
              </View>
              <Text
                style={styles.iconLabel}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t("home.icon_family")}
              </Text>
            </View>
          </View>

          <Pressable
            testID="home-website-cta"
            onPress={() => {
              const url = "https://sites.google.com/stompingroundyuma.org/stompingroundyuma/home";
              if (Platform.OS === "web" && typeof window !== "undefined") {
                const opened = window.open(url, "_blank", "noopener,noreferrer");
                if (!opened) window.location.href = url;
                return;
              }
              Linking.openURL(url).catch(() => {});
            }}
            style={styles.websiteBtn}
          >
            <Ionicons name="globe-outline" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.websiteBtnText}>{t("home.website_cta")}</Text>
            <Ionicons name="open-outline" size={16} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </ScrollView>
      <PickInstructorSheet
        visible={showPickInstructor}
        onClose={() => setShowPickInstructor(false)}
        onSaved={({ user: fresh }) => {
          setShowPickInstructor(false);
          // Only route into Suggest when they actually saved a
          // primary — otherwise leave them on Home to admire their
          // new picks.
          if (fresh.main_instructor_id) {
            router.push("/suggest");
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  // Poster hero — sized to the source image's 1024×1536 (2:3) aspect ratio
  // so the entire designed poster is visible on first paint without any
  // cropping. Background matches the poster's cream so the top status-bar
  // area feels intentional on notched devices.
  hero: {
    width: "100%",
    aspectRatio: 1024 / 1536,
    backgroundColor: "#F4E7CE",
    overflow: "hidden",
  },
  // Floating bell overlay anchored to the top-right of the hero.
  // Positioned absolutely so it doesn't move the hero image. Dark pill
  // + white icon gives it enough contrast against both light and dark
  // poster regions.
  bellBtn: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandPrimary + "DD",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  bellBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.brand ?? colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  section: { padding: spacing.xl, gap: spacing.md },
  helloText: { fontFamily: "serif", fontSize: 28, color: colors.onSurface, fontWeight: "700" },
  subHello: { fontSize: 15, color: colors.muted, marginTop: -6 },
  ctaBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ctaBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
  },
  // Only used inside sectionHeader — takes remaining space so long
  // titles truncate instead of pushing "See all" off the edge.
  sectionTitleFlex: {
    flex: 1,
    minWidth: 0,
  },
  link: { color: colors.brandPrimary, fontWeight: "600", flexShrink: 0 },
  miniCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  miniMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.onBrandTertiary },
  aboutCard: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aboutText: { flex: 1, color: colors.onSurfaceSecondary, lineHeight: 20, fontSize: 14 },
  // Three "value" chips (All ages · Beginners welcome · Family friendly).
  // Flex each item equally so labels center under their icons with plenty
  // of breathing room — no crowding on narrow devices.
  rowIcons: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  iconItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    minWidth: 0,
  },
  iconOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6ECFA",
  },
  iconLabel: {
    fontSize: 11,
    color: colors.onSurface,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 15,
    letterSpacing: 0.1,
    alignSelf: "stretch",
  },
  suggestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.brandTertiary + "22",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
  },
  suggestIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandTertiary,
  },
  suggestTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  suggestSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  classesCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.brandSecondary + "18",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary + "55",
    marginBottom: spacing.sm,
  },
  classesIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandSecondary + "55",
  },
  eventsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.brandPrimary + "14",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
    marginBottom: spacing.sm,
  },
  eventsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
  },
  leaderboardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.brandTertiary + "22",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandTertiary + "88",
    marginBottom: spacing.sm,
  },
  leaderboardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandTertiary + "88",
  },
  websiteBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  websiteBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  // ---- Recently Practiced ----
  practicedWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.brandPrimary + "0F",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
  },
  practicedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  // Left group of the practiced header — expands to eat any spare
  // width so the hint on the right doesn't crash into it on narrow
  // devices. minWidth 0 lets the child Text truncate properly.
  practicedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  practicedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    flexShrink: 1,
  },
  practicedHint: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: "italic",
    flexShrink: 0,
    maxWidth: 170,
  },
  practicedCard: {
    width: 140,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  practicedIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  practicedCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    minHeight: 34,
  },
  practicedCardMeta: {
    fontSize: 11,
    color: colors.muted,
  },

  // ---- Achievements row ----
  achievementsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandTertiary + "22",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandTertiary + "88",
  },
  feedEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  achievementsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandTertiary + "88",
    position: "relative",
  },
  badgeDot: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeDotText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
});
