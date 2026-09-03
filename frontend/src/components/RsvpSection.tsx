/**
 * RsvpSection
 * -----------
 * Compact 3-way RSVP picker (Going / Maybe / Not this time) that
 * lives on the event detail screen. Also used as the deep-link
 * destination from the push notification's "I'm going" action —
 * the action calls the RSVP API in the background, but the user's
 * next visit to the event still lands them on this section with
 * their new status highlighted.
 *
 * Behaviour:
 *   • Loads /events/{id}/rsvp/me on mount
 *   • Optimistic toggle w/ rollback on error
 *   • Tapping the currently-active status a second time CLEARS the
 *     RSVP (matches iCal-style toggle)
 *   • Shows the count of confirmed "going" dancers underneath
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api, RsvpCounts } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { colors, radius, spacing } from "@/src/theme";

type RsvpStatus = "" | "going" | "maybe" | "declined";

const OPTIONS: { status: Exclude<RsvpStatus, "">; icon: string; label: string }[] = [
  { status: "going", icon: "checkmark-circle", label: "I'm going" },
  { status: "maybe", icon: "help-circle", label: "Maybe" },
  { status: "declined", icon: "close-circle", label: "Not this time" },
];

export function RsvpSection({ eventId }: { eventId: string }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<RsvpStatus>("");
  const [counts, setCounts] = useState<RsvpCounts>({
    going: 0,
    maybe: 0,
    declined: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMyRsvp(token, eventId);
        if (cancelled) return;
        setStatus((r.status as RsvpStatus) || "");
        setCounts(r.counts);
      } catch {
        // silent — user can retry via toggle
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, eventId]);

  const tap = useCallback(
    async (next: Exclude<RsvpStatus, "">) => {
      if (!token || busy) return;
      setBusy(true);
      const prev = status;
      const prevCounts = counts;
      // Optimistic — if tapping the CURRENT status again, we clear it.
      const willClear = prev === next;
      setStatus(willClear ? "" : next);
      // Optimistic counts recompute — reconciled from server response
      // so any race with another device stays correct.
      setCounts(bumpCounts(counts, prev, willClear ? "" : next));
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
      try {
        const res = willClear
          ? await api.clearRsvp(token, eventId)
          : await api.setRsvp(token, eventId, next);
        setStatus(("status" in res && (res as any).status) || "");
        setCounts(res.counts);
      } catch (e: any) {
        setStatus(prev);
        setCounts(prevCounts);
        Alert.alert(
          "Couldn't save your RSVP",
          e?.message || "Try again in a moment."
        );
      } finally {
        setBusy(false);
      }
    },
    [token, busy, status, counts, eventId]
  );

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="event-rsvp-section">
      <Text style={styles.title}>Are you going?</Text>
      <View style={styles.optionsRow}>
        {OPTIONS.map((opt) => {
          const active = status === opt.status;
          return (
            <Pressable
              key={opt.status}
              testID={`rsvp-${opt.status}`}
              onPress={() => tap(opt.status)}
              disabled={busy}
              style={[
                styles.option,
                active && styles.optionActive,
                busy && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={opt.icon as any}
                size={16}
                color={active ? colors.onBrandPrimary : colors.brandPrimary}
              />
              <Text
                style={[
                  styles.optionText,
                  active && styles.optionTextActive,
                ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {counts.going > 0 ? (
        <Text style={styles.countText}>
          {counts.going} {counts.going === 1 ? "dancer is" : "dancers are"}{" "}
          going
          {counts.maybe > 0 ? ` · ${counts.maybe} maybe` : ""}
        </Text>
      ) : counts.maybe > 0 ? (
        <Text style={styles.countText}>
          {counts.maybe} {counts.maybe === 1 ? "dancer says" : "dancers say"}{" "}
          maybe
        </Text>
      ) : (
        <Text style={styles.countTextMuted}>
          Be the first to RSVP — Erin can plan around your headcount.
        </Text>
      )}
    </View>
  );
}

/** Given previous counts + a status transition, produce the optimistic
 *  next counts. Guarded against negatives so a stale local count
 *  never sinks below 0. */
function bumpCounts(
  prev: RsvpCounts,
  from: RsvpStatus,
  to: RsvpStatus
): RsvpCounts {
  const next = { ...prev };
  if (from && from in next) {
    (next as any)[from] = Math.max(0, (next as any)[from] - 1);
  }
  if (to && to in next) {
    (next as any)[to] = ((next as any)[to] || 0) + 1;
  }
  return next;
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  optionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: "transparent",
    minWidth: 100,
    justifyContent: "center",
    flex: 1,
  },
  optionActive: {
    backgroundColor: colors.brandPrimary,
  },
  optionText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  optionTextActive: {
    color: colors.onBrandPrimary,
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
  },
  countTextMuted: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: "italic",
  },
});
