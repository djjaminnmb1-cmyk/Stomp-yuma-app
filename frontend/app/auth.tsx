import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme";

export default function AuthScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [isInstructor, setIsInstructor] = useState(false);
  const [instructorCode, setInstructorCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitEmail = async () => {
    setErr(null);
    if (!email || !pw || (mode === "register" && !name)) {
      setErr("Fill all fields");
      return;
    }
    if (mode === "register" && isInstructor && !instructorCode.trim()) {
      setErr("Please enter your instructor access code");
      return;
    }
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(email.trim(), pw)
          : await api.register(
              email.trim(),
              pw,
              name.trim(),
              isInstructor ? instructorCode.trim() : undefined
            );
      await signIn(res.token, res.user);
      // Warn (via Alert so it survives the navigation) if instructor toggle
      // was on but the code didn't match — account still succeeds.
      if (mode === "register" && isInstructor && !res.user.is_instructor) {
        Alert.alert(
          "Account created",
          "The instructor access code didn't match, so you're signed in as a regular member. You can try again anytime from Profile → Switch to instructor profile."
        );
      }
      // 🎆 First-time users get a dedicated welcome + fireworks screen.
      if (res.is_new_user) {
        const first = encodeURIComponent(res.user?.name || "");
        router.replace(`/welcome?name=${first}`);
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      let redirect = "";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        redirect = window.location.origin + "/";
      } else {
        redirect = Linking.createURL("");
      }
      const authBase = process.env.EXPO_PUBLIC_GOOGLE_AUTH_URL;
      if (!authBase) {
        setErr("Google sign-in isn't configured for this build.");
        setBusy(false);
        return;
      }
      const authUrl = `${authBase}?redirect=${encodeURIComponent(redirect)}`;

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      if (result.type !== "success" || !result.url) {
        setBusy(false);
        return;
      }
      const url = result.url;
      const sidMatch =
        url.match(/[#?]session_id=([^&]+)/) ||
        url.match(/session_id=([^&]+)/);
      if (!sidMatch) {
        setErr("No session returned");
        setBusy(false);
        return;
      }
      const session_id = decodeURIComponent(sidMatch[1]);
      const res = await api.googleSession(session_id);
      await signIn(res.token, res.user);
      if (res.is_new_user) {
        const first = encodeURIComponent(res.user?.name || "");
        router.replace(`/welcome?name=${first}`);
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  // Process web session_id if returning from OAuth
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
    if (m && !busy) {
      const sid = decodeURIComponent(m[1]);
      window.history.replaceState(null, "", window.location.pathname);
      setBusy(true);
      api
        .googleSession(sid)
        .then(async (res) => {
          await signIn(res.token, res.user);
          if (res.is_new_user) {
            const first = encodeURIComponent(res.user?.name || "");
            router.replace(`/welcome?name=${first}`);
          } else {
            router.replace("/(tabs)");
          }
        })
        .catch((e) => setErr(e?.message || "Google sign-in failed"))
        .finally(() => setBusy(false));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Login hero — bespoke portrait artwork with the SGY logo
              already baked in. We do NOT re-render the BrandLogo
              here (it would fight with the printed one). Instead
              the app name sits pinned to the very top of the hero,
              in the sunset-sky area above the printed logo so it
              never occludes the brand mark. */}
          <View style={styles.hero}>
            <Image
              source={require("../assets/images/login-hero.jpg")}
              style={StyleSheet.absoluteFillObject as any}
              contentFit="cover"
              contentPosition="top"
            />
            {/* Soft dark scrim at the very top for text legibility. */}
            <LinearGradient
              colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.15)", "transparent"]}
              locations={[0, 0.35, 1]}
              style={styles.heroTopScrim}
            />
            {/* Soft cream-to-transparent at the bottom so the sign-in
                form feels seamless where the hero meets it. */}
            <LinearGradient
              colors={["transparent", colors.surface]}
              locations={[0.7, 1]}
              style={StyleSheet.absoluteFillObject as any}
            />
            <View style={styles.heroTopContent} pointerEvents="none">
              <Text
                style={styles.heroTitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                testID="auth-hero-title"
              >
                Stompin&apos; Ground
              </Text>
              <Text
                style={styles.heroSubtitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                Dance Social HQ
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.tabs}>
              <Pressable
                testID="auth-tab-login"
                onPress={() => setMode("login")}
                style={[styles.tab, mode === "login" && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                testID="auth-tab-register"
                onPress={() => setMode("register")}
                style={[styles.tab, mode === "register" && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>
                  Create Account
                </Text>
              </Pressable>
            </View>

            {mode === "register" && (
              <TextInput
                testID="auth-input-name"
                placeholder="Full name"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
            )}
            <TextInput
              testID="auth-input-email"
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <View style={styles.pwWrap}>
              <TextInput
                testID="auth-input-password"
                placeholder="Password"
                placeholderTextColor={colors.muted}
                value={pw}
                onChangeText={setPw}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.pwInput}
              />
              <Pressable
                testID="auth-password-toggle"
                onPress={() => setShowPassword((s) => !s)}
                style={styles.pwEye}
                hitSlop={10}
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            {mode === "register" && (
              <>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Text style={styles.toggleLabel}>I am an instructor</Text>
                    <Text style={styles.toggleSub}>
                      Requires the studio access code
                    </Text>
                  </View>
                  <Switch
                    testID="auth-instructor-toggle"
                    value={isInstructor}
                    onValueChange={(v) => {
                      setIsInstructor(v);
                      if (!v) setInstructorCode("");
                    }}
                    trackColor={{
                      false: colors.divider,
                      true: colors.brandPrimary,
                    }}
                    thumbColor={colors.surface}
                    ios_backgroundColor={colors.divider}
                  />
                </View>
                {isInstructor && (
                  <TextInput
                    testID="auth-instructor-code"
                    placeholder="Instructor access code"
                    placeholderTextColor={colors.muted}
                    value={instructorCode}
                    onChangeText={setInstructorCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    style={styles.input}
                  />
                )}
              </>
            )}

            {err ? (
              <Text testID="auth-error" style={styles.err}>
                {err}
              </Text>
            ) : null}

            <Pressable
              testID="auth-submit-button"
              onPress={submitEmail}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === "login" ? "Sign In" : "Create Account"}
                </Text>
              )}
            </Pressable>

            {mode === "login" && (
              <Pressable
                testID="auth-forgot-password-link"
                onPress={() => router.push("/forgot-password")}
                style={styles.forgotWrap}
                hitSlop={8}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.line} />
            </View>

            <View style={styles.appleWrap}>
              <AppleSignInButton onError={setErr} />
            </View>

            <Pressable
              testID="auth-google-button"
              onPress={handleGoogle}
              disabled={busy}
              style={styles.googleBtn}
            >
              <Ionicons name="logo-google" size={18} color={colors.onSurface} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>

            <Text style={styles.legal}>
              {mode === "register" ? (
                <>
                  By creating an account you agree to our{" "}
                  <Text
                    testID="auth-terms-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/terms")}
                  >
                    Terms of Service
                  </Text>{" "}
                  and{" "}
                  <Text
                    testID="auth-privacy-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/privacy")}
                  >
                    Privacy Policy
                  </Text>
                  , and acknowledge that line dancing is a physical activity
                  you take part in at your own risk.
                </>
              ) : (
                <>
                  By continuing you agree to our{" "}
                  <Text
                    testID="auth-terms-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/terms")}
                  >
                    Terms
                  </Text>{" "}
                  and{" "}
                  <Text
                    testID="auth-privacy-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/privacy")}
                  >
                    Privacy Policy
                  </Text>
                  .
                </>
              )}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  // Taller hero so the printed logo + boots artwork sits fully in
  // view before the sign-in form scrolls up under it. 520 is a
  // sweet spot on 6"-class phones — smaller devices get an ~64%
  // window that still shows the boots.
  hero: {
    height: 520,
    justifyContent: "flex-start",
    backgroundColor: "#2B1D16",
    overflow: "hidden",
  },
  heroTopScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 180,
  },
  // App-name overlay pinned to the very top. Sits ABOVE the printed
  // SGY logo (which lives at ~20-55% of the hero height) so it
  // never occludes the brand mark. Small top padding keeps it clear
  // of the notch / status bar.
  heroTopContent: {
    position: "absolute",
    top: 12,
    left: spacing.xl,
    right: spacing.xl,
    alignItems: "center",
    gap: 2,
  },
  heroTitle: {
    // Rye — bundled Wild-West display face that matches the
    // "STOMPIN' GROUND" lettering on the printed logo below.
    // Loaded once at app-start via ``useIconFonts`` (see
    // src/hooks/use-icon-fonts.ts). Fallback to serif if the font
    // hasn't loaded yet so the layout doesn't jump.
    fontFamily: Platform.select({ web: "Rye, serif", default: "Rye" }),
    fontSize: 30,
    // Rye is already heavy by design — explicit weights on this
    // font just render inconsistently across platforms.
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.6,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  heroSubtitle: {
    fontFamily: Platform.select({ web: "Rye, serif", default: "Rye" }),
    fontSize: 13,
    color: "#FFF3D9",
    textAlign: "center",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroContent: { padding: spacing.xl, alignItems: "center" },
  form: { padding: spacing.xl, gap: spacing.md },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
  tabTextActive: { color: colors.onBrandPrimary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    fontSize: 15,
  },
  pwWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingRight: 6,
  },
  pwInput: {
    flex: 1,
    padding: 14,
    color: colors.onSurface,
    fontSize: 15,
  },
  pwEye: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  err: { color: colors.error, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    marginTop: 2,
  },
  toggleLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  toggleSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  forgotWrap: { alignItems: "center", paddingVertical: spacing.sm, marginTop: 2 },
  forgotText: {
    color: colors.brandPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.muted, fontSize: 12 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
  },
  googleBtnText: { fontSize: 15, fontWeight: "600", color: colors.onSurface },
  appleWrap: {
    marginBottom: 0,
  },
  legal: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  legalLink: {
    color: colors.brandPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
