import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";

/**
 * Terms of Service.
 *
 * Reachable in-app via `/terms` and on the web preview at the same path.
 * Kept in plain-English, community-first tone. Not a substitute for a
 * lawyer-drafted document, but a reasonable baseline until you get one.
 */
export default function TermsOfService() {
  const router = useRouter();
  const contact = "whereyumalinesuptodance@stompingroundyuma.org";

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="terms-back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: June 2026</Text>

        <Text style={styles.body}>
          Welcome to Stompin&apos; Ground Yuma (&quot;SGY&quot;, &quot;we&quot;,
          &quot;our&quot;, &quot;us&quot;). By creating an account or using this
          app you agree to these Terms of Service. If you don&apos;t agree,
          please don&apos;t use the app.
        </Text>

        <Section title="1. Who can use SGY">
          <Bullet>You must be at least 13 years old, or have a parent or
            guardian&apos;s permission and supervision.</Bullet>
          <Bullet>You&apos;re responsible for keeping your login credentials
            secure.</Bullet>
          <Bullet>One account per person, please.</Bullet>
        </Section>

        <Section title="2. Dance-activity risk disclaimer">
          <Text style={styles.body}>
            Line dancing is a physical activity. By using this app and
            attending SGY classes, socials, or workshops (whether posted here
            or found elsewhere) you acknowledge that you dance{" "}
            <B>at your own risk</B>. Consult your doctor before starting any new
            physical activity. SGY, its instructors, and its venues are not
            liable for injuries you sustain on or off the dance floor.
          </Text>
        </Section>

        <Section title="3. User-generated content">
          <Text style={styles.body}>
            You may post dance suggestions, chat messages, reactions on the
            activity feed, and — if you&apos;re an instructor — dances,
            classes, and events. By posting content you grant SGY a
            non-exclusive, worldwide, royalty-free license to display and
            share that content inside the app.
          </Text>
          <Bullet>Only post content you have the right to share.</Bullet>
          <Bullet>Don&apos;t post anything hateful, harassing, sexually
            explicit, defamatory, spammy, or illegal.</Bullet>
          <Bullet>Don&apos;t impersonate other users, instructors, or SGY.</Bullet>
          <Bullet>Read our{" "}
            <Link onPress={() => router.push("/community-guidelines")}>
              Community Guidelines
            </Link>{" "}
            for the full house rules.
          </Bullet>
        </Section>

        <Section title="4. Third-party dance content">
          <Text style={styles.body}>
            SGY&apos;s dance directory links to third-party step-sheet sources
            such as CopperKnob and BootStepper. Those files remain the
            property of their original choreographers. SGY does not own or
            claim rights to third-party step sheets. If a step sheet you own
            appears here without permission, please{" "}
            <Link onPress={() => Linking.openURL(`mailto:${contact}?subject=DMCA%20takedown`)}>
              contact us
            </Link>{" "}
            and we&apos;ll remove it — see the DMCA section below.
          </Text>
        </Section>

        <Section title="5. Instructor events (Find Events)">
          <Text style={styles.body}>
            Events shown in the app&apos;s <B>Find Events</B> search — including
            workshops, socials, private parties, and classes — are hosted by
            third-party instructors. SGY does not endorse, screen, or vouch
            for these events, and is not responsible for anything that happens
            at them. Verify details (address, price, cancellation policy)
            directly with the host before you travel.
          </Text>
        </Section>

        <Section title="6. Prohibited use">
          <Bullet>Don&apos;t attempt to break into other users&apos; accounts.</Bullet>
          <Bullet>Don&apos;t scrape, crawl, or reverse-engineer the app.</Bullet>
          <Bullet>Don&apos;t use the app for commercial spam or unsolicited
            marketing.</Bullet>
          <Bullet>Don&apos;t abuse the instructor chat or Erin&apos;s
            suggestion inbox.</Bullet>
        </Section>

        <Section title="7. Termination">
          <Text style={styles.body}>
            You may delete your account any time from{" "}
            <B>Profile → Delete My Account</B>. We may suspend or terminate
            your account if you break these Terms — most likely with a warning
            first, unless the situation is serious (e.g. harassment or spam).
          </Text>
        </Section>

        <Section title="8. Disclaimers & limitation of liability">
          <Text style={styles.body}>
            The app is provided <B>as is</B>, without warranties of any kind.
            To the fullest extent allowed by law, SGY and its instructors are
            not liable for indirect, incidental, or consequential damages
            arising from your use of the app or attendance at events.
          </Text>
        </Section>

        <Section title="9. DMCA / Copyright">
          <Text style={styles.body}>
            To report content you believe infringes your copyright, email us
            with:
          </Text>
          <Bullet>A description of the copyrighted work.</Bullet>
          <Bullet>The location in the app (e.g. the dance name or event
            title).</Bullet>
          <Bullet>Your contact information and an electronic signature.</Bullet>
          <Pressable
            testID="terms-dmca-contact"
            onPress={() => Linking.openURL(`mailto:${contact}?subject=DMCA%20takedown`)}
            style={styles.contactBtn}
          >
            <Ionicons name="mail-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.contactBtnText}>{contact}</Text>
          </Pressable>
        </Section>

        <Section title="10. Changes to these terms">
          <Text style={styles.body}>
            We may update these Terms as the app evolves. Meaningful changes
            will be flagged inside the app. Continued use after an update
            means you accept the revised terms.
          </Text>
        </Section>

        <Section title="11. Governing law">
          <Text style={styles.body}>
            These Terms are governed by the laws of the State of Arizona,
            USA. Any dispute that can&apos;t be settled informally will be
            resolved in a court located in Yuma County, Arizona.
          </Text>
        </Section>

        <Section title="12. Contact us">
          <Text style={styles.body}>
            Questions, feedback, or takedown requests?
          </Text>
          <Pressable
            testID="terms-contact"
            onPress={() => Linking.openURL(`mailto:${contact}`)}
            style={styles.contactBtn}
          >
            <Ionicons name="mail-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.contactBtnText}>{contact}</Text>
          </Pressable>
        </Section>

        <Text style={[styles.body, { marginTop: spacing.xl, textAlign: "center", color: colors.muted }]}>
          Stompin&apos; Ground Yuma · Yuma, Arizona
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

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: "700", color: colors.onSurface }}>{children}</Text>;
}

function Link({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Text
      onPress={onPress}
      style={{ color: colors.brandPrimary, fontWeight: "700" }}
    >
      {children}
    </Text>
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
