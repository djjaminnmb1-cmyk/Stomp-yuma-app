import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Linking as RNLinking,
  Platform,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, spacing, radius, difficultyColor, images } from "@/src/theme";
import { api, Dance, Tracking } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import PracticeModePanel from "@/src/components/PracticeModePanel";
import { CopperKnobLinkSheet } from "@/src/components/CopperKnobLinkSheet";
import { CopperKnobCompareSheet } from "@/src/components/CopperKnobCompareSheet";
import { BootStepperLinkSheet } from "@/src/components/BootStepperLinkSheet";
import { BootStepperCompareSheet } from "@/src/components/BootStepperCompareSheet";

export default function DanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const [dance, setDance] = useState<Dance | null>(null);
  const [track, setTrack] = useState<Tracking | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState<null | "completed" | "wishlist" | "notes">(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  // Admin-only CopperKnob sheets (linking + compare-and-refresh)
  const [ckLinkOpen, setCkLinkOpen] = useState(false);
  const [ckCompareOpen, setCkCompareOpen] = useState(false);
  // Admin-only BootStepper sheets — mirror the CopperKnob pair so
  // admins can attach OR refresh EITHER provider's reference without
  // affecting the other. A single dance may end up with both.
  const [bsLinkOpen, setBsLinkOpen] = useState(false);
  const [bsCompareOpen, setBsCompareOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [editImage, setEditImage] = useState<string>("");
  // Full metadata edit form (whitelist editors: Erin & Jamin)
  const [fName, setFName] = useState("");
  const [fChor, setFChor] = useState("");
  const [fSong, setFSong] = useState("");
  const [fArtist, setFArtist] = useState("");
  const [fDiff, setFDiff] = useState("Beginner");
  const [fBpm, setFBpm] = useState("");
  const [fCount, setFCount] = useState("");
  const [fYt, setFYt] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  // Long-press → Set direct step-sheet URL modal state.
  const [stepSheetHost, setStepSheetHost] = useState<
    "copperknob" | "bootstepper" | null
  >(null);
  const [stepSheetUrlDraft, setStepSheetUrlDraft] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  // Admins + step-sheet editors can pin direct URLs. Instructors who
  // aren't editors get the standard search-page flow.
  const canEdit = !!(user?.is_admin || user?.can_edit_step_sheets);

  const openStepSheetLinkEditor = (host: "copperknob" | "bootstepper") => {
    if (!dance) return;
    setStepSheetHost(host);
    setStepSheetUrlDraft(
      host === "copperknob"
        ? dance.copperknob_url || ""
        : dance.bootstepper_url || ""
    );
  };

  const closeStepSheetLinkEditor = () => {
    setStepSheetHost(null);
    setStepSheetUrlDraft("");
  };

  const saveStepSheetUrl = async () => {
    if (!dance || !token || !stepSheetHost) return;
    const url = stepSheetUrlDraft.trim();
    // Empty clears the pinned link — fall back to search.
    if (url && !isValidStepSheetUrl(url, stepSheetHost)) {
      Alert.alert(
        "That URL doesn't look right",
        stepSheetHost === "copperknob"
          ? "Paste a full URL that starts with https:// and points to copperknob.co.uk"
          : "Paste a full URL that starts with https:// and points to bootstepper.com"
      );
      return;
    }
    setSavingLink(true);
    try {
      const bpmNum = dance.bpm ?? null;
      const updated = await api.updateDance(
        dance.id,
        {
          name: dance.name,
          choreographer: dance.choreographer,
          song: dance.song,
          artist: dance.artist,
          difficulty: dance.difficulty,
          bpm: bpmNum,
          count: dance.count,
          youtube_url: dance.youtube_url,
          step_sheet: dance.step_sheet,
          step_sheet_image: dance.step_sheet_image,
          copperknob_url:
            stepSheetHost === "copperknob" ? url : dance.copperknob_url,
          bootstepper_url:
            stepSheetHost === "bootstepper" ? url : dance.bootstepper_url,
        },
        token
      );
      setDance(updated);
      closeStepSheetLinkEditor();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Try again in a moment.");
    } finally {
      setSavingLink(false);
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    const d = await api.getDance(id).catch(() => null);
    setDance(d);
    if (token) {
      const all = await api.myTracking(token).catch(() => []);
      const t = all.find((x) => x.dance_id === id) || null;
      setTrack(t);
      setNotes(t?.notes || "");
      setRating(t?.rating || 0);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (status: "completed" | "wishlist") => {
    if (!token || !id) return;
    // Toggle behavior: if the user taps the SAME status they're already in
    // we clear the tracking (Completed → not-completed, Wishlist → removed).
    // This gives them a way to undo a mis-tap without leaving the screen.
    if (track?.status === status) {
      setSaving(status);
      try {
        await api.removeTracking(id, token);
        setTrack(null);
        setRating(0);
        setNotes("");
      } finally {
        setSaving(null);
      }
      return;
    }
    // If the user is *transitioning into* the completed state we celebrate.
    // (Toggling completed → completed again is handled above; not celebrated.)
    const wasCompleted = track?.status === "completed";
    setSaving(status);
    try {
      const t = await api.saveTracking(id, { status, rating, notes }, token);
      setTrack(t);
      if (status === "completed" && !wasCompleted && dance) {
        // Compute the user's total completed count post-save so the
        // celebration page can show a milestone message.
        let total = 1;
        try {
          const all = await api.myTracking(token);
          total = all.filter((x) => x.status === "completed").length;
        } catch {
          /* Non-fatal — fall back to a generic celebration. */
        }
        // Newly-earned badges piggy-back on the tracking POST response so
        // we can render the cascade without a second API round-trip.
        const badgesJson = (t.newly_earned_badges || []).length
          ? JSON.stringify(t.newly_earned_badges)
          : undefined;
        router.push({
          pathname: "/celebrate",
          params: {
            danceName: dance.name,
            count: String(total),
            danceId: dance.id,
            ...(badgesJson ? { badges: badgesJson } : {}),
          },
        });
      }
    } finally {
      setSaving(null);
    }
  };

  const saveNotesRating = async (newRating?: number) => {
    if (!token || !id || !track) return;
    setSaving("notes");
    try {
      const r = newRating ?? rating;
      const t = await api.saveTracking(id, { status: track.status, rating: r, notes }, token);
      setTrack(t);
      setRating(r);
    } finally {
      setSaving(null);
    }
  };

  // Open external step-sheet / video URLs in an in-app browser so users
  // stay inside the app (Safari View Controller on iOS, Chrome Custom
  // Tabs on Android, new tab on web).
  const openInApp = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        // Match brand colour on Android; iOS uses system default styling.
        toolbarColor: colors.brandPrimary,
        controlsColor: "#ffffff",
        dismissButtonStyle: "close",
        showTitle: true,
        enableBarCollapsing: true,
      });
    } catch {
      // Very rare — fall back to system browser.
      RNLinking.openURL(url).catch(() => {});
    }
  };

  const openYT = () => {
    if (dance?.youtube_url) openInApp(dance.youtube_url);
  };

  /** Build the CopperKnob search URL. Includes the choreographer in the
   *  query when known — CopperKnob's search accepts free-text so
   *  "Cha Cha Slide Casper" is far more precise than "Cha Cha Slide". */
  const copperKnobSearchUrl = (name: string, chor: string): string => {
    const parts = [name.trim(), chor.trim()].filter(Boolean);
    const q = parts.join(" ");
    return (
      `https://www.copperknob.co.uk/search?Search=${encodeURIComponent(q)}` +
      `&SearchType=Any&Order=BestMatch&Lang=Any&Level=Any&Beat=-1&Wall=-1&recnum=0`
    );
  };

  /** BootStepper search URL. Same principle: name + choreographer. */
  const bootStepperSearchUrl = (name: string, chor: string): string => {
    const parts = [name.trim(), chor.trim()].filter(Boolean);
    const q = parts.join(" ");
    return `https://bootstepper.com/dances?search=${encodeURIComponent(q)}`;
  };

  /** Basic URL sanity check — must start with http(s):// and target the
   *  expected host so a paste of the wrong site doesn't slip through. */
  const isValidStepSheetUrl = (url: string, host: "copperknob" | "bootstepper") => {
    const s = (url || "").trim();
    if (!/^https?:\/\//i.test(s)) return false;
    try {
      const u = new URL(s);
      if (host === "copperknob") {
        return /(^|\.)copperknob\.co\.uk$/i.test(u.hostname);
      }
      return /(^|\.)bootstepper\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  };

  const openCopperKnob = () => {
    if (!dance) return;
    // Direct URL trumps search — set by an instructor/admin who
    // hand-picked the exact dance-by-choreographer.
    const direct = (dance.copperknob_url || "").trim();
    if (direct && isValidStepSheetUrl(direct, "copperknob")) {
      openInApp(direct);
      return;
    }
    openInApp(copperKnobSearchUrl(dance.name || "", dance.choreographer || ""));
  };

  const openBootStepper = () => {
    if (!dance) return;
    const direct = (dance.bootstepper_url || "").trim();
    if (direct && isValidStepSheetUrl(direct, "bootstepper")) {
      openInApp(direct);
      return;
    }
    openInApp(bootStepperSearchUrl(dance.name || "", dance.choreographer || ""));
  };

  const saveDance = async () => {
    if (!token || !dance) return;
    if (!fName.trim()) {
      Alert.alert("Missing name", "Enter a dance name.");
      return;
    }
    setSavingSheet(true);
    try {
      const bpmNum = fBpm.trim() ? parseInt(fBpm, 10) : null;
      const updated = await api.updateDance(
        dance.id,
        {
          name: fName.trim(),
          choreographer: fChor.trim(),
          song: fSong.trim(),
          artist: fArtist.trim(),
          difficulty: fDiff,
          bpm: Number.isFinite(bpmNum as number) ? (bpmNum as number) : null,
          count: fCount.trim(),
          youtube_url: fYt.trim(),
          step_sheet: "",
          step_sheet_image: editImage,
        },
        token
      );
      setDance(updated);
      setEditSheetOpen(false);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Try again.");
    } finally {
      setSavingSheet(false);
    }
  };

  const pickImage = async () => {
    setUploadingImg(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access to upload a step sheet image.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => RNLinking.openSettings() },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType || "image/jpeg";
      setEditImage(`data:${mime};base64,${b64}`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not pick image");
    } finally {
      setUploadingImg(false);
    }
  };

  const clearImage = () => setEditImage("");

  if (!dance) {
    return (
      <SafeAreaView style={styles.c}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const isCompleted = track?.status === "completed";
  const isWishlist = track?.status === "wishlist";

  return (
    <View style={styles.c}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.brandTertiary, colors.brandPrimary, colors.surfaceInverse]}
            style={StyleSheet.absoluteFillObject as any}
          />
          <SafeAreaView edges={["top"]} style={{ zIndex: 2 }}>
            <View style={styles.headerBar}>
              <Pressable onPress={() => router.back()} testID="detail-back" style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={24} color={colors.onSurfaceInverse} />
              </Pressable>
              {dance.youtube_url ? (
                <Pressable onPress={openYT} testID="open-youtube" style={styles.iconBtn}>
                  <Ionicons name="logo-youtube" size={22} color={colors.onSurfaceInverse} />
                </Pressable>
              ) : <View style={styles.iconBtn} />}
            </View>
          </SafeAreaView>
          <View style={styles.heroContent}>
            <View style={[styles.diffBig, { backgroundColor: difficultyColor(dance.difficulty) }]}>
              <Text style={styles.diffBigText}>{dance.difficulty}</Text>
            </View>
            <Text style={styles.title}>{dance.name}</Text>
            <Text style={styles.subtitle}>By {dance.choreographer || "Unknown"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <InfoBox icon="musical-notes" label="Song" value={dance.song || "—"} />
            <InfoBox icon="person" label="Artist" value={dance.artist || "—"} />
          </View>
          <View style={styles.infoRow}>
            <InfoBox icon="speedometer" label="BPM" value={dance.bpm ? String(dance.bpm) : "—"} />
            <InfoBox icon="grid" label="Count" value={dance.count || "—"} />
          </View>
        </View>

        {dance.youtube_url ? (
          <View style={styles.section}>
            <Pressable testID="watch-tutorial" onPress={openYT} style={styles.ytBtn}>
              <Ionicons name="logo-youtube" size={22} color="#fff" />
              <Text style={styles.ytBtnText}>Watch Tutorial on YouTube</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <Pressable
            testID="open-practice"
            onPress={() => setPracticeOpen(true)}
            style={styles.practiceBtn}
          >
            <View style={styles.practiceIconWrap}>
              <Ionicons name="musical-notes" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.practiceBtnTitle}>Practice Mode</Text>
              <Text style={styles.practiceBtnSub}>
                {dance.bpm
                  ? `Wood-block metronome  ·  ${dance.bpm} BPM`
                  : "Wood-block metronome  ·  Set your own tempo"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.sectionTitle}>Step Sheet</Text>
            {user?.can_edit_step_sheets ? (
              <Pressable
                testID="edit-step-sheet"
                onPress={() => {
                  setFName(dance.name || "");
                  setFChor(dance.choreographer || "");
                  setFSong(dance.song || "");
                  setFArtist(dance.artist || "");
                  setFDiff(dance.difficulty || "Beginner");
                  setFBpm(dance.bpm ? String(dance.bpm) : "");
                  setFCount(dance.count || "");
                  setFYt(dance.youtube_url || "");
                  setEditImage(dance.step_sheet_image || "");
                  setEditSheetOpen(true);
                }}
                style={styles.editBtn}
              >
                <Ionicons name="create-outline" size={14} color={colors.brandPrimary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.stepIntro}>
            View the choreographer&apos;s official step sheet on:
          </Text>

          <View style={styles.linkRow}>
            <Pressable
              testID="open-copperknob"
              onPress={openCopperKnob}
              onLongPress={
                canEdit ? () => openStepSheetLinkEditor("copperknob") : undefined
              }
              delayLongPress={400}
              style={[styles.linkBtn, styles.copperknobBtn]}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkBtnText}>
                  CopperKnob
                  {dance.copperknob_url &&
                  isValidStepSheetUrl(dance.copperknob_url, "copperknob")
                    ? " ✓"
                    : ""}
                </Text>
                <Text style={styles.linkBtnSub}>
                  {dance.copperknob_url &&
                  isValidStepSheetUrl(dance.copperknob_url, "copperknob")
                    ? "Direct link · long-press to edit"
                    : canEdit
                      ? "Search · long-press to pin direct link"
                      : "copperknob.co.uk"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>

            <Pressable
              testID="open-bootstepper"
              onPress={openBootStepper}
              onLongPress={
                canEdit ? () => openStepSheetLinkEditor("bootstepper") : undefined
              }
              delayLongPress={400}
              style={[styles.linkBtn, styles.bootstepperBtn]}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkBtnText}>
                  BootStepper
                  {dance.bootstepper_url &&
                  isValidStepSheetUrl(dance.bootstepper_url, "bootstepper")
                    ? " ✓"
                    : ""}
                </Text>
                <Text style={styles.linkBtnSub}>
                  {dance.bootstepper_url &&
                  isValidStepSheetUrl(dance.bootstepper_url, "bootstepper")
                    ? "Direct link · long-press to edit"
                    : canEdit
                      ? "Search · long-press to pin direct link"
                      : "bootstepper.com"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          </View>

          {/* Instructor-only: small hint explaining the long-press flow.
              Only rendered the first time a user is looking at a dance
              whose direct links haven't been pinned yet. */}
          {canEdit &&
          !dance.copperknob_url &&
          !dance.bootstepper_url ? (
            <Text style={styles.editHint}>
              Long-press a button to paste the exact CopperKnob or
              BootStepper URL — pinned links open the correct dance
              by the correct choreographer every time.
            </Text>
          ) : null}

          {/* Admin-only external directory tools (CopperKnob +
              BootStepper). Rendered as a secondary "advanced" row
              below the primary link buttons so it never distracts
              regular users. Each provider gets its own button; the
              two integrations coexist so a single dance may show
              BOTH "Check CopperKnob data" AND "Check BootStepper
              data" side by side. */}
          {canEdit ? (
            <View style={styles.ckAdminRow}>
              {dance.copperknob_ref ? (
                <Pressable
                  testID="ck-compare"
                  onPress={() => setCkCompareOpen(true)}
                  style={styles.ckAdminBtn}
                >
                  <Ionicons
                    name="git-compare-outline"
                    size={14}
                    color={colors.brandPrimary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ckAdminBtnText}>
                      Check CopperKnob data
                    </Text>
                    <Text style={styles.ckAdminBtnHint}>
                      Ref {dance.copperknob_ref} · compare fields
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  testID="ck-link"
                  onPress={() => setCkLinkOpen(true)}
                  style={styles.ckAdminBtn}
                >
                  <Ionicons
                    name="link-outline"
                    size={14}
                    color={colors.brandPrimary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ckAdminBtnText}>
                      Link CopperKnob record
                    </Text>
                    <Text style={styles.ckAdminBtnHint}>
                      Find + attach the CopperKnob reference
                    </Text>
                  </View>
                </Pressable>
              )}

              {dance.bootstepper_ref ? (
                <Pressable
                  testID="bs-compare"
                  onPress={() => setBsCompareOpen(true)}
                  style={styles.ckAdminBtn}
                >
                  <Ionicons
                    name="git-compare-outline"
                    size={14}
                    color={colors.brandPrimary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ckAdminBtnText}>
                      Check BootStepper data
                    </Text>
                    <Text style={styles.ckAdminBtnHint}>
                      Id {dance.bootstepper_ref} · compare fields
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  testID="bs-link"
                  onPress={() => setBsLinkOpen(true)}
                  style={styles.ckAdminBtn}
                >
                  <Ionicons
                    name="link-outline"
                    size={14}
                    color={colors.brandPrimary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ckAdminBtnText}>
                      Link BootStepper record
                    </Text>
                    <Text style={styles.ckAdminBtnHint}>
                      Find + attach the BootStepper reference
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Third-party attribution notice. Required legal boilerplate
              stating we don't host or endorse third-party step-sheet
              content — we only link out. Both site names are tappable
              deep-links into the respective home pages so users can
              investigate the source directly. */}
          <View style={styles.disclaimer} testID="stepsheet-disclaimer">
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={colors.muted}
              style={{ marginTop: 1 }}
            />
            <Text style={styles.disclaimerText}>
              Step sheets are provided through links to independent third-party
              websites. Stompin&apos; Ground Yuma is not affiliated with or
              endorsed by{" "}
              <Text
                style={styles.disclaimerLink}
                onPress={() =>
                  RNLinking.openURL("https://www.copperknob.co.uk/").catch(() => {})
                }
              >
                CopperKnob
              </Text>{" "}
              or{" "}
              <Text
                style={styles.disclaimerLink}
                onPress={() =>
                  RNLinking.openURL("https://www.bootstepper.com/").catch(() => {})
                }
              >
                BootStepper
              </Text>
              . All content remains on and is governed by the respective
              third-party website.
            </Text>
          </View>

          {/* Instructor-uploaded scan (only shown if a whitelisted editor
              attached one — otherwise we don't display the section at all
              since the primary source is the external links above). */}
          {dance.step_sheet_image ? (
            <View style={styles.stepSheet}>
              <Text style={styles.stepUploadedLabel}>Uploaded by your instructor</Text>
              <Image
                source={{ uri: dance.step_sheet_image }}
                style={styles.stepImage}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {dance.choreographer_country ? (
            <Text style={styles.stepMeta}>
              Choreographed in {dance.choreographer_country}
            </Text>
          ) : null}
        </View>

        {track ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Rating & Notes</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable
                  key={s}
                  testID={`star-${s}`}
                  onPress={() => saveNotesRating(s)}
                >
                  <Ionicons
                    name={s <= rating ? "star" : "star-outline"}
                    size={32}
                    color={colors.warning}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="notes-input"
              placeholder="Add your notes... (e.g., 'Watch out for the pivot on 24')"
              placeholderTextColor={colors.muted}
              value={notes}
              onChangeText={setNotes}
              onBlur={() => saveNotesRating()}
              multiline
              style={styles.notes}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.hint}>
              <Ionicons name="information-circle" size={18} color={colors.brandSecondary} />
              <Text style={styles.hintText}>
                Add to your tracker to save personal notes and a star rating.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.stickyWrap}>
        <View style={styles.sticky}>
          <Pressable
            testID="wishlist-btn"
            onPress={() => setStatus("wishlist")}
            style={[styles.secBtn, isWishlist && styles.secBtnActive]}
            disabled={saving !== null}
            accessibilityRole="button"
            accessibilityLabel={
              isWishlist ? "Remove from wishlist" : "Add to wishlist"
            }
            accessibilityHint={
              isWishlist ? "Tap again to remove from your wishlist." : ""
            }
          >
            {saving === "wishlist" ? (
              <ActivityIndicator color={isWishlist ? "#fff" : colors.brandPrimary} />
            ) : (
              <>
                <Ionicons
                  name={isWishlist ? "bookmark" : "bookmark-outline"}
                  size={18}
                  color={isWishlist ? colors.onBrandPrimary : colors.brandPrimary}
                />
                <Text style={[styles.secBtnText, isWishlist && { color: colors.onBrandPrimary }]}>
                  {isWishlist ? "In Wishlist" : "Wishlist"}
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            testID="complete-btn"
            onPress={() => setStatus("completed")}
            style={[styles.primBtn, isCompleted && { backgroundColor: colors.success }]}
            disabled={saving !== null}
            accessibilityRole="button"
            accessibilityLabel={
              isCompleted ? "Mark as not completed" : "Mark as completed"
            }
            accessibilityHint={
              isCompleted ? "Tap again to undo your completion." : ""
            }
          >
            {saving === "completed" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={isCompleted ? "checkmark-done-circle" : "checkmark-circle-outline"}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.primBtnText}>
                  {isCompleted ? "Completed · Tap to undo" : "Mark Completed"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Admin-only CopperKnob sheets — mounted at the root of the
          screen so they overlay everything and the FlatList/scroll
          view above stays in place while they animate. */}
      <CopperKnobLinkSheet
        visible={ckLinkOpen}
        danceId={dance.id}
        danceName={dance.name}
        danceChoreographer={dance.choreographer}
        onClose={() => setCkLinkOpen(false)}
        onLinked={() => load()}
      />
      <CopperKnobCompareSheet
        visible={ckCompareOpen}
        dance={dance}
        onClose={() => setCkCompareOpen(false)}
        onApplied={() => load()}
      />

      {/* Admin-only BootStepper sheets — same pattern as CopperKnob.
          Rendered here (root level of the screen) so they overlay
          everything. A single dance may end up with BOTH refs, so
          both provider sheets are mounted in parallel. */}
      <BootStepperLinkSheet
        visible={bsLinkOpen}
        danceId={dance.id}
        danceName={dance.name}
        danceChoreographer={dance.choreographer}
        onClose={() => setBsLinkOpen(false)}
        onLinked={() => load()}
      />
      <BootStepperCompareSheet
        visible={bsCompareOpen}
        dance={dance}
        onClose={() => setBsCompareOpen(false)}
        onApplied={() => load()}
      />

      <Modal
        visible={editSheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditSheetOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Dance</Text>
            <Pressable onPress={() => setEditSheetOpen(false)} testID="close-edit-sheet">
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalSub}>
              Fix the dance metadata below. Only Erin &amp; Jamin can edit these
              fields. All changes are saved together.
            </Text>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>Dance name *</Text>
              <TextInput
                testID="edit-name"
                value={fName}
                onChangeText={setFName}
                placeholder="e.g. Summer Sway"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>Choreographer</Text>
              <TextInput
                testID="edit-chor"
                value={fChor}
                onChangeText={setFChor}
                placeholder="e.g. Rachael McEnaney-White"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>Song</Text>
              <TextInput
                testID="edit-song"
                value={fSong}
                onChangeText={setFSong}
                placeholder="Leave blank if genre-based"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>Artist</Text>
              <TextInput
                testID="edit-artist"
                value={fArtist}
                onChangeText={setFArtist}
                placeholder="e.g. Brothers Osborne"
                placeholderTextColor={colors.muted}
                style={styles.textInput}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>Difficulty</Text>
              <View style={styles.diffPickerRow}>
                {["Absolute Beginner", "Beginner", "Improver", "High Improver", "Intermediate", "Advanced"].map((lvl) => {
                  const on = fDiff === lvl;
                  return (
                    <Pressable
                      key={lvl}
                      testID={`edit-diff-${lvl.toLowerCase()}`}
                      onPress={() => setFDiff(lvl)}
                      style={[styles.diffPickerChip, on && styles.diffPickerChipOn]}
                    >
                      <Text
                        style={[
                          styles.diffPickerText,
                          on && { color: colors.onBrandPrimary },
                        ]}
                      >
                        {lvl}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.miniLabel}>BPM</Text>
                <TextInput
                  testID="edit-bpm"
                  value={fBpm}
                  onChangeText={setFBpm}
                  keyboardType="number-pad"
                  placeholder="e.g. 96"
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />
              </View>
              <View style={{ flex: 2, gap: 4 }}>
                <Text style={styles.miniLabel}>Count / walls</Text>
                <TextInput
                  testID="edit-count"
                  value={fCount}
                  onChangeText={setFCount}
                  placeholder="e.g. 32 count, 4 wall"
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.miniLabel}>YouTube URL</Text>
              <TextInput
                testID="edit-yt"
                value={fYt}
                onChangeText={setFYt}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://www.youtube.com/results?..."
                placeholderTextColor={colors.muted}
                style={styles.textInput}
              />
            </View>

            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={styles.miniLabel}>Step-sheet image (optional)</Text>
              {editImage ? (
                <View>
                  <Image
                    source={{ uri: editImage }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                  <Pressable
                    testID="clear-step-image"
                    onPress={clearImage}
                    style={styles.clearImgBtn}
                  >
                    <Ionicons name="trash" size={14} color="#fff" />
                    <Text style={styles.clearImgText}>Remove image</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  testID="upload-step-image"
                  onPress={pickImage}
                  disabled={uploadingImg}
                  style={styles.uploadBtn}
                >
                  {uploadingImg ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={22} color={colors.brandPrimary} />
                      <Text style={styles.uploadBtnText}>Upload scan (PNG/JPG)</Text>
                    </>
                  )}
                </Pressable>
              )}
              <Text style={styles.hintText}>
                Only upload material you own or have permission to share. For
                published step sheets, prefer the CopperKnob / BootStepper links
                on the dance page.
              </Text>
            </View>

            <Pressable
              testID="save-step-sheet"
              onPress={saveDance}
              disabled={savingSheet}
              style={[styles.saveBtn, savingSheet && { opacity: 0.6 }]}
            >
              {savingSheet ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <PracticeModePanel
        visible={practiceOpen}
        onClose={() => setPracticeOpen(false)}
        danceName={dance.name}
        danceBpm={dance.bpm ?? null}
        song={dance.song}
        artist={dance.artist}
        danceId={dance.id}
      />

      {/* Set direct step-sheet URL (long-press instructor UX). Live
          preview shows what the button will jump to — makes it obvious
          when the URL is the correct dance-by-correct-choreographer. */}
      <Modal
        visible={stepSheetHost !== null}
        transparent
        animationType="slide"
        onRequestClose={closeStepSheetLinkEditor}
      >
        <View style={styles.stepsheetBackdrop}>
          <Pressable
            style={{ flex: 1 }}
            onPress={closeStepSheetLinkEditor}
          />
          <View style={styles.stepsheetSheet} testID="stepsheet-link-editor">
            <View style={styles.stepsheetGrabber} />
            <View style={styles.stepsheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepsheetTitle}>
                  {stepSheetHost === "copperknob"
                    ? "Pin CopperKnob link"
                    : "Pin BootStepper link"}
                </Text>
                <Text style={styles.stepsheetSub}>
                  Paste the exact URL for <Text style={styles.stepsheetBold}>
                    {dance.name}
                  </Text>{" "}
                  by <Text style={styles.stepsheetBold}>{dance.choreographer || "?"}</Text>.
                  Everyone who taps this button will land on that exact page.
                </Text>
              </View>
              <Pressable
                onPress={closeStepSheetLinkEditor}
                style={styles.stepsheetCloseBtn}
                hitSlop={8}
                testID="stepsheet-link-editor-close"
              >
                <Ionicons name="close" size={20} color={colors.onSurface} />
              </Pressable>
            </View>

            <View style={{ padding: spacing.md, gap: spacing.sm }}>
              <TextInput
                testID="stepsheet-url-input"
                value={stepSheetUrlDraft}
                onChangeText={setStepSheetUrlDraft}
                placeholder={
                  stepSheetHost === "copperknob"
                    ? "https://www.copperknob.co.uk/stepsheets/..."
                    : "https://bootstepper.com/dances/..."
                }
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.stepsheetInput}
              />
              {stepSheetUrlDraft.trim() &&
              !isValidStepSheetUrl(
                stepSheetUrlDraft.trim(),
                stepSheetHost as "copperknob" | "bootstepper"
              ) ? (
                <Text style={styles.stepsheetWarn}>
                  URL must be on{" "}
                  {stepSheetHost === "copperknob"
                    ? "copperknob.co.uk"
                    : "bootstepper.com"}
                  .
                </Text>
              ) : null}

              <Pressable
                onPress={() => {
                  const s = stepSheetUrlDraft.trim();
                  if (
                    stepSheetHost &&
                    s &&
                    isValidStepSheetUrl(
                      s,
                      stepSheetHost as "copperknob" | "bootstepper"
                    )
                  ) {
                    openInApp(s);
                  } else if (stepSheetHost && dance) {
                    openInApp(
                      stepSheetHost === "copperknob"
                        ? copperKnobSearchUrl(dance.name || "", dance.choreographer || "")
                        : bootStepperSearchUrl(dance.name || "", dance.choreographer || "")
                    );
                  }
                }}
                style={styles.stepsheetPreview}
                testID="stepsheet-preview-btn"
              >
                <Ionicons name="open-outline" size={14} color={colors.brandPrimary} />
                <Text style={styles.stepsheetPreviewText}>
                  {stepSheetUrlDraft.trim()
                    ? "Preview this URL"
                    : "Preview the search fallback"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.stepsheetFooter}>
              {(stepSheetHost === "copperknob"
                ? dance.copperknob_url
                : dance.bootstepper_url) ? (
                <Pressable
                  onPress={() => setStepSheetUrlDraft("")}
                  style={styles.stepsheetSecondary}
                  testID="stepsheet-clear"
                  disabled={savingLink}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.warning} />
                  <Text style={[styles.stepsheetSecondaryText, { color: colors.warning }]}>
                    Clear
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={closeStepSheetLinkEditor}
                style={styles.stepsheetSecondary}
                testID="stepsheet-cancel"
                disabled={savingLink}
              >
                <Text style={styles.stepsheetSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveStepSheetUrl}
                style={[
                  styles.stepsheetSave,
                  savingLink && { opacity: 0.6 },
                ]}
                disabled={savingLink}
                testID="stepsheet-save"
              >
                {savingLink ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.onBrandPrimary}
                    />
                    <Text style={styles.stepsheetSaveText}>
                      {stepSheetUrlDraft.trim()
                        ? "Pin link"
                        : "Save (use search)"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoBox({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Ionicons name={icon} size={16} color={colors.brandPrimary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { minHeight: 280, paddingBottom: spacing.xl },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(43,29,22,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { padding: spacing.xl, gap: spacing.sm },
  diffBig: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  diffBigText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  title: {
    fontFamily: "serif",
    fontSize: 34,
    fontWeight: "700",
    color: colors.onSurfaceInverse,
    lineHeight: 40,
  },
  subtitle: { color: colors.onSurfaceInverse, opacity: 0.9, fontSize: 14 },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: { fontFamily: "serif", fontSize: 20, fontWeight: "700", color: colors.onSurface },
  infoRow: { flexDirection: "row", gap: spacing.md },
  infoBox: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  infoLabel: { fontSize: 11, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  infoValue: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  ytBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#c4302b",
    padding: 14,
    borderRadius: radius.md,
  },
  ytBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  practiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
  },
  practiceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  practiceBtnTitle: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 15,
    fontFamily: "serif",
  },
  practiceBtnSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  stars: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", padding: spacing.md },
  notes: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 90,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 14,
    textAlignVertical: "top",
  },
  hint: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13 },
  stickyWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  sticky: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  secBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  secBtnActive: { backgroundColor: colors.brandPrimary },
  secBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  primBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  primBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderRadius: radius.pill,
  },
  editBtnText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  stepSheet: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: 8,
  },
  stepText: {
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  stepEmpty: { color: colors.muted, fontStyle: "italic", fontSize: 13 },
  stepMeta: { color: colors.muted, fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  stepIntro: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: -4 },
  stepUploadedLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  linkRow: { gap: 10 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  copperknobBtn: { backgroundColor: "#B87333" },
  bootstepperBtn: { backgroundColor: "#1F2A44" },
  linkBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  linkBtnSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 },
  editHint: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 15,
    color: colors.brandSecondary,
    fontStyle: "italic",
  },
  // ---- CopperKnob admin row (Link / Check data) ----
  ckAdminRow: {
    marginTop: 10,
    gap: 6,
  },
  ckAdminBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
    backgroundColor: colors.brandPrimary + "0F",
  },
  ckAdminBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandPrimary,
  },
  ckAdminBtnHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  // ---- Set step-sheet URL modal ----
  stepsheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  stepsheetSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xl,
  },
  stepsheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 4,
  },
  stepsheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  stepsheetTitle: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  stepsheetSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  stepsheetBold: { color: colors.onSurface, fontWeight: "800" },
  stepsheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  stepsheetInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  stepsheetWarn: {
    color: colors.warning,
    fontSize: 11,
    marginLeft: 4,
  },
  stepsheetPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary + "18",
    borderWidth: 1,
    borderColor: colors.brandPrimary + "55",
  },
  stepsheetPreviewText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  stepsheetFooter: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  stepsheetSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  stepsheetSecondaryText: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 13,
  },
  stepsheetSave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  stepsheetSaveText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 13,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.brandTertiary,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onSurfaceSecondary,
    fontStyle: "italic",
  },
  disclaimerLink: {
    color: colors.brandPrimary,
    fontWeight: "700",
    textDecorationLine: "underline",
    fontStyle: "normal",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
  },
  modalSub: { color: colors.muted, fontSize: 13 },
  editArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 260,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  saveBtn: {
    backgroundColor: colors.brandPrimary,
    padding: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  stepImage: {
    width: "100%",
    height: 400,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  previewImage: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceSecondary,
  },
  uploadBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  clearImgBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  clearImgText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  miniLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurface,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 14,
  },
  diffPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  diffPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  diffPickerChipOn: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  diffPickerText: { fontSize: 12, fontWeight: "600", color: colors.onSurface },
  hintText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
