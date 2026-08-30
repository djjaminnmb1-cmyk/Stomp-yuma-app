/**
 * BootStepperResultCard
 * ---------------------
 * Renders a single BootStepper dance result. Same card used in
 * search results, popular list, and single-id lookups. Mirrors
 * CopperKnobResultCard so the two providers look consistent.
 *
 * Behaviour:
 *   • Every card has an unconditional **View on BootStepper** button
 *     that opens the exact dance URL (from the BootStepper API).
 *   • If the API flagged the record as ``existing_dance`` (matched
 *     by our server-side duplicate check), we show a green "Already
 *     in Library" badge + a **View Dance** button routing to the
 *     local dance detail page — INSTEAD of the Add-to-Library CTA.
 *   • For admins, when the record is NOT yet in the library, we
 *     surface a "+ Add to Library" button that jumps to the import
 *     review screen.  Regular users never see this.
 *   • Ownership language is scrupulously neutral — SGY curates a
 *     directory; the choreography stays with the choreographer /
 *     BootStepper.
 */
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BootStepperResult } from "@/src/api/client";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";

export function BootStepperResultCard({
  item,
  compact = false,
}: {
  item: BootStepperResult;
  compact?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdminOrEditor = !!(user?.is_admin || user?.is_instructor);

  const openOnBootStepper = () => {
    if (item.url) Linking.openURL(item.url);
  };

  const meta: string[] = [];
  if (item.count && item.count !== "0") meta.push(`${item.count} count`);
  if (item.wall && item.wall !== "0") meta.push(`${item.wall} wall`);
  if (item.video_count && item.video_count > 0)
    meta.push(`${item.video_count} video${item.video_count === 1 ? "" : "s"}`);
  const metaLine = meta.join(" • ");

  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      testID={`bs-result-${item.id}`}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title || "Untitled"}
          </Text>
          <Text style={styles.chor} numberOfLines={1}>
            By {item.choreographer || "Unknown choreographer"}
            {item.choreographer_country ? ` · ${item.choreographer_country}` : ""}
          </Text>
        </View>
        {/* Subtle source-of-truth tag — mirrors CopperKnob's brown pill
            and our "Dance Library" pill so users scanning mixed
            surfaces can tell each card's origin at a glance. */}
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceBadgeText}>BootStepper</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {item.level && item.level.toLowerCase() !== "unknown" ? (
          <View
            style={[
              styles.levelBadge,
              { backgroundColor: difficultyColor(item.level) },
            ]}
          >
            <Text style={styles.levelBadgeText}>{item.level}</Text>
          </View>
        ) : null}
        {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
      </View>

      {item.music ? (
        <Text style={styles.music} numberOfLines={1}>
          <Ionicons name="musical-notes" size={12} color={colors.muted} />{" "}
          {item.music}
        </Text>
      ) : null}

      {item.existing_dance ? (
        <View style={styles.alreadyPill}>
          <Ionicons name="checkmark-circle" size={16} color="#16803C" />
          <Text style={styles.alreadyText}>
            Already in Library
            {item.existing_dance.has_copperknob_ref
              ? " · also on CopperKnob"
              : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {item.existing_dance ? (
          <Pressable
            testID={`bs-view-local-${item.id}`}
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => router.push(`/dance/${item.existing_dance!.id}`)}
          >
            <Ionicons name="library" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>View Dance</Text>
          </Pressable>
        ) : isAdminOrEditor ? (
          <Pressable
            testID={`bs-add-${item.id}`}
            style={[styles.btn, styles.btnPrimary]}
            onPress={() =>
              router.push({
                pathname: "/bootstepper/import",
                params: { id: item.id },
              })
            }
          >
            <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>Add to Library</Text>
          </Pressable>
        ) : null}

        <Pressable
          testID={`bs-view-bs-${item.id}`}
          style={[styles.btn, styles.btnSecondary]}
          onPress={openOnBootStepper}
        >
          <Ionicons name="open-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.btnSecondaryText}>View on BootStepper</Text>
        </Pressable>
      </View>
    </View>
  );
}


export function BootStepperAttributionFooter() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Dance information provided by{" "}
        <Text
          style={styles.footerLink}
          onPress={() => Linking.openURL("https://bootstepper.com")}
        >
          BootStepper
        </Text>
      </Text>
      <Text style={styles.footerHint}>
        Full step-by-step instructions + tutorial videos are hosted on
        BootStepper — tap “View on BootStepper” to open them there.
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  cardCompact: { padding: spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  // BootStepper's brand blue-purple palette — visually distinct from
  // the CopperKnob copper/brown pill so a user scanning mixed
  // results knows which provider they're looking at.
  sourceBadge: {
    backgroundColor: "#4F46E5" + "22",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3730A3",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.onSurface,
    lineHeight: 20,
  },
  chor: { fontSize: 13, color: colors.muted, marginTop: 2 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  levelBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  meta: { fontSize: 12, color: colors.muted },
  music: { fontSize: 12, color: colors.muted, marginTop: 2 },
  alreadyPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D8F3E4",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  alreadyText: { color: "#0F5027", fontSize: 12, fontWeight: "700" },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: 36,
  },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: {
    color: colors.onBrandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  btnSecondaryText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  footer: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: "center",
    gap: 4,
  },
  footerText: { color: colors.muted, fontSize: 12 },
  footerLink: {
    color: colors.brandPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  footerHint: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
});
