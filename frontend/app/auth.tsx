import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { AppleSignInButton } from "@/src/components/AppleSignInButton";
import { api, ApiError } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme";
import { useTranslation } from "@/src/i18n";
import { TERMS_VERSION } from "@/src/lib/terms";

export default function AuthScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t, tRaw } = useTranslation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [isInstructor, setIsInstructor] = useState(false);
  const [instructorCode, setInstructorCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Apple Guideline 1.2 — the checkbox must be actively ticked before
  // Create Account is enabled. We do NOT default to true; the user
  // has to affirmatively opt in.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Highlights the Terms card when the user tries to sign up unticked.
  const [termsError, setTermsError] = useState(false);
  // Live version from the server; the bundled constant is only the
  // offline fallback so signup never sends a stale version.
  const [termsVersion, setTermsVersion] = useState(TERMS_VERSION);
  const scrollRef = useRef<ScrollView>(null);
  const termsY = useRef(0);

  useEffect(() => {
    if (mode !== "register") return;
    api
      .getTermsVersion()
      .then((r) => r?.required_version && setTermsVersion(r.required_version))
      .catch(() => {});
  }, [mode]);

  const flagTerms = () => {
    setTermsError(true);
    scrollRef.current?.scrollTo({ y: Math.max(0, termsY.current - 120), animated: true });
  };

  const toggleTerms = () => {
    setAcceptedTerms((v) => !v);
    setTermsError(false);
  };

  const submitEmail = async () => {
    setErr(null);
    if (!email || !pw || (mode === "register" && !name)) {
      setErr(t("auth.error_fill_all"));
      return;
    }
    // Client-side gate: never send a registration the server will reject.
    if (mode === "register" && !acceptedTerms) {
      flagTerms();
      return;
    }
    if (mode === "register" && isInstructor && !instructorCode.trim()) {
      setErr(t("auth.error_enter_code"));
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
              isInstructor ? instructorCode.trim() : undefined,
              termsVersion,
            );
      await signIn(res.token, res.user);
      // Warn (via Alert so it survives the navigation) if instructor toggle
      // was on but the code didn't match — account still succeeds.
      if (mode === "register" && isInstructor && !res.user.is_instructor) {
        Alert.alert(
          t("auth.account_created_title"),
          t("auth.account_created_msg")
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
      if (e instanceof ApiError && e.code === "terms_not_accepted") {
        // Server is the source of truth — adopt its live version and
        // ask the user to re-confirm the (possibly updated) Terms.
        if (e.data?.required_version) setTermsVersion(e.data.required_version);
        setAcceptedTerms(false);
        flagTerms();
      } else if (e instanceof ApiError && e.status === 422) {
        setErr(t("auth.error_invalid_email"));
      } else {
        setErr(e?.message || t("auth.error_generic"));
      }
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
        setErr(t("auth.error_google_not_configured"));
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
        setErr(t("auth.error_google_no_session"));
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
      setErr(e?.message || t("auth.error_google_failed"));
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
        .catch((e) => setErr(e?.message || t("auth.error_google_failed")))
        .finally(() => setBusy(false));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* KeyboardAwareScrollView (keyboard-controller) works with
          Android edge-to-edge, where the old KeyboardAvoidingView
          (behavior undefined on Android) left the Terms checkbox and
          Create Account button trapped behind the keyboard. */}
      <KeyboardAwareScrollView
        ref={scrollRef as any}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={32}
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
              {/* Wild-west title — Rye font is the base but we mask it
                  with a sunset gradient (deep red → sunburst amber
                  → hot gold) so the letters "pop" against the
                  hero image without losing the printed-poster
                  wood-block feel. Twin star ornaments flank the
                  title for extra saloon-signage pride. */}
              <View style={styles.heroTitleRow} pointerEvents="none">
                <Ionicons
                  name="star"
                  size={12}
                  color="#FFD065"
                  style={styles.heroTitleStar}
                />
                <View style={styles.heroTitleWrap}>
                  {/* Dark diffusion halo behind the title so it stays
                      legible on the bright sunset patch of the hero
                      image. Rendered as a duplicate Text one row
                      behind, tinted almost-black + heavily blurred
                      via text-shadow. */}
                  <Text
                    style={styles.heroTitleShadow}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    aria-hidden
                  >
                    Stompin&apos; Ground
                  </Text>
                  <MaskedView
                    maskElement={
                      <Text
                        style={styles.heroTitleMask}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        Stompin&apos; Ground
                      </Text>
                    }
                  >
                    <LinearGradient
                      colors={[
                        "#FFF6D0", // brightest sunlit cream — top highlight
                        "#FFD469", // warm gold — mid-top
                        "#F9A63A", // pumpkin amber — mid-bottom
                        "#E27C2E", // saloon amber — bottom (stays bright)
                      ]}
                      locations={[0, 0.4, 0.75, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                    >
                      <Text
                        style={[styles.heroTitleMask, styles.heroTitleInvisible]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        testID="auth-hero-title"
                      >
                        Stompin&apos; Ground
                      </Text>
                    </LinearGradient>
                  </MaskedView>
                </View>
                <Ionicons
                  name="star"
                  size={12}
                  color="#FFD065"
                  style={styles.heroTitleStar}
                />
              </View>
              {/* Wooden-slat divider — three tiny amber pips echo the
                  seed lights strung across the printed poster. */}
              <View style={styles.heroDivider}>
                <View style={styles.heroDividerPip} />
                <View style={styles.heroDividerBar} />
                <View style={styles.heroDividerPip} />
                <View style={styles.heroDividerBar} />
                <View style={styles.heroDividerPip} />
              </View>
              <Text
                style={styles.heroSubtitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t("auth.subtitle")}
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
                  {t("auth.tab_signin")}
                </Text>
              </Pressable>
              <Pressable
                testID="auth-tab-register"
                onPress={() => setMode("register")}
                style={[styles.tab, mode === "register" && styles.tabActive]}
              >
                <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>
                  {t("auth.tab_signup")}
                </Text>
              </Pressable>
            </View>

            {mode === "register" && (
              <TextInput
                testID="auth-input-name"
                placeholder={t("auth.name")}
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
            )}
            <TextInput
              testID="auth-input-email"
              placeholder={t("auth.email")}
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
                placeholder={t("auth.password")}
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
                accessibilityLabel={showPassword ? t("auth.hide_password") : t("auth.show_password")}
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
                    <Text style={styles.toggleLabel}>{t("auth.instructor_toggle")}</Text>
                    <Text style={styles.toggleSub}>
                      {t("auth.instructor_toggle_sub")}
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
                    placeholder={t("auth.instructor_code")}
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

            {mode === "register" && (
              <View
                testID="auth-terms-card"
                onLayout={(e) => {
                  termsY.current = e.nativeEvent.layout.y;
                }}
                style={[styles.termsCard, termsError && styles.termsCardError]}
              >
                <View style={styles.termsCheckboxRow}>
                  {/* Square is its own 44pt target; the sentence also
                      toggles, while the two links inside it navigate. */}
                  <Pressable
                    testID="auth-accept-terms-checkbox"
                    onPress={toggleTerms}
                    hitSlop={12}
                    style={styles.termsCheckboxHit}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: acceptedTerms }}
                    accessibilityLabel={t("auth.accept_terms_a11y")}
                  >
                    <View
                      style={[
                        styles.termsCheckbox,
                        acceptedTerms && styles.termsCheckboxChecked,
                        termsError && styles.termsCheckboxError,
                      ]}
                    >
                      {acceptedTerms ? (
                        <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />
                      ) : null}
                    </View>
                  </Pressable>
                  <Text
                    style={styles.termsCheckboxText}
                    onPress={toggleTerms}
                    testID="auth-accept-terms-label"
                  >
                    {tRaw("auth.accept_terms_checkbox").split("{terms}")[0]}
                    <Text
                      testID="auth-accept-terms-link"
                      style={styles.legalLink}
                      onPress={() => router.push("/terms")}
                    >
                      {t("auth.terms_of_use")}
                    </Text>
                    {tRaw("auth.accept_terms_checkbox")
                      .split("{terms}")[1]
                      ?.split("{guidelines}")[0]}
                    <Text
                      testID="auth-accept-guidelines-link"
                      style={styles.legalLink}
                      onPress={() => router.push("/community-guidelines")}
                    >
                      {t("auth.community_guidelines")}
                    </Text>
                    {tRaw("auth.accept_terms_checkbox").split("{guidelines}")[1]}
                  </Text>
                </View>
                {termsError ? (
                  <View style={styles.termsErrorRow}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text testID="auth-terms-error" style={styles.termsErrorText}>
                      {t("auth.error_accept_terms")}
                    </Text>
                  </View>
                ) : null}
              </View>
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
              accessibilityState={{ disabled: busy }}
              style={[
                styles.primaryBtn,
                (busy || (mode === "register" && !acceptedTerms)) && {
                  opacity: 0.6,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === "login" ? t("auth.signin_button") : t("auth.signup_button")}
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
                <Text style={styles.forgotText}>{t("auth.forgot_password")}</Text>
              </Pressable>
            )}

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.dividerText}>{t("auth.or")}</Text>
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
              <Text style={styles.googleBtnText}>{t("auth.continue_with_google")}</Text>
            </Pressable>

            <Text style={styles.legal}>
              {mode === "register" ? (
                <>
                  {tRaw("auth.legal_signup").split("{terms}")[0]}
                  <Text
                    testID="auth-terms-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/terms")}
                  >
                    {t("auth.terms_of_service")}
                  </Text>
                  {tRaw("auth.legal_signup").split("{terms}")[1]?.split("{privacy}")[0]}
                  <Text
                    testID="auth-privacy-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/privacy")}
                  >
                    {t("auth.privacy_policy")}
                  </Text>
                  {tRaw("auth.legal_signup").split("{privacy}")[1]}
                </>
              ) : (
                <>
                  {tRaw("auth.legal_signin").split("{terms}")[0]}
                  <Text
                    testID="auth-terms-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/terms")}
                  >
                    {t("auth.terms")}
                  </Text>
                  {tRaw("auth.legal_signin").split("{terms}")[1]?.split("{privacy}")[0]}
                  <Text
                    testID="auth-privacy-link"
                    style={styles.legalLink}
                    onPress={() => router.push("/privacy")}
                  >
                    {t("auth.privacy_policy")}
                  </Text>
                  {tRaw("auth.legal_signin").split("{privacy}")[1]}
                </>
              )}
            </Text>
          </View>
      </KeyboardAwareScrollView>
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
    // Legacy solid-color title kept for tests / fallbacks. The live
    // login header now uses the masked-gradient version below
    // (heroTitleMask + LinearGradient) so the printed sunset colours
    // read through the Rye letterforms.
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
  // ---- Masked-gradient hero title ----
  // Wraps both the shadow layer and the MaskedView so they overlap
  // pixel-perfectly. `MaskedView` uses the mask Text (which we hide
  // visually) to clip the LinearGradient beneath.
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    alignSelf: "stretch",
  },
  heroTitleStar: {
    // Warm amber glow around each flanking star — kicks up the
    // sunset warmth even on Android where LinearGradient dithering
    // sometimes softens the reds.
    textShadowColor: "rgba(255,182,72,0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  heroTitleWrap: {
    alignItems: "center",
    justifyContent: "center",
    // Fixed height keeps the LinearGradient from collapsing on iOS
    // when the mask Text hasn't fully laid out yet.
    minHeight: 42,
    flexShrink: 1,
  },
  heroTitleShadow: {
    position: "absolute",
    fontFamily: Platform.select({ web: "Rye, serif", default: "Rye" }),
    fontSize: 30,
    letterSpacing: 0.4,
    textAlign: "center",
    // Ultra-soft charcoal glow — just enough to keep the gold-on-
    // sunset legible without darkening the gradient sitting on top.
    // Reduced from the old heavy shadow that was making letters
    // look muddy at the bottom of the gradient.
    color: "transparent",
    textShadowColor: "rgba(90,30,10,0.65)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroTitleMask: {
    fontFamily: Platform.select({ web: "Rye, serif", default: "Rye" }),
    fontSize: 30,
    letterSpacing: 0.4,
    textAlign: "center",
    // Any solid non-transparent colour works — MaskedView only
    // cares about the alpha channel of the mask.
    color: "#000",
  },
  heroTitleInvisible: {
    // Hide the masked Text visually — it exists only to give the
    // LinearGradient a shape to fill. `opacity: 0` keeps the
    // layout intact so the gradient sizes correctly.
    opacity: 0,
  },
  heroDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
    opacity: 0.9,
  },
  heroDividerPip: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFCC7A",
    shadowColor: "#FFCC7A",
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  heroDividerBar: {
    width: 26,
    height: 1.2,
    backgroundColor: "rgba(255,214,148,0.75)",
  },
  heroSubtitle: {
    fontFamily: Platform.select({ web: "Rye, serif", default: "Rye" }),
    fontSize: 12,
    color: "#FFE7B8",
    textAlign: "center",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.7)",
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
  termsCard: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  termsCardError: {
    borderColor: colors.error,
    borderWidth: 2,
    backgroundColor: colors.error + "14",
  },
  termsCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  termsCheckboxHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  termsCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  termsCheckboxChecked: {
    backgroundColor: colors.brandPrimary,
  },
  termsCheckboxError: {
    borderColor: colors.error,
  },
  termsCheckboxText: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 20,
  },
  termsErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingBottom: 4,
  },
  termsErrorText: {
    flex: 1,
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
});
