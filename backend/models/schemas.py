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
    """

    identity_token: str
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


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
