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
import { DraftCountProvider } from "@/src/context/draft-count-context";
import { AgeGateModal } from "@/src/components/AgeGateModal";
import { UpdateBanner } from "@/src/components/UpdateBanner";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

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

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const router = useRouter();

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

    // Warm tap
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data || {}) as any;
      followUrl(data.deeplink || data.action_url);
    });

    // Cold start
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = (response.notification.request.content.data || {}) as any;
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
              <DraftCountProvider>
                <StatusBar barStyle="dark-content" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FDFBF7" } }} />
                <AgeGateModal />
                {/* Sticks to the top of the app; only renders on native
                    when expo-updates has a bundle ready. Hidden on web. */}
                <UpdateBanner />
              </DraftCountProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
