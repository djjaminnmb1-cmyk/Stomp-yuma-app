/**
 * DuoBadge — tiny inline pill that summarises how many people
 * choreographed a dance TOGETHER. Rendered next to the "By {main}"
 * line on library cards so collaborations are visible at a glance.
 *
 * Label rules
 * -----------
 *   coCount === 0  → returns null (solo dance, no pill)
 *   coCount === 1  → "Duo"                      (2 people total)
 *   coCount === 2  → "Trio"                     (3 people total)
 *   coCount >= 3   → "Group · N"                (N = coCount + 1)
 *
 * Localised via ``dance.duo.*`` — every locale ships all four keys.
 * The pill is purely visual; the wrapping card handles the tap.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "@/src/theme";
import { useTranslation } from "@/src/i18n";

type Props = {
  /** Length of the dance's ``co_choreographers`` array. */
  coCount: number;
  /** Optional style overrides for the wrapping pill (e.g. margin). */
  compact?: boolean;
};

export function DuoBadge({ coCount, compact = false }: Props) {
  const { t } = useTranslation();
  if (!coCount || coCount <= 0) return null;

  let label: string;
  if (coCount === 1) {
    label = t("dance.duo.duo");
  } else if (coCount === 2) {
    label = t("dance.duo.trio");
  } else {
    // 3+ collaborators — total artists is coCount + 1 (the main).
    label = t("dance.duo.group", { count: coCount + 1 });
  }

  return (
    <View
      style={[styles.pill, compact && styles.pillCompact]}
      accessibilityLabel={label}
      testID="duo-badge"
    >
      <Ionicons
        name="sparkles"
        size={compact ? 9 : 10}
        color={colors.brandPrimary}
      />
      <Text style={[styles.text, compact && styles.textCompact]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary + "18",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "44",
    alignSelf: "flex-start",
  },
  pillCompact: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  text: {
    color: colors.brandPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  textCompact: {
    fontSize: 9,
  },
});
