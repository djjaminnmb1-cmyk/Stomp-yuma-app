/**
 * /users/[id] — Another dancer's public profile.
 *
 * Displays: avatar + name, follow/unfollow, big streak + total-completed
 * stats, badge showcase, and follow-count row. Respects the user's
 * ``show_in_activity_feed`` preference (the profile itself is always
 * public, but a recent-activity strip is hidden when the user has
 * opted out).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, PublicProfile } from "@/src/api/client";
import { FollowButton } from "@/src/components/FollowButton";
import { InstructorBadge } from "@/src/components/InstructorBadge";

export default function PublicProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Local mirror of the follower count so the FollowButton can bump it
  // optimistically without a round-trip refetch.
  const [followers, setFollowers] = useState(0);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const p = await api.getPublicProfile(token, String(id));
      setProfile(p);
      setFollowers(p.counts.followers);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.center}>
          <Text style={styles.notFound}>Dancer not found.</Text>
          <Pressable onPress={() => router.back()} style={styles.backCta}>
            <Text style={styles.backCtaText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.c}>
      <View style={styles.hero}>
        <LinearGradient
          colors={[colors.brandTertiary, colors.brandPrimary, colors.surfaceInverse]}
          style={StyleSheet.absoluteFillObject as any}
        />
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerBar}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconBtn}
              hitSlop={12}
              testID="public-profile-back"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={styles.iconBtn} />
          </View>

          <View style={styles.heroContent}>
            <View style={styles.avatarWrap}>
              {profile.picture ? (
                <Image
                  source={{ uri: profile.picture }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarInitials]}>
                  <Text style={styles.avatarText}>
                    {initials(profile.name)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{profile.name || "Anonymous"}</Text>
              {profile.is_instructor ? (
                <InstructorBadge size="md" testID="profile-instructor-badge" />
              ) : null}
            </View>
            <View style={styles.rolesRow}>
              {profile.is_admin ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>Admin</Text>
                </View>
              ) : null}
              {profile.is_instructor ? (
                <View style={[styles.rolePill, styles.rolePillInstructor]}>
                  <Text style={styles.rolePillText}>Instructor</Text>
                </View>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* Follow button (hidden if this is the caller's own profile) */}
        {!profile.is_self ? (
          <FollowButton
            userId={profile.user_id}
            isFollowing={profile.is_following}
            onFollowChange={(_now, delta) =>
              setFollowers((n) => Math.max(0, n + delta))
            }
          />
        ) : (
          <View style={styles.selfNote}>
            <Ionicons name="person" size={14} color={colors.muted} />
            <Text style={styles.selfNoteText}>This is you</Text>
          </View>
        )}

        {/* Stat pills */}
        <View style={styles.stats}>
          <Stat label="Completed" value={profile.counts.completed} />
          <Divider />
          <Stat label="Badges" value={profile.counts.badges} />
          <Divider />
          <Stat label="Followers" value={followers} />
          <Divider />
          <Stat label="Following" value={profile.counts.following} />
        </View>

        {/* Streak row */}
        {profile.current_streak > 0 || profile.longest_streak > 0 ? (
          <View style={styles.streakCard}>
            <View style={styles.streakFlame}>
              <Ionicons name="flame" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakLabel}>Practice Streak</Text>
              <Text style={styles.streakBig}>
                {profile.current_streak}{" "}
                <Text style={styles.streakUnit}>
                  day{profile.current_streak === 1 ? "" : "s"}
                </Text>
              </Text>
              {profile.longest_streak > profile.current_streak ? (
                <Text style={styles.streakSub}>
                  Personal best · {profile.longest_streak} days
                </Text>
              ) : profile.current_streak > 0 ? (
                <Text style={styles.streakSub}>Personal best right now 🎯</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {!profile.show_in_activity_feed && !profile.is_self ? (
          <View style={styles.privacyNote}>
            <Ionicons
              name="eye-off-outline"
              size={14}
              color={colors.muted}
            />
            <Text style={styles.privacyText}>
              This dancer has hidden their activity from the feed.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={statStyles.stat}>
      <Text style={statStyles.num}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={statStyles.divider} />;
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

const statStyles = StyleSheet.create({
  stat: { flex: 1, alignItems: "center" },
  num: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.divider,
  },
});

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  notFound: {
    fontFamily: "serif",
    fontSize: 18,
    color: colors.onSurface,
  },
  backCta: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  backCtaText: { color: "#fff", fontWeight: "800" },

  hero: { paddingBottom: spacing.xl },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(43,29,22,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: colors.brandPrimary,
  },
  avatar: { width: "100%", height: "100%" },
  avatarInitials: { alignItems: "center", justifyContent: "center" },
  avatarText: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 32,
    fontWeight: "800",
  },
  name: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "800",
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rolesRow: {
    flexDirection: "row",
    gap: 6,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  rolePillInstructor: { backgroundColor: colors.brandSecondary + "AA" },
  rolePillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  stats: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFF3E7",
    borderWidth: 1,
    borderColor: "#F2A62888",
  },
  streakFlame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9502A",
    alignItems: "center",
    justifyContent: "center",
  },
  streakLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D9502A",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  streakBig: {
    fontFamily: "serif",
    fontSize: 26,
    fontWeight: "800",
    color: colors.onSurface,
    marginTop: 2,
  },
  streakUnit: { fontSize: 14, fontWeight: "600", color: colors.onSurfaceSecondary },
  streakSub: { fontSize: 11, color: colors.onSurfaceSecondary, fontStyle: "italic" },

  privacyNote: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    padding: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.sm,
  },
  privacyText: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: "italic",
  },

  selfNote: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
  },
  selfNoteText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "700",
  },
});
