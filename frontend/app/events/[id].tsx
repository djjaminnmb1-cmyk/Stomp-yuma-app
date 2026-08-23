/**
 * /events/[id] — Event detail.
 *
 * Instructor / admin actions:  Edit, Delete  (top-right when applicable)
 * User actions:                Open in maps, Copy address, Register (external URL)
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, radius, spacing, difficultyColor } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, EventItem } from "@/src/api/client";

const TYPE_LABEL: Record<string, string> = {
  class: "Class",
  workshop: "Workshop",
  social: "Social",
  private_party: "Private party",
};

export default function EventDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const e = await api.getEvent(token, String(id));
      setEvent(e);
    } catch {
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const openInMaps = useCallback(() => {
    if (!event) return;
    const q =
      typeof event.lat === "number" && typeof event.lng === "number"
        ? `${event.lat},${event.lng}`
        : [event.address, event.city, event.state, event.zip_code]
            .filter(Boolean)
            .join(", ");
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${encodeURIComponent(q)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    Linking.openURL(url).catch(() => {});
  }, [event]);

  const shareEvent = useCallback(async () => {
    if (!event) return;
    const dateStr = event.date;
    const timeStr = event.start_time ? ` @ ${event.start_time}` : "";
    const locStr = [event.venue_name, event.city, event.state]
      .filter(Boolean)
      .join(", ");
    const msg = `${event.name} · ${dateStr}${timeStr}${locStr ? ` — ${locStr}` : ""}`;
    try {
      await Share.share({ message: msg, title: event.name });
    } catch {}
  }, [event]);

  const doDelete = useCallback(() => {
    if (!event || !token) return;
    Alert.alert(
      "Delete event?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteEvent(token, event.id);
              router.back();
            } catch (e: any) {
              Alert.alert("Couldn't delete", e?.message || "Please try again.");
            }
          },
        },
      ]
    );
  }, [event, token, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.center}>
          <Text style={styles.notFound}>Event not found.</Text>
          <Pressable onPress={() => router.back()} style={styles.backCta}>
            <Text style={styles.backCtaText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canEdit =
    user?.is_admin || user?.user_id === event.instructor_id;
  const addressLine = [
    event.address,
    [event.city, event.state, event.zip_code].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.c}>
      <View style={styles.heroWrap}>
        {event.cover_image ? (
          <Image
            source={{ uri: event.cover_image }}
            style={StyleSheet.absoluteFillObject as any}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={[colors.brandTertiary, colors.brandPrimary, colors.surfaceInverse]}
            style={StyleSheet.absoluteFillObject as any}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFillObject as any}
        />
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerBar}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconBtn}
              hitSlop={12}
              testID="event-back"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable
                onPress={shareEvent}
                style={styles.iconBtn}
                hitSlop={8}
                testID="event-share"
              >
                <Ionicons name="share-social" size={20} color="#fff" />
              </Pressable>
              {canEdit ? (
                <>
                  <Pressable
                    onPress={() => router.push(`/events/${event.id}/edit`)}
                    style={styles.iconBtn}
                    hitSlop={8}
                    testID="event-edit"
                  >
                    <Ionicons name="pencil" size={18} color="#fff" />
                  </Pressable>
                  <Pressable
                    onPress={doDelete}
                    style={styles.iconBtn}
                    hitSlop={8}
                    testID="event-delete"
                  >
                    <Ionicons name="trash" size={18} color="#fff" />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.chipRow}>
              <View style={styles.typePill}>
                <Text style={styles.typePillText}>
                  {TYPE_LABEL[event.event_type] || "Event"}
                </Text>
              </View>
              {event.skill_level && event.skill_level !== "All levels" ? (
                <View
                  style={[
                    styles.levelPill,
                    { borderColor: difficultyColor(event.skill_level) },
                  ]}
                >
                  <View
                    style={[
                      styles.levelDot,
                      { backgroundColor: difficultyColor(event.skill_level) },
                    ]}
                  />
                  <Text style={styles.levelPillText}>{event.skill_level}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.name}>{event.name}</Text>
            {!event.is_published ? (
              <View style={styles.draftPill}>
                <Text style={styles.draftPillText}>Draft — not visible to others</Text>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* When */}
        <View style={styles.metaCard}>
          <Ionicons name="calendar" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.metaHead}>{formatDateLong(event.date)}</Text>
            {event.start_time || event.end_time ? (
              <Text style={styles.metaSub}>
                {[event.start_time, event.end_time]
                  .filter(Boolean)
                  .map(prettyTime)
                  .join(" – ")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Where */}
        <Pressable style={styles.metaCard} onPress={openInMaps} testID="event-open-maps">
          <Ionicons name="location" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            {event.venue_name ? (
              <Text style={styles.metaHead}>{event.venue_name}</Text>
            ) : null}
            <Text style={styles.metaSub} numberOfLines={2}>
              {addressLine || "Location TBA"}
            </Text>
            {typeof event.distance_miles === "number" ? (
              <Text style={styles.dist}>
                {event.distance_miles.toFixed(1)} mi away
              </Text>
            ) : null}
          </View>
          <Ionicons name="open-outline" size={16} color={colors.muted} />
        </Pressable>

        {/* Description */}
        {event.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this event</Text>
            <Text style={styles.body}>{event.description}</Text>
          </View>
        ) : null}

        {/* Instructor */}
        {event.instructor_name ? (
          <View style={styles.instrRow}>
            <View style={styles.instrOrb}>
              <Text style={styles.instrOrbText}>
                {initials(event.instructor_name)}
              </Text>
            </View>
            <View>
              <Text style={styles.instrLabel}>Hosted by</Text>
              <Text style={styles.instrName}>{event.instructor_name}</Text>
            </View>
          </View>
        ) : null}

        {/* Price + Register CTA */}
        {event.price ? (
          <View style={styles.priceRow}>
            <Ionicons name="pricetag" size={18} color={colors.brandTertiary} />
            <Text style={styles.priceText}>{event.price}</Text>
          </View>
        ) : null}
        {event.registration_url ? (
          <Pressable
            style={styles.registerBtn}
            onPress={() => Linking.openURL(event.registration_url!).catch(() => {})}
            testID="event-register"
          >
            <Ionicons name="ticket" size={18} color="#fff" />
            <Text style={styles.registerBtnText}>Register / Details</Text>
            <Ionicons name="open-outline" size={16} color="#fff" />
          </Pressable>
        ) : null}

        {!canEdit ? (
          <View style={styles.disclaimer} testID="event-detail-disclaimer">
            <Ionicons
              name="information-circle"
              size={14}
              color={colors.muted}
              style={{ marginTop: 2 }}
            />
            <Text style={styles.disclaimerText}>
              Hosted by a third-party instructor. Stompin&apos; Ground Yuma
              doesn&apos;t organize this event — verify details directly
              with the host before you travel or pay.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatDateLong(iso: string): string {
  if (!iso) return "Date TBA";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function prettyTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").trim());
  if (!m) return t;
  const h24 = parseInt(m[1]!, 10);
  const min = m[2];
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${min} ${ampm}`;
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  notFound: { fontFamily: "serif", fontSize: 18, color: colors.onSurface },
  backCta: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  backCtaText: { color: "#fff", fontWeight: "800" },

  heroWrap: { height: 260 },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(43,29,22,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: { padding: spacing.lg, marginTop: spacing.lg, gap: 8 },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  typePillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.3,
  },
  name: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  draftPill: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  draftPillText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  metaCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaHead: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
  },
  metaSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  dist: {
    color: colors.brandPrimary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: 0.3,
  },

  section: { gap: 6 },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.onSurface,
  },
  body: {
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    lineHeight: 21,
  },

  instrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instrOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  instrOrbText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  instrLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  instrName: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    marginTop: 2,
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brandTertiary + "22",
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  priceText: {
    color: colors.brandTertiary,
    fontWeight: "800",
    fontSize: 14,
  },
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  registerBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  disclaimerText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: "italic",
  },
});
