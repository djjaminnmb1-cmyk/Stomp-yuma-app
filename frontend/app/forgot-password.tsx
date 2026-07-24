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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme";
import { BrandLogo } from "../src/components/BrandLogo";

/**
 * Forgot Password screen.
 *
 * Flow:
 *  1. User enters email
 *  2. Backend creates a 15-minute single-use reset token, emails a link
 *  3. Screen shows a generic success message regardless of whether the
 *     account exists (server prevents user-enumeration).
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || !cleaned.includes("@")) {
      setErr("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(cleaned);
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            testID="forgot-back"
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <View style={styles.logoWrap}>
            <BrandLogo size="sm" />
          </View>

          {!sent ? (
            <>
              <Text style={styles.title}>Forgot your password?</Text>
              <Text style={styles.subtitle}>
                Enter the email you used to sign up. If we find an account,
                we&apos;ll email you a link to set a new password. The link
                expires in{" "}
                <Text style={{ fontWeight: "700" }}>15 minutes</Text>.
              </Text>

              <View style={styles.field}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={colors.muted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="forgot-email"
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  style={styles.input}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                />
              </View>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Pressable
                testID="forgot-submit"
                onPress={submit}
                disabled={busy}
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send reset link</Text>
                )}
              </Pressable>

              <Pressable
                testID="forgot-back-to-signin"
                onPress={() => router.replace("/auth")}
                style={styles.secondaryBtn}
                hitSlop={8}
              >
                <Text style={styles.secondaryBtnText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons
                  name="mail-open-outline"
                  size={40}
                  color={colors.brandPrimary}
                />
              </View>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                If an account with that email exists, we&apos;ve sent a
                password-reset link to{" "}
                <Text style={{ fontWeight: "700", color: colors.onSurface }}>
                  {email.trim()}
                </Text>
                .{"\n\n"}The link works for the next 15 minutes and can only be
                used once. Don&apos;t see it? Check your spam folder.
              </Text>

              <Pressable
                testID="forgot-return"
                onPress={() => router.replace("/auth")}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Back to sign in</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: spacing.md,
  },
  backText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  logoWrap: { alignItems: "center", marginVertical: spacing.md },
  iconCircle: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brandPrimary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  title: {
    fontFamily: "serif",
    fontSize: 26,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    color: colors.onSurface,
    fontSize: 15,
  },
  err: { color: colors.error, fontSize: 13, marginBottom: spacing.md },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryBtn: {
    alignItems: "center",
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  secondaryBtnText: {
    color: colors.brandPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
});
