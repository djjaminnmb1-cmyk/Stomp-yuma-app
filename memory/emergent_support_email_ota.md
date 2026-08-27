# Emergent Support Email — Request Managed OTA / EAS Update

**Send to:** `support@emergent.sh`
**Subject:** Managed OTA / EAS Update for `stompin-yuma-app`
**Include from Emergent editor:** your Job ID (top-right info panel)

---

## Email body (copy/paste)

Hi Emergent Support,

I'm building a React Native / Expo mobile app on Emergent and I'd like to
enable **managed OTA (Over-The-Air JavaScript updates via `expo-updates` /
EAS Update)** for my production app.

**Project details**
- Project slug: **`stompin-yuma-app`**
- Production URL: https://stompin-yuma-app.emergent.host
- App name: **Stompin' Ground Yuma**
- iOS bundle ID: `com.emergent.stompinyumaapp.uyr5zg`
- Android package: `com.stompinyuma.app`
- App version: `1.0.0`
- Emergent Job ID: <PASTE FROM TOP-RIGHT INFO PANEL>

**What I need**
1. Confirmation that managed OTA / EAS Update is available for my app on
   Emergent (I understand I shouldn't create my own Expo account per your
   guidance).
2. The real values I should put in my `app.json` for:
   - `expo.updates.url` (currently a placeholder)
   - `expo.extra.eas.projectId` (currently a placeholder)
3. The channel / branch naming convention Emergent uses for
   production vs preview (e.g. `production` vs `preview`).
4. The workflow for actually pushing an OTA update once configured —
   is it triggered by Publish, or do I need a separate command?
5. Whether `runtimeVersion: { policy: "appVersion" }` works with your
   managed builds, or if you recommend a specific value.

**Why**
I need to be able to ship JavaScript bug fixes and small feature updates
to production users without going through App Store review each time.
My current `app.json` has `updates.enabled: false` because the placeholder
values I had were causing silent update-check failures.

Happy to jump on a call or provide more info if useful. Thanks!

---

## Current app.json OTA config (for reference)

```json
"runtimeVersion": { "policy": "appVersion" },
"updates": {
  "enabled": false,
  "checkAutomatically": "NEVER",
  "fallbackToCacheTimeout": 0,
  "useEmbeddedUpdate": true
}
```

## Once Emergent replies

1. Update `frontend/app.json`:
   - `updates.enabled: true`
   - `updates.url: "<value from Emergent>"`
   - Add back `extra.eas.projectId: "<value from Emergent>"`
2. Flip `OTA_ENABLED = true` in
   `frontend/src/hooks/useOTAUpdates.ts`.
3. Replace `CurrentVersionRow` on Profile with the old
   `CheckForUpdatesRow` (git history has it).
4. Redeploy production (Publish) so the native binary embeds the new
   updates URL — after that, JS-only fixes can ship via
   whatever OTA push workflow Emergent documents in their reply.
