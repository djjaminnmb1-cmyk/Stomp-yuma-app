/**
 * /events — Events + Classes search & discovery.
 *
 * Filters: free-text, event type, skill level, date range (upcoming /
 * next 30 days / past), and location (GPS proximity OR city/zip).
 * Instructors also get a floating "+" button to jump to the create form.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, EventItem, EventSearchQuery } from "@/src/api/client";
import { EventCard } from "@/src/components/EventCard";
import { getDeviceLocation } from "@/src/lib/geo";

type DateWindow = "any" | "upcoming" | "next30" | "past";

const TYPE_OPTIONS = [
  { key: "workshop", label: "Workshop" },
  { key: "social", label: "Social" },
  { key: "class", label: "Class" },
  { key: "private_party", label: "Private party" },
];

const LEVEL_OPTIONS = [
  "All levels",
  "Absolute Beginner",
  "Beginner",
  "Improver",
  "High Improver",
  "Intermediate",
  "Advanced",
];

export default function EventsSearch() {
  const router = useRouter();
  const { token, user } = useAuth();

  // ---- Filter state ----
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [dateWindow, setDateWindow] = useState<DateWindow>("upcoming");
  const [locMode, setLocMode] = useState<"none" | "gps" | "city">("none");
  const [city, setCity] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [radiusMi, setRadiusMi] = useState(25);
  const [includeClasses, setIncludeClasses] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  // ---- Result state ----
  const [events, setEvents] = useState<EventItem[]>([]);
  const [classes, setClasses] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = useCallback((): EventSearchQuery => {
    const query: EventSearchQuery = {
      q: q.trim() || undefined,
      types: types.length ? types : undefined,
      levels: levels.length ? levels : undefined,
      include_classes: includeClasses,
      limit: 50,
    };
    // Date window presets
    const today = new Date();
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    if (dateWindow === "upcoming") {
      query.date_from = isoDate(today);
    } else if (dateWindow === "next30") {
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      query.date_from = isoDate(today);
      query.date_to = isoDate(end);
    } else if (dateWindow === "past") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      query.date_to = isoDate(y);
    }
    // Location
    if (locMode === "gps" && coords) {
      query.near_lat = coords.lat;
      query.near_lng = coords.lng;
      query.radius_miles = radiusMi;
    } else if (locMode === "city" && city.trim()) {
      query.city = city.trim();
    }
    return query;
  }, [q, types, levels, dateWindow, locMode, coords, radiusMi, city, includeClasses]);

  const runSearch = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (!opts?.silent) setLoading(true);
      try {
        const res = await api.searchEvents(token, buildQuery());
        setEvents(res.events);
        setClasses(res.classes);
      } catch (e: any) {
        Alert.alert("Search failed", e?.message || "Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, buildQuery]
  );

  // Debounced re-search whenever any filter changes.
  useEffect(() => {
    const h = setTimeout(() => runSearch({ silent: true }), 250);
    return () => clearTimeout(h);
  }, [runSearch]);

  useFocusEffect(
    useCallback(() => {
      runSearch({ silent: true });
    }, [runSearch])
  );

  const requestGPS = useCallback(async () => {
    setLocBusy(true);
    try {
      const res = await getDeviceLocation();
      if (res.status === "granted") {
        setCoords({ lat: res.lat, lng: res.lng });
        setLocMode("gps");
      } else if (res.status === "denied") {
        Alert.alert(
          "Location access needed",
          "Grant location permission to search for events near you, or type a city instead.",
          [
            { text: "OK", style: "cancel" },
            {
              text: "Enter city",
              onPress: () => setLocMode("city"),
            },
          ]
        );
      } else if (res.status === "blocked") {
        Alert.alert(
          "Permission blocked",
          "Location permission is disabled for this app in Settings. Open Settings to enable it, or search by city instead.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            {
              text: "Use city",
              onPress: () => setLocMode("city"),
            },
          ]
        );
      } else {
        Alert.alert(
          "Couldn't get location",
          res.status === "unavailable"
            ? res.reason
            : "Please try again or search by city."
        );
      }
    } finally {
      setLocBusy(false);
    }
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (types.length) n++;
    if (levels.length) n++;
    if (dateWindow !== "upcoming") n++;
    if (locMode !== "none") n++;
    if (!includeClasses) n++;
    return n;
  }, [types, levels, dateWindow, locMode, includeClasses]);

  const totalResults = events.length + classes.length;

  // Not-logged-in gate — the search endpoint requires auth per product
  // choice. Show a friendly sign-in nudge instead of an empty list.
  if (!token) {
    return (
      <View style={styles.c}>
        <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.iconBtn}
              hitSlop={12}
              testID="events-back"
            >
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Find an Event</Text>
              <Text style={styles.sub}>
                Workshops, socials, and classes near you.
              </Text>
            </View>
            <View style={styles.iconBtn} />
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons
              name="log-in-outline"
              size={64}
              color={colors.brandTertiary}
            />
            <Text style={styles.emptyTitle}>Sign in to explore events</Text>
            <Text style={styles.emptySub}>
              Log in to search workshops, socials, and classes happening near
              you.
            </Text>
            <Pressable
              onPress={() => router.push("/auth")}
              style={styles.emptyCta}
              testID="events-login-cta"
            >
              <Text style={styles.emptyCtaText}>Sign in</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.c}>
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={12}
            testID="events-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Find an Event</Text>
            <Text style={styles.sub}>
              Workshops, socials, and classes near you.
            </Text>
          </View>
          {user?.is_instructor ? (
            <Pressable
              onPress={() => router.push("/events/new")}
              style={styles.iconBtnPrimary}
              testID="events-create"
              hitSlop={8}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            testID="events-search-input"
            placeholder="Workshop, venue, city…"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Location strip */}
        <View style={styles.locStrip}>
          <Pressable
            onPress={requestGPS}
            disabled={locBusy}
            testID="events-loc-gps"
            style={[
              styles.locChip,
              locMode === "gps" && styles.locChipActive,
            ]}
          >
            {locBusy ? (
              <ActivityIndicator
                size="small"
                color={locMode === "gps" ? "#fff" : colors.brandPrimary}
              />
            ) : (
              <Ionicons
                name="navigate"
                size={14}
                color={locMode === "gps" ? "#fff" : colors.brandPrimary}
              />
            )}
            <Text
              style={[
                styles.locChipText,
                locMode === "gps" && styles.locChipTextActive,
              ]}
            >
              {locMode === "gps" && coords
                ? `Near me · ${radiusMi} mi`
                : "Near me"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setLocMode("city");
              setCoords(null);
            }}
            testID="events-loc-city"
            style={[
              styles.locChip,
              locMode === "city" && styles.locChipActive,
            ]}
          >
            <Ionicons
              name="business"
              size={14}
              color={locMode === "city" ? "#fff" : colors.brandPrimary}
            />
            <Text
              style={[
                styles.locChipText,
                locMode === "city" && styles.locChipTextActive,
              ]}
            >
              By city
            </Text>
          </Pressable>
          {locMode !== "none" ? (
            <Pressable
              onPress={() => {
                setLocMode("none");
                setCity("");
                setCoords(null);
              }}
              hitSlop={8}
              testID="events-loc-clear"
              style={styles.locClear}
            >
              <Ionicons name="close" size={14} color={colors.muted} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setShowFilters(true)}
            testID="events-open-filters"
            style={styles.filterBtn}
          >
            <Ionicons name="filter" size={14} color={colors.brandPrimary} />
            <Text style={styles.filterBtnText}>
              Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
            </Text>
          </Pressable>
        </View>

        {/* City text input (only when city mode is picked) */}
        {locMode === "city" ? (
          <View style={styles.searchWrap}>
            <Ionicons name="business" size={14} color={colors.muted} />
            <TextInput
              testID="events-city-input"
              placeholder="City or zip code"
              placeholderTextColor={colors.muted}
              value={city}
              onChangeText={setCity}
              style={styles.searchInput}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {city ? (
              <Pressable onPress={() => setCity("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Radius slider (only in GPS mode) */}
        {locMode === "gps" && coords ? (
          <View style={styles.radiusRow}>
            <Text style={styles.radiusLabel}>Radius</Text>
            <View style={styles.radiusPills}>
              {[10, 25, 50, 100, 250].map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRadiusMi(r)}
                  style={[
                    styles.radiusPill,
                    radiusMi === r && styles.radiusPillActive,
                  ]}
                  testID={`events-radius-${r}`}
                >
                  <Text
                    style={[
                      styles.radiusPillText,
                      radiusMi === r && styles.radiusPillTextActive,
                    ]}
                  >
                    {r}mi
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : totalResults === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                runSearch({ silent: true });
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          <Ionicons name="calendar-outline" size={64} color={colors.brandTertiary} />
          <Text style={styles.emptyTitle}>No events match</Text>
          <Text style={styles.emptySub}>
            Try widening the radius, clearing filters, or searching a
            different city.
          </Text>
          {activeFilterCount > 0 ? (
            <Pressable
              onPress={() => {
                setQ("");
                setTypes([]);
                setLevels([]);
                setDateWindow("upcoming");
                setLocMode("none");
                setCity("");
                setCoords(null);
                setIncludeClasses(true);
              }}
              style={styles.emptyCta}
              testID="events-clear-filters"
            >
              <Text style={styles.emptyCtaText}>Reset filters</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                runSearch({ silent: true });
              }}
              tintColor={colors.brandPrimary}
            />
          }
        >
          <Text style={styles.count}>
            {totalResults} result{totalResults === 1 ? "" : "s"}
          </Text>
          {events.map((e) => (
            <EventCard key={`e-${e.id}`} event={e} />
          ))}
          {includeClasses
            ? classes.map((c) => <EventCard key={`c-${c.id}`} event={c} />)
            : null}
          <View style={styles.disclaimer} testID="events-disclaimer">
            <Ionicons
              name="information-circle"
              size={14}
              color={colors.muted}
              style={{ marginTop: 2 }}
            />
            <Text style={styles.disclaimerText}>
              Events are posted by third-party instructors. Stompin&apos;
              Ground Yuma doesn&apos;t endorse or vouch for them — verify
              details directly with the host before you travel.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Filters bottom sheet */}
      <FiltersSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        types={types}
        setTypes={setTypes}
        levels={levels}
        setLevels={setLevels}
        dateWindow={dateWindow}
        setDateWindow={setDateWindow}
        includeClasses={includeClasses}
        setIncludeClasses={setIncludeClasses}
      />
    </View>
  );
}

// ---------------- Filters bottom sheet ----------------
function FiltersSheet({
  visible,
  onClose,
  types,
  setTypes,
  levels,
  setLevels,
  dateWindow,
  setDateWindow,
  includeClasses,
  setIncludeClasses,
}: {
  visible: boolean;
  onClose: () => void;
  types: string[];
  setTypes: (v: string[]) => void;
  levels: string[];
  setLevels: (v: string[]) => void;
  dateWindow: DateWindow;
  setDateWindow: (v: DateWindow) => void;
  includeClasses: boolean;
  setIncludeClasses: (v: boolean) => void;
}) {
  const toggle = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheet.backdrop}>
        <Pressable style={sheet.backdropTap} onPress={onClose} />
        <View style={sheet.sheet}>
          <View style={sheet.grabber} />
          <View style={sheet.headerRow}>
            <Text style={sheet.title}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={12} testID="filters-close">
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <View>
              <Text style={sheet.sectionLabel}>Event type</Text>
              <View style={sheet.chipRow}>
                {TYPE_OPTIONS.map((t) => {
                  const active = types.includes(t.key);
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setTypes(toggle(types, t.key))}
                      testID={`filter-type-${t.key}`}
                      style={[sheet.chip, active && sheet.chipActive]}
                    >
                      <Text
                        style={[
                          sheet.chipText,
                          active && sheet.chipTextActive,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={sheet.sectionLabel}>Skill level</Text>
              <View style={sheet.chipRow}>
                {LEVEL_OPTIONS.map((l) => {
                  const active = levels.includes(l);
                  return (
                    <Pressable
                      key={l}
                      onPress={() => setLevels(toggle(levels, l))}
                      testID={`filter-level-${l}`}
                      style={[sheet.chip, active && sheet.chipActive]}
                    >
                      <Text
                        style={[
                          sheet.chipText,
                          active && sheet.chipTextActive,
                        ]}
                      >
                        {l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={sheet.sectionLabel}>When</Text>
              <View style={sheet.chipRow}>
                {(
                  [
                    { key: "any", label: "Any date" },
                    { key: "upcoming", label: "Upcoming" },
                    { key: "next30", label: "Next 30 days" },
                    { key: "past", label: "Past" },
                  ] as { key: DateWindow; label: string }[]
                ).map((d) => {
                  const active = dateWindow === d.key;
                  return (
                    <Pressable
                      key={d.key}
                      onPress={() => setDateWindow(d.key)}
                      testID={`filter-date-${d.key}`}
                      style={[sheet.chip, active && sheet.chipActive]}
                    >
                      <Text
                        style={[
                          sheet.chipText,
                          active && sheet.chipTextActive,
                        ]}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => setIncludeClasses(!includeClasses)}
              testID="filter-include-classes"
              style={sheet.toggleRow}
            >
              <Ionicons
                name={includeClasses ? "checkbox" : "square-outline"}
                size={22}
                color={includeClasses ? colors.brandPrimary : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={sheet.toggleLabel}>Include recurring classes</Text>
                <Text style={sheet.toggleSub}>
                  Show weekly studio sessions alongside one-off events.
                </Text>
              </View>
            </Pressable>
          </ScrollView>

          <View style={sheet.footRow}>
            <Pressable
              onPress={() => {
                setTypes([]);
                setLevels([]);
                setDateWindow("upcoming");
                setIncludeClasses(true);
              }}
              style={sheet.footClear}
              testID="filters-reset"
            >
              <Text style={sheet.footClearText}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={sheet.footApply}
              testID="filters-apply"
            >
              <Text style={sheet.footApplyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  iconBtnPrimary: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
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
  locStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexWrap: "wrap",
  },
  locChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  locChipActive: {
    backgroundColor: colors.brandPrimary,
  },
  locChipText: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  locChipTextActive: { color: "#fff" },
  locClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary + "22",
  },
  filterBtnText: {
    color: colors.brandPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  radiusRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 6,
  },
  radiusLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  radiusPills: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  radiusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radiusPillActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.brandPrimary,
  },
  radiusPillTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 48,
  },
  count: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  emptyWrap: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    minHeight: 400,
  },
  emptyTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
  },
  emptyCta: {
    marginTop: spacing.sm,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  emptyCtaText: { color: "#fff", fontWeight: "800" },
  disclaimer: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  disclaimerText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: "italic",
  },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "85%",
    paddingBottom: spacing.md,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  chipText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: { color: "#fff" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  toggleLabel: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  toggleSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  footRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footClear: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  footClearText: {
    color: colors.onSurface,
    fontWeight: "700",
  },
  footApply: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
  },
  footApplyText: { color: "#fff", fontWeight: "800" },
});
