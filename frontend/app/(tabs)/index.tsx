import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { colors, spacing, radius, images } from "@/src/theme";
import { api, Dance } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { BrandLogo } from "../../src/components/BrandLogo";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [recent, setRecent] = useState<Dance[]>([]);

  useEffect(() => {
    api.listDances().then((all) => setRecent(all.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Image source={{ uri: images.venue_hero }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />
          <LinearGradient
            colors={["transparent", "rgba(43,29,22,0.55)", colors.surfaceInverse]}
            style={StyleSheet.absoluteFillObject as any}
          />
          <View style={styles.heroContent}>
            <BrandLogo variant="light" size="lg" />
            <Text style={styles.tagline}>
              Yuma, Arizona's home for country line dancing — all ages welcome.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.helloText}>
            Howdy{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
          </Text>
          <Text style={styles.subHello}>Ready to boot-scoot?</Text>

          <Pressable
            testID="home-browse-cta"
            onPress={() => router.push("/(tabs)/library")}
            style={styles.ctaBtn}
          >
            <Text style={styles.ctaBtnText}>Start Browsing Dances</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fresh on the Floor</Text>
            <Pressable onPress={() => router.push("/(tabs)/library")} testID="home-see-all">
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>

          <Pressable
            testID="home-classes-cta"
            onPress={() => router.push("/classes")}
            style={styles.classesCard}
          >
            <View style={styles.classesIcon}>
              <Ionicons name="calendar" size={22} color={colors.brandSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>Recent Class Recap</Text>
              <Text style={styles.suggestSub}>
                See which dances were taught in recent classes.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>

          <Pressable
            testID="home-suggest-cta"
            onPress={() => router.push("/suggest")}
            style={styles.suggestCard}
          >
            <View style={styles.suggestIcon}>
              <Ionicons name="bulb" size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestTitle}>Suggest a Dance for Erin</Text>
              <Text style={styles.suggestSub}>
                Got an idea? Send it to instructor Erin Brown.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
          {recent.map((d) => (
            <Pressable
              key={d.id}
              testID={`home-dance-${d.id}`}
              onPress={() => router.push(`/dance/${d.id}`)}
              style={styles.miniCard}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.miniTitle} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.miniMeta} numberOfLines={1}>
                  {d.song} • {d.choreographer || "Unknown"}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{d.difficulty}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About the Venue</Text>
          <View style={styles.aboutCard}>
            <Ionicons name="location" size={18} color={colors.brandPrimary} />
            <Text style={styles.aboutText}>
              Stompin' Ground Yuma is a friendly community where dancers of every age and
              skill level come together to learn, laugh, and boot-scoot the night away.
              Grab your boots and let's dance.
            </Text>
          </View>
          <View style={styles.rowIcons}>
            <View style={styles.iconItem}>
              <Ionicons name="people" size={22} color={colors.brandSecondary} />
              <Text style={styles.iconLabel}>All ages</Text>
            </View>
            <View style={styles.iconItem}>
              <Ionicons name="sparkles" size={22} color={colors.warning} />
              <Text style={styles.iconLabel}>Beginners welcome</Text>
            </View>
            <View style={styles.iconItem}>
              <Ionicons name="heart" size={22} color={colors.brandPrimary} />
              <Text style={styles.iconLabel}>Family friendly</Text>
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
            <Text style={styles.websiteBtnText}>Visit stompingroundyuma.org</Text>
            <Ionicons name="open-outline" size={16} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 420, justifyContent: "flex-end" },
  heroContent: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  tag: { color: colors.onSurfaceInverse, opacity: 0.8, letterSpacing: 2, fontSize: 11, fontWeight: "700" },
  brand: { color: colors.onSurfaceInverse, fontFamily: "serif", fontSize: 22, fontStyle: "italic", opacity: 0.95 },
  brandBig: { color: colors.onSurfaceInverse, fontFamily: "serif", fontSize: 48, fontWeight: "700", letterSpacing: -1 },
  tagline: { color: colors.onSurfaceInverse, marginTop: spacing.xs, fontSize: 13, opacity: 0.9, lineHeight: 18, textAlign: "center", paddingHorizontal: spacing.lg },
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
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontFamily: "serif", fontSize: 22, fontWeight: "700", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "600" },
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
  rowIcons: { flexDirection: "row", justifyContent: "space-around", marginTop: spacing.md },
  iconItem: { alignItems: "center", gap: 6 },
  iconLabel: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
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
});
