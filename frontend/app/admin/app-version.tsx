/**
 * Admin → App Version
 * Sets the minimum (blocking "Update required" screen) and latest
 * ("New version available" banner) app versions plus the store links
 * the update buttons open. Read by <AppVersionGate /> on every launch.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { APP_VERSION } from "@/src/lib/appVersion";
import { colors, radius, spacing } from "@/src/theme";

type Form = { min_version: string; latest_version: string; ios_url: string; android_url: string };

export default function AdminAppVersionScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<{ at?: string | null; by?: string | null }>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const p = await api.adminGetVersionPolicy(token);
      setForm({
        min_version: p.min_version,
        latest_version: p.latest_version,
        ios_url: p.ios_url,
        android_url: p.android_url,
      });
      setMeta({ at: p.updated_at, by: p.updated_by_email });
    } catch (e: any) {
      setErr(e?.message || "Couldn't load settings.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form || !token) return;
    setErr(null);
    setSaving(true);
    try {
      const p = await api.adminSetVersionPolicy(form, token);
      setMeta({ at: p.updated_at, by: p.updated_by_email });
      toast.success("App version settings saved");
    } catch (e: any) {
      setErr(e?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={[styles.title, { padding: spacing.lg }]}>Admins only</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          testID="appver-back"
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>App Version</Text>
          <Text style={styles.subtitle}>This device is running v{APP_VERSION}</Text>
        </View>
      </View>

      {!form ? (
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          {err ? <Text style={styles.err}>{err}</Text> : <ActivityIndicator color={colors.brandPrimary} />}
        </View>
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <View style={styles.card}>
            <Text style={styles.label}>Minimum version (blocking)</Text>
            <TextInput
              testID="appver-min"
              value={form.min_version}
              onChangeText={set("min_version")}
              placeholder="e.g. 1.1.0 — leave blank for none"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <Text style={styles.help}>
              Anyone on an older version sees a full-screen &quot;Update required&quot; page and
              can&apos;t use the app until they update. Admins only see a banner.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Latest version (banner)</Text>
            <TextInput
              testID="appver-latest"
              value={form.latest_version}
              onChangeText={set("latest_version")}
              placeholder="e.g. 1.2.0 — leave blank for none"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <Pressable
              testID="appver-use-current"
              onPress={() => set("latest_version")(APP_VERSION)}
              style={styles.chip}
            >
              <Ionicons name="phone-portrait-outline" size={14} color={colors.brandPrimary} />
              <Text style={styles.chipText}>Use this build (v{APP_VERSION})</Text>
            </Pressable>
            <Text style={styles.help}>
              Anyone on an older version sees a dismissible &quot;New version available&quot; banner.
              Set this after the new build is live in both stores.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>iPhone — App Store link</Text>
            <TextInput
              testID="appver-ios"
              value={form.ios_url}
              onChangeText={set("ios_url")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
            <Pressable onPress={() => Linking.openURL(form.ios_url)} testID="appver-ios-test">
              <Text style={styles.link}>Test link</Text>
            </Pressable>

            <Text style={[styles.label, { marginTop: spacing.md }]}>Android — Google Play link</Text>
            <TextInput
              testID="appver-android"
              value={form.android_url}
              onChangeText={set("android_url")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
            <Pressable onPress={() => Linking.openURL(form.android_url)} testID="appver-android-test">
              <Text style={styles.link}>Test link</Text>
            </Pressable>
          </View>

          {err ? (
            <Text testID="appver-error" style={styles.err}>
              {err}
            </Text>
          ) : null}

          <Pressable
            testID="appver-save"
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
          {meta.at ? (
            <Text style={styles.meta}>
              Last saved {new Date(meta.at).toLocaleString()}
              {meta.by ? ` by ${meta.by}` : ""}
            </Text>
          ) : null}

          {token ? <WhatsNewEditor token={token} /> : null}
        </KeyboardAwareScrollView>
      )}
    </SafeAreaView>
  );
}

/** "What's new" notes for one version — one line per item, shown once
 *  on Home to existing members after they update to that version. */
function WhatsNewEditor({ token }: { token: string }) {
  const toast = useToast();
  const [version, setVersion] = useState(APP_VERSION);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadNotes = useCallback(async (v: string) => {
    setErr(null);
    setLoading(true);
    try {
      const r = await api.getWhatsNew(v.trim());
      setText(r.items.join("\n"));
    } catch (e: any) {
      setErr(e?.message || "Couldn't load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes(APP_VERSION);
  }, [loadNotes]);

  const saveNotes = async () => {
    setErr(null);
    setSaving(true);
    try {
      const items = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const r = await api.adminSetWhatsNew(version.trim(), items, token);
      setText(r.items.join("\n"));
      toast.success(`What's new for v${r.version} saved`);
    } catch (e: any) {
      setErr(e?.message || "Couldn't save notes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>What&apos;s new card</Text>
      <Text style={styles.help}>
        Shown once on Home to existing members after they update to this version. Brand-new
        sign-ups skip it. One item per line; leave empty to hide the card.
      </Text>
      <Text style={styles.subLabel}>Version</Text>
      <TextInput
        testID="appver-notes-version"
        value={version}
        onChangeText={setVersion}
        onEndEditing={() => loadNotes(version)}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        style={styles.input}
      />
      <Text style={styles.subLabel}>Notes</Text>
      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} />
      ) : (
        <TextInput
          testID="appver-notes"
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          placeholder={"Smoother sign-up\nFaster dance search"}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.notesInput]}
        />
      )}
      {err ? (
        <Text testID="appver-notes-error" style={styles.err}>
          {err}
        </Text>
      ) : null}
      <Pressable
        testID="appver-notes-save"
        onPress={saveNotes}
        disabled={saving || loading}
        style={[styles.saveBtn, (saving || loading) && { opacity: 0.6 }]}
      >
        {saving ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <Text style={styles.saveText}>Save notes</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  title: { fontFamily: "serif", fontSize: 18, fontWeight: "800", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: { fontWeight: "800", color: colors.onSurface, fontSize: 14 },
  subLabel: { fontWeight: "700", color: colors.onSurfaceSecondary, fontSize: 12 },
  notesInput: { minHeight: 140, paddingTop: spacing.sm, paddingBottom: spacing.sm, lineHeight: 20 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    fontSize: 15,
  },
  help: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  chipText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13, paddingVertical: 4 },
  err: { color: colors.error, fontWeight: "600", textAlign: "center" },
  saveBtn: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
