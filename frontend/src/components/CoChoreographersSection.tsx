/**
 * Co-Choreographers section for the individual dance page.
 *
 * Contract with the "solo-choreographers only" library
 * ---------------------------------------------------
 * Only the MAIN choreographer of a dance ever gets a library
 * entry (see ``backend/services/choreographer_follows.py``). Any
 * collaborators are pushed onto the parallel ``co_choreographers``
 * list on the dance doc — those people don't have their own
 * discover-tab page, but tapping their chip here opens a small
 * bottom-sheet popup listing every LOCAL dance where they appear
 * (as main OR co-choreographer). That gives full discoverability
 * without polluting the library grouping.
 *
 * Rendered only when the dance's ``co_choreographers`` array has
 * at least one entry — otherwise the section is skipped entirely
 * so solo dances stay visually tight.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, spacing, difficultyColor } from "@/src/theme";
import { api, CoChoreographerDances } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useTranslation } from "@/src/i18n";

type Props = {
  /** Ordered list of collaborator names, as returned by the API
   *  (main choreographer is NEVER included here). */
  names: string[];
  /** The current dance id — the popup excludes it from the list of
   *  "other dances" so the user isn't shown the page they're on. */
  currentDanceId?: string;
};

export function CoChoreographersSection({ names, currentDanceId }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const router = useRouter();

  const [openName, setOpenName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [popupData, setPopupData] = useState<CoChoreographerDances | null>(null);

  const loadPopup = useCallback(
    async (name: string) => {
      if (!token) return;
      setLoading(true);
      setPopupData(null);
      try {
        const data = await api.listCoChoreographerDances(name, token, 50);
        setPopupData(data);
      } catch {
        setPopupData({ choreographer: name, dance_count: 0, dances: [] });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (openName) {
      void loadPopup(openName);
    } else {
      setPopupData(null);
    }
  }, [openName, loadPopup]);

  const closePopup = () => setOpenName(null);

  const openDance = (danceId: string) => {
    closePopup();
    // Slight delay so the modal's close animation doesn't fight the
    // push transition on iOS.
    setTimeout(() => router.push(`/dance/${danceId}`), 60);
  };

  if (!names || names.length === 0) return null;

  const dancesForPopup = (popupData?.dances || []).filter(
    (d) => d.id !== currentDanceId
  );

  return (
    <View style={styles.section} testID="co-choreographers-section">
      <View style={styles.headerRow}>
        <Ionicons
          name="people-outline"
          size={18}
          color={colors.brandPrimary}
        />
        <Text style={styles.sectionTitle}>
          {t("dance.co_choreographers.title")}
        </Text>
      </View>
      <Text style={styles.sectionHint}>
        {t("dance.co_choreographers.hint")}
      </Text>

      <View style={styles.chipsRow}>
        {names.map((name) => (
          <Pressable
            key={name}
            onPress={() => setOpenName(name)}
            style={styles.chip}
            testID={`co-chip-${name}`}
            accessibilityRole="button"
            accessibilityLabel={t(
              "dance.co_choreographers.popup_title",
              { name }
            )}
          >
            <Ionicons name="person" size={14} color={colors.brandPrimary} />
            <Text style={styles.chipText} numberOfLines={1}>
              {name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={openName !== null}
        transparent
        animationType="slide"
        onRequestClose={closePopup}
      >
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={closePopup} />
          <View style={styles.sheet} testID="co-choreographer-popup">
            <View style={styles.grabber} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {t("dance.co_choreographers.popup_title", {
                    name: openName || "",
                  })}
                </Text>
                <Text style={styles.sheetSub}>
                  {t("dance.co_choreographers.popup_subtitle")}
                </Text>
              </View>
              <Pressable
                onPress={closePopup}
                style={styles.closeBtn}
                hitSlop={8}
                testID="co-choreographer-popup-close"
                accessibilityLabel={t("dance.co_choreographers.popup_close")}
              >
                <Ionicons name="close" size={20} color={colors.onSurface} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brandPrimary} />
                <Text style={styles.loadingText}>
                  {t("dance.co_choreographers.loading")}
                </Text>
              </View>
            ) : dancesForPopup.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="musical-notes-outline"
                  size={28}
                  color={colors.muted}
                />
                <Text style={styles.emptyText}>
                  {t("dance.co_choreographers.popup_empty")}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
              >
                {dancesForPopup.map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => openDance(d.id)}
                    style={styles.row}
                    testID={`co-popup-dance-${d.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {d.song || "—"}
                        {d.artist ? `  ·  ${d.artist}` : ""}
                      </Text>
                      {d.choreographer &&
                      openName &&
                      d.choreographer.toLowerCase() !==
                        openName.toLowerCase() ? (
                        <Text style={styles.rowChor} numberOfLines={1}>
                          {d.choreographer}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.diffPill,
                        { backgroundColor: difficultyColor(d.difficulty) },
                      ]}
                    >
                      <Text style={styles.diffText}>
                        {(d.difficulty || "").slice(0, 3).toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.muted}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "700",
    color: colors.onSurface,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: -2,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "66",
    backgroundColor: colors.brandPrimary + "14",
    maxWidth: "100%",
  },
  chipText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 13,
    maxWidth: 220,
  },
  // ---- popup ----
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xl,
    maxHeight: "80%",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetTitle: {
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sheetSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 10,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 10,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
  },
  list: {
    maxHeight: 480,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowName: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
  },
  rowMeta: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  rowChor: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  diffText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
