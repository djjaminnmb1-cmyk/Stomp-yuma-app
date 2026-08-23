import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";

/**
 * Community Guidelines — house rules for the social feed, follows,
 * reactions, chat, and suggestions. Kept short and warm rather than
 * legalistic — the goal is a great dance-floor vibe, not lawyer-speak.
 */
export default function CommunityGuidelines() {
  const router = useRouter();
  const contact = "whereyumalinesuptodance@stompingroundyuma.org";

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="community-back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Community Guidelines</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: June 2026</Text>

        <View style={styles.heroCard}>
          <Ionicons
            name="heart"
            size={26}
            color={colors.brandPrimary}
          />
          <Text style={styles.heroText}>
            Boot-scoot with respect. Whether you&apos;re a first-timer or a
            floor legend, everyone should feel welcome to dance.
          </Text>
        </View>

        <Section title="Be kind on the feed">
          <Bullet>Cheer for other dancers. Reactions and follows are the
            fastest way to make a newcomer feel at home.</Bullet>
          <Bullet>Save critique for private feedback — the Activity Feed is
            for celebration, not corrections.</Bullet>
          <Bullet>Don&apos;t brigade, dogpile, or single anyone out for
            harassment.</Bullet>
        </Section>

        <Section title="Keep it authentic">
          <Bullet>Post about your own dance journey. Don&apos;t impersonate
            other dancers, instructors, or SGY.</Bullet>
          <Bullet>Don&apos;t game your streak or completion count with
            bogus check-ins.</Bullet>
        </Section>

        <Section title="No hate, no harassment">
          <Bullet>Zero tolerance for slurs, threats, sexual content, or
            targeted attacks based on race, gender, orientation, religion,
            ability, or age.</Bullet>
          <Bullet>Public shaming is not welcome — instructors, guests, or
            new dancers.</Bullet>
        </Section>

        <Section title="Keep the venue safe">
          <Bullet>Follow the venue&apos;s posted rules at every event.</Bullet>
          <Bullet>Don&apos;t promote drug use, dangerous stunts on the floor,
            or unsafe drinking games.</Bullet>
          <Bullet>Consent on the dance floor matters — don&apos;t pressure
            anyone into a partner dance they didn&apos;t agree to.</Bullet>
        </Section>

        <Section title="Respect creators">
          <Bullet>Credit choreographers. When you share step sheets or
            videos, tag or link the original creator.</Bullet>
          <Bullet>Don&apos;t upload third-party step sheets you don&apos;t
            have permission to share.</Bullet>
        </Section>

        <Section title="If something goes wrong">
          <Text style={styles.body}>
            See something off? Report it and we&apos;ll take a look — usually
            within 48 hours. We can hide posts, remove reactions, or suspend
            accounts that don&apos;t follow these guidelines.
          </Text>
          <Pressable
            testID="community-report"
            onPress={() =>
              Linking.openURL(
                `mailto:${contact}?subject=Community%20guidelines%20report`
              )
            }
            style={styles.contactBtn}
          >
            <Ionicons name="flag-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.contactBtnText}>Report to SGY</Text>
          </Pressable>
        </Section>

        <Text style={[styles.body, { marginTop: spacing.xl, textAlign: "center", color: colors.muted }]}>
          Thanks for keeping our dance floor a welcoming place. 🤠
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={[styles.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: Platform.OS === "web" ? spacing.md : spacing.md,
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
  title: { fontFamily: "serif", fontSize: 20, fontWeight: "700", color: colors.onSurface },
  updated: { color: colors.muted, fontSize: 12, marginBottom: spacing.md },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.brandPrimary + "14",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "44",
  },
  heroText: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 17,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  bulletRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  bulletDot: { color: colors.brandPrimary, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "44",
    backgroundColor: colors.brandPrimary + "0F",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  contactBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
});
