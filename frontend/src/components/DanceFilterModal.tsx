import React, { useMemo } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

/**
 * DanceFilterModal
 * ---------------------------------------------------------------------------
 * Bottom-sheet-style modal that surfaces the secondary filters (BPM range,
 * choreographer, sort order). Difficulty stays inline on the library header
 * because it's the most-used filter for line dancers, so surfacing it in the
 * modal would just add a step.
 *
 * All state is lifted to the parent — this component is purely presentational.
 */

export type SortKey =
  | "name-asc"
  | "name-desc"
  | "bpm-asc"
  | "bpm-desc"
  | "difficulty-asc"
  | "newest";

export const SORT_OPTIONS: { key: SortKey; label: string; icon: any }[] = [
  { key: "name-asc", label: "Name  A → Z", icon: "text" },
  { key: "name-desc", label: "Name  Z → A", icon: "text" },
  { key: "difficulty-asc", label: "Easiest first", icon: "trending-up" },
  { key: "bpm-asc", label: "BPM  Slow → Fast", icon: "speedometer" },
  { key: "bpm-desc", label: "BPM  Fast → Slow", icon: "flash" },
  { key: "newest", label: "Newest first", icon: "sparkles" },
];

export type BpmBand = "Any" | "Slow" | "Medium" | "Fast" | "Very Fast";
export const BPM_BANDS: {
  key: BpmBand;
  label: string;
  match: (bpm?: number | null) => boolean;
}[] = [
  { key: "Any", label: "Any", match: () => true },
  {
    key: "Slow",
    label: "Slow  <90",
    match: (b) => (b || 0) > 0 && (b || 0) < 90,
  },
  {
    key: "Medium",
    label: "Medium  90–120",
    match: (b) => (b || 0) >= 90 && (b || 0) <= 120,
  },
  {
    key: "Fast",
    label: "Fast  120–140",
    match: (b) => (b || 0) > 120 && (b || 0) <= 140,
  },
  {
    key: "Very Fast",
    label: "Very Fast  140+",
    match: (b) => (b || 0) > 140,
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  bpmBand: BpmBand;
  setBpmBand: (b: BpmBand) => void;
  chor: string | null;
  setChor: (c: string | null) => void;
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
  choreographers: [string, number][]; // [name, count] sorted by count desc
  resultCount: number;
  onReset: () => void;
};

export default function DanceFilterModal({
  visible,
  onClose,
  bpmBand,
  setBpmBand,
  chor,
  setChor,
  sortBy,
  setSortBy,
  choreographers,
  resultCount,
  onReset,
}: Props) {
  const topChoreographers = useMemo(
    () => choreographers.slice(0, 24),
    [choreographers]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hLabel}>Filter & Sort</Text>
            <Text style={styles.hTitle}>Find your next dance</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} testID="close-filters">
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Sort */}
          <Section title="Sort" icon="swap-vertical">
            <View style={styles.chipFlow}>
              {SORT_OPTIONS.map((opt) => {
                const on = sortBy === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSortBy(opt.key)}
                    testID={`sort-${opt.key}`}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={13}
                      color={on ? colors.onBrandPrimary : colors.brandPrimary}
                    />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* BPM */}
          <Section title="Tempo (BPM)" icon="speedometer">
            <View style={styles.chipFlow}>
              {BPM_BANDS.map((b) => {
                const on = bpmBand === b.key;
                return (
                  <Pressable
                    key={b.key}
                    testID={`bpm-band-${b.key.replace(/\s+/g, "-").toLowerCase()}`}
                    onPress={() => setBpmBand(b.key)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Choreographer */}
          <Section title="Choreographer" icon="person">
            <View style={styles.chipFlow}>
              <Pressable
                testID="chor-any"
                onPress={() => setChor(null)}
                style={[styles.chip, chor === null && styles.chipOn]}
              >
                <Text style={[styles.chipText, chor === null && styles.chipTextOn]}>
                  Any
                </Text>
              </Pressable>
              {topChoreographers.map(([name, count]) => {
                const on = chor === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setChor(on ? null : name)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                      {name}
                    </Text>
                    <View style={[styles.count, on && styles.countOn]}>
                      <Text style={[styles.countText, on && styles.countTextOn]}>
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {choreographers.length > topChoreographers.length ? (
              <Text style={styles.hint}>
                Showing top {topChoreographers.length} of {choreographers.length} —
                use the search bar for others.
              </Text>
            ) : null}
          </Section>
        </ScrollView>

        {/* Sticky footer */}
        <View style={styles.footer}>
          <Pressable onPress={onReset} style={styles.resetBtn} testID="reset-filters">
            <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={styles.applyBtn}
            testID="apply-filters"
          >
            <Text style={styles.applyText}>
              Show {resultCount} {resultCount === 1 ? "dance" : "dances"}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={colors.brandPrimary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  hLabel: {
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  hTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  chipFlow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
    maxWidth: "100%",
  },
  chipOn: {
    backgroundColor: colors.brandPrimary,
  },
  chipText: {
    color: colors.brandPrimary,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  chipTextOn: { color: colors.onBrandPrimary },
  count: {
    marginLeft: 4,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
  },
  countOn: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  countTextOn: { color: "#fff" },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  resetText: { color: colors.brandPrimary, fontWeight: "700" },
  applyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 4,
    elevation: 3,
  },
  applyText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
