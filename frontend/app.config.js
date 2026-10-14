// Expo dynamic config. Reads env vars via `require('dotenv').config()`
// (Metro auto-injects EXPO_PUBLIC_* at build time; this file runs at
// prebuild / build time so it needs its own dotenv load too).
//
// Why dynamic config instead of app.json?
// The privacy-policy URL and (soon) the backend base URL must follow
// the environment they were built in. app.json is a static file with
// no env interpolation — dynamic config lets us derive URLs from
// process.env, which the deploy pipeline sets differently for
// preview vs. production.

const path = require("path");
const fs = require("fs");
// Load .env early so dev builds see the same env the deploy pipeline
// injects in prod. Non-fatal if the file is missing.
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (_) {
  // dotenv is a transitive dep; if it's ever pruned, skip silently.
}

// Optional iOS Firebase config for push notifications. We only wire
// it into the native build if the plist actually exists on disk —
// otherwise a missing file would fail `expo prebuild --clean`. Drop
// the plist from the Firebase console at frontend/GoogleService-Info.plist
// and it's picked up automatically on the next build.
const iosGoogleServicesFile = fs.existsSync(
  path.join(__dirname, "GoogleService-Info.plist")
)
  ? "./GoogleService-Info.plist"
  : undefined;

/**
 * Resolve the privacy-policy URL:
 *
 *   1. explicit override via EXPO_PUBLIC_PRIVACY_POLICY_URL
 *   2. derived from EXPO_PUBLIC_BACKEND_URL (which the deploy
 *      pipeline sets to the production domain) + `/api/legal/privacy`
 *   3. hard-coded fallback so `expo start` still works when the
 *      env is completely empty (dev-only convenience).
 *
 * The backend serves the privacy policy from a STABLE `/api/legal/privacy`
 * endpoint (see backend/routes/legal.py) so the URL is guaranteed to
 * resolve regardless of which domain the mobile app is hosted at —
 * ingress always routes `/api/*` to the backend.
 */
const privacyPolicyUrl =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
  (process.env.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/$/, "")}/api/legal/privacy`
    : "https://stompin-yuma-app.preview.emergentagent.com/api/legal/privacy");

// The Emergent build pipeline writes an ``app.json`` right before
// ``eas project:init`` / ``eas build`` with the build identity:
// name, slug, version, android.versionCode, ios.buildNumber and
// extra.eas.projectId. A dynamic config that exports a plain object
// IGNORES app.json, so EAS never saw the projectId and failed with
// "Cannot automatically write to dynamic config". We read it here and
// merge those fields in (store identifiers below stay authoritative).
const appJsonPath = path.join(__dirname, "app.json");
let pipelineExpo = {};
try {
  if (fs.existsSync(appJsonPath)) {
    pipelineExpo = JSON.parse(fs.readFileSync(appJsonPath, "utf8")).expo || {};
  }
} catch (_) {
  pipelineExpo = {};
}

/** Higher of two "X.Y.Z" versions, so a stale default in the build form
 *  can never downgrade the version baked into this file (and vice versa). */
function higherVersion(a, b) {
  if (!a) return b;
  if (!b) return a;
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? a : b;
  }
  return a;
}

const baseExpo = {
    name: "Stompin' Ground Yuma",
    slug: "stompin-ground-yuma",
    version: "1.1.0",
    // ``default`` lets the OS pick the natural orientation — portrait
    // stays the primary layout (phones open in portrait), but users
    // who rotate the device sideways get a proper landscape reflow
    // instead of the app being locked upright. This is especially
    // helpful for typing in the instructor chat and for viewing the
    // dance library on tablets. The UI already uses
    // ``SafeAreaProvider`` + ``KeyboardProvider`` at the root, so
    // notches, keyboards, and gestures all handle rotation correctly
    // without per-screen changes.
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "frontend",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      enabled: false,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
      useEmbeddedUpdate: true,
    },
    // Top-level privacyPolicyUrl — surfaces in the app metadata and
    // is what Play / App Store review pipelines can auto-scrape.
    privacyPolicyUrl,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.emergent.stompinyumaapp.uyr5zg",
      usesAppleSignIn: true,
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        CFBundleDisplayName: "Stompin' Yuma",
        NSCameraUsageDescription:
          "Scan step sheets and take dance photos",
        NSPhotoLibraryUsageDescription: "Upload step-sheet images for dances",
        NSPhotoLibraryAddUsageDescription: "Save step-sheet images to your device",
        NSLocationWhenInUseUsageDescription: "Find line-dance events near you",
        LSApplicationQueriesSchemes: [
          "vnd.youtube",
          "youtube",
          "instagram",
          "fb",
          "fbapiauthlogin",
          "snssdk1233",
          "tiktok",
        ],
      },
      // Optional: only wired in if a GoogleService-Info.plist is ever
      // added (e.g. for Firebase Analytics). iOS PUSH does NOT need it —
      // Emergent delivers iOS pushes via APNs using the .p8 key uploaded
      // in the build UI.
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#F2A628",
      },
      edgeToEdgeEnabled: true,
      package: "com.stompinyuma.app",
      googleServicesFile: "./google-services.json",
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-notifications",
      "expo-localization",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-image.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#F2A628",
        },
      ],
      "expo-web-browser",
      "expo-audio",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Find line-dance events near you",
          locationWhenInUsePermission: "Find line-dance events near you",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      "@react-native-community/datetimepicker",
      // Pin Kotlin to 2.1.20 for the whole Android build. This is
      // the officially supported way to override the Kotlin version
      // (Expo docs / config-plugins) and it complements the
      // patch-package fix in patches/expo-updates+29.0.20.patch —
      // both together guarantee expo-updates's Gradle plugin (which
      // pins to 2.0.21 by default) compiles against the same
      // Kotlin runtime that the rest of the Android graph uses.
      [
        "expo-build-properties",
        {
          android: {
            kotlinVersion: "2.1.20",
          },
        },
      ],
      // Raise the Gradle daemon's heap to 4 GiB so the Kotlin 2.1.20
      // compile pass in expo-updates + Reanimated + Screens doesn't
      // OOM the default 2 GiB EAS worker allotment. Ships as a tiny
      // local config plugin — see plugins/with-gradle-heap.js.
      "./plugins/with-gradle-heap.js",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // Also expose under `extra.privacyPolicyUrl` so any component
      // reading `Constants.expoConfig.extra.privacyPolicyUrl` keeps
      // working after the app.json → app.config.js migration.
      privacyPolicyUrl,
    },
};

module.exports = () => {
  const p = pipelineExpo;
  // Returned under an explicit `expo` key (Expo's documented dynamic
  // form) so tools that look for the `expo` field still detect the app.
  return {
    expo: {
      ...baseExpo,
      // Build-form name wins (ignore the pipeline's generic "App" fallback).
      name: p.name && p.name !== "App" ? p.name : baseExpo.name,
      // Slug MUST match the EAS project behind extra.eas.projectId.
      slug: p.slug || baseExpo.slug,
      version: higherVersion(baseExpo.version, p.version),
      ios: {
        ...baseExpo.ios,
        ...(p.ios && p.ios.buildNumber ? { buildNumber: p.ios.buildNumber } : {}),
      },
      android: {
        ...baseExpo.android,
        ...(p.android && p.android.versionCode ? { versionCode: p.android.versionCode } : {}),
      },
      extra: {
        ...baseExpo.extra,
        ...(p.extra && p.extra.eas ? { eas: p.extra.eas } : {}),
      },
    },
  };
};
