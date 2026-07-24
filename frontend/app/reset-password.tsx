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
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api/client";
import { colors, spacing, radius } from "@/src/theme";
import { BrandLogo } from "../src/components/BrandLogo";

/**
 * Reset Password screen.
 * Reached via a link emailed from /auth/forgot-password.
 * URL: /reset-password?token=<raw_token>
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const tokenParam = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (tokenParam || "").trim();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!token) {
      setErr("This reset link is missing its token. Please request a new one.");
      return;
    }
    if (pw1.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, pw1);
      setDone(true);
    } catch (e: any) {
      const msg = e?.message || "Unable to reset password.";
      setErr(
        msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")
          ? "This reset link has expired or already been used. Please request a new one."
          : msg
      );
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
          <View style={styles.logoWrap}>
            <BrandLogo size="sm" />
          </View>

          {!done ? (
            <>
              <Text style={styles.title}>Set a new password</Text>
              <Text style={styles.subtitle}>
                Choose a new password for your Stompin&apos; Ground Yuma account. It
                must be at least 8 characters.
              </Text>

              <View style={styles.field}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.muted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="reset-pw1"
                  placeholder="New password"
                  placeholderTextColor={colors.muted}
                  value={pw1}
                  onChangeText={setPw1}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="next"
                />
                <Pressable onPress={() => setShow((s) => !s)} hitSlop={10}>
                  <Ionicons
                    name={show ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.muted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="reset-pw2"
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.muted}
                  value={pw2}
                  onChangeText={setPw2}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                />
              </View>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Pressable
                testID="reset-submit"
                onPress={submit}
                disabled={busy}
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Set new password</Text>
                )}
              </Pressable>

              <Pressable
                testID="reset-back"
                onPress={() => router.replace("/auth")}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={colors.brandPrimary}
                />
              </View>
              <Text style={styles.title}>Password reset!</Text>
              <Text style={styles.subtitle}>
                Your password has been updated. You can sign in with your new
                password now.
              </Text>

              <Pressable
                testID="reset-done"
                onPress={() => router.replace("/auth")}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Go to sign in</Text>
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
