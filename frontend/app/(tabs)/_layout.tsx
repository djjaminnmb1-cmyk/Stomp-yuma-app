import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { useDraftCount } from "@/src/context/draft-count-context";
import { useTranslation } from "@/src/i18n";

// Base "content" height for the tab bar — icons (24pt) + labels (11pt)
// + breathing room. This is added ON TOP of the device's bottom safe
// area so the final visible bar height is ``TAB_CONTENT_HEIGHT + insets.bottom``.
const TAB_CONTENT_HEIGHT = 60;

export default function TabsLayout() {
  const { user } = useAuth();
  const { draftCount } = useDraftCount();
  const { t } = useTranslation();
  const isInstructor = !!(user && (user.is_admin || user.is_instructor));
  const insets = useSafeAreaInsets();
  // Bottom safe-area — 34pt on iPhones with a home indicator,
  // 24-48pt on Androids with gesture / 3-button nav, 0 on iPhone
  // SE / web. On Android edge-to-edge (see ``app.config.js``) the
  // system nav bar is translucent and the app draws behind it, so
  // this padding is REQUIRED — without it the tab icons sit under
  // the nav bar. We floor at a small value for platforms where
  // insets briefly return 0 during layout thrash.
  const rawInset = insets.bottom;
  const bottomInset = Math.max(
    rawInset,
    Platform.OS === "android" ? 12 : Platform.OS === "ios" ? 6 : 4,
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          // Explicit height + paddingBottom keeps icons + labels
          // ABOVE the phone's system nav bar / home indicator on
          // every device. See TAB_CONTENT_HEIGHT / bottomInset above.
          height: TAB_CONTENT_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          // Push the label down a tiny bit so it doesn't crash into
          // the icon on the compact devices.
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("tabs.dances"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-dances"
        options={{
          title: t("tabs.my_dances"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bookmark" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="instructor"
        options={{
          title: t("tabs.instructor"),
          href: isInstructor ? "/instructor" : null,
          tabBarBadge: isInstructor && draftCount > 0 ? draftCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.warning,
            color: "#fff",
            fontSize: 10,
            fontWeight: "700",
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="school" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
