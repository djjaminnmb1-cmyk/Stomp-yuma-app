/**
 * MentionAutocomplete
 * -------------------
 * Renders an in-place suggestion strip ABOVE the chat composer when the
 * user is actively typing an ``@name`` token. Debounced call to
 * ``/users/search`` — the top 5 matches are shown as compact chips;
 * tapping one splices the picked user's full name into the message so
 * the backend's mention parser can resolve it unambiguously.
 *
 * Design contract
 * ---------------
 * • The caller owns the text state. This component only READS it and
 *   asks the caller to replace it (via ``onPickMention``) when a chip
 *   is tapped. Keeps composers testable + avoids re-render loops.
 * • Renders nothing when there's no active @-token, so the composer
 *   height doesn't jump for casual typing.
 * • Trims to 5 results — for a small community this is plenty.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  text: string;
  onPickMention: (nextText: string) => void;
  token: string | null;
};

/** Extract the token currently being typed after the LAST unclosed
 *  ``@``. Returns the token substring + its offset so the caller
 *  can splice a full name back in the right place. */
function activeMentionToken(text: string): { token: string; at: number } | null {
  if (!text) return null;
  // Find the last @, ensure it's at start-of-string or after whitespace.
  const at = text.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(text[at - 1])) return null;
  const after = text.slice(at + 1);
  // Any whitespace after the @ closes the token.
  if (/\s/.test(after)) return null;
  // Reject bare "@" — start suggestion strip only after 1+ chars typed.
  return { token: after, at };
}

export function MentionAutocomplete({ text, onPickMention, token }: Props) {
  const active = useMemo(() => activeMentionToken(text), [text]);
  const query = active?.token ?? "";
  const [hits, setHits] = useState<
    { user_id: string; name: string; picture: string; is_instructor: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);

  // Debounced search — 200 ms is snappy for chip picks but avoids
  // hammering the endpoint on every keystroke.
  useEffect(() => {
    if (!active || !token || query.length === 0) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const res = await api.searchUsers(token, query, 5);
        if (cancelled) return;
        setHits(res.users || []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, active, token]);

  const pick = useCallback(
    (name: string) => {
      if (!active) return;
      const before = text.slice(0, active.at);
      const after = text.slice(active.at + 1 + active.token.length);
      // Wrap the mention in a way the backend's regex can still parse.
      // We swap the picked user's full name (spaces removed for
      // camel-safety) so exact-match resolution wins server-side.
      const clean = name.trim().replace(/\s+/g, "");
      onPickMention(`${before}@${clean}${after ? "" : " "}${after}`);
    },
    [active, text, onPickMention]
  );

  if (!active || query.length === 0) return null;

  return (
    <View style={styles.wrap} testID="mention-autocomplete">
      <View style={styles.header}>
        <Ionicons name="at" size={12} color={colors.brandPrimary} />
        <Text style={styles.headerText}>
          Mentioning
          <Text style={styles.headerTextEmph}> @{query}</Text>
          {loading ? " …" : ""}
        </Text>
      </View>
      {hits.length === 0 && !loading ? (
        <Text style={styles.emptyText}>
          No match yet — keep typing, or send as-is
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {loading && hits.length === 0 ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : null}
        {hits.map((h) => (
          <Pressable
            key={h.user_id}
            testID={`mention-pick-${h.user_id}`}
            onPress={() => pick(h.name)}
            style={styles.chip}
          >
            {h.picture ? (
              // Using a simple RN <Text> instead of expo-image so the
              // strip stays lightweight; falls back to a monogram.
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(h.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(h.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.chipText} numberOfLines={1}>
              {h.name}
              {h.is_instructor ? " · Instructor" : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerText: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  headerTextEmph: {
    color: colors.brandPrimary,
    fontWeight: "800",
    textTransform: "none",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
  },
  strip: {
    flexDirection: "row",
    gap: 6,
    paddingRight: spacing.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 180,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary + "26",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.brandPrimary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
    flexShrink: 1,
  },
});
