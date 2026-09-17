"""Pydantic request/response models used across routes.

Grouped in one module because they're small and heavily cross-referenced;
splitting them per-resource added imports with little payoff. If any group
grows large we can promote it to its own file.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------- Auth ----------------
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_admin: bool = False
    is_instructor: bool = False
    auth_provider: str = "email"


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    # Self-serve instructor role at signup, if code matches server's INSTRUCTOR_CODE.
    instructor_code: Optional[str] = None


class SetInstructorIn(BaseModel):
    instructor_code: str  # server checks against INSTRUCTOR_CODE env


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str


class AppleSignInIn(BaseModel):
    """Body sent by the mobile client after a native Apple sign-in.

    ``identity_token`` is the Apple-signed JWT — always required.
    ``full_name`` and ``email`` are ONLY populated on the very first
    sign-in (Apple's docs are explicit about this). We persist them
    only when the token is otherwise valid.

    ``authorization_code`` is Apple's one-shot server-side code from
    ``AppleAuthentication.signInAsync`` — the ONLY way to obtain a
    refresh token which we later use to satisfy App Store 5.1.1(v)
    (token revocation on account deletion). Optional so older client
    builds keep working, but new builds MUST forward it.
    """

    identity_token: str
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    authorization_code: Optional[str] = None


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


# ---------------- Dance ----------------
class DanceIn(BaseModel):
    name: str
    choreographer: str
    choreographer_country: Optional[str] = ""
    song: str
    artist: Optional[str] = ""
    difficulty: str  # Beginner / Improver / Intermediate / Advanced
    bpm: Optional[int] = None
    count: Optional[str] = None  # e.g. "32 count, 4 wall"
    youtube_url: Optional[str] = ""
    step_sheet: Optional[str] = ""
    step_sheet_image: Optional[str] = ""  # base64 data URL
    description: Optional[str] = ""
    tags: Optional[List[str]] = []
    is_published: Optional[bool] = None  # None = keep existing / creation default
    # Direct step-sheet URLs. When set, override the search-page
    # fallback so tapping "CopperKnob" / "BootStepper" opens the exact
    # dance-by-choreographer instead of a search results page.
    copperknob_url: Optional[str] = ""
    bootstepper_url: Optional[str] = ""
    # CopperKnob API reference (stable ID like ``XCZW7BV``) when the
    # dance was imported from — or linked to — a CopperKnob record.
    # Nullable so existing listings continue to validate cleanly.
    copperknob_ref: Optional[str] = ""
    # BootStepper API reference (opaque stable ID like
    # ``D36J5F44H3GB38N``). A single dance MAY carry BOTH refs at
    # once — the two integrations coexist and never overwrite each
    # other's fields.
    bootstepper_ref: Optional[str] = ""


class DanceImportRow(BaseModel):
    name: str
    choreographer: Optional[str] = ""
    song: Optional[str] = ""
    artist: Optional[str] = ""
    difficulty: Optional[str] = "Beginner"
    bpm: Optional[int] = None
    count: Optional[str] = ""
    youtube_url: Optional[str] = ""
    step_sheet: Optional[str] = ""
    copperknob_url: Optional[str] = ""
    bootstepper_url: Optional[str] = ""


class DanceImportBody(BaseModel):
    dances: List[DanceImportRow]
    publish_all: bool = False


class DanceOut(DanceIn):
    id: str
    created_at: str


# ---------------- Tracking ----------------
class TrackingIn(BaseModel):
    status: str  # completed | wishlist
    rating: Optional[int] = 0  # 0..5
    notes: Optional[str] = ""


class TrackingOut(BaseModel):
    dance_id: str
    status: str
    rating: int
    notes: str
    updated_at: str


# ---------------- Classes ----------------
class ClassSessionIn(BaseModel):
    date: str  # YYYY-MM-DD
    session_label: Optional[str] = ""  # e.g. "Friday Night", "Beginner Class"
    dance_ids: List[str] = []
    notes: Optional[str] = ""
    flyer_image: Optional[str] = ""  # base64 data URL, senior instructors only
    # NEW — optional address so classes can appear in the geo-events search.
    # Instructor can leave every field blank on existing classes; new saves
    # geocode via services.geocoding into a GeoJSON Point on write.
    venue_name: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    country: Optional[str] = "US"


# ---------------- Events ----------------
# Events are one-off (or scheduled-out) happenings that instructors post
# for the community to discover: workshops, socials, guest-teacher nights,
# out-of-town line-dance gatherings. Different from ``classes`` which are
# the recurring studio-attendance rows the app was originally built on.
EVENT_TYPES = (
    "class",
    "workshop",
    "social",
    "private_party",
)
EVENT_SKILL_LEVELS = (
    "All levels",
    "Absolute Beginner",
    "Beginner",
    "Improver",
    "High Improver",
    "Intermediate",
    "Advanced",
)


class EventIn(BaseModel):
    name: str
    description: Optional[str] = ""
    event_type: str = "workshop"  # one of EVENT_TYPES
    skill_level: Optional[str] = "All levels"  # one of EVENT_SKILL_LEVELS
    date: str  # YYYY-MM-DD — start / single-day
    end_date: Optional[str] = ""  # YYYY-MM-DD; when set, must be >= date
    start_time: Optional[str] = ""  # "19:30"
    end_time: Optional[str] = ""    # "21:30"
    # --- Location (required for creating a searchable event) ---
    venue_name: Optional[str] = ""
    address: str
    city: str
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    country: Optional[str] = "US"
    # --- Extra optional details ---
    cover_image: Optional[str] = ""      # base64 data URL or public URL
    price: Optional[str] = ""            # free-form ("$15", "$20 at door")
    registration_url: Optional[str] = ""  # external RSVP link
    max_attendees: Optional[int] = None
    is_published: Optional[bool] = True


# ---------------- Push ----------------
class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


# ---------------- Chat ----------------
class ChatMessageIn(BaseModel):
    message: str
    # Optional ID of the message this one is replying to. When set, the
    # reply carries a compact ``parent`` summary on GET so the UI can
    # render the "replying to X" strip above the bubble. Ignored (with
    # a soft warning) if the parent doesn't exist or is by a blocked
    # user — the reply still goes through as a standalone message.
    parent_id: Optional[str] = None


# ---------------- Suggestions ----------------
class SuggestionIn(BaseModel):
    dance_name: str
    song: Optional[str] = ""
    artist: Optional[str] = ""
    difficulty: Optional[str] = ""
    youtube_url: Optional[str] = ""
    # Direct URL to the choreographer's official step sheet (CopperKnob,
    # BootStepper, choreographer's own site, etc.). We do not host copies.
    step_sheet_url: Optional[str] = ""
    # Optional user-uploaded photo of the step sheet, base64 data URL.
    # The user must confirm it's the choreographer's official sheet.
    step_sheet_image: Optional[str] = ""
    notes: Optional[str] = ""
    # Optional — route this suggestion to a specific instructor. When
    # omitted the server falls back to the user's ``main_instructor_id``
    # (chosen once in the picker) or, as a last resort, the SGY admin
    # inbox so nothing gets lost.
    target_instructor_id: Optional[str] = ""


class MainInstructorBody(BaseModel):
    instructor_id: str


class InstructorSelectionBody(BaseModel):
    """Atomic update of the caller's picked instructors.

    - ``instructor_ids`` — full set of instructors the dancer has
      selected. Empty list clears everything.
    - ``main_instructor_id`` — optional. Must be a member of
      ``instructor_ids`` (or empty). When omitted, the server keeps the
      existing main if still valid, else auto-promotes the first item.
    - ``follow`` — when true, the server upserts follow rows for every
      selected instructor (never removes existing follows on save).
    """

    instructor_ids: List[str] = []
    main_instructor_id: Optional[str] = None
    follow: bool = True


# ---------------- Leaderboard ----------------
class LeaderboardOptInBody(BaseModel):
    show_on_leaderboard: bool


# ---------------- User preferences ----------------
class PreferredLanguageIn(BaseModel):
    """Language override the mobile client sends when the user picks
    a language in the onboarding modal / settings toggle.

    Empty string is legal — means "clear my override, follow the
    device locale" (mirrors the semantics the UI uses).
    """

    language: str = Field(
        ...,
        max_length=8,
        description="BCP-47 short code — 'en', 'es', 'fr', or '' to reset.",
    )
