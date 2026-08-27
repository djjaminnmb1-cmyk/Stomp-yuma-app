/**
 * Feedback screen — Profile → "Send Feedback"
 *
 * Purpose: give dancers a friendly place to tell us what's working,
 * what's broken, or what they wish the app did. Every submission is
 * auto-stamped with the client diagnostics (OTA update id, channel,
 * app version, platform) so an admin can trace back to the exact
 * bundle the dancer was on.
 */
import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { getClientDiagnostics } from "@/src/lib/diagnostics";
import { colors, radius, spacing } from "@/src/theme";

const CATEGORIES: {
  key: "bug" | "feature_request" | "content_error" | "instructor_help" | "other";
  emoji: string;
  label: string;
  hint: string;
}[] = [
  { key: "bug", emoji: "🐞", label: "Bug", hint: "Something broke or looks wrong" },
  { key: "feature_request", emoji: "💡", label: "Idea", hint: "Wish for a new feature" },
  { key: "content_error", emoji: "📝", label: "Content", hint: "Dance / step-sheet fix" },
  { key: "instructor_help", emoji: "🎓", label: "Class", hint: "Question for an instructor" },
  { key: "other", emoji: "💬", label: "Other", hint: "Anything else" },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("bug");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const diag = getClientDiagnostics();

  const submit = async () => {
    if (!token) return;
    const msg = message.trim();
    if (msg.length < 3) {
      Alert.alert("Say a little more", "Please add at least a few words.");
      return;
    }
    setSaving(true);
    try {
      await api.submitFeedback(token, {
        message: msg,
        category,
        // ``screen`` is best-effort — we know they're on /feedback but
        // future callers might invoke this endpoint from elsewhere.
        screen: "/feedback",
      });
      Alert.alert(
        "Thanks!",
        "Your feedback landed with the SGY team. We'll follow up if we need more info.",
        [{ text: "OK", onPress: () => router.back() }]
      );
      setMessage("");
    } catch (e: any) {
      Alert.alert("Couldn't send", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          testID="feedback-back"
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Send Feedback</Text>
          <Text style={styles.subtitle}>
            We read every message. Tell us what&apos;s on your mind.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionTitle}>What kind of feedback?</Text>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.categoryPill, active && styles.categoryPillActive]}
                  testID={`feedback-category-${c.key}`}
                >
                  <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryLabel,
                      active && styles.categoryLabelActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {CATEGORIES.find((c) => c.key === category)?.hint}
          </Text>

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
            Tell us more
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Describe what happened, what you expected, or what you'd love to see…"
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            testID="feedback-message"
            maxLength={4000}
          />
          <Text style={styles.counter}>
            {message.length} / 4000
          </Text>

          {/* Diagnostic footer — visible so users know we're not
              sneakily collecting anything. */}
          <View style={styles.diagBox}>
            <View style={styles.diagRow}>
              <Ionicons name="information-circle" size={16} color={colors.brandSecondary} />
              <Text style={styles.diagTitle}>
                Auto-attached to help us investigate
              </Text>
            </View>
            <Text style={styles.diagLine}>
              App v{diag.app_version || "—"}  ·  Build {diag.build_number || "—"}
            </Text>
            <Text style={styles.diagLine}>
              Platform: {diag.platform} {diag.os_version || ""}
            </Text>
            <Text style={styles.diagLine}>
              OTA channel: {diag.ota_channel || "embedded"}  ·  Update id:{" "}
              {diag.ota_update_id ? diag.ota_update_id.slice(0, 8) + "…" : "—"}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={submit}
            disabled={saving || message.trim().length < 3}
            style={[
              styles.submit,
              (saving || message.trim().length < 3) && { opacity: 0.5 },
            ]}
            testID="feedback-submit"
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons
                  name="paper-plane"
                  size={16}
                  color={colors.onBrandPrimary}
                />
                <Text style={styles.submitText}>Send feedback</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfacePrimary },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  title: {
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "800",
    color: colors.onSurface,
  },
  subtitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryPillActive: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimary + "18",
  },
  categoryEmoji: { fontSize: 14 },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
  },
  categoryLabelActive: { color: colors.brandPrimary },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  textarea: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlignVertical: "top",
  },
  counter: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  diagBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  diagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  diagTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.onSurface,
  },
  diagLine: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary,
  },
  submitText: {
    color: colors.onBrandPrimary,
    fontWeight: "800",
    fontSize: 14,
  },
});
