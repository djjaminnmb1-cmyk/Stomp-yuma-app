import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";
import { useDraftCount } from "@/src/context/draft-count-context";
import { useTranslation } from "@/src/i18n";

export default function TabsLayout() {
  const { user } = useAuth();
  const { draftCount } = useDraftCount();
  const { t } = useTranslation();
  const isInstructor = !!(user && (user.is_admin || user.is_instructor));
  // Bottom safe-area inset — 34pt on iPhones with a home indicator,
  // 24-48px on Androids with gesture nav, 0 on iPhone SE / 3-button
  // Android nav. We floor to a small value so the tab bar never
  // pancakes flush against the screen edge even on hardware with
  // zero-inset chins.
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 8 : 12);

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
          // Base tab-bar surface = 56pt icons + labels. We add the
          // device's bottom safe-area on top so the icons never sit
          // under the home indicator / gesture bar.
          height: 56 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
