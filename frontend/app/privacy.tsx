import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius } from "@/src/theme";

/**
 * Public privacy policy page. Reachable in-app via `/privacy` and on the
 * web preview at `https://<host>/privacy` — that URL is used for App Store
 * and Google Play submission metadata.
 *
 * Keep this page factual, short, and free of legalese — Apple reviewers
 * expect a clear description of what data is collected, how it's used,
 * how to contact us, and how to delete an account.
 */
export default function PrivacyPolicy() {
  const router = useRouter();
  const contact = "whereyumalinesuptodance@stompingroundyuma.org";

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="privacy-back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: June 2026</Text>

        <Text style={styles.body}>
          Stompin&apos; Ground Yuma (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;)
          operates this mobile app to help our line-dance community track dances,
          class attendance, and studio events. This policy explains what we
          collect, why, and the choices you have.
        </Text>

        <Section title="1. Information we collect">
          <Bullet>
            <B>Account info</B> — name, email, and (if you register with email)
            an encrypted password hash. We never store your password in
            plain text.
          </Bullet>
          <Bullet>
            <B>Google sign-in</B> — if you tap &quot;Continue with Google&quot;
            we receive your name, email, and public profile picture from Google.
            We do not receive your Google password.
          </Bullet>
          <Bullet>
            <B>App activity</B> — dances you mark as completed or wishlist,
            classes you attend, dances you suggest, chat messages you post
            in the instructor chat, activity-feed events and reactions,
            follow/unfollow actions.
          </Bullet>
          <Bullet>
            <B>Device push token</B> — if you allow notifications, we store a
            device push token so we can send reminders and class updates.
          </Bullet>
          <Bullet>
            <B>Approximate location (opt-in)</B> — only when you tap
            &quot;Near me&quot; on the <B>Find Events</B> screen. We use it
            once to compute distances and never store the coordinates on our
            servers.
          </Bullet>
          <Bullet>
            <B>Event addresses</B> — if you&apos;re an instructor and post an
            event, the address you type is stored and geocoded to display
            events on a map/list. Please only post addresses you have the
            right to publish.
          </Bullet>
        </Section>

        <Section title="2. How we use it">
          <Bullet>To sign you in and keep your account secure.</Bullet>
          <Bullet>
            To show your personal dance library, wishlist, and attendance
            history.
          </Bullet>
          <Bullet>
            To let instructors coordinate classes, suggestions, and community
            chat.
          </Bullet>
          <Bullet>
            To power social features — activity feed, reactions, follows,
            and dancer discovery — so you can cheer on other dancers in the
            community.
          </Bullet>
          <Bullet>
            To send you class reminders and event updates (only if you opted
            in to notifications).
          </Bullet>
        </Section>

        <Section title="3. Who we share it with">
          <Text style={styles.body}>
            We do <B>not</B> sell your data. Your data is only shared with the
            service providers we rely on to run the app:
          </Text>
          <Bullet>
            <B>Google</B> — only if you sign in with Google, for
            authentication.
          </Bullet>
          <Bullet>
            <B>Push-notification provider</B> — only your device push token,
            used solely to deliver reminders.
          </Bullet>
          <Bullet>
            <B>Email provider</B> — only when you request a password reset.
          </Bullet>
          <Bullet>
            <B>OpenStreetMap Nominatim</B> — event addresses are sent to
            Nominatim to obtain map coordinates. We do <B>not</B> send your
            personal identifiers along with the address.
          </Bullet>
          <Bullet>
            <B>AI providers (OpenAI / Anthropic / Google Gemini)</B> — a
            limited set of features (such as future AI-assisted suggestions,
            when we roll them out) may forward your prompt text to one of
            these providers. Your account identifiers are never included.
          </Bullet>
        </Section>

        <Section title="4. Data retention & deletion">
          <Text style={styles.body}>
            You can permanently delete your account and all personal data at
            any time from inside the app: go to <B>Profile → Delete My Account</B>
            and confirm. Deleting your account removes your login, tracking,
            attendance history, suggestions, and chat messages. Content you
            authored for the community (dances or classes) is preserved but
            your name is replaced with &quot;Deleted user&quot;.
          </Text>
        </Section>

        <Section title="5. Your rights">
          <Bullet>
            You can view your data at any time inside the app.
          </Bullet>
          <Bullet>
            You can correct your name/email from the Profile screen.
          </Bullet>
          <Bullet>You can delete your account (see section 4).</Bullet>
          <Bullet>
            You can withdraw notification consent from your device settings.
          </Bullet>
        </Section>

        <Section title="6. Children">
          <Text style={styles.body}>
            The app is intended for line dancers of all ages, but children
            under 13 should only use it with a parent or guardian&apos;s
            supervision. We do not knowingly collect data from children under
            13 without parental involvement. If you believe a child under 13
            created an account without permission,{" "}
            <Link onPress={() => Linking.openURL(`mailto:${contact}?subject=COPPA%20request`)}>
              contact us
            </Link>{" "}
            and we&apos;ll remove the account.
          </Text>
        </Section>

        <Section title="7. California residents (CCPA)">
          <Text style={styles.body}>
            If you live in California you have the right to know what
            personal information we collect, request a copy, request that
            we delete it, and not be discriminated against for exercising
            your rights. We do not sell your personal information. To make
            a request, email us using the contact link below.
          </Text>
        </Section>

        <Section title="8. EU / UK residents (GDPR)">
          <Text style={styles.body}>
            If you live in the EU, UK, or European Economic Area, you have
            the right to access, correct, port, or erase your personal data,
            and to object to or restrict its processing. Our legal basis for
            processing is either your consent (e.g. notifications, location)
            or the performance of our service agreement (your account and
            tracking data). Email us to exercise any of these rights.
          </Text>
        </Section>

        <Section title="9. Security">
          <Text style={styles.body}>
            Passwords are hashed with bcrypt. All traffic between the app and
            our servers is encrypted over HTTPS. Reset tokens expire after
            15 minutes.
          </Text>
        </Section>

        <Section title="10. DMCA / Copyright takedown">
          <Text style={styles.body}>
            The Stompin&apos; Ground Yuma dance directory links to
            third-party step sheets hosted on services such as CopperKnob and
            BootStepper. If you own a step sheet or other content that
            appears in the app without permission, email us with a
            description of the work, where it appears, and your contact
            details. We&apos;ll remove valid takedown requests within a
            reasonable time.
          </Text>
          <Pressable
            testID="privacy-dmca"
            onPress={() =>
              Linking.openURL(`mailto:${contact}?subject=DMCA%20takedown`)
            }
            style={styles.contactBtn}
          >
            <Ionicons
              name="document-lock-outline"
              size={18}
              color={colors.brandPrimary}
            />
            <Text style={styles.contactBtnText}>DMCA takedown request</Text>
          </Pressable>
        </Section>

        <Section title="11. Contact us">
          <Text style={styles.body}>
            Questions or requests? Email us and we&apos;ll get back to you.
          </Text>
          <Pressable
            testID="privacy-contact"
            onPress={() => Linking.openURL(`mailto:${contact}`)}
            style={styles.contactBtn}
          >
            <Ionicons name="mail-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.contactBtnText}>{contact}</Text>
          </Pressable>
        </Section>

        <View style={styles.footerLinks}>
          <Pressable
            testID="privacy-goto-terms"
            onPress={() => router.push("/terms")}
            hitSlop={6}
          >
            <Text style={styles.footerLinkText}>Terms of Service</Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable
            testID="privacy-goto-community"
            onPress={() => router.push("/community-guidelines")}
            hitSlop={6}
          >
            <Text style={styles.footerLinkText}>Community Guidelines</Text>
          </Pressable>
        </View>

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
  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: spacing.lg,
  },
  footerLinkText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  footerDot: { color: colors.muted, fontSize: 13 },
});
