import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";
import { useMetronome } from "@/src/hooks/useMetronome";

/**
 * PracticeModePanel
 * ---------------------------------------------------------------------------
 * Full-screen modal that runs a wood-block metronome for the current dance.
 *
 * Features:
 *   • Wood-block sample (bundled) at 60-200 BPM, drift-corrected scheduler.
 *   • Optional pre-count "3-2-1-GO!" that ticks in tempo before regular beats.
 *   • Animated visual beat indicator (pulses on every tick, brighter on "1").
 *   • 8-count phrase row so line dancers can see where they are in the phrase.
 *   • BPM slider (60-200) with quick reset to the dance's stored BPM.
 *   • Sound on / off toggle (visual-only silent practice mode).
 */

const woodBlock = require("../../assets/sounds/wood-block.wav");

// Line-dance phrases are 8-count. Highlight beat 1 of each phrase.
const PHRASE = 8;

type Props = {
  visible: boolean;
  onClose: () => void;
  danceName: string;
  danceBpm?: number | null;
};

export default function PracticeModePanel({
  visible,
  onClose,
  danceName,
  danceBpm,
}: Props) {
  const defaultBpm = clamp(danceBpm && danceBpm > 0 ? danceBpm : 96, 60, 200);
  const [bpm, setBpm] = useState<number>(defaultBpm);
  const [running, setRunning] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [beat, setBeat] = useState(0);
  // Countdown ticks left before regular play (3 → 2 → 1 → GO!)
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const player = useAudioPlayer(woodBlock);

  // Reset BPM if the parent's dance changes while the modal is closed.
  useEffect(() => {
    if (!visible) {
      setBpm(defaultBpm);
      setRunning(false);
      setBeat(0);
      setCountdown(null);
      setElapsedSec(0);
    }
  }, [visible, defaultBpm]);

  // Configure audio session for iOS silent-mode playback.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    }).catch(() => {});
  }, []);

  // Timer for elapsed seconds while running.
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const iv = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(iv);
  }, [running]);

  const scale = useSharedValue(0.6);
  const glow = useSharedValue(0);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 0.4 + glow.value * 0.6,
  }));

  const playClick = useCallback(() => {
    if (!soundOn) return;
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Not fatal — silent on this tick.
    }
  }, [player, soundOn]);

  const flashBeat = useCallback(
    (isDownbeat: boolean) => {
      cancelAnimation(scale);
      cancelAnimation(glow);
      scale.value = isDownbeat ? 1.15 : 1.0;
      glow.value = 1;
      scale.value = withTiming(0.7, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
      glow.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.quad),
      });
    },
    [scale, glow]
  );

  const onTick = useCallback(
    (beatIndex: number) => {
      // Countdown phase — the first 3 ticks are the pre-count.
      if (countdown !== null && beatIndex < 3) {
        setCountdown(3 - beatIndex);
        playClick();
        flashBeat(false);
        return;
      }
      // First real beat replaces countdown state with the "GO" flash.
      if (countdown !== null && beatIndex === 3) {
        setCountdown(0); // 0 == GO!
        setBeat(0);
        playClick();
        flashBeat(true);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        // Clear countdown label a beat later.
        setTimeout(() => setCountdown(null), 60000 / bpm);
        return;
      }
      // Steady-state beats.
      const inPhrase = beat % PHRASE;
      const isDownbeat = inPhrase === 0;
      setBeat((b) => b + 1);
      playClick();
      flashBeat(isDownbeat);
      if (isDownbeat && Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
    },
    [bpm, beat, countdown, flashBeat, playClick]
  );

  useMetronome({ bpm, enabled: running, onTick });

  const start = () => {
    setBeat(0);
    setElapsedSec(0);
    setCountdown(3);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setBeat(0);
    setCountdown(null);
    scale.value = withTiming(0.6, { duration: 200 });
    glow.value = withTiming(0, { duration: 200 });
  };

  const useDanceBpm = () => {
    if (danceBpm && danceBpm > 0) setBpm(clamp(danceBpm, 60, 200));
  };

  const phraseIndex = beat > 0 ? (beat - 1) % PHRASE : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        stop();
        onClose();
      }}
    >
      <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>Practice Mode</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {danceName}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              stop();
              onClose();
            }}
            hitSlop={12}
            testID="close-practice"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          {/* Beat visualizer */}
          <View style={styles.visualCard}>
            <View style={styles.pulseArea}>
              {/* Outer glow ring */}
              <Animated.View
                style={[
                  styles.pulseRing,
                  pulseStyle,
                  { backgroundColor: colors.brandTertiary },
                ]}
              />
              {/* Inner solid dot */}
              <View style={styles.pulseCore}>
                <Text style={styles.pulseNumber}>
                  {countdown === null
                    ? beat === 0
                      ? "•"
                      : String(phraseIndex + 1)
                    : countdown > 0
                      ? String(countdown)
                      : "GO!"}
                </Text>
              </View>
            </View>

            {/* 8-count phrase row */}
            <View style={styles.phraseRow}>
              {Array.from({ length: PHRASE }).map((_, i) => {
                const on = running && countdown === null && phraseIndex === i && beat > 0;
                const isDown = i === 0;
                return (
                  <View
                    key={i}
                    style={[
                      styles.phraseDot,
                      isDown && styles.phraseDotDown,
                      on && styles.phraseDotOn,
                      on && isDown && styles.phraseDotOnDown,
                    ]}
                  >
                    <Text
                      style={[
                        styles.phraseDotText,
                        on && { color: "#fff" },
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.statLine}>
              {running
                ? countdown === null
                  ? `Beat ${beat}  ·  ${formatTime(elapsedSec)}  ·  ${bpm} BPM`
                  : "Get ready…"
                : "Press Play to start"}
            </Text>
          </View>

          {/* BPM Control */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>Tempo</Text>
              {danceBpm && danceBpm > 0 && bpm !== danceBpm ? (
                <Pressable onPress={useDanceBpm} testID="reset-bpm" style={styles.chip}>
                  <Ionicons name="refresh" size={12} color={colors.brandPrimary} />
                  <Text style={styles.chipText}>Use dance BPM ({danceBpm})</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.bpmReadoutRow}>
              <Text style={styles.bpmBig}>{bpm}</Text>
              <Text style={styles.bpmUnit}>BPM</Text>
            </View>

            <Slider
              testID="bpm-slider"
              style={{ width: "100%", height: 40 }}
              minimumValue={60}
              maximumValue={200}
              step={1}
              value={bpm}
              minimumTrackTintColor={colors.brandPrimary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.brandPrimary}
              onValueChange={(v) => setBpm(Math.round(v))}
            />
            <View style={styles.rangeRow}>
              <Text style={styles.rangeText}>60</Text>
              <Text style={styles.rangeText}>130</Text>
              <Text style={styles.rangeText}>200</Text>
            </View>

            {/* Nudge buttons */}
            <View style={styles.nudgeRow}>
              <NudgeBtn onPress={() => setBpm((b) => clamp(b - 5, 60, 200))} label="-5" />
              <NudgeBtn onPress={() => setBpm((b) => clamp(b - 1, 60, 200))} label="-1" />
              <NudgeBtn onPress={() => setBpm((b) => clamp(b + 1, 60, 200))} label="+1" />
              <NudgeBtn onPress={() => setBpm((b) => clamp(b + 5, 60, 200))} label="+5" />
            </View>

            <Text style={styles.hint}>
              {tempoLabel(bpm)}  ·  Line dance sweet spot is 90–130 BPM
            </Text>
          </View>

          {/* Sound toggle */}
          <Pressable
            onPress={() => setSoundOn((s) => !s)}
            testID="toggle-sound"
            style={[styles.card, styles.toggleRow]}
          >
            <Ionicons
              name={soundOn ? "volume-high" : "volume-mute"}
              size={22}
              color={soundOn ? colors.brandPrimary : colors.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{soundOn ? "Sound on" : "Silent (visual only)"}</Text>
              <Text style={styles.subLine}>
                {soundOn
                  ? "Wood-block clicks each beat, plus haptic on downbeats."
                  : "Tap to enable the wood block."}
              </Text>
            </View>
            <View
              style={[
                styles.switchTrack,
                soundOn && { backgroundColor: colors.brandPrimary },
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  soundOn && { transform: [{ translateX: 20 }] },
                ]}
              />
            </View>
          </Pressable>
        </ScrollView>

        {/* Sticky play/stop */}
        <View style={styles.stickyFooter}>
          <Pressable
            testID={running ? "stop-practice" : "start-practice"}
            onPress={running ? stop : start}
            style={[
              styles.playBtn,
              running && { backgroundColor: colors.error },
            ]}
          >
            <Ionicons
              name={running ? "stop" : "play"}
              size={22}
              color="#fff"
            />
            <Text style={styles.playBtnText}>
              {running ? "Stop" : "Start Practice"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function NudgeBtn({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={styles.nudge} testID={`bpm-nudge-${label}`}>
      <Text style={styles.nudgeText}>{label}</Text>
    </Pressable>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function tempoLabel(bpm: number): string {
  if (bpm < 76) return "Adagio (slow, careful)";
  if (bpm < 96) return "Andante (walking pace)";
  if (bpm < 120) return "Moderato (comfortable)";
  if (bpm < 156) return "Allegro (lively)";
  return "Presto (very fast)";
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
  headerLabel: {
    fontSize: 11,
    letterSpacing: 1,
    color: colors.muted,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  headerTitle: {
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
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: "serif",
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
  },
  visualCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceInverse,
    borderWidth: 1,
    borderColor: colors.surfaceInverse,
    gap: spacing.md,
    alignItems: "center",
  },
  pulseArea: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  pulseRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  pulseCore: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 6,
  },
  pulseNumber: {
    fontFamily: "serif",
    fontSize: 46,
    fontWeight: "700",
    color: "#fff",
  },
  phraseRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  phraseDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  phraseDotDown: {
    borderColor: colors.brandTertiary,
  },
  phraseDotOn: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  phraseDotOnDown: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandTertiary,
  },
  phraseDotText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
  },
  statLine: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: spacing.sm,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  bpmReadoutRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    justifyContent: "center",
  },
  bpmBig: {
    fontFamily: "serif",
    fontSize: 56,
    fontWeight: "700",
    color: colors.brandPrimary,
    lineHeight: 60,
  },
  bpmUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 1,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: -6,
  },
  rangeText: { color: colors.muted, fontSize: 11 },
  nudgeRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  nudge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  nudgeText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  hint: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: -4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  subLine: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: "center",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 2,
  },
  stickyFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 16,
    borderRadius: radius.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  playBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
});
