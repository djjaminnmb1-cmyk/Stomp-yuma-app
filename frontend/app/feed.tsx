/**
 * /feed — Full activity feed screen.
 *
 * Pull-to-refresh, latest 30 events from users the caller follows plus
 * their own (opt-outable via Profile). Empty state guides new users to
 * the Find-Dancers picker so they can bootstrap their feed.
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
  Modal,
  TextInput,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, FeedEvent, PublicUser } from "@/src/api/client";
import { FeedEventCard } from "@/src/components/FeedEventCard";
import { FollowButton } from "@/src/components/FollowButton";

export default function FeedScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFind, setShowFind] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (!opts?.silent) setLoading(true);
      try {
        const r = await api.getFeed(token, 30);
        setEvents(r.events);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Refresh whenever this screen regains focus so users returning from
  // a Follow / Public-Profile screen see the freshest state.
  useFocusEffect(
    useCallback(() => {
      load({ silent: true });
    }, [load])
  );

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={12}
            testID="feed-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Activity Feed</Text>
            <Text style={styles.sub}>
              What your dance community is up to.
            </Text>
          </View>
          <Pressable
            onPress={() => setShowFind(true)}
            style={styles.iconBtn}
            testID="feed-find-dancers"
            hitSlop={8}
          >
            <Ionicons name="person-add" size={22} color={colors.brandPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : events.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ silent: true });
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          <Ionicons
            name="megaphone-outline"
            size={64}
            color={colors.brandTertiary}
          />
          <Text style={styles.emptyTitle}>Your feed is quiet</Text>
          <Text style={styles.emptySub}>
            Follow other dancers to see their completions, badges, and streak
            wins show up here.
          </Text>
          <Pressable
            onPress={() => setShowFind(true)}
            style={styles.emptyCta}
            testID="feed-empty-find-cta"
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.emptyCtaText}>Find dancers</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load({ silent: true });
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          {events.map((e) => (
            <FeedEventCard key={e.id} event={e} />
          ))}
          <Pressable
            testID="feed-community-guidelines-cta"
            onPress={() => router.push("/community-guidelines")}
            style={styles.beKindRow}
            hitSlop={6}
          >
            <Ionicons name="heart" size={14} color={colors.brandPrimary} />
            <Text style={styles.beKindText}>
              Be kind — <Text style={styles.beKindLink}>Community Guidelines</Text>
            </Text>
          </Pressable>
          <Text style={styles.foot}>
            Showing the last 30 days · Pull down to refresh
          </Text>
        </ScrollView>
      )}

      <FindDancersModal
        visible={showFind}
        onClose={() => {
          setShowFind(false);
          // Reload the feed so newly-followed users' activity shows up.
          load({ silent: true });
        }}
      />
    </View>
  );
}

// -------------- Find Dancers modal --------------
function FindDancersModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

  const search = useCallback(
    async (query: string) => {
      if (!token) return;
      setBusy(true);
      try {
        const r = await api.searchUsers(token, query, 30);
        setUsers(r.users);
      } finally {
        setBusy(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!visible) return;
    // Prime the list with recent users when the sheet opens.
    search("");
  }, [visible, search]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    const h = setTimeout(() => search(q), 250);
    return () => clearTimeout(h);
  }, [q, visible, search]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Find Dancers</Text>
            <Text style={styles.sub}>Search by name to follow other members.</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.iconBtn}
            hitSlop={12}
            testID="find-dancers-close"
          >
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            testID="find-dancers-input"
            placeholder="Search name…"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {busy && users.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptySub}>
              No dancers match &ldquo;{q}&rdquo;.
            </Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.user_id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                testID={`user-row-${item.user_id}`}
                style={styles.userRow}
                onPress={() => {
                  onClose();
                  router.push(`/users/${item.user_id}`);
                }}
              >
                <View style={styles.avatarSm}>
                  <Text style={styles.avatarSmText}>
                    {initials(item.name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userRowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.userRowMeta} numberOfLines={1}>
                    {item.is_instructor ? "Instructor · " : ""}
                    {item.current_streak > 0
                      ? `🔥 ${item.current_streak}-day streak`
                      : "New dancer"}
                  </Text>
                </View>
                <FollowButton
                  userId={item.user_id}
                  isFollowing={!!item.is_following}
                  size="sm"
                />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.lg, gap: spacing.sm },
  foot: {
    color: colors.muted,
    fontSize: 11,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing.md,
  },
  beKindRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  beKindText: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  beKindLink: {
    color: colors.brandPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  emptyWrap: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    minHeight: 400,
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    marginTop: spacing.sm,
  },
  emptyCtaText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    padding: 0,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  avatarSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  userRowName: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  userRowMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});
