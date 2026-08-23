/**
 * AppleSignInButton
 * -----------------
 * Renders the native Apple-branded button (required by App Store) and
 * hands off the ``identityToken`` to our backend.
 *
 * Availability
 *   * iOS only. On Android / web we return ``null`` — the calling
 *     screen keeps rendering email/password + Google as the visible
 *     options.
 *   * We call ``AppleAuthentication.isAvailableAsync()`` before
 *     rendering so ancient iOS builds or Simulator setups without Sign
 *     in with Apple don't show a broken button.
 *
 * UX notes
 *   * Apple's guidelines require the branded button — do not swap for
 *     a custom design.
 *   * ``ERR_REQUEST_CANCELED`` is a normal user action (they tapped
 *     Cancel). We stay silent instead of showing an alert.
 */
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { radius } from "@/src/theme";

export function AppleSignInButton({
  onError,
}: {
  onError?: (msg: string) => void;
}) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Only iOS ships the native module — everything else can bail
    // early so we don't even touch the module.
    if (Platform.OS !== "ios") return;
    let alive = true;
    (async () => {
      try {
        const ok = await AppleAuthentication.isAvailableAsync();
        if (alive) setAvailable(!!ok);
      } catch {
        if (alive) setAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (Platform.OS !== "ios" || !available) return null;

  const handlePress = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        onError?.("Apple didn't return an identity token. Try again.");
        return;
      }
      // The full-name payload only arrives on the very first sign-in
      // for a given Apple ID. Compose "First Last" or fall back to
      // whatever piece Apple gives us.
      const first = credential.fullName?.givenName || "";
      const last = credential.fullName?.familyName || "";
      const composed = `${first} ${last}`.trim();
      const res = await api.appleSignIn(
        credential.identityToken,
        composed || undefined,
        credential.email || undefined,
      );
      await signIn(res.token, res.user);
      router.replace("/");
    } catch (err: any) {
      // Silent cancel is the norm — the user just tapped away.
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      const msg =
        err?.message ||
        "Apple sign-in failed. Please try again in a moment.";
      if (onError) onError(msg);
      else Alert.alert("Apple sign-in", msg);
    }
  };

  return (
    <View style={styles.wrap}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={
          AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={radius.md}
        style={styles.btn}
        onPress={handlePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  btn: { width: "100%", height: 48 },
});

export default AppleSignInButton;
