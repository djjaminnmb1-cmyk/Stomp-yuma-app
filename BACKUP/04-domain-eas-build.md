# 04 · Domain, Expo, EAS Build Config

## Domain

- **Preferred production domain**: `https://www.stompingroundyuma.org` (per user, June 2026).
- **DNS registrar**: Owned by you — I don't have access from the container.
- **DNS records to snapshot yourself** (log in to whichever registrar/host your
  domain uses — Cloudflare, Namecheap, Google Domains, GoDaddy, etc. — and export a
  zone file OR screenshot the DNS panel):
  - `A` / `AAAA` for the apex `stompingroundyuma.org`
  - `A` / `AAAA` / `CNAME` for `www.stompingroundyuma.org`
  - `MX` records if you have custom mail
  - `TXT` records (SPF, DKIM, DMARC, domain verification for Firebase / Apple / Search Console)
  - `CAA` records if any
  - `NS` records (in case you ever transfer the domain — the registrar shows these)

The redirects the user is separately asking for (HTTP→HTTPS, non-www→www) will need
to be configured on your DNS/CDN provider once the domain switches over. Both
Cloudflare and most managed hosting providers have a UI for this. See the paused
SEO plan in `06-checklist.md` for the app-layer bits I can wire when work resumes.

## Expo / EAS project configuration

Snapshotted from `frontend/app.config.js`:

- **Expo project name**: `Stompin' Ground Yuma`
- **Slug**: `stompin-ground-yuma`
- **Version**: `1.0.0`
- **Scheme (deep-linking)**: `frontend`
- **New Architecture**: enabled (`newArchEnabled: true`)
- **Runtime version policy**: `appVersion` (each app version pin its own JS runtime — required for EAS Update, currently disabled).
- **`updates.enabled`**: `false` (OTA gated off until Emergent Support provisions managed EAS Update).

### iOS

- **Bundle Identifier**: `com.emergent.stompinyumaapp.uyr5zg`
- **Display name (Home screen)**: `Stompin' Yuma`
- **Supports tablet**: `true`
- **Uses Apple Sign In**: `true`
- **Uses non-exempt encryption**: `false` (App Store won't prompt for compliance).
- **App-queried schemes**: `vnd.youtube`, `youtube`, `instagram`, `fb`, `fbapiauthlogin`, `snssdk1233`, `tiktok`.
- **Privacy usage strings**:
  - `NSPhotoLibraryUsageDescription`: "Upload step-sheet images for dances"
  - `NSPhotoLibraryAddUsageDescription`: "Save step-sheet images to your device"
  - `NSLocationWhenInUseUsageDescription`: "Find line-dance events near you"

### Android

- **Package name**: `com.stompinyuma.app`
- **Adaptive icon foreground**: `./assets/images/adaptive-icon.png`
- **Adaptive icon background**: `#F2A628` (brand amber)
- **Edge-to-edge**: enabled
- **Google Services file**: `./google-services.json` (present in repo).
- **Permissions**: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`.

### Web

- **Bundler**: `metro`
- **Output**: `single` (SPA — one HTML shell for every route, client-side routing).
- **Favicon**: `./assets/images/favicon.png`

### Plugins wired

- `expo-router`
- `expo-notifications`
- `expo-localization`
- `expo-splash-screen` (splash image `./assets/images/splash-image.png`, background `#F2A628`)
- `expo-web-browser`
- `expo-audio`
- `expo-location` (with in-use permission strings)
- `@react-native-community/datetimepicker`
- `expo-build-properties` (pins Android Kotlin to `2.1.20`)
- `./plugins/with-gradle-heap.js` (raises Gradle daemon heap to 4 GiB)

### Native patches

- `patches/expo-updates+29.0.20.patch` — a 1-line diff that changes
  `kotlin("jvm") version("2.0.21")` to `"2.1.20"` inside expo-updates' Gradle
  plugin. Applied at `yarn install` time by `patch-package` (declared in
  `package.json` as `postinstall`).

## What EAS/Emergent Build actually needs to produce IPA / AAB

**Managed by Emergent — request from Emergent Support if you migrate to your own EAS account:**

| Item                                | Where it lives                       | What to ask Emergent for                                    |
| ----------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| iOS Distribution Certificate (.p12) | EAS credentials store                | "Please export the iOS Distribution Certificate + private key for slug `stompin-ground-yuma` so I can move it to my own EAS account." |
| iOS Provisioning Profile             | EAS credentials store                | Same request, plus the provisioning profile.                |
| Push Notification Key (APNs .p8)     | Uploaded to Firebase; also in EAS   | Export the APNs Auth Key .p8 for App ID `com.emergent.stompinyumaapp.uyr5zg`. |
| Android Upload Keystore (.jks)       | EAS credentials store                | "Export the Android upload keystore + password + key alias for package `com.stompinyuma.app`." |
| App Store Connect API Key (.p8)      | Optional, only if auto-submit used   | "Export the App Store Connect API key we're using for automated submissions." |
| Google Play Service Account          | Optional, only if auto-submit used   | "Export the Google Play service-account JSON."              |
| EAS Project ID                       | Empty in `app.config.js` right now  | If you plan to enable OTA via EAS Update, you'll receive an `extra.eas.projectId` and `updates.url` string when Emergent provisions managed OTA. |

**Owned by you directly (no request needed):**

- Apple Developer Program membership — https://developer.apple.com/account
- App Store Connect app record for `com.emergent.stompinyumaapp.uyr5zg`
- Google Play Console app record for `com.stompinyuma.app`
- Firebase project (currently `frontend/google-services.json` shows the project ID)
- Domain registration for `stompingroundyuma.org`

## Firebase project

- Client config file: `/app/frontend/google-services.json` (Android). ID + api_key
  visible in that file — these are **client-side identifiers**, safe by Firebase
  design as long as you keep Firebase Rules restrictive on any Firestore / Realtime
  DB you use. This app only uses Firebase for FCM (push), so there's no data
  storage bucket to secure.
- Missing: `GoogleService-Info.plist` (iOS). Add an iOS app inside the same
  Firebase project → Project Settings → General → "Add app" → iOS → bundle
  ID `com.emergent.stompinyumaapp.uyr5zg` → download the plist → place at
  `frontend/GoogleService-Info.plist`.

## Publish / OTA / build pipeline

- **Publish button (Emergent dashboard)** produces the current preview build. On
  Publish Emergent also builds the iOS/Android artifacts if you provide EAS
  credentials.
- **OTA (over-the-air updates)** is currently **disabled** in `app.config.js`
  (`updates.enabled: false`) because Emergent Support hasn't provisioned managed
  EAS Update for this project yet. Draft support email at
  `/app/memory/emergent_support_email_ota.md` (if present).
