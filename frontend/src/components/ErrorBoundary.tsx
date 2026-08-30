/**
 * ErrorBoundary
 * -------------
 * Root-level React error boundary. Any render / lifecycle error inside
 * the app tree lands here so the user sees a branded "Something went
 * wrong" screen with a Reload button instead of a hard iOS/Android
 * crash-to-home-screen.
 *
 * Apple's App Store review team treats launch crashes as an automatic
 * 2.1 rejection — this component is the last line of defence for JS
 * errors slipping through TestFlight. It also gives us a chance to
 * console.error the stack for post-mortem when we're on Metro.
 *
 * Native crashes (JSI / native modules blowing up) still cause a full
 * process crash — that's out of scope for a JS boundary.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Console log so it lands in Metro / device console. Ready spot to
    // plug in Sentry / Crashlytics later without touching call sites.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload = () => {
    // JS-only "reload" — resets the boundary and re-mounts the tree.
    // Fine for transient render errors. A truly wedged native module
    // would need the user to fully kill the app.
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.wrap} testID="root-error-boundary">
        <View style={styles.card}>
          <Ionicons
            name="warning-outline"
            size={48}
            color={colors.brandPrimary}
          />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Tap reload to try again — your
            data is safe.
          </Text>
          <Pressable
            onPress={this.handleReload}
            style={styles.btn}
            testID="root-error-reload"
          >
            <Text style={styles.btnText}>Reload the app</Text>
          </Pressable>

          {__DEV__ && this.state.error ? (
            <View style={styles.devBox}>
              <Text style={styles.devTitle}>Dev-only detail</Text>
              <Text style={styles.devText} numberOfLines={6}>
                {this.state.error.message}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minWidth: 200,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      default: {},
    }),
  },
  btnText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  devBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    width: "100%",
  },
  devTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 4,
    letterSpacing: 0.6,
  },
  devText: {
    fontSize: 12,
    color: colors.onSurface,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});
