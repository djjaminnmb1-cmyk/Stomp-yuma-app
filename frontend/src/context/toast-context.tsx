/**
 * ToastProvider — global in-app toast surface.
 *
 * A lightweight, dependency-free replacement for `Alert.alert(...)`
 * on non-blocking confirmations (e.g. "Report submitted — reviewed
 * within 24 h"). Renders one banner at a time; a second `showToast`
 * call replaces the on-screen banner instead of stacking.
 *
 * Usage anywhere below <ToastProvider>:
 *   const toast = useToast();
 *   toast.success(t("report.ok_body"));
 *   toast.error("Something went wrong");
 *   toast.info("Copied to clipboard", { duration: 1500 });
 *
 * Notes:
 *   - Positioned below the notch on iOS + Android automatic status-bar
 *     inset via `useSafeAreaInsets`.
 *   - Reanimated slide-in / slide-out (200 ms) so it never feels
 *     jarring compared to Alert.alert.
 *   - Auto-dismisses after `duration` ms (default 3200). Tap to
 *     dismiss immediately.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "@/src/theme";

// -------------------------------------------------------------- Types

type ToastKind = "success" | "error" | "info";

export type ToastOptions = {
  /** How long the toast stays on-screen (ms). Default 3200. */
  duration?: number;
};

type ToastCtx = {
  show: (kind: ToastKind, message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
};

// A no-op implementation so components mounted OUTSIDE the provider
// (e.g. quick unit tests) never crash — they just silently do nothing.
const NOOP: ToastCtx = {
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
};

const Ctx = createContext<ToastCtx>(NOOP);

const DEFAULT_DURATION = 3200;

// ---------------------------------------------------------- Provider

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
    id: number;
  } | null>(null);
  // Monotonic id so a rapid succession of show()s doesn't collide
  // with a still-pending auto-dismiss timer from the previous one.
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-24);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    opacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(-24, { duration: 200 }, (finished) => {
      // Clear the toast payload AFTER the animation resolves so the
      // banner doesn't disappear mid-slide.
      if (finished) runOnJS(setToast)(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      if (!message) return;
      idRef.current += 1;
      const nextId = idRef.current;
      setToast({ kind, message, id: nextId });
      // Snap animation values back to hidden then animate in — covers
      // the "second toast while the first is still fading out" case.
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      opacity.value = 0;
      translateY.value = -24;
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 220 });

      if (timerRef.current) clearTimeout(timerRef.current);
      const duration = Math.max(1200, opts?.duration ?? DEFAULT_DURATION);
      timerRef.current = setTimeout(() => {
        // Only auto-dismiss if this is still the LATEST toast — a
        // newer show() call will have advanced idRef.current.
        if (idRef.current === nextId) hide();
      }, duration);
    },
    [hide, opacity, translateY]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo<ToastCtx>(
    () => ({
      show,
      success: (m, o) => show("success", m, o),
      error: (m, o) => show("error", m, o),
      info: (m, o) => show("info", m, o),
    }),
    [show]
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { top: Math.max(insets.top + 8, 20), width: Math.min(width - 32, 480) },
            animStyle,
          ]}
        >
          <Pressable
            onPress={hide}
            style={[
              styles.card,
              toast.kind === "success" && styles.cardSuccess,
              toast.kind === "error" && styles.cardError,
              toast.kind === "info" && styles.cardInfo,
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID={`toast-${toast.kind}`}
          >
            <Ionicons
              name={
                toast.kind === "success"
                  ? "checkmark-circle"
                  : toast.kind === "error"
                    ? "alert-circle"
                    : "information-circle"
              }
              size={20}
              color="#fff"
            />
            <Text style={styles.text} numberOfLines={3}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------- Hook

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

// ------------------------------------------------------------ Styles

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    // Center by ceiling — right/left computed at render time so the
    // toast stays centred regardless of screen width.
    alignSelf: "center",
    zIndex: 9999,
    // On web, `zIndex` alone doesn't guarantee the toast paints on
    // top of every native-ish overlay; `elevation` covers Android.
    elevation: 32,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    // Drop-shadow on both platforms so the banner reads clearly on
    // any background.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  cardSuccess: { backgroundColor: colors.success },
  cardError: { backgroundColor: colors.error },
  cardInfo: { backgroundColor: colors.brandPrimary },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
});
