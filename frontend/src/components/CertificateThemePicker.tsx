/**
 * CertificateThemePicker
 *
 * Small horizontal row of pill-style theme chips. Each chip shows a live
 * mini-swatch of that theme's palette so users can eyeball the difference
 * before committing.
 *
 * Reused by:
 *   - `/app/celebrate.tsx` — pick a theme before downloading a specific
 *     certificate (also persists as the user's default via the API).
 *   - `/app/(tabs)/profile.tsx` — set the default theme once so all future
 *     downloads use it.
 *
 * Fetches theme options from `/api/certificate-themes` (public endpoint,
 * no auth needed) so palette hex values live server-side — updating a
 * theme's colors is a one-liner in `routes/certificate.py::THEMES` and
 * every client picks it up automatically.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { api, CertificateTheme } from "@/src/api/client";
import { colors, radius } from "@/src/theme";

type Props = {
  value: string;
  onChange: (theme: string) => void;
  disabled?: boolean;
  // Vertical layout stacks label + swatches for the profile screen; the
  // default horizontal row fits neatly under a bottom-sheet button.
  layout?: "row" | "grid";
};

export default function CertificateThemePicker({
  value,
  onChange,
  disabled,
  layout = "row",
}: Props) {
  const [themes, setThemes] = useState<CertificateTheme[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .listCertificateThemes()
      .then((r) => {
        if (alive) setThemes(r.themes || []);
      })
      .catch(() => {
        // If the server call fails (rare — public endpoint), fall back to
        // the three canonical themes so the UI still works.
        if (alive) {
          setThemes([
            {
              key: "classic",
              label: "Classic",
              colors: {
                primary: "#8B2E1E",
                secondary: "#1D3B87",
                accent: "#F2A628",
                bg: "#FBF3E4",
                ink: "#2A1F18",
              },
            },
            {
              key: "mardi_gras",
              label: "Mardi Gras",
              colors: {
                primary: "#5D267D",
                secondary: "#0F7B5A",
                accent: "#F2C230",
                bg: "#FEF7E0",
                ink: "#2C1637",
              },
            },
            {
              key: "desert_sunset",
              label: "Desert Sunset",
              colors: {
                primary: "#C34A2C",
                secondary: "#8B5E3C",
                accent: "#F49E4C",
                bg: "#FFF3E3",
                ink: "#3B1F14",
              },
            },
          ]);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (layout === "grid") {
    return (
      <View style={styles.grid}>
        {themes.map((t) => (
          <ChipCard
            key={t.key}
            theme={t}
            selected={t.key === value}
            onPress={() => onChange(t.key)}
            disabled={disabled}
          />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {themes.map((t) => (
        <Chip
          key={t.key}
          theme={t}
          selected={t.key === value}
          onPress={() => onChange(t.key)}
          disabled={disabled}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  theme,
  selected,
  onPress,
  disabled,
}: {
  theme: CertificateTheme;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={`cert-theme-${theme.key}`}
      style={[
        styles.chip,
        selected && styles.chipSel,
        disabled && { opacity: 0.55 },
      ]}
    >
      {/* Mini palette (3 stacked color squares) */}
      <View style={styles.swatchWrap}>
        <View style={[styles.swatch, { backgroundColor: theme.colors.primary }]} />
        <View style={[styles.swatch, { backgroundColor: theme.colors.accent }]} />
        <View style={[styles.swatch, { backgroundColor: theme.colors.secondary }]} />
      </View>
      <Text style={[styles.chipText, selected && styles.chipTextSel]}>
        {theme.label}
      </Text>
    </Pressable>
  );
}

function ChipCard({
  theme,
  selected,
  onPress,
  disabled,
}: {
  theme: CertificateTheme;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={`cert-theme-${theme.key}`}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bg,
          borderColor: selected ? theme.colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
        disabled && { opacity: 0.55 },
      ]}
    >
      <View style={[styles.cardBar, { backgroundColor: theme.colors.accent }]} />
      <Text style={[styles.cardLabel, { color: theme.colors.primary }]}>
        {theme.label}
      </Text>
      <View style={styles.cardSwatches}>
        {(["primary", "secondary", "accent"] as const).map((k) => (
          <View
            key={k}
            style={[
              styles.cardSwatch,
              { backgroundColor: theme.colors[k], borderColor: theme.colors.ink + "33" },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  chipSel: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  swatchWrap: {
    flexDirection: "row",
    gap: 2,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  chipText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  chipTextSel: {
    color: "#fff",
  },

  // Grid layout for the profile screen (larger swatches, more visual)
  grid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  card: {
    flex: 1,
    minWidth: 100,
    padding: 10,
    borderRadius: radius.md,
    gap: 8,
    alignItems: "center",
  },
  cardBar: {
    width: "70%",
    height: 4,
    borderRadius: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  cardSwatches: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "center",
  },
  cardSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
  },
});
