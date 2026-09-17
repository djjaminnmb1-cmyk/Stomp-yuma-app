import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { LogBox, Platform, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/auth-context";
import { PendingSubmissionsProvider } from "@/src/context/pending-submissions-context";
import { TermsGate } from "@/src/components/TermsGate";
import { DraftCountProvider } from "@/src/context/draft-count-context";
import { AgeGateModal } from "@/src/components/AgeGateModal";
import { LanguagePickerModal } from "@/src/components/LanguagePickerModal";
import { UpdateBanner } from "@/src/components/UpdateBanner";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { useI18nBootstrap } from "@/src/i18n";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Module-scope: foreground handler (native only)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Module-scope: Android channel
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

// Module-scope: interactive notification category for the "New event"
// push. Adding an "I'm going" action button to the notification tray
// so followers can RSVP without opening the app.
//
// Handling: the response listener below inspects
// ``response.actionIdentifier`` — if it matches ``rsvp_going`` we
// POST the RSVP in the background AND still deep-link to the event
// detail so the user gets visual confirmation. If the user just
// taps the notification body (default action), we deep-link only.
if (Platform.OS !== "web") {
  Notifications.setNotificationCategoryAsync("event_new", [
    {
      identifier: "rsvp_going",
      buttonTitle: "I'm going",
      options: {
        // Do not open the app for this action — RSVPs are a quick,
        // background-only interaction. The app receives the response
        // + POSTs the API call, no navigation stack disruption.
        opensAppToForeground: false,
      },
    },
  ]).catch(() => {
    // Non-fatal on platforms that don't support the API (e.g. some
    // older Android builds). The base notification still fires.
  });
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

  // Load persisted language override + set the effective i18n locale.
  // Fires once on mount; every ``useTranslation`` subscriber re-renders
  // when bootstrap completes.
  useI18nBootstrap();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const followUrl = (url?: string) => {
      if (!url) return;
      if (url.startsWith("http")) Linking.openURL(url);
      else router.push(url as any);
    };

    /** If the user tapped the "I'm going" action from a
     *  ``event_new`` notification, fire the RSVP API in the
     *  background. Never blocks the UI — if the token is stale or
     *  the network hiccups, the user can still RSVP from the event
     *  detail screen next time they open it. */
    const maybeRsvp = async (data: any, actionId: string) => {
      if (actionId !== "rsvp_going") return;
      const eventId = data?.event_id;
      if (!eventId) return;
      try {
        // Deferred import avoids a circular dependency at module load.
        const { api } = await import("@/src/api/client");
        const { getStoredToken } = await import(
          "@/src/context/auth-context"
        );
        const t = await getStoredToken();
        if (!t) return;
        await api.setRsvp(t, String(eventId), "going");
      } catch {
        // Silent — user can retry inside the app.
      }
    };

    // Warm tap
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data || {}) as any;
      const actionId = response.actionIdentifier;
      // Interactive action → RSVP in background, but still deep-link
      // so the app opens on the event detail for visual confirmation.
      maybeRsvp(data, actionId);
      followUrl(data.deeplink || data.action_url);
    });

    // Cold start
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = (response.notification.request.content.data || {}) as any;
      const actionId = response.actionIdentifier;
      maybeRsvp(data, actionId);
      followUrl(data.deeplink || data.action_url);
    });

    return () => {
      tapSub.remove();
    };
  }, [router]);

  if (!loaded && !error) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <PendingSubmissionsProvider>
                <DraftCountProvider>
                  <TermsGate />
                  <StatusBar barStyle="dark-content" />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FDFBF7" } }} />
                  <AgeGateModal />
                  {/* First-open language picker — auto-detects the
                      device locale and shows a one-time picker so the
                      user can confirm or override. Silently no-ops once
                      the user has made a choice. */}
                  <LanguagePickerModal />
                  {/* Sticks to the top of the app; only renders on native
                      when expo-updates has a bundle ready. Hidden on web. */}
                  <UpdateBanner />
                </DraftCountProvider>
              </PendingSubmissionsProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
