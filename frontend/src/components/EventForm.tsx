/**
 * EventForm — reused by both /events/new and /events/[id]/edit.
 *
 * Form-level validation:
 *   - name, date, address, city are required
 *   - date must be YYYY-MM-DD
 *   - start_time / end_time (when supplied) must be HH:MM (24h)
 *
 * On submit we call ``onSubmit(payload)`` which is expected to throw
 * on API failure. The form surfaces the error inline.
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import type { EventInput, EventItem } from "@/src/api/client";

type Props = {
  mode: "create" | "edit";
  initial: EventItem | null;
  catalog: { types: string[]; skill_levels: string[] };
  onSubmit: (payload: EventInput) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
};

export function EventForm({
  mode,
  initial,
  catalog,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [eventType, setEventType] = useState(initial?.event_type || "workshop");
  const [skillLevel, setSkillLevel] = useState(
    initial?.skill_level || "All levels"
  );
  const [date, setDate] = useState(initial?.date || "");
  const [startTime, setStartTime] = useState(initial?.start_time || "");
  const [endTime, setEndTime] = useState(initial?.end_time || "");
  const [venueName, setVenueName] = useState(initial?.venue_name || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [city, setCity] = useState(initial?.city || "");
  const [state, setState] = useState(initial?.state || "");
  const [zipCode, setZipCode] = useState(initial?.zip_code || "");
  const [country, setCountry] = useState(initial?.country || "US");
  const [price, setPrice] = useState(initial?.price || "");
  const [registrationUrl, setRegistrationUrl] = useState(
    initial?.registration_url || ""
  );
  const [isPublished, setIsPublished] = useState(
    initial?.is_published !== false
  );
  const [error, setError] = useState<string | null>(null);

  const types = catalog.types.length
    ? catalog.types
    : ["workshop", "social", "class", "private_party"];
  const levels = catalog.skill_levels.length
    ? catalog.skill_levels
    : [
        "All levels",
        "Absolute Beginner",
        "Beginner",
        "Improver",
        "High Improver",
        "Intermediate",
        "Advanced",
      ];

  const validate = (): string | null => {
    if (!name.trim()) return "Event name is required.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
      return "Date must be in YYYY-MM-DD format.";
    if (!address.trim()) return "Address is required.";
    if (!city.trim()) return "City is required.";
    if (startTime && !/^\d{1,2}:\d{2}$/.test(startTime.trim()))
      return "Start time must be HH:MM (24-hour).";
    if (endTime && !/^\d{1,2}:\d{2}$/.test(endTime.trim()))
      return "End time must be HH:MM (24-hour).";
    return null;
  };

  const doSubmit = async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const payload: EventInput = {
      name: name.trim(),
      description: description.trim(),
      event_type: eventType,
      skill_level: skillLevel,
      date: date.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim(),
      venue_name: venueName.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zip_code: zipCode.trim(),
      country: (country || "US").trim() || "US",
      price: price.trim(),
      registration_url: registrationUrl.trim(),
      is_published: isPublished,
    };
    try {
      await onSubmit(payload);
    } catch (e: any) {
      setError(e?.message || "Couldn't save event. Please try again.");
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onCancel}
          style={styles.iconBtn}
          hitSlop={12}
          testID="event-form-cancel"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {mode === "create" ? "New Event" : "Edit Event"}
          </Text>
          <Text style={styles.sub}>
            Workshops, socials, guest-teacher nights, and more.
          </Text>
        </View>
      </View>

      <Field label="Event name" required>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Line-Dance Legends Workshop"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="event-form-name"
        />
      </Field>

      <Field label="Type" required>
        <View style={styles.chipRow}>
          {types.map((t) => {
            const active = eventType === t;
            return (
              <Pressable
                key={t}
                onPress={() => setEventType(t)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`event-form-type-${t}`}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {prettyType(t)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Skill level">
        <View style={styles.chipRow}>
          {levels.map((l) => {
            const active = skillLevel === l;
            return (
              <Pressable
                key={l}
                onPress={() => setSkillLevel(l)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`event-form-level-${l}`}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {l}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Date (YYYY-MM-DD)" required>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="2026-09-14"
          placeholderTextColor={colors.muted}
          style={styles.input}
          keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
          testID="event-form-date"
        />
      </Field>

      <View style={styles.rowTwo}>
        <View style={{ flex: 1 }}>
          <Field label="Start (HH:MM)">
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              placeholder="19:30"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
              testID="event-form-start"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="End (HH:MM)">
            <TextInput
              value={endTime}
              onChangeText={setEndTime}
              placeholder="21:30"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
              testID="event-form-end"
            />
          </Field>
        </View>
      </View>

      <Field label="Venue name">
        <TextInput
          value={venueName}
          onChangeText={setVenueName}
          placeholder="e.g. Yuma Civic Center"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="event-form-venue"
        />
      </Field>

      <Field label="Street address" required>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="1440 Desert Hills Dr"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="event-form-address"
        />
      </Field>

      <View style={styles.rowTwo}>
        <View style={{ flex: 2 }}>
          <Field label="City" required>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Yuma"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="event-form-city"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="State">
            <TextInput
              value={state}
              onChangeText={setState}
              placeholder="AZ"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={2}
              autoCapitalize="characters"
              testID="event-form-state"
            />
          </Field>
        </View>
      </View>

      <View style={styles.rowTwo}>
        <View style={{ flex: 1 }}>
          <Field label="ZIP">
            <TextInput
              value={zipCode}
              onChangeText={setZipCode}
              placeholder="85365"
              placeholderTextColor={colors.muted}
              style={styles.input}
              keyboardType="number-pad"
              testID="event-form-zip"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Country">
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="US"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={4}
              autoCapitalize="characters"
              testID="event-form-country"
            />
          </Field>
        </View>
      </View>

      <Field label="Price (optional)">
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="$15 · Free · $20 at door"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="event-form-price"
        />
      </Field>

      <Field label="Registration URL (optional)">
        <TextInput
          value={registrationUrl}
          onChangeText={setRegistrationUrl}
          placeholder="https://…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="url"
          testID="event-form-url"
        />
      </Field>

      <Field label="Description">
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What should dancers expect? Any prerequisites?"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.textarea]}
          multiline
          numberOfLines={4}
          testID="event-form-description"
        />
      </Field>

      <Pressable
        onPress={() => setIsPublished(!isPublished)}
        style={styles.publishRow}
        testID="event-form-publish"
      >
        <Ionicons
          name={isPublished ? "checkbox" : "square-outline"}
          size={22}
          color={isPublished ? colors.brandPrimary : colors.muted}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.publishLabel}>Publish immediately</Text>
          <Text style={styles.publishSub}>
            Uncheck to save as a draft only you can see.
          </Text>
        </View>
      </Pressable>

      {error ? (
        <View style={styles.errBox}>
          <Ionicons
            name="alert-circle"
            size={16}
            color={colors.error}
            style={{ marginTop: 1 }}
          />
          <Text style={styles.errText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footRow}>
        <Pressable
          onPress={onCancel}
          style={styles.footCancel}
          disabled={submitting}
        >
          <Text style={styles.footCancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={doSubmit}
          style={[styles.footSave, submitting && { opacity: 0.7 }]}
          disabled={submitting}
          testID="event-form-save"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.footSaveText}>
              {mode === "create" ? "Create event" : "Save changes"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>
        {label}
        {required ? <Text style={fieldStyles.required}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function prettyType(t: string): string {
  if (t === "private_party") return "Private party";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: spacing.md },
  label: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  required: { color: colors.brandPrimary },
});

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xl },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  rowTwo: { flexDirection: "row", gap: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  chipText: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  publishRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  publishLabel: {
    fontFamily: "serif",
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
  },
  publishSub: { fontSize: 11, color: colors.muted, marginTop: 2 },

  errBox: {
    flexDirection: "row",
    gap: 6,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FDE8E4",
    borderWidth: 1,
    borderColor: colors.error + "66",
  },
  errText: { color: colors.error, fontSize: 13, flex: 1, lineHeight: 18 },

  footRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  footCancelText: { color: colors.onSurface, fontWeight: "700" },
  footSave: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  footSaveText: { color: "#fff", fontWeight: "800" },
});

export default EventForm;
