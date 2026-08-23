# Sign in with Apple — Testing Playbook

Sign in with Apple is a **native-only** feature. The Apple button will
not render on Android or the web preview — that is by design and Apple
policy.

## Where the button appears
- `/auth` screen (Sign In and Create Account modes), directly above the
  Google button, only when `Platform.OS === "ios"` **and**
  `AppleAuthentication.isAvailableAsync()` returns true.

## Before you test on a real device
1. Sign in to <https://developer.apple.com/account/resources/identifiers/list>
2. Under **Identifiers → App IDs**, find (or create) the App ID that
   matches `com.emergent.stompinyumaapp.uyr5zg`.
3. Enable the **Sign In with Apple** capability. Save.
4. Trigger a fresh build from the Emergent deploy panel — Sign in with
   Apple requires a native module and will not run in Expo Go on iOS
   16+ builds.

## Backend env
`backend/.env` must contain:
```
APPLE_AUDIENCES="com.emergent.stompinyumaapp.uyr5zg,host.exp.Exponent"
```
Add every bundle id you plan to test with. Missing / wrong value is the
#1 cause of 401 responses from `/api/auth/apple`.

## Manual test cases

| # | Action | Expected |
|---|--------|----------|
| 1 | On iOS device, open the app fresh, dismiss age gate, tap **Sign in with Apple** | Native Apple sheet opens showing your Apple ID |
| 2 | Complete the sheet, allow FULL_NAME + EMAIL | Land on Home tab, greeted with your Apple name |
| 3 | Sign out from Profile, tap **Sign in with Apple** again | Sign-in completes without prompting for name — token no longer carries `email` / `fullName`, backend re-uses the stored account |
| 4 | Open the same account by tapping the Sign In tab (email/password) using the same email | Backend links the existing Apple `sub` to the account; no duplicate row |
| 5 | Use **Hide My Email** on the Apple sheet | Account is created keyed on `apple_sub`, `email` is the `@privaterelay.appleid.com` alias |
| 6 | Kill the app and re-open | Auto-login via cached JWT, no Apple sheet |
| 7 | Toggle airplane mode after tapping the Apple button | The Apple sheet still opens; when the network request to `/api/auth/apple` fails the on-screen error toast surfaces without crashing |
| 8 | Cancel the Apple sheet with the X button | No error toast, no state change (silent cancel path) |

## Curl smoke test (server-side only)

```bash
# The server can't mint a real Apple JWT, but we can verify the endpoint
# rejects a bogus one with 401 + a clear message.
curl -s -X POST "$EXPO_BACKEND_URL/api/auth/apple" \
  -H "Content-Type: application/json" \
  -d '{"identity_token":"not.a.jwt"}' | jq
# Expect: {"detail":"Malformed token: ..."}
```

## Common failure modes
- `Apple token audience mismatch` → `APPLE_AUDIENCES` doesn't include
  the bundle id in the token. Add it, redeploy the backend, retry.
- `Apple token expired` → device clock skew. Sync device time.
- `Unknown signing key` → Apple rotated JWKS; the in-memory cache
  auto-refreshes on the next request. Retry once.
