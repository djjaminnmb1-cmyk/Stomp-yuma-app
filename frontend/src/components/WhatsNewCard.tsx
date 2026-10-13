/**
 * WhatsNewCard — one-time Home card after an app update.
 *
 * Shows when the signed-in member hasn't seen this build's notes yet
 * (AsyncStorage ``whatsNew.lastSeenVersion`` < APP_VERSION) and the
 * server has notes for this version (Admin → App Version). Brand-new
 * sign-ups (account < 24 h old) skip it silently — everything is new
 * to them. "Got it" or ✕ marks the version as seen.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useTranslation } from "@/src/i18n";
import { APP_VERSION, isOlder } from "@/src/lib/appVersion";
import { colors, radius, spacing } from "@/src/theme";

const SEEN_KEY = "whatsNew.lastSeenVersion";
const NEW_MEMBER_MS = 24 * 60 * 60 * 1000;

export function WhatsNewCard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<string[] | null>(null);
  const userId = user?.user_id;
  const createdAt = user?.created_at;

  useEffect(() => {
    setItems(null);
    if (!userId) return;
    let alive = true;
    (async () => {
      const seen = await AsyncStorage.getItem(SEEN_KEY).catch(() => null);
      if (seen && !isOlder(seen, APP_VERSION)) return;
      const created = Date.parse(createdAt || "");
      if (!Number.isNaN(created) && Date.now() - created < NEW_MEMBER_MS) {
        AsyncStorage.setItem(SEEN_KEY, APP_VERSION).catch(() => {});
        return;
      }
      const r = await api.getWhatsNew(APP_VERSION).catch(() => null);
      if (alive && r?.items?.length) setItems(r.items);
    })();
    return () => {
      alive = false;
    };
  }, [userId, createdAt]);

  if (!items) return null;

  const dismiss = () => {
    setItems(null);
    AsyncStorage.setItem(SEEN_KEY, APP_VERSION).catch(() => {});
  };

  return (
    <View style={styles.card} testID="whats-new-card">
      <View style={styles.headRow}>
        <View style={styles.iconBubble}>
          <Ionicons name="sparkles" size={20} color={colors.onBrandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("whats_new.title", { version: APP_VERSION })}</Text>
          <Text style={styles.sub}>{t("whats_new.subtitle")}</Text>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={10}
          style={styles.close}
          testID="whats-new-close"
          accessibilityLabel={t("whats_new.got_it")}
        >
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.list}>
        {items.map((line, i) => (
          <View key={i} style={styles.itemRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
            <Text style={styles.itemText}>{line}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={dismiss} style={styles.cta} testID="whats-new-dismiss">
        <Text style={styles.ctaText}>{t("whats_new.got_it")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
    gap: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 3,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: "serif", fontSize: 18, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  close: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  list: { gap: spacing.sm },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  itemText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurface },
  cta: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
