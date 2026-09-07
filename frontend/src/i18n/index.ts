/**
 * i18n runtime for the mobile app.
 *
 * Responsibilities
 * ----------------
 * 1. Detect the device's preferred locale via `expo-localization`.
 * 2. Load / persist the user's manual override in AsyncStorage.
 * 3. When the user signs in, sync their choice up to the backend
 *    (``PATCH /api/auth/me/language``) so it follows them across
 *    devices — and pull the server-side override on login so a fresh
 *    device install picks up the previously-chosen language.
 * 4. Expose a `useTranslation()` hook + tiny `t(key)` shortcut for
 *    call-sites that only need the translator.
 *
 * The runtime is intentionally re-render-cheap: state lives in a
 * ``useSyncExternalStore``-style subscription set so a locale swap
 * causes every subscriber to re-render exactly once.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getLocales } from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18n } from "i18n-js";

import {
  DEFAULT_LOCALE,
  Locale,
  SUPPORTED_LOCALES,
  translations,
} from "./translations";

// AsyncStorage key. Kept stable — never rename without a migration.
const STORAGE_KEY = "sgy.locale.v1";
// A magic sentinel we persist to encode "user chose System default".
// AsyncStorage can only hold strings; using "" would clash with a
// half-written value.
const SYSTEM_DEFAULT_MARKER = "__system__";
// Snapshot of the device's ordered locale-tag list from the LAST time
// we ran bootstrap. If it changes across launches we treat that as a
// signal that the user swapped their phone language and we re-prompt
// them to pick a language for the app. Storing the raw tag list (not
// just the resolved locale) means we notice even changes between two
// unsupported locales — since either can drift what "system default"
// resolves to.
const LAST_DEVICE_TAG_KEY = "sgy.locale.last_device_tag.v1";
// Companion key used by the picker modal so an old picker-shown flag
// doesn't suppress the re-prompt after a device-language change.
const PICKER_SHOWN_KEY = "sgy.locale.picker_shown_at";


/**
 * Convert a flat ``{"a.b.c": "value"}`` map into a nested
 * ``{a: {b: {c: "value"}}}`` structure that i18n-js's default
 * ``defaultSeparator`` (".") can walk.
 *
 * We keep translations flat in ``translations.ts`` because a flat
 * map is much easier to maintain (grep-friendly, single lookup,
 * IDE-friendly) — but i18n-js expects nested at runtime. So we
 * nest once, at construction.
 *
 * ALSO: at nesting time we rewrite our authoring placeholder syntax
 * ``{name}`` to the ``%{name}`` sprintf-style form that i18n-js's
 * default interpolator understands. Doing this pre-processing here
 * means our translations.ts stays human-friendly (single-brace) but
 * runtime interpolation still fires. Escaped literals ``\{`` and
 * ``\}`` are preserved as bare braces.
 */
function toRuntimeString(v: string): string {
  // 1. Match a single-brace ``{ident}`` and rewrite to ``%{ident}``
  //    — but ONLY when the previous char isn't already ``%`` (so a
  //    pre-formatted ``%{name}`` in a translation still works).
  // 2. Rewrite escaped ``\{`` / ``\}`` to their literal forms so we
  //    can still render a literal brace when needed.
  return v
    .replace(/(^|[^%\\])\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "$1%{$2}")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}");
}

function nest(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split(".");
    let node: any = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (typeof node[seg] !== "object" || node[seg] === null) {
        node[seg] = {};
      }
      node = node[seg];
    }
    node[parts[parts.length - 1]] = toRuntimeString(v);
  }
  return out;
}

const NESTED_TRANSLATIONS: Record<string, unknown> = {
  en: nest(translations.en),
  es: nest(translations.es),
  fr: nest(translations.fr),
  de: nest(translations.de),
  nl: nest(translations.nl),
  ko: nest(translations.ko),
  "zh-Hans": nest(translations["zh-Hans"]),
  "zh-Hant": nest(translations["zh-Hant"]),
};

// Singleton i18n-js instance. Everything (t, hook, provider) reads
// from this one object.
export const i18n = new I18n(NESTED_TRANSLATIONS, {
  defaultLocale: DEFAULT_LOCALE,
  enableFallback: true,
});

// -------- Locale detection --------
/**
 * Return the device's best-supported locale, or DEFAULT_LOCALE when
 * none of the device languages map to a supported one.
 *
 * ``getLocales()`` returns the OS's ordered preference list, so we
 * scan and pick the first supported hit. For Chinese we additionally
 * inspect the script tag / regional variant so `zh-Hans-CN` maps to
 * Simplified and `zh-Hant-TW` (or `zh-TW` / `zh-HK` / `zh-MO`) maps
 * to Traditional. Anything bare (``zh``) defaults to Simplified —
 * the larger reader base — and can always be overridden via the
 * settings screen.
 */
export function deviceLocale(): Locale {
  try {
    const list = getLocales();
    for (const l of list) {
      const tag = (l.languageTag || l.languageCode || "").toLowerCase();
      const scriptCode = ((l as unknown as { languageScriptCode?: string })
        .languageScriptCode || "").toLowerCase();
      const regionCode = (l.regionCode || "").toLowerCase();
      const base = tag.split("-")[0].split("_")[0];

      // Chinese variants ── inspect script + region.
      if (base === "zh") {
        if (
          scriptCode === "hant" ||
          regionCode === "tw" ||
          regionCode === "hk" ||
          regionCode === "mo" ||
          tag.includes("-hant") ||
          tag.includes("_hant")
        ) {
          return "zh-Hant";
        }
        return "zh-Hans";
      }

      if ((SUPPORTED_LOCALES as string[]).includes(base)) {
        return base as Locale;
      }
    }
  } catch (_) {
    // ``expo-localization`` throws on jest/web without native.
  }
  return DEFAULT_LOCALE;
}

/**
 * Serialise the device's ordered locale-tag list so we can detect a
 * change on the next boot. The order MATTERS: iOS/Android put the
 * "primary" language first, so the effective locale can flip even if
 * the same tags stay in the list.
 */
function deviceTagsSignature(): string {
  try {
    const list = getLocales() || [];
    return list
      .map((l) => (l.languageTag || l.languageCode || "").toLowerCase())
      .filter(Boolean)
      .join(",");
  } catch (_) {
    return "";
  }
}

// -------- External store (state + subscribers) --------
type State = {
  locale: Locale;
  // True while we haven't finished loading the persisted override yet.
  // The onboarding modal waits on this so it doesn't flash a picker
  // for a user who already chose one.
  hydrated: boolean;
  // The user's ACTUAL override — "system" means "follow device
  // locale". Kept separate from ``locale`` so a change of device
  // locale propagates automatically when the user hasn't overridden.
  override: Locale | "system";
};

let state: State = {
  locale: DEFAULT_LOCALE,
  hydrated: false,
  override: "system",
};
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) fn();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function snapshot(): State {
  return state;
}

// Apply a new state, keeping ``i18n.locale`` in lock-step so any
// non-hook call-site (event handlers, one-shot format calls in native
// modules) sees the fresh locale immediately.
function commit(next: State) {
  state = next;
  i18n.locale = next.locale;
  emit();
}

// -------- Boot / hydration --------
/**
 * Load the persisted override (if any) and set the effective locale.
 * Called ONCE from the root layout. Later changes should go through
 * ``setLocaleOverride`` so persistence and backend-sync stay in sync.
 *
 * We ALSO compare the current device locale-tag list against the one
 * we saw the last time the app booted. If it changed AND the user
 * had originally left the app on "system default", we clear the
 * "picker was shown" marker so the LanguagePickerModal re-appears on
 * the next launch — matching the user preference of "re-prompt if
 * device language changes". A user who explicitly pinned a language
 * override is NEVER re-prompted; their choice is authoritative.
 */
export async function bootstrapI18n(): Promise<void> {
  let override: Locale | "system" = "system";
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === SYSTEM_DEFAULT_MARKER) {
      override = "system";
    } else if (raw && SUPPORTED_LOCALES.includes(raw as Locale)) {
      override = raw as Locale;
    }
  } catch (_) {
    // First-launch or storage denied — treat as system default.
  }

  // Device-language change detection.
  // Only relevant when the user hadn't pinned a language override —
  // if they explicitly chose, say, Spanish, we honour that even if
  // the OS moved from English to French.
  try {
    const sig = deviceTagsSignature();
    const lastSig = await AsyncStorage.getItem(LAST_DEVICE_TAG_KEY);
    if (sig) {
      if (lastSig && lastSig !== sig && override === "system") {
        // Device language moved and user hadn't overridden — clear
        // the "picker was shown" flag so onboarding re-prompts on
        // next mount. We DO NOT delete the STORAGE_KEY entry so we
        // still remember the user's "system default" choice.
        try {
          await AsyncStorage.removeItem(PICKER_SHOWN_KEY);
        } catch (_) {}
      }
      // Always refresh the stored signature — even for a first-run
      // where lastSig is null.
      try {
        await AsyncStorage.setItem(LAST_DEVICE_TAG_KEY, sig);
      } catch (_) {}
    }
  } catch (_) {
    // Non-fatal: if we can't detect the change we just skip the
    // re-prompt on this boot. Everything else still works.
  }

  const locale = override === "system" ? deviceLocale() : override;
  commit({ locale, override, hydrated: true });
}

/**
 * Change the user's language choice and persist it.
 *
 * ``newOverride === "system"`` clears the override and re-detects
 * from the device. A supported code pins the app to that locale.
 *
 * If ``syncToBackend`` is passed, the caller is responsible for
 * hitting ``PATCH /api/auth/me/language`` — separated so this
 * module doesn't take a hard dependency on the API client.
 */
export async function setLocaleOverride(
  newOverride: Locale | "system",
  opts?: { syncToBackend?: (lang: string) => Promise<void> },
): Promise<void> {
  const nextLocale =
    newOverride === "system" ? deviceLocale() : newOverride;
  commit({
    locale: nextLocale,
    override: newOverride,
    hydrated: true,
  });
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      newOverride === "system" ? SYSTEM_DEFAULT_MARKER : newOverride,
    );
  } catch (_) {
    // Non-fatal — the in-memory state still reflects the choice; a
    // future app open will just re-detect from device.
  }
  if (opts?.syncToBackend) {
    try {
      // Empty string tells the server "clear the override".
      await opts.syncToBackend(
        newOverride === "system" ? "" : newOverride,
      );
    } catch (_) {
      // Best-effort — the user's local choice already stuck.
    }
  }
}

/**
 * Apply a server-provided preferred_language (from /auth/me on
 * login) BUT only when the user has no local override yet. This
 * keeps the client authoritative on the current device (offline
 * changes never get clobbered) while still restoring a language
 * chosen on another device for a fresh install.
 */
export async function applyServerPreferredLanguage(
  serverLang: string | null | undefined,
): Promise<void> {
  if (!serverLang) return;
  const normalised = serverLang.toLowerCase() as Locale;
  if (!SUPPORTED_LOCALES.includes(normalised)) return;
  // If the user already picked something locally, don't override —
  // the local device is the last-writer-wins.
  if (state.override !== "system") return;
  await setLocaleOverride(normalised);
}

// -------- Public reactive API --------
/**
 * Return ``{ t, tRaw, locale, override, setLocale }``. Any component
 * that calls this re-renders exactly once when the locale changes.
 */
export function useTranslation() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    t: (key: string, params?: Record<string, unknown>) =>
      i18n.t(key, params),
    /**
     * Return the raw source string (with authoring-time ``{ident}``
     * placeholders intact) — for call-sites that need to
     * ``.split()`` on those tokens to render inline JSX.
     */
    tRaw: (key: string) => tRaw(key),
    locale: state.locale,
    override: state.override,
    hydrated: state.hydrated,
    setLocale: setLocaleOverride,
    deviceLocale: deviceLocale(),
  } as const;
}

/**
 * Non-hook shortcut for utility modules that just need to translate
 * a single string (toast messages, alert bodies) without wanting to
 * subscribe to changes. Reads the CURRENT locale.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params);
}

/**
 * Return the RAW authoring-time source string for the current
 * locale, before ``toRuntimeString``'s ``{name}`` → ``%{name}``
 * rewrite. Falls back to English if the locale is missing the key
 * (mirrors i18n-js's ``enableFallback`` behaviour but without going
 * through the interpolator).
 *
 * Use this at call-sites that need to ``.split("{ident}")`` on the
 * source string to render inline nodes (e.g. clickable Terms /
 * Privacy links inside a paragraph). Passing this through the
 * regular ``t()`` would swap the token for ``%{ident}`` which
 * i18n-js then either interpolates or drops entirely — leaving the
 * split with nothing to match.
 */
export function tRaw(key: string): string {
  const loc = state.locale;
  const table =
    (translations as Record<string, Record<string, string>>)[loc] || {};
  if (typeof table[key] === "string") return table[key];
  // Fall back to English.
  const en = translations.en;
  return (en as Record<string, string>)[key] ?? key;
}

/** Convenience: kick bootstrap AND subscribe in one shot for the
 *  root component. Ensures the first render already has the right
 *  locale on cold-start when persisted override loads instantly. */
export function useI18nBootstrap() {
  useEffect(() => {
    // Fire-and-forget. Sub-components using ``useTranslation`` will
    // re-render when bootstrap completes.
    void bootstrapI18n();
  }, []);
}
