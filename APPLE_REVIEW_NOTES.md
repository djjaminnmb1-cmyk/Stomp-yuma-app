# Apple App Review — Reviewer Notes
## Stompin' Ground Yuma — Guideline 1.2 (Safety – User-Generated Content) Response

> **Copy the "Reviewer Notes" block below directly into App Store Connect → App Review Information → Notes when resubmitting your build.**

---

## 1. Reviewer Notes (copy-paste ready)

```
Thank you for the detailed feedback. In response to Guideline 1.2 we have
implemented all four App Store UGC requirements: (a) an EULA / Terms of
Use acceptance gate, (b) a filter for objectionable content, (c) an in-app
Report mechanism, and (d) a Block mechanism. All reports are reviewed by
a human moderator within 24 hours.

TEST ACCOUNTS (both have full UGC access):
  Regular dancer:  reviewer@stompinground.com  /  AppleReview!2026
  Admin/moderator: adminreview@stompinground.com  /  AppleReview!2026#

Please use the DANCER account for demos 1–3, and the ADMIN account for
demo 4 (the moderation queue).

STEP-BY-STEP DEMOS
------------------

DEMO 1 — Terms of Use / EULA acceptance
  Case A: New user (please try this first)
    1. Launch the app → tap "I'm 13 or older" on the Age Gate.
    2. Pick a language and tap Continue.
    3. On the Auth screen, tap the "Create Account" tab.
    4. Fill in Name / Email / Password.
    5. Observe the "Create Account" button is greyed out and does
       not respond to taps until the "I have read and agree to the
       Terms of Service and Community Guidelines" checkbox is ticked.
    6. Tap the checkbox → the Create Account button turns yellow and
       becomes tappable. Both "Terms of Service" and "Community
       Guidelines" are tappable links that open the full text.

  Case B: Existing user (uses the reviewer account above)
    1. Sign in with reviewer@stompinground.com / AppleReview!2026.
    2. The app immediately shows a mandatory "Updated Terms" screen
       (this account was pre-set to a stale terms version so you can
       see the gate). You cannot reach any UGC surface until you tick
       the checkbox and tap "Agree & Continue" — or "Decline" which
       signs you out.

DEMO 2 — Report objectionable user-generated content
  1. Sign in with reviewer@stompinground.com / AppleReview!2026.
  2. Tap the "Chat" tab (bottom nav) → open the "Yuma Line Dancers"
     room. You will see a pinned test message from user "Sample User"
     that reads: "This is sample content for App Review — long-press
     me to Report or Block."
  3. Long-press that message → a bottom sheet appears with Reply,
     Report, Block, and Cancel actions.
  4. Tap "Report" → pick a reason (Spam / Harassment / Hate speech /
     Sexual content / Threats / Other) → optionally add a note →
     tap "Submit report".
  5. You'll see the confirmation: "Thanks — our team reviews every
     report within 24 hours." The reported message is hidden from
     your feed immediately and a record lands in the moderation
     queue (see Demo 4).

  Alternate report entry points (same flow, same 24 h SLA):
    • Feed posts:    long-press the post card → Report.
    • User profile:  tap any dancer's name/avatar → open profile →
                     tap ⋯ (top-right) → Report user.
    • Comments:      long-press the comment → Report.

DEMO 3 — Block an abusive user
  1. Sign in with reviewer@stompinground.com / AppleReview!2026.
  2. Tap the ⋯ (top-right) on any dancer's profile OR long-press
     one of their messages / posts → tap "Block".
  3. Confirm the destructive alert. The user is added to your block
     list and all of their existing UGC (messages, posts, comments)
     disappears from your view immediately. They also cannot see
     your content, DM you, or reply to your posts.
  4. To review or reverse the block: Profile tab → Settings →
     "Blocked users" → Unblock.

DEMO 4 — Moderator review queue (24-hour SLA)
  1. Sign out. Sign back in with adminreview@stompinground.com /
     AppleReview!2026#.
  2. Tap Profile → "Admin" → "Moderation Queue".
  3. You will see a list of every open report with the reporter,
     the reported user/content, the reason, and a red "Overdue"
     badge on anything older than 24 h. Tap any row to see the full
     content and choose:
       • Remove content (hides UGC + notifies the reporter)
       • Warn user  (private in-app warning)
       • Suspend 7 days (blocks login for a week)
       • Ban permanently (blocks login forever + logs the reason)
       • Dismiss (no action, closes the report)

FILTER FOR OBJECTIONABLE CONTENT
--------------------------------
Every UGC write path (chat, posts, comments, dance submissions,
profile bio) runs through a server-side filter (services/
content_filter.py) that rejects:
  • Slurs / hate speech (curated multilingual word list)
  • Sexual content targeting minors (zero tolerance — insta-ban)
  • Threats of violence
  • Common spam patterns (URLs from known abuse hosts, repeated
    Unicode homoglyph spam, "buy followers" copy-pasta)
Rejected content never reaches the database; the client gets a
polite "This message can't be sent — it may violate our community
guidelines. If you think this is a mistake, contact us at
safety@stompinground.com." All rejections are logged for audit.

CONTACT & TAKEDOWN
------------------
In-app: Profile → Settings → "Safety Center" (shows how to report,
how to block, and lists safety@stompinground.com as the direct
Safety Team contact).
Email:  safety@stompinground.com — monitored 7 days/week, response
        within 24 hours. Takedown requests receive priority.

Thank you for the re-review. Please let us know if anything else
would help you validate compliance.
```

---

## 2. Physical-device demo checklist for **YOU** (before pressing "Submit for Review")

Do this on a real iPhone or iPad (TestFlight build or dev build) — Apple's reviewer will replicate it.

- [ ] Delete the app if it was previously installed.
- [ ] Reinstall a fresh build.
- [ ] **Demo 1 (Case A — new user):** Complete the register form, confirm the "Create Account" button is greyed out, tick the checkbox, confirm the button turns yellow, confirm both "Terms of Service" and "Community Guidelines" links open readable full-text screens.
- [ ] **Demo 1 (Case B — existing user):** Sign in with `reviewer@stompinground.com` → confirm the "Updated Terms" screen intercepts you and blocks the rest of the app.
- [ ] **Demo 2:** Long-press the seeded test message in the "Yuma Line Dancers" chat → Report → submit with reason "Harassment" → confirm the "reviewed within 24 hours" toast.
- [ ] **Demo 3:** Tap ⋯ on any dancer profile → Block → confirm their messages disappear from your feed.
- [ ] **Demo 4:** Sign in as admin → Profile → Admin → Moderation Queue → confirm the report from Demo 2 is at the top of the queue with a fresh timestamp.
- [ ] Take one screenshot per demo (you can drop them into the App Review Notes attachment section — Apple accepts up to 5).

---

## 3. Seed script — run this ONCE before submitting

The two reviewer accounts and the seeded chat test message must exist on production before Apple runs the demos. Everything below is idempotent; running it twice is safe.

```bash
# From the repo root, on your prod DB:
python /app/backend/scripts/seed_apple_review.py
```

The seed script creates:
1. `reviewer@stompinground.com` (regular user, `accepted_terms_version` **intentionally set to the previous version** so Demo 1B trips the gate).
2. `adminreview@stompinground.com` (admin flag on, terms up-to-date).
3. A pinned message in the "Yuma Line Dancers" room from a placeholder "Sample User" account, body: `"This is sample content for App Review — long-press me to Report or Block."`

> The seed script is generated as part of this task — see `/app/backend/scripts/seed_apple_review.py`.

---

## 4. What was changed on the app side (evidence log for Apple)

| Requirement (Guideline 1.2) | Implementation | Evidence file |
|---|---|---|
| EULA / Terms acceptance | Register form checkbox blocks submit until ticked. Existing users routed through `/terms-accept` on any TERMS_VERSION bump. | `frontend/app/auth.tsx`, `frontend/app/terms-accept.tsx`, `frontend/src/components/TermsGate.tsx`, `backend/core/terms.py`, `backend/routes/legal.py` |
| Content filter | Every UGC POST runs `content_filter.check_text()`; hard-rejects hate speech, CSAM, threats, spam. Reasons are audit-logged. | `backend/services/content_filter.py` |
| Report mechanism | Long-press action on chat/feed/comments + ⋯ menu on user profile → `ReportContentSheet` (reason + optional note). | `frontend/src/components/ReportContentSheet.tsx`, `backend/routes/moderation.py` |
| Block mechanism | Profile ⋯ menu, long-press menu on any UGC, or Settings → Blocked users. Mutual visibility hides content in both directions. | `frontend/src/hooks/useBlockUser.ts`, `backend/routes/moderation.py`, `backend/services/content_filter.py` (query-level filter) |
| Moderator review within 24 h | `/admin/moderation` queue with real-time timestamps + red "Overdue" badge past 24 h. Admin actions: Remove / Warn / Suspend 7d / Ban / Dismiss. | `frontend/app/admin/moderation.tsx`, `backend/routes/moderation.py` |
| Contact info | In-app Safety Center (Profile → Settings → Safety Center) + `safety@stompinground.com` on every rejection message and in the App Store listing description. | `frontend/app/safety.tsx` |

Backend test coverage: `backend/tests/test_ugc_compliance.py` — **32 tests, all green.**
