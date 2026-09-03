/**
 * Settings → Language.
 *
 * Lets the user change the app's language at any time. Same options
 * as the first-open picker plus a "System default" toggle that clears
 * the override and lets the app follow the device locale.
 *
 * Changes take effect immediately (every ``useTranslation`` subscriber
 * re-renders) and, if the user is signed in, are synced to the server
 * via ``PATCH /api/auth/me/language`` so the choice survives a device
 * change.
 */
import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/context/auth-context";
import { api } from "@/src/api/client";
import {
  Locale,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
} from "@/src/i18n/translations";
import { setLocaleOverride, useTranslation } from "@/src/i18n";
import { colors, radius, spacing } from "@/src/theme";


export default function LanguageSettings() {
  const router = useRouter();
  const { t, override, locale, deviceLocale } = useTranslation();
  const { token, user, updateUser } = useAuth();
  const [busy, setBusy] = useState<Locale | "system" | null>(null);

  const pick = async (choice: Locale | "system") => {
    if (busy) return;
    setBusy(choice);
    try {
      await setLocaleOverride(choice, {
        syncToBackend: token
          ? async (lang) => {
              try {
                const res = await api.setPreferredLanguage(lang, token);
                if (res.user) updateUser(res.user);
              } catch {
                // Local override still applied — server sync is
                // best-effort.
              }
            }
          : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const rows: { code: Locale | "system"; label: string; hint?: string }[] = [
    {
      code: "system",
      label: t("language.system_default"),
      hint: t("language.system_default_hint", {
        locale: LOCALE_LABELS[deviceLocale],
      }),
    },
    ...SUPPORTED_LOCALES.map((code) => ({
      code,
      label: LOCALE_LABELS[code],
    })),
  ];

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.headerBar}>
        <Pressable
          testID="language-back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>{t("language.title")}</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{t("language.subtitle")}</Text>

        <View style={styles.list}>
          {rows.map((row) => {
            const active = override === row.code;
            const rowBusy = busy === row.code;
            return (
              <Pressable
                key={row.code}
                testID={`language-row-${row.code}`}
                onPress={() => pick(row.code)}
                style={[styles.row, active && styles.rowActive]}
                disabled={!!busy}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rowLabel,
                      active && styles.rowLabelActive,
                    ]}
                  >
                    {row.label}
                  </Text>
                  {row.hint ? (
                    <Text style={styles.rowHint}>{row.hint}</Text>
                  ) : null}
                </View>
                {rowBusy ? (
                  <ActivityIndicator color={colors.brandPrimary} />
                ) : active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.brandPrimary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>
          {t("language.saved_toast")} · {LOCALE_LABELS[locale]}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  list: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  rowActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: "#FBEDE5",
  },
  rowLabel: {
    fontSize: 16,
    color: colors.onSurface,
    fontWeight: "500",
  },
  rowLabelActive: {
    color: colors.brandPrimary,
    fontWeight: "700",
  },
  rowHint: {
    marginTop: 2,
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    marginTop: spacing.md,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
  },
});
