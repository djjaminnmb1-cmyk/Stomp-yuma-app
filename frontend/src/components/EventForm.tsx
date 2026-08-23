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
import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import type { EventInput, EventItem } from "@/src/api/client";
import { DateTimeField } from "@/src/components/DateTimeField";

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
  const [endDate, setEndDate] = useState(initial?.end_date || "");
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
  const [coverImage, setCoverImage] = useState(initial?.cover_image || "");
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opens the OS gallery, resizes to a reasonable preview quality, and
  // stores the result as a base64 data-URL. Matches the pattern the app
  // already uses for step-sheet uploads (see instructor.tsx) so we don't
  // introduce a second storage flow just for flyers.
  const pickFlyer = async () => {
    setUploadingFlyer(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow SGY to read your photos so you can upload a flyer for this event.",
          [
            { text: "Cancel", style: "cancel" },
            perm.canAskAgain
              ? { text: "Try again", onPress: pickFlyer }
              : { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Flyers are usually poster-shaped; allow anything but keep the
        // final base64 lean so we don't bloat the Mongo doc.
        quality: 0.6,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const asset = result.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      setCoverImage(`data:${mime};base64,${asset.base64}`);
    } catch (e: any) {
      Alert.alert(
        "Couldn't upload",
        e?.message || "Please try again in a moment."
      );
    } finally {
      setUploadingFlyer(false);
    }
  };

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
    if (endDate.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim()))
        return "End date must be in YYYY-MM-DD format.";
      if (endDate.trim() < date.trim())
        return "End date can't be before the start date.";
    }
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
      end_date: endDate.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim(),
      venue_name: venueName.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zip_code: zipCode.trim(),
      country: (country || "US").trim() || "US",
      cover_image: coverImage,
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

      <Field label="Event flyer (optional)">
        {coverImage ? (
          <View style={styles.flyerPreviewWrap}>
            <Image
              source={{ uri: coverImage }}
              style={styles.flyerPreview}
              contentFit="cover"
              testID="event-form-flyer-preview"
            />
            <View style={styles.flyerBtnRow}>
              <Pressable
                onPress={pickFlyer}
                style={styles.flyerBtnGhost}
                disabled={uploadingFlyer}
                testID="event-form-flyer-replace"
              >
                <Ionicons
                  name="image"
                  size={16}
                  color={colors.brandPrimary}
                />
                <Text style={styles.flyerBtnGhostText}>Replace</Text>
              </Pressable>
              <Pressable
                onPress={() => setCoverImage("")}
                style={styles.flyerBtnGhost}
                disabled={uploadingFlyer}
                testID="event-form-flyer-remove"
              >
                <Ionicons name="trash" size={16} color={colors.error} />
                <Text
                  style={[
                    styles.flyerBtnGhostText,
                    { color: colors.error },
                  ]}
                >
                  Remove
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={pickFlyer}
            style={styles.flyerDrop}
            disabled={uploadingFlyer}
            testID="event-form-flyer-upload"
          >
            {uploadingFlyer ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={28}
                  color={colors.brandPrimary}
                />
                <Text style={styles.flyerDropTitle}>
                  Upload event flyer
                </Text>
                <Text style={styles.flyerDropSub}>
                  A poster helps dancers spot it in the list. JPG or PNG
                  works best.
                </Text>
              </>
            )}
          </Pressable>
        )}
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

      <Field label="Date" required>
        <DateTimeField
          mode="date"
          value={date}
          onChange={setDate}
          placeholder="Pick a date"
          testID="event-form-date"
        />
      </Field>

      <Field label="End date (optional — for multi-day events)">
        <DateTimeField
          mode="date"
          value={endDate}
          onChange={setEndDate}
          placeholder="Same as start date"
          testID="event-form-end-date"
        />
      </Field>

      <View style={styles.rowTwo}>
        <View style={{ flex: 1 }}>
          <Field label="Starts at">
            <DateTimeField
              mode="time"
              value={startTime}
              onChange={setStartTime}
              placeholder="Pick a time"
              testID="event-form-start"
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ends at">
            <DateTimeField
              mode="time"
              value={endTime}
              onChange={setEndTime}
              placeholder="Pick a time"
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
  flyerDrop: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary + "77",
    borderStyle: "dashed",
    borderRadius: radius.md,
    backgroundColor: colors.brandPrimary + "0F",
    minHeight: 130,
  },
  flyerDropTitle: {
    color: colors.brandPrimary,
    fontWeight: "800",
    fontSize: 14,
    marginTop: 4,
  },
  flyerDropSub: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
    maxWidth: 260,
  },
  flyerPreviewWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  flyerPreview: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: colors.surfaceSecondary,
  },
  flyerBtnRow: {
    flexDirection: "row",
    gap: 6,
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  flyerBtnGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  flyerBtnGhostText: {
    color: colors.brandPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
});

export default EventForm;
