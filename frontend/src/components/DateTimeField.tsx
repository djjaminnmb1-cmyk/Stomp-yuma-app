/**
 * DateTimeField — a friendly tap-to-pick field for dates and times.
 *
 * Why not just wrap ``@react-native-community/datetimepicker`` inline?
 *   * iOS renders the picker inline in the current view which shoves
 *     the form around. Users kept getting confused. We wrap it in a
 *     bottom-sheet Modal with Done/Cancel buttons so the interaction
 *     feels like every other iOS date picker.
 *   * Android's picker is already a native dialog — we just fire it on
 *     press.
 *   * Web has no native picker component from the community package,
 *     so we render the browser's ``<input type="date|time">``. That's
 *     the sanest fallback for the preview experience.
 *
 * The field surfaces the value as a big tap-target (44+px per iOS HIG),
 * with a subtle chevron icon so it reads as "opens something".
 */
import { useMemo, useState } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { colors, radius, spacing } from "@/src/theme";

type Mode = "date" | "time";

export function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  testID,
  minDate,
  maxDate,
}: {
  /** "date" -> stores YYYY-MM-DD, "time" -> stores HH:MM (24h). */
  mode: Mode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testID?: string;
  /** Optional bounds for the date picker (ignored on time). */
  minDate?: Date;
  maxDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  // On iOS we want the picker to hold its own draft so we can commit
  // only when the user taps Done — that way scrolling the wheel
  // doesn't fire onChange on every notch.
  const [draft, setDraft] = useState<Date>(() => parseValue(value, mode));

  const display = useMemo(() => formatDisplay(value, mode), [value, mode]);

  const openPicker = () => {
    setDraft(parseValue(value, mode));
    setOpen(true);
  };

  // Web fallback — the RN Community picker doesn't ship a web renderer.
  // The browser's native input is the least surprising thing here.
  if (Platform.OS === "web") {
    return (
      <View style={styles.wrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          // @ts-expect-error — RN Web accepts input type via a
          //  private prop, hidden behind the type layer.
          type={mode === "date" ? "date" : "time"}
          placeholder={placeholder || (mode === "date" ? "YYYY-MM-DD" : "HH:MM")}
          placeholderTextColor={colors.muted}
          style={styles.webInput}
          testID={testID}
        />
        <Ionicons
          name={mode === "date" ? "calendar" : "time"}
          size={18}
          color={colors.muted}
          style={styles.webIcon}
          pointerEvents="none"
        />
      </View>
    );
  }

  const commit = (d: Date) => {
    onChange(mode === "date" ? formatDate(d) : formatTime(d));
  };

  // Android: fires the native dialog on press and closes itself. We
  // commit the value the moment the user picks.
  if (Platform.OS === "android") {
    return (
      <>
        <Pressable
          testID={testID}
          onPress={openPicker}
          style={styles.field}
          android_ripple={{ color: colors.brandPrimary + "22" }}
        >
          <Ionicons
            name={mode === "date" ? "calendar" : "time"}
            size={18}
            color={value ? colors.brandPrimary : colors.muted}
          />
          <Text
            style={[
              styles.fieldText,
              !value && { color: colors.muted },
            ]}
            numberOfLines={1}
          >
            {display || placeholder ||
              (mode === "date" ? "Pick a date" : "Pick a time")}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.muted} />
        </Pressable>
        {open ? (
          <DateTimePicker
            value={draft}
            mode={mode}
            is24Hour={false}
            minimumDate={mode === "date" ? minDate : undefined}
            maximumDate={mode === "date" ? maxDate : undefined}
            onChange={(evt: DateTimePickerEvent, d?: Date) => {
              setOpen(false);
              // ``dismissedAction`` fires when the user taps outside
              // or backs out — respect their choice, don't overwrite.
              if (evt.type === "set" && d) commit(d);
            }}
          />
        ) : null}
      </>
    );
  }

  // iOS: draw the picker inside a bottom-sheet modal so it doesn't
  // reflow the form and users get a familiar Done/Cancel flow.
  return (
    <>
      <Pressable
        testID={testID}
        onPress={openPicker}
        style={styles.field}
      >
        <Ionicons
          name={mode === "date" ? "calendar" : "time"}
          size={18}
          color={value ? colors.brandPrimary : colors.muted}
        />
        <Text
          style={[styles.fieldText, !value && { color: colors.muted }]}
          numberOfLines={1}
        >
          {display || placeholder ||
            (mode === "date" ? "Pick a date" : "Pick a time")}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Pressable
              testID={`${testID || "dtf"}-cancel`}
              onPress={() => setOpen(false)}
              hitSlop={8}
            >
              <Text style={styles.sheetLink}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>
              {mode === "date" ? "Pick a date" : "Pick a time"}
            </Text>
            <Pressable
              testID={`${testID || "dtf"}-done`}
              onPress={() => {
                commit(draft);
                setOpen(false);
              }}
              hitSlop={8}
            >
              <Text style={[styles.sheetLink, { color: colors.brandPrimary }]}>
                Done
              </Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={draft}
            mode={mode}
            display="spinner"
            themeVariant="light"
            minimumDate={mode === "date" ? minDate : undefined}
            maximumDate={mode === "date" ? maxDate : undefined}
            onChange={(_evt: DateTimePickerEvent, d?: Date) => {
              if (d) setDraft(d);
            }}
            style={styles.iosPicker}
          />
        </View>
      </Modal>
    </>
  );
}

// ---------- helpers ----------
function parseValue(v: string, mode: Mode): Date {
  const now = new Date();
  if (!v) return now;
  if (mode === "date") {
    // Expect "YYYY-MM-DD". Fall back to today if malformed.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return now;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
    );
  }
  // "HH:MM"
  const t = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!t) return now;
  const d = new Date();
  d.setHours(Number(t[1]), Number(t[2]), 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// User-friendly display strings — the raw ISO is still what we persist,
// but the tap target should read like a human wrote it.
function formatDisplay(v: string, mode: Mode): string {
  if (!v) return "";
  if (mode === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return v;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const t = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!t) return v;
  const h24 = Number(t[1]);
  const mm = t[2];
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 >= 12 ? "PM" : "AM";
  return `${h12}:${mm} ${ampm}`;
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  webInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    paddingRight: 40,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    minHeight: 46,
  },
  webIcon: {
    position: "absolute",
    right: 12,
    top: 14,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    minHeight: 46,
  },
  fieldText: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.md,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sheetTitle: {
    fontFamily: "serif",
    fontSize: 15,
    fontWeight: "800",
    color: colors.onSurface,
  },
  sheetLink: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.muted,
  },
  iosPicker: { alignSelf: "center" },
});

export default DateTimeField;
