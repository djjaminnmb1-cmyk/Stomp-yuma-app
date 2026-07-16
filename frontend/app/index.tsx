import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/auth");
  }, [user, loading, router]);

  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
