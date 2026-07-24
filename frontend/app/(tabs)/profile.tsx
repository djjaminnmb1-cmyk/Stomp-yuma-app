import { useCallback, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { colors, spacing, radius, images } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { api, Tracking } from "@/src/api/client";

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
    nativeUrl: "snssdk1233://user/profile/@stompingroundyuma",
    webUrl: "https://www.tiktok.com/@stompingroundyuma",
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "logo-facebook",
    iconColor: "#FFFFFF",
    bg: "#1877F2",
    nativeUrl: "fb://profile/stompingroundyuma",
    webUrl: "https://www.facebook.com/stompingroundyuma",
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

// Open a native app if we can, otherwise fall back to web. `canOpenURL` may
// return false on iOS for schemes not declared in Info.plist, so we ALSO
// swallow errors from openURL and try the web fallback as a safety net.
async function openSocial(s: SocialLink) {
  try {
    if (s.nativeUrl) {
      const supported = await Linking.canOpenURL(s.nativeUrl).catch(() => false);
      if (supported) {
        try {
          await Linking.openURL(s.nativeUrl);
          return;
        } catch {
          // fall through to web
        }
      }
    }
    await Linking.openURL(s.webUrl);
  } catch {
    Alert.alert(`Unable to open ${s.label}`);
  }
}

export default function Profile() {
  const router = useRouter();
  const { user, token, signOut } = useAuth();
  const [tracking, setTracking] = useState<Tracking[]>([]);
  const [attendanceCount, setAttendanceCount] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const t = await api.myTracking(token);
      setTracking(t);
      const a = await api.myAttendance(token);
      setAttendanceCount(a.class_ids.length);
    } catch {}
  }, [token]);

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
          <Text style={styles.name} testID="profile-name">{user?.name || "Dancer"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin ? (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.onBrandPrimary} />
              <Text style={styles.adminText}>Admin</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-completed">{completed}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-wishlist">{wishlist}</Text>
            <Text style={styles.statLabel}>Wishlist</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum} testID="stat-attended">{attendanceCount}</Text>
            <Text style={styles.statLabel}>Classes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{avgRating}</Text>
            <Text style={styles.statLabel}>Avg ★</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {(user?.is_admin || user?.is_instructor) ? (
            <Pressable
              testID="profile-instructor-btn"
              style={styles.row}
              onPress={() => router.push("/(tabs)/instructor")}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="school" size={22} color={colors.brandPrimary} />
                <Text style={styles.rowText}>Instructor Tab</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}

          <Pressable
            testID="profile-classes-row"
            style={styles.row}
            onPress={() => router.push("/classes")}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="calendar" size={22} color={colors.brandSecondary} />
              <Text style={styles.rowText}>
                {user?.is_admin || user?.is_instructor ? "Log a Class" : "Class Recap"}
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
                {user?.is_admin ? "Review Suggestions" : "Suggest a Dance to Erin"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

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
              <Text style={[styles.rowText, { color: colors.error }]}>Sign Out</Text>
            </View>
          </Pressable>
        </View>

        {/* -------------------- Connect With Us -------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connect With Us</Text>
          <Text style={styles.connectSub}>
            Follow Stompin&apos; Ground Yuma on your favourite platform — links open
            in the native app if installed.
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
            testID="profile-website-cta"
            onPress={() => openSocial(SITE_LINK)}
            style={styles.websiteRow}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="globe-outline" size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>Visit our website</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Stompin&apos; Ground Yuma</Text>
          <Text style={styles.aboutText}>
            Country line dancing for all ages in Yuma, AZ. Join us, learn a new step,
            and make new friends on the dance floor.
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
    </SafeAreaView>
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
            {["Beginner", "Improver", "Intermediate", "Advanced"].map((d) => (
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
