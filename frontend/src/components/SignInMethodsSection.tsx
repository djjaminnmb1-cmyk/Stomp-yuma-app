/**
 * Sign-in methods panel — visible on Profile.
 *
 * Shows the caller which auth providers their account is linked to
 * (Email, Google, Apple) and lets them link Apple in place if they
 * haven't already. Unlink is offered when it's safe (they still have
 * another way to sign in). Web and Android hide the Apple row entirely
 * — the native module isn't available there.
 */
import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

export function SignInMethodsSection() {
  const { user, token, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Fire the availability probe once when the component mounts.
  // Android/web never mount the ``ios`` code path.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (alive) setAppleAvailable(!!ok);
      })
      .catch(() => {
        if (alive) setAppleAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!user || !token) return null;

  const appleLinked = !!user.apple_sub;
  const emailLinked = !!user.email && !user.email_is_synthetic;
  const provider = (user.auth_provider || "email").toLowerCase();

  const doLinkApple = async () => {
    if (!appleAvailable) return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert("Apple sign-in", "No identity token returned. Try again.");
        return;
      }
      setBusy(true);
      // Forward authorizationCode too so link path establishes the
      // refresh token needed for revoke-on-delete (5.1.1(v)).
      const res = await api.linkApple(
        token,
        credential.identityToken,
        credential.authorizationCode || undefined,
      );
      updateUser(res.user);
      Alert.alert("Apple linked", "You can now sign in with Apple.");
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      Alert.alert(
        "Couldn't link Apple",
        err?.message || "Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const doUnlink = () => {
    Alert.alert(
      "Unlink Apple?",
      "You'll need email/password or Google to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const res = await api.unlinkApple(token);
              updateUser(res.user);
            } catch (e: any) {
              Alert.alert("Couldn't unlink", e?.message || "Try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.section} testID="profile-sign-in-methods">
      <Text style={styles.sectionTitle}>Sign-in methods</Text>

      {/* Email row — always shown; label reflects whether they can
          currently use email/password to sign in. */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Ionicons
            name="mail-outline"
            size={20}
            color={colors.brandPrimary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowText}>Email &amp; password</Text>
            {emailLinked ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {user.email}
              </Text>
            ) : (
              <Text style={styles.rowSub}>Not configured</Text>
            )}
          </View>
        </View>
        {emailLinked ? <StatusChip label="Connected" tone="ok" /> : null}
      </View>

      {/* Google — shown only when the account was originally created via
          Google. We can't currently unlink Google, so this row is
          informational. */}
      {provider === "google" ? (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="logo-google"
              size={20}
              color={colors.brandPrimary}
            />
            <Text style={styles.rowText}>Google</Text>
          </View>
          <StatusChip label="Connected" tone="ok" />
        </View>
      ) : null}

      {/* Apple — iOS only. On Android/web we hide the whole row because
          the module isn't available anyway. */}
      {Platform.OS === "ios" && (appleAvailable || appleLinked) ? (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="logo-apple"
              size={20}
              color={colors.brandPrimary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>Apple</Text>
              <Text style={styles.rowSub}>
                {appleLinked
                  ? "Sign in with your Apple ID from any device."
                  : "Link once and sign in with Face ID next time."}
              </Text>
            </View>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={colors.brandPrimary} />
          ) : appleLinked ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <StatusChip label="Connected" tone="ok" />
              <Pressable
                testID="profile-apple-unlink"
                onPress={doUnlink}
                hitSlop={8}
                style={styles.linkBtn}
              >
                <Text style={styles.unlinkText}>Unlink</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="profile-apple-link"
              onPress={doLinkApple}
              style={styles.primaryBtn}
              hitSlop={6}
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.primaryBtnText}>Link Apple</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <Text style={styles.note}>
        Linking gives you more ways to sign in and adds a backup if you
        lose access to one of them.
      </Text>
    </View>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn";
}) {
  const bg = tone === "ok" ? colors.success + "22" : colors.warning + "22";
  const fg = tone === "ok" ? colors.success : colors.warning;
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  rowText: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
  },
  rowSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  linkBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  unlinkText: {
    color: colors.error,
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  note: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
});

export default SignInMethodsSection;
