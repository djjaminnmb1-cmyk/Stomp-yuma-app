/**
 * AudiencePicker — admin UI for scoping an announcement broadcast.
 *
 * Three modes (one segmented control):
 *   • Everyone                 — no filter, full fan-out (default)
 *   • Instructor's followers   — multi-select instructor picker
 *   • Difficulty tier          — multi-select tier chips
 *
 * Combining
 * ---------
 * The two custom filters are intersected server-side: picking
 * "Erin's followers" AND "Beginner" reaches only dancers who follow
 * Erin AND whose most-practiced tier (last 30 days) is Beginner. The
 * UI exposes BOTH filter blocks whenever the admin is in "custom"
 * mode so they can combine without leaving the screen.
 *
 * Preview count
 * -------------
 * Debounced to 500ms after the last change — the preview call is
 * cheap but a free-text instructor search would hammer it otherwise.
 * The count reflects the ``notification_prefs.announcements`` opt-out
 * so a dancer who muted announcements won't be in the number.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  AnnouncementAudience,
  InstructorPickerItem,
} from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type Mode = "everyone" | "instructor" | "difficulty";

export type AudiencePickerProps = {
  value: AnnouncementAudience;
  onChange: (next: AnnouncementAudience) => void;
};

function deriveMode(a: AnnouncementAudience): Mode {
  if (a.scope === "everyone") return "everyone";
  // Custom scope — pick the "primary" tab based on which filter has
  // the first value. Both tabs STILL show their respective filter
  // blocks (admins can combine).
  if ((a.instructor_user_ids?.length ?? 0) > 0) return "instructor";
  if ((a.difficulty_tiers?.length ?? 0) > 0) return "difficulty";
  return "instructor";
}

export function AudiencePicker({ value, onChange }: AudiencePickerProps) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>(() => deriveMode(value));
  const [instructors, setInstructors] = useState<InstructorPickerItem[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [instructorFilter, setInstructorFilter] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sampleNames, setSampleNames] = useState<string[]>([]);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load picker metadata once per mount.
  useEffect(() => {
    if (!token) return;
    api
      .listAnnouncementInstructorPicker(token)
      .then((r) => setInstructors(r.items || []))
      .catch(() => setInstructors([]));
    api
      .listAnnouncementDifficultyTiers(token)
      .then((r) => setTiers(r.items || []))
      .catch(() => setTiers([]));
  }, [token]);

  // Debounced preview — recompute 500ms after the last audience edit.
  const runPreview = useCallback(
    (audience: AnnouncementAudience) => {
      if (!token) return;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
      previewTimerRef.current = setTimeout(async () => {
        setPreviewLoading(true);
        try {
          const r = await api.previewAnnouncementAudience(token, audience);
          setPreviewCount(r.count);
          setSampleNames(r.sample_names);
        } catch {
          setPreviewCount(null);
          setSampleNames([]);
        } finally {
          setPreviewLoading(false);
        }
      }, 500);
    },
    [token],
  );

  useEffect(() => {
    runPreview(value);
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [value, runPreview]);

  const updateMode = useCallback(
    (m: Mode) => {
      setMode(m);
      if (m === "everyone") {
        onChange({ scope: "everyone" });
      } else {
        // Keep whatever filters are already set — swapping tabs is a
        // UI focus change, not a reset.
        onChange({
          scope: "custom",
          instructor_user_ids: value.instructor_user_ids ?? [],
          difficulty_tiers: value.difficulty_tiers ?? [],
        });
      }
    },
    [onChange, value.instructor_user_ids, value.difficulty_tiers],
  );

  const toggleInstructor = useCallback(
    (uid: string) => {
      const current = new Set(value.instructor_user_ids ?? []);
      if (current.has(uid)) current.delete(uid);
      else current.add(uid);
      onChange({
        scope: "custom",
        instructor_user_ids: Array.from(current),
        difficulty_tiers: value.difficulty_tiers ?? [],
      });
    },
    [value, onChange],
  );

  const toggleTier = useCallback(
    (tier: string) => {
      const current = new Set(value.difficulty_tiers ?? []);
      if (current.has(tier)) current.delete(tier);
      else current.add(tier);
      onChange({
        scope: "custom",
        instructor_user_ids: value.instructor_user_ids ?? [],
        difficulty_tiers: Array.from(current),
      });
    },
    [value, onChange],
  );

  const filteredInstructors = useMemo(() => {
    const q = instructorFilter.trim().toLowerCase();
    if (!q) return instructors;
    return instructors.filter((x) =>
      x.name.toLowerCase().includes(q),
    );
  }, [instructors, instructorFilter]);

  const picks: Set<string> = useMemo(
    () => new Set(value.instructor_user_ids ?? []),
    [value.instructor_user_ids],
  );
  const tierPicks: Set<string> = useMemo(
    () => new Set(value.difficulty_tiers ?? []),
    [value.difficulty_tiers],
  );

  return (
    <View style={styles.container} testID="audience-picker">
      <Text style={styles.sectionLabel}>Audience</Text>
      <View style={styles.modeRow}>
        <ModeBtn
          testID="audience-mode-everyone"
          icon="people"
          label="Everyone"
          active={mode === "everyone"}
          onPress={() => updateMode("everyone")}
        />
        <ModeBtn
          testID="audience-mode-instructor"
          icon="person"
          label="Followers"
          active={mode === "instructor"}
          onPress={() => updateMode("instructor")}
        />
        <ModeBtn
          testID="audience-mode-difficulty"
          icon="speedometer"
          label="Difficulty"
          active={mode === "difficulty"}
          onPress={() => updateMode("difficulty")}
        />
      </View>

      {/* Instructor picker (shown only when Followers mode is active OR
          when some instructor is already selected under Difficulty mode
          — so combinations are visible). */}
      {mode === "instructor" ||
      (mode === "difficulty" && picks.size > 0) ? (
        <View style={styles.block} testID="audience-instructor-block">
          <View style={styles.blockHeader}>
            <Ionicons
              name="person"
              size={14}
              color={colors.brandPrimary}
            />
            <Text style={styles.blockLabel}>
              Followers of {picks.size === 0 ? "..." : `${picks.size} picked`}
            </Text>
          </View>
          <TextInput
            testID="audience-instructor-search"
            style={styles.search}
            placeholder="Search instructors..."
            placeholderTextColor={colors.muted}
            value={instructorFilter}
            onChangeText={setInstructorFilter}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ScrollView
            style={styles.instructorScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {filteredInstructors.length === 0 ? (
              <Text style={styles.emptyInline}>No instructors.</Text>
            ) : (
              filteredInstructors.map((inst) => {
                const on = picks.has(inst.user_id);
                return (
                  <Pressable
                    key={inst.user_id}
                    testID={`audience-inst-${inst.user_id}`}
                    onPress={() => toggleInstructor(inst.user_id)}
                    style={[styles.instRow, on && styles.instRowOn]}
                  >
                    <Ionicons
                      name={on ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={on ? colors.brandPrimary : colors.muted}
                    />
                    <Text style={styles.instName} numberOfLines={1}>
                      {inst.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}

      {/* Difficulty picker (shown under Difficulty mode OR when the
          admin has combined it onto an Instructor filter). */}
      {mode === "difficulty" ||
      (mode === "instructor" && tierPicks.size > 0) ? (
        <View style={styles.block} testID="audience-difficulty-block">
          <View style={styles.blockHeader}>
            <Ionicons
              name="speedometer"
              size={14}
              color={colors.brandPrimary}
            />
            <Text style={styles.blockLabel}>
              Current level{" "}
              {tierPicks.size === 0 ? "..." : `(${tierPicks.size} picked)`}
            </Text>
          </View>
          <View style={styles.tierChips}>
            {tiers.map((tier) => {
              const on = tierPicks.has(tier);
              return (
                <Pressable
                  key={tier}
                  testID={`audience-tier-${tier}`}
                  onPress={() => toggleTier(tier)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, on && styles.chipTextOn]}
                  >
                    {tier}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Preview footer — "Will reach N dancers". */}
      <View style={styles.previewBar} testID="audience-preview">
        {previewLoading ? (
          <ActivityIndicator size="small" color={colors.brandPrimary} />
        ) : previewCount == null ? (
          <Text style={styles.previewTextMuted}>
            Counting...
          </Text>
        ) : (
          <>
            <Ionicons
              name="people"
              size={16}
              color={colors.brandPrimary}
            />
            <Text style={styles.previewText}>
              Will reach{" "}
              <Text style={styles.previewCount}>{previewCount}</Text>{" "}
              {previewCount === 1 ? "dancer" : "dancers"}
            </Text>
            {sampleNames.length > 0 ? (
              <Text style={styles.previewSample} numberOfLines={1}>
                e.g. {sampleNames.slice(0, 3).join(", ")}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}


type ModeBtnProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
};
function ModeBtn({ icon, label, active, onPress, testID }: ModeBtnProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.modeBtn, active && styles.modeBtnActive]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? colors.onBrandPrimary : colors.onSurface}
      />
      <Text
        style={[
          styles.modeBtnText,
          active && styles.modeBtnTextActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  modeRow: {
    flexDirection: "row",
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  modeBtnActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  modeBtnText: {
    fontWeight: "700",
    fontSize: 12,
    color: colors.onSurface,
  },
  modeBtnTextActive: {
    color: colors.onBrandPrimary,
  },
  block: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurface,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  instructorScroll: {
    maxHeight: 180,
  },
  instRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  instRowOn: {
    backgroundColor: colors.brandPrimary + "14",
  },
  instName: {
    fontSize: 14,
    color: colors.onSurface,
    flex: 1,
  },
  emptyInline: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
  },
  tierChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipOn: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
  },
  chipTextOn: {
    color: colors.onBrandPrimary,
  },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary + "0A",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "33",
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  previewText: {
    fontSize: 13,
    color: colors.onSurface,
  },
  previewTextMuted: {
    fontSize: 13,
    color: colors.muted,
  },
  previewCount: {
    fontWeight: "800",
    color: colors.brandPrimary,
  },
  previewSample: {
    flex: 1,
    fontSize: 11,
    color: colors.muted,
    marginLeft: 4,
  },
});
