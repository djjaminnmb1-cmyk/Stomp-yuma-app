/**
 * First-open language picker.
 *
 * Shown once, when we've never persisted an override AND the app has
 * finished hydrating the locale store. Auto-selects the device's
 * detected locale (or English as a last resort) so the user can just
 * tap "Continue" if that's what they want.
 *
 * After a choice, we persist the override via ``setLocaleOverride``.
 * The picker never re-appears on the same device. Users can revisit
 * the choice from Profile → Language.
 *
 * We ship this as an uncloseable Modal so the user can't dismiss it
 * without picking — but every option is obvious and one tap away, so
 * the friction is minimal.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  Locale,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
} from "@/src/i18n/translations";
import {
  deviceLocale,
  setLocaleOverride,
  useTranslation,
} from "@/src/i18n";
import { colors, radius, spacing } from "@/src/theme";

// The bootstrap hook writes this AsyncStorage key with either the
// SYSTEM_DEFAULT_MARKER or a locale code once the user picks. If the
// key is missing entirely we know we've never asked.
const OVERRIDE_KEY = "sgy.locale.v1";
// Independent "picker was shown" flag — so a user who explicitly
// picks "System default" doesn't re-see the picker on next launch
// (their override value in storage IS "__system__" and we treat
// that as a valid answer).
const PICKER_SHOWN_KEY = "sgy.locale.picker_shown_at";


export function LanguagePickerModal() {
  const { t, hydrated } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Locale>(deviceLocale());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    (async () => {
      try {
        const [override, shown] = await Promise.all([
          AsyncStorage.getItem(OVERRIDE_KEY),
          AsyncStorage.getItem(PICKER_SHOWN_KEY),
        ]);
        // Never asked AND never picked → show the sheet.
        if (!override && !shown && alive) {
          setVisible(true);
        }
      } catch {
        // Storage denied — pretend we've asked so we don't loop.
      }
    })();
    return () => {
      alive = false;
    };
  }, [hydrated]);

  const detected = useMemo(() => deviceLocale(), []);

  const onContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await setLocaleOverride(selected);
      // Mark the sheet as shown — same session or later, we won't
      // pop it up again.
      await AsyncStorage.setItem(
        PICKER_SHOWN_KEY,
        new Date().toISOString(),
      );
      setVisible(false);
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Uncloseable — pressing Android back does nothing so the
        // user must pick.
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons
              name="language"
              size={28}
              color={colors.brandPrimary}
            />
          </View>
          <Text style={styles.title}>
            {t("onboarding.language.title")}
          </Text>
          <Text style={styles.subtitle}>
            {t("onboarding.language.subtitle")}
          </Text>

          <View style={styles.list}>
            {SUPPORTED_LOCALES.map((code) => {
              const active = selected === code;
              return (
                <Pressable
                  key={code}
                  testID={`lang-pick-${code}`}
                  onPress={() => setSelected(code)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <Text
                    style={[
                      styles.rowLabel,
                      active && styles.rowLabelActive,
                    ]}
                  >
                    {LOCALE_LABELS[code]}
                  </Text>
                  {code === detected && (
                    <Text style={styles.detectedTag}>
                      {t("onboarding.language.system_default")}
                    </Text>
                  )}
                  <View style={{ flex: 1 }} />
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.brandPrimary}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            testID="lang-pick-continue"
            onPress={onContinue}
            disabled={saving}
            style={[styles.cta, saving && { opacity: 0.7 }]}
          >
            <Text style={styles.ctaText}>
              {t("onboarding.language.continue")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 12, 6, 0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    // Subtle elevation so it feels like a card, not a full-page.
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimarySoft ?? "#F7E7DF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
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
    backgroundColor: colors.surfaceAlt ?? "#fff",
  },
  rowActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft ?? "#FBEDE5",
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
  detectedTag: {
    marginLeft: 8,
    fontSize: 11,
    color: colors.muted,
    backgroundColor: colors.surfaceAlt ?? "rgba(0,0,0,0.05)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  cta: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
