/**
 * CopperKnobResultCard
 * --------------------
 * Renders a single CopperKnob stepsheet result. Same card used in
 * search results, popular list, and single-ref lookups.
 *
 * Behaviour:
 *   • Every card has an unconditional **View on CopperKnob** button
 *     that opens the exact stepsheet URL (from the CopperKnob API).
 *   • If the API already flagged the record as ``existing_dance``
 *     (matched by our server-side duplicate check), we show a green
 *     "Already in Library" badge + a **View Dance** button routing to
 *     the local dance detail page — INSTEAD of the Add-to-Library CTA.
 *   • For admins, when the record is NOT yet in the library, we surface
 *     a "+ Add to Library" button that jumps to the import review
 *     screen. Regular users never see this.
 *   • Ownership language is scrupulously neutral. Choreographer name
 *     stays prominent and unchanged.
 */
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { CopperKnobResult } from "@/src/api/client";
import { colors, spacing, radius, difficultyColor } from "@/src/theme";
import { useAuth } from "@/src/context/auth-context";

export function CopperKnobResultCard({
  item,
  compact = false,
}: {
  item: CopperKnobResult;
  compact?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdminOrEditor = !!(user?.is_admin || user?.is_instructor);

  const openOnCopperKnob = () => {
    if (item.url) Linking.openURL(item.url);
  };

  const meta: string[] = [];
  if (item.count) meta.push(`${item.count} count`);
  if (item.wall) meta.push(`${item.wall} wall`);
  const metaLine = meta.join(" • ");

  return (
    <View style={[styles.card, compact && styles.cardCompact]} testID={`ck-result-${item.ref}`}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title || "Untitled"}
          </Text>
          <Text style={styles.chor} numberOfLines={1}>
            By {item.choreographer || "Unknown choreographer"}
          </Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {item.level ? (
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
          <Text style={styles.alreadyText}>Already in Library</Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {item.existing_dance ? (
          <Pressable
            testID={`ck-view-local-${item.ref}`}
            style={[styles.btn, styles.btnPrimary]}
            onPress={() =>
              router.push(`/dance/${item.existing_dance!.id}`)
            }
          >
            <Ionicons name="library" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>View Dance</Text>
          </Pressable>
        ) : isAdminOrEditor ? (
          <Pressable
            testID={`ck-add-${item.ref}`}
            style={[styles.btn, styles.btnPrimary]}
            onPress={() =>
              router.push({
                pathname: "/copperknob/import",
                params: { ref: item.ref },
              })
            }
          >
            <Ionicons name="add" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.btnPrimaryText}>Add to Library</Text>
          </Pressable>
        ) : null}

        <Pressable
          testID={`ck-view-ck-${item.ref}`}
          style={[styles.btn, styles.btnSecondary]}
          onPress={openOnCopperKnob}
        >
          <Ionicons name="open-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.btnSecondaryText}>View on CopperKnob</Text>
        </Pressable>
      </View>
    </View>
  );
}


export function CopperKnobAttributionFooter() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Dance information provided by{" "}
        <Text
          style={styles.footerLink}
          onPress={() => Linking.openURL("https://www.copperknob.co.uk")}
        >
          CopperKnob
        </Text>
      </Text>
      <Text style={styles.footerHint}>
        Full stepsheet instructions are hosted on CopperKnob — tap “View on
        CopperKnob” to read them there.
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
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
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
