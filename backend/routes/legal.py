"""Public legal pages (privacy, terms) served as self-contained HTML.

Why the BACKEND serves these
----------------------------
Google Play / App Store submission metadata requires a **stable public
URL** for the privacy policy. Frontend Metro-bundled routes work in
preview, but a couple of things make them brittle for store review:

* The Metro dev server can 404 on cold-start until the bundle is ready
  — reviewers get a blank page and reject the submission.
* Preview / production frontend hostnames can rotate; the /api/*
  prefix is guaranteed to route to the same backend regardless.
* Serving legal copy from the backend means it stays reachable even
  if the mobile app itself is not currently deployed.

So we mount these pages under ``/api/legal/*`` — a permanent URL that
survives Emergent redeploys and lands on the same host the mobile
app talks to.

The HTML is intentionally minimal — no CDN dependencies, no external
CSS, no analytics. Everything inlined so the page renders in every
crawler / reviewer environment.
"""
from __future__ import annotations

from fastapi import APIRouter, Response


router = APIRouter(prefix="/legal", tags=["legal"])


# Last-updated timestamp for reviewers. Bump ONLY when the content
# below changes.
_LAST_UPDATED = "June 2026"
_CONTACT = "whereyumalinesuptodance@stompingroundyuma.org"


_HTML_HEAD = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="index, follow"/>
  <title>Privacy Policy · Stompin&#39; Ground Yuma</title>
  <meta name="description" content="Privacy policy for the Stompin&#39; Ground Yuma line-dance mobile app."/>
  <style>
    :root {{
      --bg: #fdf9f1;
      --ink: #2b1d0e;
      --muted: #6b5a44;
      --brand: #b04b1f;
      --card: #ffffff;
      --border: #e6dbc7;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{
      margin: 0; padding: 0;
      background: var(--bg);
      color: var(--ink);
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
    }}
    header {{
      background: var(--brand);
      color: #fff;
      padding: 32px 24px 24px;
      text-align: center;
    }}
    header h1 {{ margin: 0 0 4px; font-size: 22px; letter-spacing: 0.2px; }}
    header p {{ margin: 0; opacity: 0.85; font-size: 14px; }}
    main {{
      max-width: 760px;
      margin: -20px auto 60px;
      padding: 24px 24px 40px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(45, 30, 15, 0.06);
    }}
    .updated {{ color: var(--muted); font-size: 13px; margin-bottom: 20px; }}
    h2 {{ font-size: 17px; margin: 28px 0 8px; color: var(--brand); }}
    p, li {{ margin: 0 0 8px; }}
    ul {{ padding-left: 22px; }}
    b {{ color: var(--ink); }}
    a {{ color: var(--brand); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .footer {{
      color: var(--muted); font-size: 13px; text-align: center;
      margin-top: 32px;
    }}
    .footer a {{ color: var(--muted); text-decoration: underline; }}
  </style>
</head>
<body>
  <header>
    <h1>Privacy Policy</h1>
    <p>Stompin&#39; Ground Yuma</p>
  </header>
  <main>
    <p class="updated">Last updated: {_LAST_UPDATED}</p>
"""


_HTML_BODY = f"""
    <p>
      Stompin&#39; Ground Yuma (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;)
      operates this mobile app to help our line-dance community track dances,
      class attendance, and studio events. This policy explains what we
      collect, why, and the choices you have.
    </p>

    <h2>1. Information we collect</h2>
    <ul>
      <li><b>Account info</b> — name, email, and (if you register with email) an encrypted password hash. We never store your password in plain text.</li>
      <li><b>Google sign-in</b> — if you tap &quot;Continue with Google&quot; we receive your name, email, and public profile picture from Google. We do not receive your Google password.</li>
      <li><b>Sign in with Apple</b> — if you tap &quot;Continue with Apple&quot; Apple returns a stable, anonymised user identifier and (only if you allow it) your name and email. If you choose to hide your email, Apple provides us a relay address; we don&#39;t receive your real one.</li>
      <li><b>App activity</b> — dances you mark as completed or wishlist, classes you attend, dances you suggest, chat messages you post in the instructor chat, activity-feed events and reactions, follow / unfollow actions.</li>
      <li><b>Device push token</b> — if you allow notifications, we store a device push token so we can send reminders and class updates.</li>
      <li><b>Approximate location (opt-in)</b> — only when you tap &quot;Near me&quot; on the <b>Find Events</b> screen. We use it once to compute distances and never store the coordinates on our servers.</li>
      <li><b>Event addresses</b> — if you&#39;re an instructor and post an event, the address you type is stored and geocoded to display events on a map / list. Please only post addresses you have the right to publish.</li>
    </ul>

    <h2>2. How we use it</h2>
    <ul>
      <li>To sign you in and keep your account secure.</li>
      <li>To show your personal dance library, wishlist, and attendance history.</li>
      <li>To let instructors coordinate classes, suggestions, and community chat.</li>
      <li>To power social features — activity feed, reactions, follows, and dancer discovery — so you can cheer on other dancers in the community.</li>
      <li>To send you class reminders and event updates (only if you opted in to notifications).</li>
    </ul>

    <h2>3. Who we share it with</h2>
    <p>We do <b>not</b> sell your data. Your data is only shared with the service providers we rely on to run the app:</p>
    <ul>
      <li><b>Google</b> — only if you sign in with Google, for authentication.</li>
      <li><b>Apple</b> — only if you sign in with Apple, for authentication.</li>
      <li><b>Firebase Cloud Messaging (Google)</b> — your device push token is registered with FCM so we can deliver reminders to Android and iOS.</li>
      <li><b>Email provider (SMTP)</b> — only when you request a password reset.</li>
      <li><b>OpenStreetMap Nominatim</b> — event addresses are sent to Nominatim to obtain map coordinates. We do <b>not</b> send your personal identifiers along with the address.</li>
      <li><b>Third-party step-sheet APIs (CopperKnob, BootStepper)</b> — read-only lookups for dance metadata. We send only the dance title / choreographer, never your identifiers.</li>
    </ul>

    <h2>4. Data retention &amp; deletion</h2>
    <p>You can permanently delete your account and all personal data at any time from inside the app: go to <b>Profile → Delete My Account</b> and confirm. Deleting your account removes your login, tracking, attendance history, suggestions, and chat messages. Content you authored for the community (dances or classes) is preserved but your name is replaced with &quot;Deleted user&quot;.</p>

    <h2>5. Your rights</h2>
    <ul>
      <li>You can view your data at any time inside the app.</li>
      <li>You can correct your name / email from the Profile screen.</li>
      <li>You can delete your account (see section 4).</li>
      <li>You can withdraw notification consent from your device settings.</li>
    </ul>

    <h2>6. Children</h2>
    <p>The app is intended for line dancers of all ages, but children under 13 should only use it with a parent or guardian&#39;s supervision. We do not knowingly collect data from children under 13 without parental involvement. If you believe a child under 13 created an account without permission, <a href="mailto:{_CONTACT}?subject=COPPA%20request">contact us</a> and we&#39;ll remove the account.</p>

    <h2>7. California residents (CCPA)</h2>
    <p>If you live in California you have the right to know what personal information we collect, request a copy, request that we delete it, and not be discriminated against for exercising your rights. We do not sell your personal information. To make a request, email us using the contact link below.</p>

    <h2>8. EU / UK residents (GDPR)</h2>
    <p>If you live in the EU, UK, or European Economic Area, you have the right to access, correct, port, or erase your personal data, and to object to or restrict its processing. Our legal basis for processing is either your consent (e.g. notifications, location) or the performance of our service agreement (your account and tracking data). Email us to exercise any of these rights.</p>

    <h2>9. Security</h2>
    <p>Passwords are hashed with bcrypt. All traffic between the app and our servers is encrypted over HTTPS. Reset tokens expire after 15 minutes. Administrative access is restricted by JWT-based session tokens with password-version revocation.</p>

    <h2>10. DMCA / Copyright takedown</h2>
    <p>The Stompin&#39; Ground Yuma dance directory links to third-party step sheets hosted on services such as CopperKnob and BootStepper. If you own a step sheet or other content that appears in the app without permission, <a href="mailto:{_CONTACT}?subject=DMCA%20takedown">email us</a> with a description of the work, where it appears, and your contact details. We&#39;ll remove valid takedown requests within a reasonable time.</p>

    <h2>11. Contact us</h2>
    <p>Questions or requests? Email us at <a href="mailto:{_CONTACT}">{_CONTACT}</a> and we&#39;ll get back to you.</p>

    <p class="footer">
      Stompin&#39; Ground Yuma · Yuma, Arizona
    </p>
"""


_HTML_FOOT = """
  </main>
</body>
</html>
"""


_PRIVACY_HTML = _HTML_HEAD + _HTML_BODY + _HTML_FOOT


@router.get("/privacy", response_class=Response)
async def privacy_policy() -> Response:
    """Return the privacy policy as a full HTML page.

    Cache-Control: public, max-age=3600 — reviewers may hit this
    repeatedly during app review. An hour of edge caching keeps our
    egress bill sane while still allowing hot-fixes to propagate.
    """
    return Response(
        content=_PRIVACY_HTML,
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600",
            # Explicit content-security header keeps Chromium's
            # dev-tools happy for reviewers who open the URL directly.
            "X-Content-Type-Options": "nosniff",
            # Never allow the page to be framed by a third-party — the
            # store may render our policy inside a WKWebView but we
            # want to be explicit that we don't host in an iframe.
            "X-Frame-Options": "SAMEORIGIN",
        },
    )
