/**
 * FeedReactionsBar
 * ----------------
 * A row shown at the bottom of every FeedEventCard.
 *
 * Behavior
 *   - Displays already-added reaction chips (emoji + count). Tapping an
 *     existing chip toggles the caller's own reaction on/off with an
 *     optimistic update and plays a soft click sound (silent-mode
 *     friendly).
 *   - Long-press ANY chip (or the "+" button) opens the ReactorsSheet
 *     so dancers can see exactly who cheered them on.
 *   - The trailing "+" button opens a compact inline picker with the
 *     full set of reaction kinds so users can add any kind (not just
 *     the ones that already have counts).
 *   - Reactions the caller has added themselves are highlighted with a
 *     brand-primary outline.
 *   - Optimistic-first UX: local state flips immediately, then we call
 *     the API and reconcile on success or roll back on failure.
 *
 * The picker renders INLINE below the chips row (not as an absolute
 * popover) so its emojis never run off the screen no matter where the
 * "+" button sits within the row.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  FeedReactionKind,
  FeedReactionMeta,
  FeedReactions,
} from "@/src/api/client";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useTapSound } from "@/src/hooks/useTapSound";
import { ReactorsSheet } from "@/src/components/ReactorsSheet";
import { colors, radius, spacing } from "@/src/theme";

// Emoji fallback used if the server catalog hasn't loaded yet.
// NOTE: v2.7 pack — 👏 clap was swapped for 🕺 dancer to lean into the
// line-dance vibe. ``clap`` is still rendered for legacy rows in the
// DB but is no longer offered in the picker.
const EMOJI_FALLBACK: Record<FeedReactionKind, string> = {
  high_five: "🙌",
  dancer: "🕺",
  yeehaw: "🤠",
  heart: "❤️",
  clap: "👏",
};
const LABEL_FALLBACK: Record<FeedReactionKind, string> = {
  high_five: "High five",
  dancer: "Dance!",
  yeehaw: "Yeehaw",
  heart: "Love it",
  clap: "Applause",
};
// Order the CURRENT reaction pack shows up in — legacy ``clap`` is
// intentionally omitted so the picker matches the fresh line-dance
// feel. Legacy chips still render if a historical row exists.
const KIND_ORDER: FeedReactionKind[] = [
  "high_five",
  "dancer",
  "yeehaw",
  "heart",
];
// Superset used by ``visibleKinds`` so a legacy ``clap`` chip still
// shows up if the event happens to have one.
const ALL_KNOWN_KINDS: FeedReactionKind[] = [
  "high_five",
  "dancer",
  "yeehaw",
  "heart",
  "clap",
];

// Module-level cache — the reaction catalog rarely changes so we fetch
// it once per app-run and share across all cards.
let cachedCatalog: FeedReactionMeta[] | null = null;

async function loadCatalog(token: string): Promise<FeedReactionMeta[]> {
  if (cachedCatalog) return cachedCatalog;
  try {
    const r = await api.getReactionKinds(token);
    cachedCatalog = r.kinds || [];
  } catch {
    cachedCatalog = KIND_ORDER.map((k) => ({
      kind: k,
      emoji: EMOJI_FALLBACK[k],
      label: LABEL_FALLBACK[k],
    }));
  }
  return cachedCatalog!;
}

export function FeedReactionsBar({
  eventId,
  reactions,
  testID,
}: {
  eventId: string;
  reactions?: FeedReactions;
  testID?: string;
}) {
  const { token } = useAuth();
  const playTap = useTapSound();
  const [state, setState] = useState<FeedReactions>({
    counts: reactions?.counts || {},
    mine: reactions?.mine || [],
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reactorsSheet, setReactorsSheet] = useState<{
    kind?: FeedReactionKind;
    emoji?: string;
    label?: string;
  } | null>(null);
  const [catalog, setCatalog] = useState<FeedReactionMeta[]>(
    () =>
      KIND_ORDER.map((k) => ({
        kind: k,
        emoji: EMOJI_FALLBACK[k],
        label: LABEL_FALLBACK[k],
      }))
  );

  // Keep local state in sync when parent hands us new reactions (e.g.
  // after a feed refresh).
  useEffect(() => {
    setState({
      counts: reactions?.counts || {},
      mine: reactions?.mine || [],
    });
  }, [reactions]);

  // Load the full catalog lazily the first time the picker opens.
  useEffect(() => {
    if (!pickerOpen || !token) return;
    let cancelled = false;
    loadCatalog(token).then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, token]);

  const toggle = useCallback(
    async (kind: FeedReactionKind) => {
      if (!token) return;
      const mine = state.mine.includes(kind);
      // Optimistic
      const nextMine = mine
        ? state.mine.filter((k) => k !== kind)
        : [...state.mine, kind];
      const currentCount = state.counts[kind] || 0;
      const nextCount = mine
        ? Math.max(0, currentCount - 1)
        : currentCount + 1;
      const nextCounts = { ...state.counts, [kind]: nextCount };
      setState({ counts: nextCounts, mine: nextMine });
      setPickerOpen(false);
      // Play the click sound + haptic ping right after the optimistic
      // flip so it feels instant, even on slow networks.
      playTap();
      try {
        const res = mine
          ? await api.removeFeedReaction(token, eventId, kind)
          : await api.addFeedReaction(token, eventId, kind);
        setState({
          counts: res.reactions.counts || {},
          mine: res.reactions.mine || [],
        });
      } catch {
        // Roll back on failure.
        setState({ counts: state.counts, mine: state.mine });
      }
    },
    [state, token, eventId, playTap]
  );

  // Which reaction chips to actually render inline (count > 0 OR user
  // added them). ``ALL_KNOWN_KINDS`` includes the legacy ``clap`` so
  // any historical row still surfaces as a chip.
  const visibleKinds = ALL_KNOWN_KINDS.filter(
    (k) => (state.counts[k] || 0) > 0 || state.mine.includes(k)
  );

  const openReactors = useCallback((k?: FeedReactionKind) => {
    const meta = catalog.find((m) => m.kind === k);
    setReactorsSheet({
      kind: k,
      emoji: meta?.emoji || (k ? EMOJI_FALLBACK[k] : undefined),
      label: meta?.label || (k ? LABEL_FALLBACK[k] : "Reactions"),
    });
  }, [catalog]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.wrap}>
        {visibleKinds.map((k) => {
          const mine = state.mine.includes(k);
          const meta = catalog.find((m) => m.kind === k);
          const emoji = meta?.emoji || EMOJI_FALLBACK[k];
          const count = state.counts[k] || 0;
          return (
            <Pressable
              key={k}
              onPress={() => toggle(k)}
              onLongPress={() => openReactors(k)}
              delayLongPress={350}
              style={[styles.chip, mine && styles.chipMine]}
              testID={`reaction-chip-${eventId}-${k}`}
              hitSlop={4}
            >
              <Text style={styles.chipEmoji}>{emoji}</Text>
              <Text style={[styles.chipCount, mine && styles.chipCountMine]}>
                {count}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          onLongPress={() => openReactors(undefined)}
          delayLongPress={350}
          style={styles.addBtn}
          hitSlop={6}
          testID={`reaction-add-${eventId}`}
        >
          <Ionicons
            name={pickerOpen ? "close" : "add"}
            size={16}
            color={colors.brandPrimary}
          />
        </Pressable>
      </View>
      {pickerOpen ? (
        <ReactionPicker
          catalog={catalog.filter((c) => KIND_ORDER.includes(c.kind))}
          mine={state.mine}
          onPick={toggle}
          onClose={() => setPickerOpen(false)}
          eventId={eventId}
        />
      ) : null}

      <ReactorsSheet
        visible={!!reactorsSheet}
        onClose={() => setReactorsSheet(null)}
        eventId={eventId}
        kind={reactorsSheet?.kind}
        headerEmoji={reactorsSheet?.emoji}
        headerLabel={reactorsSheet?.label}
      />
    </View>
  );
}

// -------------------- Picker --------------------
function ReactionPicker({
  catalog,
  mine,
  onPick,
  onClose,
  eventId,
}: {
  catalog: FeedReactionMeta[];
  mine: FeedReactionKind[];
  onPick: (k: FeedReactionKind) => void;
  onClose: () => void;
  eventId: string;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 90,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={[
        styles.picker,
        {
          transform: [{ scale }],
          opacity,
        },
      ]}
      testID={`reaction-picker-${eventId}`}
    >
      {catalog.map((c) => {
        const isMine = mine.includes(c.kind);
        return (
          <Pressable
            key={c.kind}
            onPress={() => {
              onPick(c.kind);
              onClose();
            }}
            style={[styles.pickerItem, isMine && styles.pickerItemMine]}
            hitSlop={4}
            testID={`reaction-pick-${eventId}-${c.kind}`}
          >
            <Text style={styles.pickerEmoji}>{c.emoji}</Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    gap: 6,
  },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  chipMine: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary + "18",
  },
  chipEmoji: { fontSize: 13 },
  chipCount: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.onSurface,
    minWidth: 8,
  },
  chipCountMine: { color: colors.brandPrimary },
  addBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "88",
    borderStyle: "dashed",
    backgroundColor: colors.surface,
  },
  // Inline picker — a wrap-friendly row rendered directly below the
  // reactions chips inside the card body. This is deliberately inline
  // (not absolute-positioned) so it can never run off the screen edge
  // regardless of where the "+" button sits within the row.
  picker: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    // Subtle drop shadow — noticeable enough to lift the picker off the
    // card without stealing focus from the timeline.
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  pickerItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  pickerItemMine: {
    backgroundColor: colors.brandPrimary + "22",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  pickerEmoji: { fontSize: 20 },
});

export default FeedReactionsBar;
