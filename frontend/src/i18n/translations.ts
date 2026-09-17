/**
 * Client-side translation catalog.
 *
 * Keys follow ``area.thing.description`` so the flat map stays scannable
 * as we add more strings. English is the source-of-truth; missing
 * translations transparently fall back to English via i18n-js's
 * ``defaultLocale`` mechanism.
 *
 * Only strings that are STATIC in the app live here — user content
 * (dance names, chat, choreographers) stays in whatever language the
 * user typed it in.
 *
 * When you add a new key, add it to ALL EIGHT locales; the missing-
 * translations helper below only fires in dev and complains loudly.
 *
 * ── CJK NOTE ───────────────────────────────────────────────────
 * React Native falls back to the OS's system font family whenever a
 * glyph isn't found in the current typeface. That means our custom
 * ``Rye`` display font (only used on the login hero title, which we
 * treat as brand and never translate) does NOT bottleneck CJK
 * rendering — every non-brand ``<Text>`` uses the platform default
 * (PingFang SC/TC on iOS, Noto Sans CJK on Android, both of which
 * ship with the OS since ~2015). Do not add ``fontFamily`` to
 * translated text.
 * ─────────────────────────────────────────────────────────────
 */
export type Locale =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "nl"
  | "ko"
  | "zh-Hans"
  | "zh-Hant";

export const SUPPORTED_LOCALES: Locale[] = [
  "en",
  "es",
  "fr",
  "de",
  "nl",
  "ko",
  "zh-Hans",
  "zh-Hant",
];

// Label rendered in the picker + settings screen. Kept in the
// language's own script so a Korean user recognises their option
// even when the surrounding UI is still in English on first launch.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  nl: "Nederlands",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

// Fallback locale used by i18n-js when a key is missing.
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Locales whose bulk translations were machine-drafted and would
 * benefit from a pass by a fluent speaker before store release.
 *
 * We surface this array (never used at runtime) so QA can produce a
 * simple "still-needs-review" report:
 *
 *   ``import { LOCALES_NEEDING_NATIVE_REVIEW } from "@/src/i18n/translations";``
 *
 * Once a locale gets a native review, drop it from this list.
 */
export const LOCALES_NEEDING_NATIVE_REVIEW: Locale[] = [
  "ko",
  "zh-Hans",
  "zh-Hant",
];

export const translations: Record<Locale, Record<string, string>> = {
  en: {
    // ---------- Onboarding language picker ----------
    "onboarding.language.title": "Choose your language",
    "onboarding.language.subtitle":
      "You can change this any time in Profile → Settings.",
    "onboarding.language.continue": "Continue",
    "onboarding.language.system_default": "System default",

    // ---------- Age gate modal ----------
    "age_gate.hero_title": "Age check",
    "age_gate.hero_sub": "Grab your boots — a quick step first.",
    "age_gate.title_line1":
      "To use Stompin' Ground Yuma you must be at least",
    "age_gate.title_years": "13 years old",
    "age_gate.body_copy":
      "Younger dancers are welcome on the floor with a parent or guardian — just have them create the account.",
    "age_gate.adult_button": "I'm 13 or older",
    "age_gate.child_button": "I'm under 13",
    "age_gate.legal":
      "By tapping {emph} you agree to our {terms} and {privacy}.",
    "age_gate.legal_emph": "I'm 13 or older",
    "age_gate.under13_title": "Ask a grown-up to sign in.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma is for dancers 13+. If you're under 13, please have a parent or guardian create the account and sign you in — they can bring you to class and you can dance together in person any time!",
    "age_gate.back": "Back",

    // ---------- Tabs ----------
    "tabs.home": "Home",
    "tabs.dances": "Dances",
    "tabs.my_dances": "My Dances",
    "tabs.instructor": "Instructor",
    "tabs.profile": "Profile",

    // ---------- Auth screen ----------
    "auth.tab_signin": "Sign In",
    "auth.tab_signup": "Create Account",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.name": "Full name",
    "auth.instructor_toggle": "I am an instructor",
    "auth.instructor_toggle_sub": "Requires the studio access code",
    "auth.instructor_code": "Instructor access code",
    "auth.signin_button": "Sign In",
    "auth.signup_button": "Create Account",
    "auth.continue_with_google": "Continue with Google",
    "auth.or": "or",
    "auth.forgot_password": "Forgot password?",
    "auth.legal_signin": "By continuing you agree to our {terms} and {privacy}.",
    "auth.legal_signup":
      "By creating an account you agree to our {terms} and {privacy}, and acknowledge that line dancing is a physical activity you take part in at your own risk.",
    "auth.terms": "Terms",
    "auth.terms_of_service": "Terms of Service",
    "auth.privacy_policy": "Privacy Policy",
    "auth.error_fill_all": "Fill all fields",
    "auth.error_enter_code": "Please enter your instructor access code",
    "auth.error_generic": "Something went wrong",
    "auth.error_google_no_session": "No session returned",
    "auth.error_google_not_configured":
      "Google sign-in isn't configured for this build.",
    "auth.error_google_failed": "Google sign-in failed",
    "auth.account_created_title": "Account created",
    "auth.account_created_msg":
      "The instructor access code didn't match, so you're signed in as a regular member. You can try again anytime from Profile → Switch to instructor profile.",
    "auth.show_password": "Show password",
    "auth.hide_password": "Hide password",

    // ---------- Welcome screen ----------
    "welcome.greeting": "Welcome, {name}!",
    "welcome.subtitle": "Let's get dancing 🥾",
    "welcome.default_name": "friend",

    // ---------- Common actions ----------
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.done": "Done",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.back": "Back",
    "common.close": "Close",
    "common.retry": "Try again",
    "common.loading": "Loading…",
    "common.ok": "OK",
    "common.yes": "Yes",
    "common.no": "No",
    "common.confirm": "Confirm",
    "common.share": "Share",
    "common.follow": "Follow",
    "common.unfollow": "Unfollow",
    "common.following": "Following",
    "common.search": "Search",
    "common.see_all": "See all",
    "common.error": "Error",
    "common.new": "New",
    "common.publish": "Publish",
    "common.unpublish": "Unpublish",
    "common.published": "Published",
    "common.draft": "Draft",
    "common.upload": "Upload",
    "common.remove": "Remove",
    "common.next": "Next",
    "common.skip": "Skip",
    "common.open_settings": "Open Settings",
    "common.permission_needed": "Permission needed",

    // ---------- Home tab ----------
    "home.hello": "Howdy, {name}!",
    "home.hello_no_name": "Howdy!",
    "home.subhello": "Ready to boot-scoot?",
    "home.browse_cta": "Start Browsing Dances",
    "home.achievements_title": "Achievements",
    "home.achievements_sub_unseen": "You unlocked {count} new badges!",
    "home.achievements_sub_unseen_one": "You unlocked 1 new badge!",
    "home.achievements_sub_default": "Track your badges & practice streak.",
    "home.community_activity": "Community Activity",
    "home.feed_empty_title": "Follow other dancers",
    "home.feed_empty_sub":
      "Their completions, badges, and streaks will show up here.",
    "home.fresh_on_floor": "Fresh on the Floor",
    "home.recently_practiced": "Recently Practiced",
    "home.pick_up": "Pick up where you left off",
    "home.leaderboard_title": "Boot Scoot Board",
    "home.leaderboard_default_sub": "See who's topping the floor — join in.",
    "home.events_title": "Find Events Near You",
    "home.events_sub":
      "Workshops, socials, and classes wherever your boots land.",
    "home.classes_title": "Recent Class Recap",
    "home.classes_sub": "See which dances were taught in recent classes.",
    "home.suggest_title": "Suggest a Dance",
    "home.suggest_title_for": "Suggest a Dance for {name}",
    "home.suggest_sub_default":
      "Pick your main instructor and send them your ideas.",
    "home.suggest_sub_for": "Got an idea? Send it to {name}.",
    "home.about_title": "About the Venue",
    "home.about_text":
      "Stompin' Ground Yuma is a friendly community where dancers of every age and skill level come together to learn, laugh, and boot-scoot the night away. Grab your boots and let's dance.",
    "home.icon_all_ages": "All ages",
    "home.icon_beginners": "Beginners welcome",
    "home.icon_family": "Family friendly",
    "home.website_cta": "Visit stompingroundyuma.org",

    // ---------- Library tab ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "Line dance library",
    "library.search_placeholder":
      "Search name, song, artist, choreographer",
    "library.diff_all": "All",
    "library.diff_absolute_beginner": "Absolute Beginner",
    "library.diff_beginner": "Beginner",
    "library.diff_improver": "Improver",
    "library.diff_high_improver": "High Improver",
    "library.diff_intermediate": "Intermediate",
    "library.diff_advanced": "Advanced",
    "library.empty_none": "No dances match these filters.",
    "library.reset_filters": "Reset filters",
    "library.cant_find": "Can't find what you're looking for?",
    "library.external_cta": "Search CopperKnob + BootStepper",
    "library.external_cta_q": 'Search CopperKnob + BootStepper for "{q}"',
    "library.single_dir": "Or browse a single directory",
    "library.popular_copperknob": "Popular on CopperKnob",
    "library.popular_bootstepper": "Popular on BootStepper",
    "library.by": "By {name}",
    "library.unknown": "Unknown",
    "library.source_badge": "Dance Library",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances tab ----------
    "my_dances.title": "My Tracker",
    "my_dances.subtitle": "Keep tabs on your line dance journey",
    "my_dances.tab_completed": "Completed ({count})",
    "my_dances.tab_wishlist": "Wishlist ({count})",
    "my_dances.empty_completed_title": "No dances completed yet",
    "my_dances.empty_wishlist_title": "Wishlist is empty",
    "my_dances.empty_text": "Head to the Library to find your next challenge!",
    "my_dances.browse_dances": "Browse Dances",
    "my_dances.cert_error_title": "Couldn't download certificate",
    "my_dances.cert_download_label": "Download certificate",
    "my_dances.cert_download_hint":
      "Downloads a PDF certificate for this completed dance.",

    // ---------- Instructor tab ----------
    "instructor.title": "Instructor",
    "instructor.subtitle": "Dances · Classes · Events · Chat",
    "instructor.only": "Instructors only.",
    "instructor.new": "New",
    "instructor.csv": "CSV",
    "instructor.restore": "Restore",
    "instructor.tab_dances": "Dances",
    "instructor.tab_classes": "Classes",
    "instructor.tab_events": "Events",
    "instructor.tab_chat": "Chat",
    "instructor.legend_new_dance":
      "New dances start as **Drafts** — only you can see them. Tap **Publish** to share with everyone in the app.",
    "instructor.no_dances":
      'No dances yet. Tap "+ New" to upload a dance with its step sheet, or log a class in the Classes tab.',
    "instructor.no_classes_yet": "You haven't logged any classes yet.",
    "instructor.go_to_classes": "Go to Classes",
    "instructor.class_session_default": "Class session",
    "instructor.dance_count": "{count} dances · {names}",
    "instructor.dance_count_one": "1 dance · {names}",
    "instructor.pill_sheet": "Sheet",
    "instructor.pill_no_sheet": "No sheet",
    "instructor.pill_published": "Published",
    "instructor.pill_draft": "Draft",
    "instructor.edit_sheet": "Sheet",
    "instructor.chat_lounge_hello": "Instructor lounge — say hi 👋",
    "instructor.chat_placeholder":
      "Message the instructors… (tag with @name)",
    "instructor.events_your_events": "Your events",
    "instructor.events_hero_sub":
      "Workshops, socials, and pop-up nights you're hosting.",
    "instructor.events_add_new": "Add a new event",
    "instructor.events_browse_all": "Browse all",
    "instructor.events_empty_title": "No events yet",
    "instructor.events_empty_sub":
      "Post your next workshop, social, or private party so dancers can find it in the app.",
    "instructor.events_upcoming": "Upcoming",
    "instructor.events_past": "Past",
    "instructor.event_delete_title": "Delete this event?",
    "instructor.event_delete_msg": '"{name}" — this can\'t be undone.',
    "instructor.event_delete_error": "Couldn't delete",
    "instructor.step_sheet_title": "Step Sheet",
    "instructor.new_dance_title": "New Dance + Step Sheet",
    "instructor.import_title": "Import from CSV",
    "instructor.import_sub": "Bulk-add dances to the library",
    "instructor.upload_image": "Upload image",
    "instructor.text_notation": "Text notation",
    "instructor.image_label": "Image (PNG/JPG)",
    "instructor.step_sheet_image": "Step sheet image",
    "instructor.step_sheet_text": "Step sheet text",
    "instructor.save_step_sheet": "Save Step Sheet",
    "instructor.dance_name": "Dance name *",
    "instructor.choreographer": "Choreographer *",
    "instructor.song": "Song *",
    "instructor.artist": "Artist",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "Count (e.g. 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube URL",
    "instructor.autofill_youtube": "Auto-fill YouTube search",
    "instructor.publish_now": "Publish to everyone right away",
    "instructor.publish_now_on":
      "Everyone will see this dance in the public library.",
    "instructor.publish_now_off":
      "Save as draft — only you can see it until you publish.",
    "instructor.save_dance": "Save Dance",
    "instructor.enter_name_first": "Enter a name first",
    "instructor.enter_name_first_msg":
      "Type the dance name so I can build the search.",
    "instructor.missing_info": "Missing info",
    "instructor.missing_info_msg":
      "Name, choreographer, and song are required.",
    "instructor.permission_photo":
      "Allow photo access to upload a step sheet.",

    // ---------- Profile screen ----------
    "profile.title": "Profile",
    "profile.dancer_default": "Dancer",
    "profile.admin": "Admin",
    "profile.stat_completed": "Completed",
    "profile.stat_wishlist": "Wishlist",
    "profile.stat_classes": "Classes",
    "profile.stat_avg_rating": "Avg ★",
    "profile.section_achievements": "Achievements",
    "profile.section_practice_history": "Practice History",
    "profile.total_sessions": "total sessions",
    "profile.days_active": "days active",
    "profile.peak_day": "peak day",
    "profile.history_foot":
      "Last 30 days · Tap any dance and open Practice Mode to log a session.",
    "profile.section_account": "Account",
    "profile.instructor_tab": "Instructor Tab",
    "profile.switch_to_instructor": "Switch to instructor profile",
    "profile.class_recap": "Class Recap",
    "profile.log_a_class": "Log a Class",
    "profile.review_suggestions": "Review Suggestions",
    "profile.suggest_a_dance": "Suggest a Dance",
    "profile.suggest_a_dance_to": "Suggest a Dance to {name}",
    "profile.my_instructors": "My instructors",
    "profile.pick_your_instructors": "Choose your instructors",
    "profile.instructors_hint_none":
      "Tap to pick who receives your suggestions",
    "profile.instructors_hint_primary_more":
      "Primary: {name} · +{count} more",
    "profile.instructors_hint_primary": "Primary: {name}",
    "profile.instructors_hint_no_primary":
      "{count} picked — tap to set primary",
    "profile.followed_choreographers": "Followed choreographers",
    "profile.followed_choreographers_sub":
      "Get a nudge when they drop a new dance",
    "profile.my_mentions": "My mentions",
    "profile.mentions_unread": "{count} unread mentions from instructors",
    "profile.mentions_unread_one": "1 unread mention from instructors",
    "profile.mentions_default":
      "See instructor tags in your class chat",
    "profile.notification_prefs": "Notification preferences",
    "profile.notification_prefs_sub":
      "Mute event, class, or mention pings independently",
    "profile.language": "Language",
    "profile.boot_scoot_board": "Boot Scoot Board",
    "profile.boot_scoot_visible": "You're visible on the board.",
    "profile.boot_scoot_hidden": "You're hidden. Tap to join.",
    "profile.follows_row": "Following & Followers",
    "profile.follows_row_sub": "{following} following · {followers} follower",
    "profile.follows_row_sub_plural":
      "{following} following · {followers} followers",
    "profile.show_activity": "Show me in activity feed",
    "profile.show_activity_on": "Followers see your completions & badges.",
    "profile.show_activity_off": "Your activity is hidden from others.",
    "profile.certificate_theme": "Certificate theme",
    "profile.certificate_theme_sub":
      "Sets the default look for the PDF certificates you download.",
    "profile.couldnt_save": "Couldn't save",
    "profile.couldnt_update_theme": "Couldn't update theme",
    "profile.please_try_again": "Please try again.",
    "profile.sign_out": "Sign Out",
    "profile.delete_account": "Delete My Account",
    "profile.delete_account_sub":
      "Permanently removes your account and personal data.",
    "profile.section_connect": "Connect With Us",
    "profile.connect_sub":
      "Follow Stompin' Ground Yuma on your favourite platform — links open in the native app if installed.",
    "profile.share_app": "Share the app",
    "profile.share_app_sub":
      "Invite friends to Stompin' Ground Yuma",
    "profile.visit_website": "Visit our website",
    "profile.privacy_policy": "Privacy Policy",
    "profile.terms_of_service": "Terms of Service",
    "profile.community_guidelines": "Community Guidelines",
    "profile.blocked_users": "Blocked users",
    "profile.blocked_users_sub":
      "Manage who you've muted in chat and feed",
    "profile.send_feedback": "Send Feedback",
    "profile.send_feedback_sub": "Bugs, ideas or a shout-out",
    "profile.app_version": "App version {version}",
    "profile.app_version_with_build": "App version {version} ({build})",
    "profile.updates_arrive":
      "Updates arrive with new App Store / Play Store releases.",
    "profile.about_venue": "About Stompin' Ground Yuma",
    "profile.about_venue_text":
      "Country line dancing for all ages in Yuma, AZ. Join us, learn a new step, and make new friends on the dance floor.",
    "profile.instructor_unlock_title": "You're an instructor!",
    "profile.instructor_unlock_msg":
      "Your Instructor tab is now unlocked.",
    "profile.instructor_code_placeholder": "Instructor access code",
    "profile.enter_access_code": "Enter your access code",
    "profile.invalid_access_code": "Invalid access code",
    "profile.instructor_modal_sub":
      "Enter the access code your studio gave you to unlock instructor tools (log classes, upload step sheets, edit dances, chat).",
    "profile.unlock": "Unlock",
    "profile.delete_title": "Delete your account?",
    "profile.delete_body":
      "This permanently removes:\n• Your login & profile\n• Your dance tracking (completed / wishlist)\n• Your class attendance history\n• Any suggestions or chat messages you sent\n\nAny dances or classes you authored will remain visible to the community, but your name will be replaced with \"Deleted user\".",
    "profile.delete_cant_undone": "This can't be undone.",
    "profile.delete_confirm_label":
      "Type {word} to confirm",
    "profile.delete_type_confirm":
      'Type "DELETE" (all caps) to confirm.',
    "profile.delete_forever": "Delete Forever",
    "profile.deleted_title": "Account deleted",
    "profile.deleted_msg":
      "Your account and personal data have been removed. Thanks for dancing with us!",
    "profile.deleted_generic_error":
      "Could not delete account. Please try again.",
    "profile.sgy_admin": "SGY Admin",
    "profile.moderation_queue": "Feed Moderation Queue",
    "profile.user_feedback": "User Feedback",
    "profile.refresh_recommendations": "Refresh Recommendations",
    "profile.refresh_recommendations_none":
      "Library metadata is in sync with providers",
    "profile.refresh_recommendations_unseen":
      "{count} dances with drifted metadata",
    "profile.refresh_recommendations_unseen_one":
      "1 dance with drifted metadata",

    // ---------- Language switcher (Settings) ----------
    "language.title": "Language",
    "language.subtitle":
      "Choose the language you want to see across the app and in notifications.",
    "language.system_default": "System default",
    "language.system_default_hint":
      "Follows your phone's language ({locale}).",
    "language.saved_toast": "Language updated.",

    // ---------- Notifications preferences ----------
    "notifications.title": "Notifications",
    "notifications.classes": "New classes",
    "notifications.events": "New events",
    "notifications.choreographers": "New dances from followed choreographers",
    "notifications.mentions": "@Mentions in chat",
    "notifications.reminders": "Class reminders",

    // ---------- Errors & fallbacks ----------
    "error.generic":
      "Something went wrong. Please try again in a moment.",
    "error.offline": "You appear to be offline.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ Request to Add",
    "pending_dance.btn_submitting": "Submitting…",
    "pending_dance.btn_pending": "Pending Review",
    "pending_dance.btn_rejected": "Not Approved",
    "pending_dance.btn_in_library": "In Library",
    "pending_dance.btn_limit": "{limit}/{limit} today",
    "pending_dance.submitted_title": "Submitted for Review",
    "pending_dance.submitted_body":
      "An admin will review it soon. ({used}/{limit} today)",
    "pending_dance.pending_title": "Awaiting Approval",
    "pending_dance.pending_body":
      "An admin will review your submission soon.",
    "pending_dance.rejected_title": "Not Approved",
    "pending_dance.rejected_body":
      "The admin didn't add this dance to the library.",
    "pending_dance.limit_title": "Daily limit reached",
    "pending_dance.limit_body":
      "You've reached today's limit (5). Try again tomorrow.",
    "pending_dance.dup_title": "Already Submitted",
    "pending_dance.dup_pending_body":
      "This dance is already pending approval.",
    "pending_dance.dup_library_body":
      "This dance is already in the library.",
    "pending_dance.error_title": "Something went wrong",
    "pending_dance.error_body": "Please try again in a moment.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "Pending Dances",
    "admin_pending.not_allowed": "Admin only.",
    "admin_pending.tab_pending": "Pending",
    "admin_pending.tab_approved": "Approved",
    "admin_pending.tab_rejected": "Rejected",
    "admin_pending.tab_all": "All",
    "admin_pending.empty_pending": "No pending submissions.",
    "admin_pending.empty_generic": "Nothing here yet.",
    "admin_pending.untitled": "(Untitled)",
    "admin_pending.by": "By",
    "admin_pending.rejected_reason": "Rejection reason",
    "admin_pending.status_approved": "Approved & added to library",
    "admin_pending.view_source": "View on {source}",
    "admin_pending.view_dance": "View Dance",
    "admin_pending.approve": "Approve",
    "admin_pending.reject": "Reject",
    "admin_pending.reject_modal_title": "Reject this submission?",
    "admin_pending.reject_placeholder":
      "Optional reason (visible to the user)",
    "admin_pending.cancel": "Cancel",
    "admin_pending.confirm_reject": "Reject",
    "admin_pending.error_load": "Couldn't load submissions",
    "admin_pending.approve_ok_title":
      "Approved and added to library",
    "admin_pending.approve_dup_title": "Already in library",
    "admin_pending.approve_dup_body":
      "This dance is already listed. Submission cleared.",
    "admin_pending.approve_fail": "Approval failed",
    "admin_pending.reject_fail": "Reject failed",
  },

  es: {
    // ---------- Onboarding ----------
    "onboarding.language.title": "Elige tu idioma",
    "onboarding.language.subtitle":
      "Puedes cambiarlo en cualquier momento en Perfil → Ajustes.",
    "onboarding.language.continue": "Continuar",
    "onboarding.language.system_default": "Predeterminado del sistema",

    // ---------- Age gate ----------
    "age_gate.hero_title": "Verificación de edad",
    "age_gate.hero_sub": "Toma tus botas — un paso rápido primero.",
    "age_gate.title_line1":
      "Para usar Stompin' Ground Yuma debes tener al menos",
    "age_gate.title_years": "13 años",
    "age_gate.body_copy":
      "Los bailarines más jóvenes son bienvenidos con un padre o tutor — pídeles que creen la cuenta.",
    "age_gate.adult_button": "Tengo 13 o más",
    "age_gate.child_button": "Tengo menos de 13",
    "age_gate.legal":
      "Al tocar {emph} aceptas nuestros {terms} y {privacy}.",
    "age_gate.legal_emph": "Tengo 13 o más",
    "age_gate.under13_title": "Pide a un adulto que inicie sesión.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma es para bailarines de 13 años en adelante. Si eres menor, pide a un padre o tutor que cree la cuenta e inicie sesión — pueden llevarte a clase y bailar juntos en persona cuando quieran.",
    "age_gate.back": "Atrás",

    // ---------- Tabs ----------
    "tabs.home": "Inicio",
    "tabs.dances": "Bailes",
    "tabs.my_dances": "Mis bailes",
    "tabs.instructor": "Instructor",
    "tabs.profile": "Perfil",

    // ---------- Auth ----------
    "auth.tab_signin": "Iniciar sesión",
    "auth.tab_signup": "Crear cuenta",
    "auth.subtitle": "Central social del baile",
    "auth.email": "Correo electrónico",
    "auth.password": "Contraseña",
    "auth.name": "Nombre completo",
    "auth.instructor_toggle": "Soy instructor",
    "auth.instructor_toggle_sub":
      "Necesita el código de acceso del estudio",
    "auth.instructor_code": "Código de acceso de instructor",
    "auth.signin_button": "Iniciar sesión",
    "auth.signup_button": "Crear cuenta",
    "auth.continue_with_google": "Continuar con Google",
    "auth.or": "o",
    "auth.forgot_password": "¿Olvidaste tu contraseña?",
    "auth.legal_signin":
      "Al continuar aceptas nuestros {terms} y {privacy}.",
    "auth.legal_signup":
      "Al crear una cuenta aceptas nuestros {terms} y {privacy}, y reconoces que bailar en línea es una actividad física en la que participas bajo tu propio riesgo.",
    "auth.terms": "Términos",
    "auth.terms_of_service": "Términos del servicio",
    "auth.privacy_policy": "Política de privacidad",
    "auth.error_fill_all": "Rellena todos los campos",
    "auth.error_enter_code":
      "Introduce tu código de acceso de instructor",
    "auth.error_generic": "Algo salió mal",
    "auth.error_google_no_session": "No se devolvió ninguna sesión",
    "auth.error_google_not_configured":
      "Google no está configurado para esta versión.",
    "auth.error_google_failed": "Error al iniciar sesión con Google",
    "auth.account_created_title": "Cuenta creada",
    "auth.account_created_msg":
      "El código de instructor no coincidió, así que has entrado como miembro normal. Puedes intentarlo desde Perfil → Cambiar a perfil de instructor.",
    "auth.show_password": "Mostrar contraseña",
    "auth.hide_password": "Ocultar contraseña",

    // ---------- Welcome ----------
    "welcome.greeting": "¡Bienvenido, {name}!",
    "welcome.subtitle": "¡A bailar! 🥾",
    "welcome.default_name": "amigo",

    // ---------- Common ----------
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.done": "Listo",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.back": "Atrás",
    "common.close": "Cerrar",
    "common.retry": "Reintentar",
    "common.loading": "Cargando…",
    "common.ok": "Aceptar",
    "common.yes": "Sí",
    "common.no": "No",
    "common.confirm": "Confirmar",
    "common.share": "Compartir",
    "common.follow": "Seguir",
    "common.unfollow": "Dejar de seguir",
    "common.following": "Siguiendo",
    "common.search": "Buscar",
    "common.see_all": "Ver todo",
    "common.error": "Error",
    "common.new": "Nuevo",
    "common.publish": "Publicar",
    "common.unpublish": "Despublicar",
    "common.published": "Publicado",
    "common.draft": "Borrador",
    "common.upload": "Subir",
    "common.remove": "Quitar",
    "common.next": "Siguiente",
    "common.skip": "Saltar",
    "common.open_settings": "Abrir Ajustes",
    "common.permission_needed": "Se necesita permiso",

    // ---------- Home ----------
    "home.hello": "¡Hola, {name}!",
    "home.hello_no_name": "¡Hola!",
    "home.subhello": "¿Listo para bailar?",
    "home.browse_cta": "Explorar bailes",
    "home.achievements_title": "Logros",
    "home.achievements_sub_unseen": "¡Desbloqueaste {count} insignias nuevas!",
    "home.achievements_sub_unseen_one": "¡Desbloqueaste 1 insignia nueva!",
    "home.achievements_sub_default":
      "Sigue tus insignias y racha de práctica.",
    "home.community_activity": "Actividad de la comunidad",
    "home.feed_empty_title": "Sigue a otros bailarines",
    "home.feed_empty_sub":
      "Sus bailes completados, insignias y rachas aparecerán aquí.",
    "home.fresh_on_floor": "Novedades",
    "home.recently_practiced": "Practicados recientemente",
    "home.pick_up": "Continúa donde lo dejaste",
    "home.leaderboard_title": "Ranking Boot Scoot",
    "home.leaderboard_default_sub":
      "Descubre quién lidera la pista — únete.",
    "home.events_title": "Eventos cerca de ti",
    "home.events_sub":
      "Talleres, socials y clases donde te lleven tus botas.",
    "home.classes_title": "Resumen de clases recientes",
    "home.classes_sub":
      "Ve qué bailes se enseñaron en las últimas clases.",
    "home.suggest_title": "Sugerir un baile",
    "home.suggest_title_for": "Sugerir un baile a {name}",
    "home.suggest_sub_default":
      "Elige tu instructor principal y envíale ideas.",
    "home.suggest_sub_for": "¿Tienes una idea? Envíasela a {name}.",
    "home.about_title": "Sobre el lugar",
    "home.about_text":
      "Stompin' Ground Yuma es una comunidad amigable donde bailarines de todas las edades y niveles aprenden, ríen y bailan juntos. Toma tus botas y ¡a bailar!",
    "home.icon_all_ages": "Todas las edades",
    "home.icon_beginners": "Principiantes bienvenidos",
    "home.icon_family": "Apto para familias",
    "home.website_cta": "Visitar stompingroundyuma.org",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "Biblioteca de line dance",
    "library.search_placeholder":
      "Busca por nombre, canción, artista o coreógrafo",
    "library.diff_all": "Todos",
    "library.diff_absolute_beginner": "Principiante absoluto",
    "library.diff_beginner": "Principiante",
    "library.diff_improver": "Mejorando",
    "library.diff_high_improver": "Mejorando avanzado",
    "library.diff_intermediate": "Intermedio",
    "library.diff_advanced": "Avanzado",
    "library.empty_none": "Ningún baile coincide con los filtros.",
    "library.reset_filters": "Restablecer filtros",
    "library.cant_find": "¿No encuentras lo que buscas?",
    "library.external_cta": "Buscar en CopperKnob + BootStepper",
    "library.external_cta_q":
      'Buscar en CopperKnob + BootStepper: "{q}"',
    "library.single_dir": "O explora un solo directorio",
    "library.popular_copperknob": "Populares en CopperKnob",
    "library.popular_bootstepper": "Populares en BootStepper",
    "library.by": "Por {name}",
    "library.unknown": "Desconocido",
    "library.source_badge": "Biblioteca de bailes",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "Mi progreso",
    "my_dances.subtitle": "Sigue tu recorrido por el line dance",
    "my_dances.tab_completed": "Completados ({count})",
    "my_dances.tab_wishlist": "Lista de deseos ({count})",
    "my_dances.empty_completed_title": "Aún no has completado bailes",
    "my_dances.empty_wishlist_title": "Tu lista de deseos está vacía",
    "my_dances.empty_text":
      "¡Ve a la biblioteca para encontrar tu próximo reto!",
    "my_dances.browse_dances": "Explorar bailes",
    "my_dances.cert_error_title":
      "No se pudo descargar el certificado",
    "my_dances.cert_download_label": "Descargar certificado",
    "my_dances.cert_download_hint":
      "Descarga un certificado PDF de este baile completado.",

    // ---------- Instructor ----------
    "instructor.title": "Instructor",
    "instructor.subtitle": "Bailes · Clases · Eventos · Chat",
    "instructor.only": "Solo para instructores.",
    "instructor.new": "Nuevo",
    "instructor.csv": "CSV",
    "instructor.restore": "Restaurar",
    "instructor.tab_dances": "Bailes",
    "instructor.tab_classes": "Clases",
    "instructor.tab_events": "Eventos",
    "instructor.tab_chat": "Chat",
    "instructor.legend_new_dance":
      "Los bailes nuevos empiezan como **Borrador** — solo tú los ves. Toca **Publicar** para compartirlos con todos.",
    "instructor.no_dances":
      'Aún no hay bailes. Toca "+ Nuevo" para subir un baile con su hoja de pasos o registra una clase en la pestaña Clases.',
    "instructor.no_classes_yet": "Aún no has registrado clases.",
    "instructor.go_to_classes": "Ir a Clases",
    "instructor.class_session_default": "Sesión de clase",
    "instructor.dance_count": "{count} bailes · {names}",
    "instructor.dance_count_one": "1 baile · {names}",
    "instructor.pill_sheet": "Hoja",
    "instructor.pill_no_sheet": "Sin hoja",
    "instructor.pill_published": "Publicado",
    "instructor.pill_draft": "Borrador",
    "instructor.edit_sheet": "Hoja",
    "instructor.chat_lounge_hello":
      "Sala de instructores — saluda 👋",
    "instructor.chat_placeholder":
      "Escribe a los instructores… (etiqueta con @nombre)",
    "instructor.events_your_events": "Tus eventos",
    "instructor.events_hero_sub":
      "Talleres, socials y noches especiales que organizas.",
    "instructor.events_add_new": "Añadir nuevo evento",
    "instructor.events_browse_all": "Ver todos",
    "instructor.events_empty_title": "Aún no hay eventos",
    "instructor.events_empty_sub":
      "Publica tu próximo taller, social o fiesta privada para que los bailarines lo encuentren.",
    "instructor.events_upcoming": "Próximos",
    "instructor.events_past": "Pasados",
    "instructor.event_delete_title": "¿Eliminar este evento?",
    "instructor.event_delete_msg":
      '"{name}" — no se puede deshacer.',
    "instructor.event_delete_error": "No se pudo eliminar",
    "instructor.step_sheet_title": "Hoja de pasos",
    "instructor.new_dance_title": "Nuevo baile + hoja de pasos",
    "instructor.import_title": "Importar desde CSV",
    "instructor.import_sub":
      "Agrega bailes a la biblioteca de forma masiva",
    "instructor.upload_image": "Subir imagen",
    "instructor.text_notation": "Notación en texto",
    "instructor.image_label": "Imagen (PNG/JPG)",
    "instructor.step_sheet_image": "Imagen de la hoja de pasos",
    "instructor.step_sheet_text": "Texto de la hoja de pasos",
    "instructor.save_step_sheet": "Guardar hoja de pasos",
    "instructor.dance_name": "Nombre del baile *",
    "instructor.choreographer": "Coreógrafo *",
    "instructor.song": "Canción *",
    "instructor.artist": "Artista",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "Conteo (ej. 32 count, 4 wall)",
    "instructor.youtube_url": "URL de YouTube",
    "instructor.autofill_youtube": "Autocompletar búsqueda en YouTube",
    "instructor.publish_now": "Publicar de inmediato",
    "instructor.publish_now_on":
      "Todos verán este baile en la biblioteca pública.",
    "instructor.publish_now_off":
      "Guarda como borrador — solo tú lo verás hasta que lo publiques.",
    "instructor.save_dance": "Guardar baile",
    "instructor.enter_name_first": "Primero escribe un nombre",
    "instructor.enter_name_first_msg":
      "Escribe el nombre del baile para construir la búsqueda.",
    "instructor.missing_info": "Faltan datos",
    "instructor.missing_info_msg":
      "Nombre, coreógrafo y canción son obligatorios.",
    "instructor.permission_photo":
      "Permite acceso a fotos para subir una hoja de pasos.",

    // ---------- Profile ----------
    "profile.title": "Perfil",
    "profile.dancer_default": "Bailarín",
    "profile.admin": "Administrador",
    "profile.stat_completed": "Completados",
    "profile.stat_wishlist": "Deseados",
    "profile.stat_classes": "Clases",
    "profile.stat_avg_rating": "★ media",
    "profile.section_achievements": "Logros",
    "profile.section_practice_history": "Historial de práctica",
    "profile.total_sessions": "sesiones totales",
    "profile.days_active": "días activos",
    "profile.peak_day": "mejor día",
    "profile.history_foot":
      "Últimos 30 días · Abre un baile y usa Modo Práctica para registrar una sesión.",
    "profile.section_account": "Cuenta",
    "profile.instructor_tab": "Pestaña de instructor",
    "profile.switch_to_instructor": "Cambiar a perfil de instructor",
    "profile.class_recap": "Resumen de clase",
    "profile.log_a_class": "Registrar una clase",
    "profile.review_suggestions": "Revisar sugerencias",
    "profile.suggest_a_dance": "Sugerir un baile",
    "profile.suggest_a_dance_to": "Sugerir un baile a {name}",
    "profile.my_instructors": "Mis instructores",
    "profile.pick_your_instructors": "Elige tus instructores",
    "profile.instructors_hint_none":
      "Toca para elegir quién recibe tus sugerencias",
    "profile.instructors_hint_primary_more":
      "Principal: {name} · +{count} más",
    "profile.instructors_hint_primary": "Principal: {name}",
    "profile.instructors_hint_no_primary":
      "{count} elegidos — toca para fijar principal",
    "profile.followed_choreographers": "Coreógrafos seguidos",
    "profile.followed_choreographers_sub":
      "Recibe un aviso cuando publiquen un baile nuevo",
    "profile.my_mentions": "Mis menciones",
    "profile.mentions_unread":
      "{count} menciones sin leer de instructores",
    "profile.mentions_unread_one":
      "1 mención sin leer de instructores",
    "profile.mentions_default":
      "Ve las etiquetas de instructores en tu chat de clase",
    "profile.notification_prefs": "Preferencias de notificación",
    "profile.notification_prefs_sub":
      "Silencia eventos, clases o menciones por separado",
    "profile.language": "Idioma",
    "profile.boot_scoot_board": "Ranking Boot Scoot",
    "profile.boot_scoot_visible": "Apareces en el ranking.",
    "profile.boot_scoot_hidden": "Estás oculto. Toca para unirte.",
    "profile.follows_row": "Siguiendo y seguidores",
    "profile.follows_row_sub":
      "{following} siguiendo · {followers} seguidor",
    "profile.follows_row_sub_plural":
      "{following} siguiendo · {followers} seguidores",
    "profile.show_activity": "Mostrarme en el feed de actividad",
    "profile.show_activity_on":
      "Tus seguidores verán tus bailes completados e insignias.",
    "profile.show_activity_off":
      "Tu actividad está oculta para los demás.",
    "profile.certificate_theme": "Tema del certificado",
    "profile.certificate_theme_sub":
      "Establece el aspecto por defecto de los certificados PDF que descargues.",
    "profile.couldnt_save": "No se pudo guardar",
    "profile.couldnt_update_theme": "No se pudo actualizar el tema",
    "profile.please_try_again": "Inténtalo de nuevo.",
    "profile.sign_out": "Cerrar sesión",
    "profile.delete_account": "Eliminar mi cuenta",
    "profile.delete_account_sub":
      "Elimina tu cuenta y datos personales de forma permanente.",
    "profile.section_connect": "Conecta con nosotros",
    "profile.connect_sub":
      "Sigue a Stompin' Ground Yuma en tu red favorita — los enlaces abren la app nativa si está instalada.",
    "profile.share_app": "Compartir la app",
    "profile.share_app_sub":
      "Invita a tus amigos a Stompin' Ground Yuma",
    "profile.visit_website": "Visita nuestro sitio web",
    "profile.privacy_policy": "Política de privacidad",
    "profile.terms_of_service": "Términos del servicio",
    "profile.community_guidelines": "Reglas de la comunidad",
    "profile.blocked_users": "Usuarios bloqueados",
    "profile.blocked_users_sub":
      "Administra a quién silenciaste en el chat y el feed",
    "profile.send_feedback": "Enviar comentarios",
    "profile.send_feedback_sub":
      "Errores, ideas o un saludo",
    "profile.app_version": "Versión {version}",
    "profile.app_version_with_build": "Versión {version} ({build})",
    "profile.updates_arrive":
      "Las actualizaciones llegan con nuevas versiones de App Store / Play Store.",
    "profile.about_venue": "Sobre Stompin' Ground Yuma",
    "profile.about_venue_text":
      "Baile en línea country para todas las edades en Yuma, AZ. Únete, aprende un paso nuevo y haz amigos en la pista.",
    "profile.instructor_unlock_title": "¡Eres instructor!",
    "profile.instructor_unlock_msg":
      "Tu pestaña de instructor está desbloqueada.",
    "profile.instructor_code_placeholder": "Código de instructor",
    "profile.enter_access_code": "Introduce tu código de acceso",
    "profile.invalid_access_code": "Código de acceso inválido",
    "profile.instructor_modal_sub":
      "Introduce el código que te dio tu estudio para desbloquear herramientas de instructor (registrar clases, subir hojas de pasos, editar bailes, chatear).",
    "profile.unlock": "Desbloquear",
    "profile.delete_title": "¿Eliminar tu cuenta?",
    "profile.delete_body":
      "Esto elimina permanentemente:\n• Tu inicio de sesión y perfil\n• Tu registro de bailes (completados / deseados)\n• Tu historial de asistencia a clases\n• Cualquier sugerencia o mensaje de chat que enviaste\n\nLos bailes o clases que hayas creado seguirán visibles, pero tu nombre será reemplazado por \"Usuario eliminado\".",
    "profile.delete_cant_undone": "No se puede deshacer.",
    "profile.delete_confirm_label": "Escribe {word} para confirmar",
    "profile.delete_type_confirm":
      'Escribe "DELETE" (mayúsculas) para confirmar.',
    "profile.delete_forever": "Eliminar para siempre",
    "profile.deleted_title": "Cuenta eliminada",
    "profile.deleted_msg":
      "Tu cuenta y datos personales se han eliminado. ¡Gracias por bailar con nosotros!",
    "profile.deleted_generic_error":
      "No se pudo eliminar la cuenta. Inténtalo de nuevo.",
    "profile.sgy_admin": "Administración SGY",
    "profile.moderation_queue": "Cola de moderación del feed",
    "profile.user_feedback": "Comentarios de usuarios",
    "profile.refresh_recommendations": "Refrescar recomendaciones",
    "profile.refresh_recommendations_none":
      "Los metadatos de la biblioteca están sincronizados",
    "profile.refresh_recommendations_unseen":
      "{count} bailes con metadatos desfasados",
    "profile.refresh_recommendations_unseen_one":
      "1 baile con metadatos desfasados",

    // ---------- Language ----------
    "language.title": "Idioma",
    "language.subtitle":
      "Elige el idioma que quieres ver en toda la app y en las notificaciones.",
    "language.system_default": "Predeterminado del sistema",
    "language.system_default_hint":
      "Sigue el idioma del teléfono ({locale}).",
    "language.saved_toast": "Idioma actualizado.",

    // ---------- Notifications prefs ----------
    "notifications.title": "Notificaciones",
    "notifications.classes": "Nuevas clases",
    "notifications.events": "Nuevos eventos",
    "notifications.choreographers":
      "Bailes nuevos de coreógrafos que sigues",
    "notifications.mentions": "@Menciones en el chat",
    "notifications.reminders": "Recordatorios de clase",

    // ---------- Errors ----------
    "error.generic": "Algo salió mal. Inténtalo en un momento.",
    "error.offline": "Parece que no tienes conexión.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ Pedir añadir",
    "pending_dance.btn_submitting": "Enviando…",
    "pending_dance.btn_pending": "En revisión",
    "pending_dance.btn_rejected": "No aprobado",
    "pending_dance.btn_in_library": "En la biblioteca",
    "pending_dance.btn_limit": "{limit}/{limit} hoy",
    "pending_dance.submitted_title": "Enviado a revisión",
    "pending_dance.submitted_body":
      "Un admin lo revisará pronto. ({used}/{limit} hoy)",
    "pending_dance.pending_title": "Esperando aprobación",
    "pending_dance.pending_body":
      "Un admin revisará tu envío pronto.",
    "pending_dance.rejected_title": "No aprobado",
    "pending_dance.rejected_body":
      "El admin no añadió este baile a la biblioteca.",
    "pending_dance.limit_title": "Límite diario alcanzado",
    "pending_dance.limit_body":
      "Has alcanzado el límite de hoy (5). Inténtalo de nuevo mañana.",
    "pending_dance.dup_title": "Ya enviado",
    "pending_dance.dup_pending_body":
      "Este baile ya está pendiente de aprobación.",
    "pending_dance.dup_library_body":
      "Este baile ya está en la biblioteca.",
    "pending_dance.error_title": "Algo salió mal",
    "pending_dance.error_body": "Inténtalo de nuevo en un momento.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "Bailes pendientes",
    "admin_pending.not_allowed": "Solo administradores.",
    "admin_pending.tab_pending": "Pendientes",
    "admin_pending.tab_approved": "Aprobados",
    "admin_pending.tab_rejected": "Rechazados",
    "admin_pending.tab_all": "Todos",
    "admin_pending.empty_pending": "No hay envíos pendientes.",
    "admin_pending.empty_generic": "Aún no hay nada aquí.",
    "admin_pending.untitled": "(Sin título)",
    "admin_pending.by": "Por",
    "admin_pending.rejected_reason": "Motivo del rechazo",
    "admin_pending.status_approved": "Aprobado y añadido a la biblioteca",
    "admin_pending.view_source": "Ver en {source}",
    "admin_pending.view_dance": "Ver baile",
    "admin_pending.approve": "Aprobar",
    "admin_pending.reject": "Rechazar",
    "admin_pending.reject_modal_title": "¿Rechazar este envío?",
    "admin_pending.reject_placeholder":
      "Motivo opcional (visible para el usuario)",
    "admin_pending.cancel": "Cancelar",
    "admin_pending.confirm_reject": "Rechazar",
    "admin_pending.error_load": "No se pudieron cargar los envíos",
    "admin_pending.approve_ok_title":
      "Aprobado y añadido a la biblioteca",
    "admin_pending.approve_dup_title": "Ya en la biblioteca",
    "admin_pending.approve_dup_body":
      "Este baile ya está listado. Envío eliminado.",
    "admin_pending.approve_fail": "Falló la aprobación",
    "admin_pending.reject_fail": "Falló el rechazo",
  },

  fr: {
    // ---------- Onboarding ----------
    "onboarding.language.title": "Choisissez votre langue",
    "onboarding.language.subtitle":
      "Vous pouvez la modifier à tout moment dans Profil → Réglages.",
    "onboarding.language.continue": "Continuer",
    "onboarding.language.system_default": "Réglage système",

    // ---------- Age gate ----------
    "age_gate.hero_title": "Vérification d'âge",
    "age_gate.hero_sub": "Prenez vos bottes — un petit pas d'abord.",
    "age_gate.title_line1":
      "Pour utiliser Stompin' Ground Yuma vous devez avoir au moins",
    "age_gate.title_years": "13 ans",
    "age_gate.body_copy":
      "Les jeunes danseurs sont bienvenus avec un parent ou tuteur — c'est lui qui crée le compte.",
    "age_gate.adult_button": "J'ai 13 ans ou plus",
    "age_gate.child_button": "J'ai moins de 13 ans",
    "age_gate.legal":
      "En appuyant sur {emph} vous acceptez nos {terms} et notre {privacy}.",
    "age_gate.legal_emph": "J'ai 13 ans ou plus",
    "age_gate.under13_title":
      "Demandez à un adulte de se connecter.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma est réservé aux danseurs de 13 ans et plus. Si vous avez moins de 13 ans, demandez à un parent ou tuteur de créer le compte et de vous connecter — il pourra vous amener en cours et vous danserez ensemble en personne quand vous voudrez.",
    "age_gate.back": "Retour",

    // ---------- Tabs ----------
    "tabs.home": "Accueil",
    "tabs.dances": "Danses",
    "tabs.my_dances": "Mes danses",
    "tabs.instructor": "Instructeur",
    "tabs.profile": "Profil",

    // ---------- Auth ----------
    "auth.tab_signin": "Se connecter",
    "auth.tab_signup": "Créer un compte",
    "auth.subtitle": "QG social de la danse",
    "auth.email": "E-mail",
    "auth.password": "Mot de passe",
    "auth.name": "Nom complet",
    "auth.instructor_toggle": "Je suis instructeur",
    "auth.instructor_toggle_sub":
      "Nécessite le code d'accès du studio",
    "auth.instructor_code": "Code d'accès instructeur",
    "auth.signin_button": "Se connecter",
    "auth.signup_button": "Créer un compte",
    "auth.continue_with_google": "Continuer avec Google",
    "auth.or": "ou",
    "auth.forgot_password": "Mot de passe oublié ?",
    "auth.legal_signin":
      "En continuant vous acceptez nos {terms} et notre {privacy}.",
    "auth.legal_signup":
      "En créant un compte vous acceptez nos {terms} et notre {privacy}, et reconnaissez que la line dance est une activité physique à laquelle vous participez à vos propres risques.",
    "auth.terms": "Conditions",
    "auth.terms_of_service": "Conditions d'utilisation",
    "auth.privacy_policy": "Politique de confidentialité",
    "auth.error_fill_all": "Remplissez tous les champs",
    "auth.error_enter_code":
      "Entrez votre code d'accès instructeur",
    "auth.error_generic": "Une erreur est survenue",
    "auth.error_google_no_session": "Aucune session renvoyée",
    "auth.error_google_not_configured":
      "Google n'est pas configuré pour cette version.",
    "auth.error_google_failed": "Échec de la connexion Google",
    "auth.account_created_title": "Compte créé",
    "auth.account_created_msg":
      "Le code instructeur ne correspondait pas, vous êtes donc connecté en tant que membre standard. Vous pouvez réessayer depuis Profil → Passer au profil instructeur.",
    "auth.show_password": "Afficher le mot de passe",
    "auth.hide_password": "Masquer le mot de passe",

    // ---------- Welcome ----------
    "welcome.greeting": "Bienvenue, {name} !",
    "welcome.subtitle": "C'est parti pour danser 🥾",
    "welcome.default_name": "ami",

    // ---------- Common ----------
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.done": "Terminé",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.back": "Retour",
    "common.close": "Fermer",
    "common.retry": "Réessayer",
    "common.loading": "Chargement…",
    "common.ok": "OK",
    "common.yes": "Oui",
    "common.no": "Non",
    "common.confirm": "Confirmer",
    "common.share": "Partager",
    "common.follow": "Suivre",
    "common.unfollow": "Ne plus suivre",
    "common.following": "Abonné",
    "common.search": "Rechercher",
    "common.see_all": "Tout voir",
    "common.error": "Erreur",
    "common.new": "Nouveau",
    "common.publish": "Publier",
    "common.unpublish": "Retirer",
    "common.published": "Publié",
    "common.draft": "Brouillon",
    "common.upload": "Téléverser",
    "common.remove": "Retirer",
    "common.next": "Suivant",
    "common.skip": "Passer",
    "common.open_settings": "Ouvrir les réglages",
    "common.permission_needed": "Autorisation requise",

    // ---------- Home ----------
    "home.hello": "Salut, {name} !",
    "home.hello_no_name": "Salut !",
    "home.subhello": "Prêt·e à danser ?",
    "home.browse_cta": "Parcourir les danses",
    "home.achievements_title": "Succès",
    "home.achievements_sub_unseen":
      "Vous avez débloqué {count} nouveaux badges !",
    "home.achievements_sub_unseen_one":
      "Vous avez débloqué 1 nouveau badge !",
    "home.achievements_sub_default":
      "Suivez vos badges et votre série de pratique.",
    "home.community_activity": "Activité de la communauté",
    "home.feed_empty_title": "Suivez d'autres danseurs",
    "home.feed_empty_sub":
      "Leurs danses terminées, badges et séries apparaîtront ici.",
    "home.fresh_on_floor": "Nouveautés",
    "home.recently_practiced": "Récemment pratiqué",
    "home.pick_up": "Reprenez là où vous vous êtes arrêté·e",
    "home.leaderboard_title": "Classement Boot Scoot",
    "home.leaderboard_default_sub":
      "Voyez qui domine la piste — rejoignez-les.",
    "home.events_title": "Événements près de chez vous",
    "home.events_sub":
      "Ateliers, socials et cours partout où vos bottes vous mènent.",
    "home.classes_title": "Récap. récents des cours",
    "home.classes_sub":
      "Voyez quelles danses ont été enseignées récemment.",
    "home.suggest_title": "Suggérer une danse",
    "home.suggest_title_for": "Suggérer une danse à {name}",
    "home.suggest_sub_default":
      "Choisissez votre instructeur principal et envoyez-lui vos idées.",
    "home.suggest_sub_for": "Une idée ? Envoyez-la à {name}.",
    "home.about_title": "À propos du lieu",
    "home.about_text":
      "Stompin' Ground Yuma est une communauté chaleureuse où des danseurs de tous âges et niveaux se retrouvent pour apprendre, rire et danser jusqu'au bout de la nuit. Prenez vos bottes et dansons !",
    "home.icon_all_ages": "Tous âges",
    "home.icon_beginners": "Débutants bienvenus",
    "home.icon_family": "Adapté aux familles",
    "home.website_cta": "Visiter stompingroundyuma.org",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "Bibliothèque de line dance",
    "library.search_placeholder":
      "Rechercher nom, chanson, artiste, chorégraphe",
    "library.diff_all": "Tous",
    "library.diff_absolute_beginner": "Débutant absolu",
    "library.diff_beginner": "Débutant",
    "library.diff_improver": "Intermédiaire",
    "library.diff_high_improver": "Intermédiaire avancé",
    "library.diff_intermediate": "Confirmé",
    "library.diff_advanced": "Avancé",
    "library.empty_none":
      "Aucune danse ne correspond à ces filtres.",
    "library.reset_filters": "Réinitialiser les filtres",
    "library.cant_find": "Vous ne trouvez pas ce que vous cherchez ?",
    "library.external_cta": "Rechercher sur CopperKnob + BootStepper",
    "library.external_cta_q":
      'Rechercher sur CopperKnob + BootStepper : "{q}"',
    "library.single_dir": "Ou parcourir un seul annuaire",
    "library.popular_copperknob": "Populaires sur CopperKnob",
    "library.popular_bootstepper": "Populaires sur BootStepper",
    "library.by": "Par {name}",
    "library.unknown": "Inconnu",
    "library.source_badge": "Bibliothèque",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "Mon suivi",
    "my_dances.subtitle":
      "Suivez votre parcours de line dance",
    "my_dances.tab_completed": "Terminées ({count})",
    "my_dances.tab_wishlist": "À faire ({count})",
    "my_dances.empty_completed_title":
      "Aucune danse terminée pour l'instant",
    "my_dances.empty_wishlist_title": "Votre liste est vide",
    "my_dances.empty_text":
      "Allez dans la Bibliothèque pour trouver votre prochain défi !",
    "my_dances.browse_dances": "Parcourir les danses",
    "my_dances.cert_error_title":
      "Impossible de télécharger le certificat",
    "my_dances.cert_download_label": "Télécharger le certificat",
    "my_dances.cert_download_hint":
      "Télécharge un certificat PDF pour cette danse terminée.",

    // ---------- Instructor ----------
    "instructor.title": "Instructeur",
    "instructor.subtitle": "Danses · Cours · Événements · Chat",
    "instructor.only": "Réservé aux instructeurs.",
    "instructor.new": "Nouveau",
    "instructor.csv": "CSV",
    "instructor.restore": "Restaurer",
    "instructor.tab_dances": "Danses",
    "instructor.tab_classes": "Cours",
    "instructor.tab_events": "Événements",
    "instructor.tab_chat": "Chat",
    "instructor.legend_new_dance":
      "Les nouvelles danses commencent en **Brouillon** — vous seul·e les voyez. Appuyez sur **Publier** pour les partager.",
    "instructor.no_dances":
      'Pas encore de danses. Appuyez sur "+ Nouveau" pour ajouter une danse avec sa fiche, ou enregistrez un cours.',
    "instructor.no_classes_yet":
      "Vous n'avez encore enregistré aucun cours.",
    "instructor.go_to_classes": "Aller aux Cours",
    "instructor.class_session_default": "Séance de cours",
    "instructor.dance_count": "{count} danses · {names}",
    "instructor.dance_count_one": "1 danse · {names}",
    "instructor.pill_sheet": "Fiche",
    "instructor.pill_no_sheet": "Pas de fiche",
    "instructor.pill_published": "Publié",
    "instructor.pill_draft": "Brouillon",
    "instructor.edit_sheet": "Fiche",
    "instructor.chat_lounge_hello":
      "Salon des instructeurs — dites bonjour 👋",
    "instructor.chat_placeholder":
      "Message aux instructeurs… (tag avec @nom)",
    "instructor.events_your_events": "Vos événements",
    "instructor.events_hero_sub":
      "Ateliers, socials et soirées que vous organisez.",
    "instructor.events_add_new": "Ajouter un nouvel événement",
    "instructor.events_browse_all": "Tout voir",
    "instructor.events_empty_title": "Pas encore d'événements",
    "instructor.events_empty_sub":
      "Publiez votre prochain atelier, social ou soirée privée pour que les danseurs le trouvent.",
    "instructor.events_upcoming": "À venir",
    "instructor.events_past": "Passés",
    "instructor.event_delete_title":
      "Supprimer cet événement ?",
    "instructor.event_delete_msg":
      '« {name} » — action irréversible.',
    "instructor.event_delete_error":
      "Suppression impossible",
    "instructor.step_sheet_title": "Fiche de pas",
    "instructor.new_dance_title":
      "Nouvelle danse + fiche de pas",
    "instructor.import_title": "Importer depuis un CSV",
    "instructor.import_sub":
      "Ajouter des danses en masse à la bibliothèque",
    "instructor.upload_image": "Téléverser une image",
    "instructor.text_notation": "Notation en texte",
    "instructor.image_label": "Image (PNG/JPG)",
    "instructor.step_sheet_image": "Image de la fiche de pas",
    "instructor.step_sheet_text": "Texte de la fiche de pas",
    "instructor.save_step_sheet": "Enregistrer la fiche",
    "instructor.dance_name": "Nom de la danse *",
    "instructor.choreographer": "Chorégraphe *",
    "instructor.song": "Chanson *",
    "instructor.artist": "Artiste",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "Comptes (ex. 32 count, 4 wall)",
    "instructor.youtube_url": "URL YouTube",
    "instructor.autofill_youtube":
      "Remplir automatiquement la recherche YouTube",
    "instructor.publish_now": "Publier tout de suite",
    "instructor.publish_now_on":
      "Tout le monde verra cette danse dans la bibliothèque publique.",
    "instructor.publish_now_off":
      "Enregistrer en brouillon — vous seul·e la verrez avant publication.",
    "instructor.save_dance": "Enregistrer la danse",
    "instructor.enter_name_first":
      "Entrez d'abord un nom",
    "instructor.enter_name_first_msg":
      "Saisissez le nom de la danse pour construire la recherche.",
    "instructor.missing_info": "Informations manquantes",
    "instructor.missing_info_msg":
      "Nom, chorégraphe et chanson sont obligatoires.",
    "instructor.permission_photo":
      "Autorisez l'accès aux photos pour envoyer une fiche.",

    // ---------- Profile ----------
    "profile.title": "Profil",
    "profile.dancer_default": "Danseur",
    "profile.admin": "Administrateur",
    "profile.stat_completed": "Terminées",
    "profile.stat_wishlist": "À faire",
    "profile.stat_classes": "Cours",
    "profile.stat_avg_rating": "★ moy.",
    "profile.section_achievements": "Succès",
    "profile.section_practice_history": "Historique de pratique",
    "profile.total_sessions": "sessions au total",
    "profile.days_active": "jours actifs",
    "profile.peak_day": "meilleur jour",
    "profile.history_foot":
      "30 derniers jours · Ouvrez une danse et utilisez le Mode Pratique pour enregistrer une séance.",
    "profile.section_account": "Compte",
    "profile.instructor_tab": "Onglet Instructeur",
    "profile.switch_to_instructor":
      "Passer au profil instructeur",
    "profile.class_recap": "Récap. de cours",
    "profile.log_a_class": "Enregistrer un cours",
    "profile.review_suggestions": "Examiner les suggestions",
    "profile.suggest_a_dance": "Suggérer une danse",
    "profile.suggest_a_dance_to": "Suggérer une danse à {name}",
    "profile.my_instructors": "Mes instructeurs",
    "profile.pick_your_instructors":
      "Choisissez vos instructeurs",
    "profile.instructors_hint_none":
      "Appuyez pour choisir qui reçoit vos suggestions",
    "profile.instructors_hint_primary_more":
      "Principal : {name} · +{count} autres",
    "profile.instructors_hint_primary": "Principal : {name}",
    "profile.instructors_hint_no_primary":
      "{count} sélectionnés — appuyez pour définir le principal",
    "profile.followed_choreographers":
      "Chorégraphes suivis",
    "profile.followed_choreographers_sub":
      "Recevez un rappel quand ils publient une nouvelle danse",
    "profile.my_mentions": "Mes mentions",
    "profile.mentions_unread":
      "{count} mentions non lues d'instructeurs",
    "profile.mentions_unread_one":
      "1 mention non lue d'instructeurs",
    "profile.mentions_default":
      "Voir les tags d'instructeurs dans le chat du cours",
    "profile.notification_prefs": "Préférences de notification",
    "profile.notification_prefs_sub":
      "Désactivez événements, cours ou mentions séparément",
    "profile.language": "Langue",
    "profile.boot_scoot_board": "Classement Boot Scoot",
    "profile.boot_scoot_visible":
      "Vous êtes visible sur le classement.",
    "profile.boot_scoot_hidden":
      "Vous êtes masqué·e. Appuyez pour rejoindre.",
    "profile.follows_row": "Abonnements et abonnés",
    "profile.follows_row_sub":
      "{following} abonnements · {followers} abonné",
    "profile.follows_row_sub_plural":
      "{following} abonnements · {followers} abonnés",
    "profile.show_activity":
      "M'afficher dans le fil d'activité",
    "profile.show_activity_on":
      "Vos abonnés voient vos danses et badges.",
    "profile.show_activity_off":
      "Votre activité est masquée aux autres.",
    "profile.certificate_theme": "Thème du certificat",
    "profile.certificate_theme_sub":
      "Définit l'apparence par défaut des certificats PDF téléchargés.",
    "profile.couldnt_save":
      "Enregistrement impossible",
    "profile.couldnt_update_theme":
      "Mise à jour du thème impossible",
    "profile.please_try_again": "Merci de réessayer.",
    "profile.sign_out": "Se déconnecter",
    "profile.delete_account": "Supprimer mon compte",
    "profile.delete_account_sub":
      "Supprime définitivement votre compte et vos données personnelles.",
    "profile.section_connect": "Restons connectés",
    "profile.connect_sub":
      "Suivez Stompin' Ground Yuma sur votre réseau préféré — les liens ouvrent l'app native si installée.",
    "profile.share_app": "Partager l'app",
    "profile.share_app_sub":
      "Invitez vos amis sur Stompin' Ground Yuma",
    "profile.visit_website": "Visitez notre site",
    "profile.privacy_policy": "Politique de confidentialité",
    "profile.terms_of_service": "Conditions d'utilisation",
    "profile.community_guidelines":
      "Règles de la communauté",
    "profile.blocked_users": "Utilisateurs bloqués",
    "profile.blocked_users_sub":
      "Gérez qui vous avez masqué dans le chat et le fil",
    "profile.send_feedback": "Envoyer un retour",
    "profile.send_feedback_sub":
      "Bugs, idées ou un mot sympa",
    "profile.app_version": "Version {version}",
    "profile.app_version_with_build":
      "Version {version} ({build})",
    "profile.updates_arrive":
      "Les mises à jour arrivent avec les nouvelles versions App Store / Play Store.",
    "profile.about_venue": "À propos de Stompin' Ground Yuma",
    "profile.about_venue_text":
      "Line dance country pour tous les âges à Yuma, AZ. Rejoignez-nous, apprenez un nouveau pas et faites de nouvelles rencontres sur la piste.",
    "profile.instructor_unlock_title": "Vous êtes instructeur !",
    "profile.instructor_unlock_msg":
      "Votre onglet Instructeur est désormais débloqué.",
    "profile.instructor_code_placeholder":
      "Code d'accès instructeur",
    "profile.enter_access_code": "Entrez votre code d'accès",
    "profile.invalid_access_code": "Code d'accès invalide",
    "profile.instructor_modal_sub":
      "Entrez le code fourni par votre studio pour débloquer les outils instructeur (enregistrer les cours, envoyer des fiches, modifier les danses, chatter).",
    "profile.unlock": "Débloquer",
    "profile.delete_title": "Supprimer votre compte ?",
    "profile.delete_body":
      "Cette action supprime définitivement :\n• Votre identifiant et profil\n• Votre suivi de danses (terminées / à faire)\n• Votre historique de présence aux cours\n• Toute suggestion ou message envoyé\n\nLes danses ou cours que vous avez créés restent visibles, mais votre nom sera remplacé par « Utilisateur supprimé ».",
    "profile.delete_cant_undone": "Action irréversible.",
    "profile.delete_confirm_label":
      "Tapez {word} pour confirmer",
    "profile.delete_type_confirm":
      'Tapez "DELETE" (majuscules) pour confirmer.',
    "profile.delete_forever": "Supprimer définitivement",
    "profile.deleted_title": "Compte supprimé",
    "profile.deleted_msg":
      "Votre compte et vos données personnelles ont été supprimés. Merci d'avoir dansé avec nous !",
    "profile.deleted_generic_error":
      "Impossible de supprimer le compte. Réessayez.",
    "profile.sgy_admin": "Administration SGY",
    "profile.moderation_queue":
      "File de modération du fil",
    "profile.user_feedback": "Retours utilisateur",
    "profile.refresh_recommendations":
      "Rafraîchir les recommandations",
    "profile.refresh_recommendations_none":
      "Les métadonnées de la bibliothèque sont à jour",
    "profile.refresh_recommendations_unseen":
      "{count} danses avec des métadonnées obsolètes",
    "profile.refresh_recommendations_unseen_one":
      "1 danse avec des métadonnées obsolètes",

    // ---------- Language ----------
    "language.title": "Langue",
    "language.subtitle":
      "Choisissez la langue à utiliser dans l'app et les notifications.",
    "language.system_default": "Réglage système",
    "language.system_default_hint":
      "Suit la langue du téléphone ({locale}).",
    "language.saved_toast": "Langue mise à jour.",

    // ---------- Notifications prefs ----------
    "notifications.title": "Notifications",
    "notifications.classes": "Nouveaux cours",
    "notifications.events": "Nouveaux événements",
    "notifications.choreographers":
      "Nouvelles danses des chorégraphes suivis",
    "notifications.mentions": "@Mentions dans le chat",
    "notifications.reminders": "Rappels de cours",

    // ---------- Errors ----------
    "error.generic":
      "Une erreur s'est produite. Réessayez dans un instant.",
    "error.offline": "Vous semblez hors ligne.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ Proposer",
    "pending_dance.btn_submitting": "Envoi…",
    "pending_dance.btn_pending": "En attente",
    "pending_dance.btn_rejected": "Refusée",
    "pending_dance.btn_in_library": "Dans la bibliothèque",
    "pending_dance.btn_limit": "{limit}/{limit} aujourd'hui",
    "pending_dance.submitted_title": "Proposition envoyée",
    "pending_dance.submitted_body":
      "Un admin la vérifiera bientôt. ({used}/{limit} aujourd'hui)",
    "pending_dance.pending_title": "En attente d'approbation",
    "pending_dance.pending_body":
      "Un admin va bientôt vérifier votre proposition.",
    "pending_dance.rejected_title": "Refusée",
    "pending_dance.rejected_body":
      "L'admin n'a pas ajouté cette danse à la bibliothèque.",
    "pending_dance.limit_title": "Limite journalière atteinte",
    "pending_dance.limit_body":
      "Vous avez atteint la limite du jour (5). Réessayez demain.",
    "pending_dance.dup_title": "Déjà proposée",
    "pending_dance.dup_pending_body":
      "Cette danse est déjà en attente d'approbation.",
    "pending_dance.dup_library_body":
      "Cette danse est déjà dans la bibliothèque.",
    "pending_dance.error_title": "Une erreur est survenue",
    "pending_dance.error_body": "Merci de réessayer dans un instant.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "Danses en attente",
    "admin_pending.not_allowed": "Réservé aux administrateurs.",
    "admin_pending.tab_pending": "En attente",
    "admin_pending.tab_approved": "Approuvées",
    "admin_pending.tab_rejected": "Refusées",
    "admin_pending.tab_all": "Toutes",
    "admin_pending.empty_pending": "Aucune proposition en attente.",
    "admin_pending.empty_generic": "Rien pour le moment.",
    "admin_pending.untitled": "(Sans titre)",
    "admin_pending.by": "Par",
    "admin_pending.rejected_reason": "Motif du refus",
    "admin_pending.status_approved":
      "Approuvée et ajoutée à la bibliothèque",
    "admin_pending.view_source": "Voir sur {source}",
    "admin_pending.view_dance": "Voir la danse",
    "admin_pending.approve": "Approuver",
    "admin_pending.reject": "Refuser",
    "admin_pending.reject_modal_title":
      "Refuser cette proposition ?",
    "admin_pending.reject_placeholder":
      "Motif facultatif (visible par l'utilisateur)",
    "admin_pending.cancel": "Annuler",
    "admin_pending.confirm_reject": "Refuser",
    "admin_pending.error_load":
      "Impossible de charger les propositions",
    "admin_pending.approve_ok_title":
      "Approuvée et ajoutée à la bibliothèque",
    "admin_pending.approve_dup_title": "Déjà dans la bibliothèque",
    "admin_pending.approve_dup_body":
      "Cette danse est déjà listée. Proposition effacée.",
    "admin_pending.approve_fail": "Échec de l'approbation",
    "admin_pending.reject_fail": "Échec du refus",
  },

  de: {
    // ---------- Onboarding ----------
    "onboarding.language.title": "Wähle deine Sprache",
    "onboarding.language.subtitle":
      "Du kannst das jederzeit unter Profil → Einstellungen ändern.",
    "onboarding.language.continue": "Weiter",
    "onboarding.language.system_default": "Systemsprache",

    // ---------- Age gate ----------
    "age_gate.hero_title": "Altersprüfung",
    "age_gate.hero_sub":
      "Schnür deine Stiefel – kurz ein Schritt zurück.",
    "age_gate.title_line1":
      "Für Stompin' Ground Yuma musst du mindestens",
    "age_gate.title_years": "13 Jahre alt",
    "age_gate.body_copy":
      "Jüngere Tänzer sind mit einem Elternteil oder Erziehungsberechtigten herzlich willkommen – der- oder diejenige legt einfach das Konto an.",
    "age_gate.adult_button": "Ich bin 13 oder älter",
    "age_gate.child_button": "Ich bin unter 13",
    "age_gate.legal":
      "Mit dem Tippen auf {emph} akzeptierst du unsere {terms} und {privacy}.",
    "age_gate.legal_emph": "Ich bin 13 oder älter",
    "age_gate.under13_title":
      "Bitte einen Erwachsenen, sich anzumelden.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma ist für Tänzer ab 13. Wenn du jünger bist, lass ein Elternteil oder eine erziehungsberechtigte Person das Konto anlegen und sich anmelden – ihr könnt dann jederzeit gemeinsam zum Kurs kommen und tanzen!",
    "age_gate.back": "Zurück",

    // ---------- Tabs ----------
    "tabs.home": "Start",
    "tabs.dances": "Tänze",
    "tabs.my_dances": "Meine Tänze",
    "tabs.instructor": "Trainer",
    "tabs.profile": "Profil",

    // ---------- Auth ----------
    "auth.tab_signin": "Anmelden",
    "auth.tab_signup": "Konto erstellen",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "E-Mail",
    "auth.password": "Passwort",
    "auth.name": "Vollständiger Name",
    "auth.instructor_toggle": "Ich bin Trainer:in",
    "auth.instructor_toggle_sub":
      "Braucht den Zugangscode des Studios",
    "auth.instructor_code": "Trainer-Zugangscode",
    "auth.signin_button": "Anmelden",
    "auth.signup_button": "Konto erstellen",
    "auth.continue_with_google": "Mit Google fortfahren",
    "auth.or": "oder",
    "auth.forgot_password": "Passwort vergessen?",
    "auth.legal_signin":
      "Mit dem Fortfahren akzeptierst du unsere {terms} und {privacy}.",
    "auth.legal_signup":
      "Mit dem Anlegen eines Kontos akzeptierst du unsere {terms} und {privacy} und bestätigst, dass Line Dance eine körperliche Aktivität ist, an der du auf eigenes Risiko teilnimmst.",
    "auth.terms": "AGB",
    "auth.terms_of_service": "Nutzungsbedingungen",
    "auth.privacy_policy": "Datenschutzerklärung",
    "auth.error_fill_all": "Bitte alle Felder ausfüllen",
    "auth.error_enter_code":
      "Bitte gib deinen Trainer-Zugangscode ein",
    "auth.error_generic": "Etwas ist schiefgelaufen",
    "auth.error_google_no_session": "Keine Sitzung zurückgegeben",
    "auth.error_google_not_configured":
      "Google-Login ist für diesen Build nicht konfiguriert.",
    "auth.error_google_failed":
      "Google-Anmeldung fehlgeschlagen",
    "auth.account_created_title": "Konto erstellt",
    "auth.account_created_msg":
      "Der Trainer-Zugangscode passte nicht, deshalb bist du als normales Mitglied angemeldet. Du kannst es jederzeit unter Profil → Zum Trainer-Profil wechseln erneut versuchen.",
    "auth.show_password": "Passwort anzeigen",
    "auth.hide_password": "Passwort verbergen",

    // ---------- Welcome ----------
    "welcome.greeting": "Willkommen, {name}!",
    "welcome.subtitle": "Los geht's aufs Parkett 🥾",
    "welcome.default_name": "Freund:in",

    // ---------- Common ----------
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.done": "Fertig",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.back": "Zurück",
    "common.close": "Schließen",
    "common.retry": "Erneut versuchen",
    "common.loading": "Wird geladen…",
    "common.ok": "OK",
    "common.yes": "Ja",
    "common.no": "Nein",
    "common.confirm": "Bestätigen",
    "common.share": "Teilen",
    "common.follow": "Folgen",
    "common.unfollow": "Nicht mehr folgen",
    "common.following": "Folge ich",
    "common.search": "Suchen",
    "common.see_all": "Alle anzeigen",
    "common.error": "Fehler",
    "common.new": "Neu",
    "common.publish": "Veröffentlichen",
    "common.unpublish": "Zurückziehen",
    "common.published": "Veröffentlicht",
    "common.draft": "Entwurf",
    "common.upload": "Hochladen",
    "common.remove": "Entfernen",
    "common.next": "Weiter",
    "common.skip": "Überspringen",
    "common.open_settings": "Einstellungen öffnen",
    "common.permission_needed": "Berechtigung erforderlich",

    // ---------- Home ----------
    "home.hello": "Hi, {name}!",
    "home.hello_no_name": "Hi!",
    "home.subhello": "Bereit für ein paar Steps?",
    "home.browse_cta": "Tänze durchstöbern",
    "home.achievements_title": "Erfolge",
    "home.achievements_sub_unseen":
      "Du hast {count} neue Abzeichen freigeschaltet!",
    "home.achievements_sub_unseen_one":
      "Du hast 1 neues Abzeichen freigeschaltet!",
    "home.achievements_sub_default":
      "Verfolge deine Abzeichen und Übungs-Serie.",
    "home.community_activity": "Community-Aktivität",
    "home.feed_empty_title": "Folge anderen Tänzer:innen",
    "home.feed_empty_sub":
      "Ihre erledigten Tänze, Abzeichen und Serien erscheinen hier.",
    "home.fresh_on_floor": "Frisch auf der Tanzfläche",
    "home.recently_practiced": "Kürzlich geübt",
    "home.pick_up": "Da weitermachen, wo du aufgehört hast",
    "home.leaderboard_title": "Boot-Scoot-Rangliste",
    "home.leaderboard_default_sub":
      "Sieh, wer die Tanzfläche anführt – mach mit.",
    "home.events_title": "Events in deiner Nähe",
    "home.events_sub":
      "Workshops, Socials und Kurse, wo deine Stiefel dich hinbringen.",
    "home.classes_title": "Letzte Kursübersicht",
    "home.classes_sub":
      "Sieh, welche Tänze in den letzten Kursen unterrichtet wurden.",
    "home.suggest_title": "Tanz vorschlagen",
    "home.suggest_title_for": "Tanz für {name} vorschlagen",
    "home.suggest_sub_default":
      "Wähle deinen Haupttrainer und schick ihm deine Ideen.",
    "home.suggest_sub_for":
      "Idee? Schick sie an {name}.",
    "home.about_title": "Über den Veranstaltungsort",
    "home.about_text":
      "Stompin' Ground Yuma ist eine herzliche Community, in der Tänzer:innen jeden Alters und Levels zusammenkommen, lernen, lachen und die Nacht durchtanzen. Schnür deine Stiefel und los geht's.",
    "home.icon_all_ages": "Alle Altersgruppen",
    "home.icon_beginners": "Anfänger willkommen",
    "home.icon_family": "Familienfreundlich",
    "home.website_cta": "stompingroundyuma.org besuchen",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "Line-Dance-Bibliothek",
    "library.search_placeholder":
      "Name, Song, Artist, Choreograf durchsuchen",
    "library.diff_all": "Alle",
    "library.diff_absolute_beginner": "Absoluter Anfänger",
    "library.diff_beginner": "Anfänger",
    "library.diff_improver": "Improver",
    "library.diff_high_improver": "High Improver",
    "library.diff_intermediate": "Fortgeschritten",
    "library.diff_advanced": "Profi",
    "library.empty_none": "Keine Tänze passen zu diesen Filtern.",
    "library.reset_filters": "Filter zurücksetzen",
    "library.cant_find": "Nichts Passendes gefunden?",
    "library.external_cta":
      "In CopperKnob + BootStepper suchen",
    "library.external_cta_q":
      'CopperKnob + BootStepper nach „{q}" durchsuchen',
    "library.single_dir": "Oder ein einzelnes Verzeichnis öffnen",
    "library.popular_copperknob": "Beliebt auf CopperKnob",
    "library.popular_bootstepper": "Beliebt auf BootStepper",
    "library.by": "Von {name}",
    "library.unknown": "Unbekannt",
    "library.source_badge": "Tanzbibliothek",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "Mein Tracker",
    "my_dances.subtitle": "Behalte deine Line-Dance-Reise im Blick",
    "my_dances.tab_completed": "Erledigt ({count})",
    "my_dances.tab_wishlist": "Wunschliste ({count})",
    "my_dances.empty_completed_title":
      "Noch keine Tänze abgeschlossen",
    "my_dances.empty_wishlist_title": "Wunschliste ist leer",
    "my_dances.empty_text":
      "Ab in die Bibliothek und deine nächste Herausforderung finden!",
    "my_dances.browse_dances": "Tänze durchstöbern",
    "my_dances.cert_error_title":
      "Zertifikat konnte nicht heruntergeladen werden",
    "my_dances.cert_download_label": "Zertifikat herunterladen",
    "my_dances.cert_download_hint":
      "Lädt ein PDF-Zertifikat für diesen abgeschlossenen Tanz herunter.",

    // ---------- Instructor ----------
    "instructor.title": "Trainer",
    "instructor.subtitle": "Tänze · Kurse · Events · Chat",
    "instructor.only": "Nur für Trainer:innen.",
    "instructor.new": "Neu",
    "instructor.csv": "CSV",
    "instructor.restore": "Wiederherstellen",
    "instructor.tab_dances": "Tänze",
    "instructor.tab_classes": "Kurse",
    "instructor.tab_events": "Events",
    "instructor.tab_chat": "Chat",
    "instructor.legend_new_dance":
      "Neue Tänze starten als **Entwurf** – nur du siehst sie. Tippe **Veröffentlichen**, um sie mit allen zu teilen.",
    "instructor.no_dances":
      'Noch keine Tänze. Tippe "+ Neu", um einen Tanz mit Schrittzettel hochzuladen, oder erfasse einen Kurs im Kurse-Tab.',
    "instructor.no_classes_yet":
      "Du hast noch keine Kurse erfasst.",
    "instructor.go_to_classes": "Zu den Kursen",
    "instructor.class_session_default": "Kursstunde",
    "instructor.dance_count": "{count} Tänze · {names}",
    "instructor.dance_count_one": "1 Tanz · {names}",
    "instructor.pill_sheet": "Blatt",
    "instructor.pill_no_sheet": "Kein Blatt",
    "instructor.pill_published": "Veröffentlicht",
    "instructor.pill_draft": "Entwurf",
    "instructor.edit_sheet": "Blatt",
    "instructor.chat_lounge_hello":
      "Trainer-Lounge – sag Hallo 👋",
    "instructor.chat_placeholder":
      "Nachricht an die Trainer:innen… (mit @Name markieren)",
    "instructor.events_your_events": "Deine Events",
    "instructor.events_hero_sub":
      "Workshops, Socials und Sondertermine, die du veranstaltest.",
    "instructor.events_add_new": "Neues Event hinzufügen",
    "instructor.events_browse_all": "Alle ansehen",
    "instructor.events_empty_title": "Noch keine Events",
    "instructor.events_empty_sub":
      "Poste deinen nächsten Workshop, Social oder deine Privatparty, damit Tänzer:innen sie in der App finden.",
    "instructor.events_upcoming": "Bevorstehend",
    "instructor.events_past": "Vergangen",
    "instructor.event_delete_title": "Dieses Event löschen?",
    "instructor.event_delete_msg":
      '„{name}" – kann nicht rückgängig gemacht werden.',
    "instructor.event_delete_error":
      "Löschen fehlgeschlagen",
    "instructor.step_sheet_title": "Schrittzettel",
    "instructor.new_dance_title":
      "Neuer Tanz + Schrittzettel",
    "instructor.import_title": "Aus CSV importieren",
    "instructor.import_sub":
      "Tänze in Massen zur Bibliothek hinzufügen",
    "instructor.upload_image": "Bild hochladen",
    "instructor.text_notation": "Textnotation",
    "instructor.image_label": "Bild (PNG/JPG)",
    "instructor.step_sheet_image": "Bild des Schrittzettels",
    "instructor.step_sheet_text": "Text des Schrittzettels",
    "instructor.save_step_sheet": "Schrittzettel speichern",
    "instructor.dance_name": "Name des Tanzes *",
    "instructor.choreographer": "Choreograf:in *",
    "instructor.song": "Song *",
    "instructor.artist": "Künstler:in",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "Counts (z. B. 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube-URL",
    "instructor.autofill_youtube":
      "YouTube-Suche automatisch ausfüllen",
    "instructor.publish_now": "Sofort für alle veröffentlichen",
    "instructor.publish_now_on":
      "Alle sehen diesen Tanz in der öffentlichen Bibliothek.",
    "instructor.publish_now_off":
      "Als Entwurf speichern – nur du siehst ihn bis zur Veröffentlichung.",
    "instructor.save_dance": "Tanz speichern",
    "instructor.enter_name_first": "Erst einen Namen eingeben",
    "instructor.enter_name_first_msg":
      "Gib den Namen des Tanzes ein, damit ich die Suche aufbauen kann.",
    "instructor.missing_info": "Angaben fehlen",
    "instructor.missing_info_msg":
      "Name, Choreograf:in und Song sind Pflichtfelder.",
    "instructor.permission_photo":
      "Erlaube Fotozugriff, um einen Schrittzettel hochzuladen.",

    // ---------- Profile ----------
    "profile.title": "Profil",
    "profile.dancer_default": "Tänzer:in",
    "profile.admin": "Admin",
    "profile.stat_completed": "Erledigt",
    "profile.stat_wishlist": "Wunschliste",
    "profile.stat_classes": "Kurse",
    "profile.stat_avg_rating": "Ø ★",
    "profile.section_achievements": "Erfolge",
    "profile.section_practice_history": "Übungsverlauf",
    "profile.total_sessions": "Sitzungen gesamt",
    "profile.days_active": "aktive Tage",
    "profile.peak_day": "bester Tag",
    "profile.history_foot":
      "Letzte 30 Tage · Öffne einen Tanz und nutze den Übungsmodus, um eine Sitzung zu erfassen.",
    "profile.section_account": "Konto",
    "profile.instructor_tab": "Trainer-Tab",
    "profile.switch_to_instructor":
      "Zum Trainer-Profil wechseln",
    "profile.class_recap": "Kursüberblick",
    "profile.log_a_class": "Kurs erfassen",
    "profile.review_suggestions": "Vorschläge prüfen",
    "profile.suggest_a_dance": "Tanz vorschlagen",
    "profile.suggest_a_dance_to": "{name} einen Tanz vorschlagen",
    "profile.my_instructors": "Meine Trainer:innen",
    "profile.pick_your_instructors": "Wähle deine Trainer:innen",
    "profile.instructors_hint_none":
      "Tippen, um festzulegen, wer deine Vorschläge erhält",
    "profile.instructors_hint_primary_more":
      "Primär: {name} · +{count} weitere",
    "profile.instructors_hint_primary": "Primär: {name}",
    "profile.instructors_hint_no_primary":
      "{count} gewählt – tippen, um primär zu setzen",
    "profile.followed_choreographers":
      "Gefolgte Choreograf:innen",
    "profile.followed_choreographers_sub":
      "Erhalte einen Stubs, wenn sie einen neuen Tanz veröffentlichen",
    "profile.my_mentions": "Meine Erwähnungen",
    "profile.mentions_unread":
      "{count} ungelesene Erwähnungen von Trainer:innen",
    "profile.mentions_unread_one":
      "1 ungelesene Erwähnung von Trainer:innen",
    "profile.mentions_default":
      "Sieh Trainer-Tags in deinem Kurschat",
    "profile.notification_prefs":
      "Benachrichtigungseinstellungen",
    "profile.notification_prefs_sub":
      "Event, Kurs oder Erwähnungen einzeln stummschalten",
    "profile.language": "Sprache",
    "profile.boot_scoot_board": "Boot-Scoot-Rangliste",
    "profile.boot_scoot_visible":
      "Du bist in der Rangliste sichtbar.",
    "profile.boot_scoot_hidden":
      "Du bist verborgen. Zum Beitreten tippen.",
    "profile.follows_row": "Folge ich & Follower",
    "profile.follows_row_sub":
      "{following} folge ich · {followers} Follower",
    "profile.follows_row_sub_plural":
      "{following} folge ich · {followers} Follower",
    "profile.show_activity":
      "Mich im Aktivitäts-Feed zeigen",
    "profile.show_activity_on":
      "Deine Follower sehen deine erledigten Tänze und Abzeichen.",
    "profile.show_activity_off":
      "Deine Aktivität ist für andere verborgen.",
    "profile.certificate_theme": "Zertifikatsdesign",
    "profile.certificate_theme_sub":
      "Legt das Standard-Aussehen der PDF-Zertifikate fest.",
    "profile.couldnt_save": "Konnte nicht gespeichert werden",
    "profile.couldnt_update_theme":
      "Design konnte nicht aktualisiert werden",
    "profile.please_try_again": "Bitte erneut versuchen.",
    "profile.sign_out": "Abmelden",
    "profile.delete_account": "Konto löschen",
    "profile.delete_account_sub":
      "Entfernt dein Konto und deine persönlichen Daten dauerhaft.",
    "profile.section_connect": "Bleib in Verbindung",
    "profile.connect_sub":
      "Folge Stompin' Ground Yuma auf deiner Lieblingsplattform – die Links öffnen die native App, wenn installiert.",
    "profile.share_app": "App teilen",
    "profile.share_app_sub":
      "Lade Freunde zu Stompin' Ground Yuma ein",
    "profile.visit_website": "Website besuchen",
    "profile.privacy_policy": "Datenschutzerklärung",
    "profile.terms_of_service": "Nutzungsbedingungen",
    "profile.community_guidelines": "Community-Regeln",
    "profile.blocked_users": "Blockierte Nutzer:innen",
    "profile.blocked_users_sub":
      "Verwalte, wen du in Chat und Feed stummgeschaltet hast",
    "profile.send_feedback": "Feedback senden",
    "profile.send_feedback_sub": "Bugs, Ideen oder ein Gruß",
    "profile.app_version": "Version {version}",
    "profile.app_version_with_build":
      "Version {version} ({build})",
    "profile.updates_arrive":
      "Updates kommen mit neuen App-Store-/Play-Store-Releases.",
    "profile.about_venue": "Über Stompin' Ground Yuma",
    "profile.about_venue_text":
      "Country Line Dance für alle Altersgruppen in Yuma, AZ. Komm dazu, lern einen neuen Schritt und finde neue Freunde auf der Tanzfläche.",
    "profile.instructor_unlock_title": "Du bist Trainer:in!",
    "profile.instructor_unlock_msg":
      "Dein Trainer-Tab ist jetzt freigeschaltet.",
    "profile.instructor_code_placeholder": "Trainer-Zugangscode",
    "profile.enter_access_code": "Gib deinen Zugangscode ein",
    "profile.invalid_access_code": "Ungültiger Zugangscode",
    "profile.instructor_modal_sub":
      "Gib den Code deines Studios ein, um Trainer-Tools freizuschalten (Kurse erfassen, Schrittzettel hochladen, Tänze bearbeiten, chatten).",
    "profile.unlock": "Freischalten",
    "profile.delete_title": "Konto löschen?",
    "profile.delete_body":
      'Das entfernt dauerhaft:\n• Deinen Login & dein Profil\n• Dein Tanz-Tracking (erledigt / Wunschliste)\n• Deinen Kursbesuchsverlauf\n• Alle Vorschläge oder Chat-Nachrichten, die du gesendet hast\n\nVon dir erstellte Tänze oder Kurse bleiben für die Community sichtbar, dein Name wird jedoch durch „Gelöschte:r Nutzer:in" ersetzt.',
    "profile.delete_cant_undone":
      "Kann nicht rückgängig gemacht werden.",
    "profile.delete_confirm_label":
      "Tippe {word}, um zu bestätigen",
    "profile.delete_type_confirm":
      'Tippe "DELETE" (Großbuchstaben) zum Bestätigen.',
    "profile.delete_forever": "Für immer löschen",
    "profile.deleted_title": "Konto gelöscht",
    "profile.deleted_msg":
      "Dein Konto und deine persönlichen Daten wurden entfernt. Danke, dass du mit uns getanzt hast!",
    "profile.deleted_generic_error":
      "Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
    "profile.sgy_admin": "SGY Admin",
    "profile.moderation_queue": "Feed-Moderations-Warteschlange",
    "profile.user_feedback": "Nutzer-Feedback",
    "profile.refresh_recommendations":
      "Empfehlungen aktualisieren",
    "profile.refresh_recommendations_none":
      "Bibliotheks-Metadaten sind mit den Anbietern synchronisiert",
    "profile.refresh_recommendations_unseen":
      "{count} Tänze mit abweichenden Metadaten",
    "profile.refresh_recommendations_unseen_one":
      "1 Tanz mit abweichenden Metadaten",

    // ---------- Language ----------
    "language.title": "Sprache",
    "language.subtitle":
      "Wähle die Sprache, in der die App und Benachrichtigungen angezeigt werden.",
    "language.system_default": "Systemsprache",
    "language.system_default_hint":
      "Folgt der Sprache des Telefons ({locale}).",
    "language.saved_toast": "Sprache aktualisiert.",

    // ---------- Notifications prefs ----------
    "notifications.title": "Benachrichtigungen",
    "notifications.classes": "Neue Kurse",
    "notifications.events": "Neue Events",
    "notifications.choreographers":
      "Neue Tänze von gefolgten Choreograf:innen",
    "notifications.mentions": "@Erwähnungen im Chat",
    "notifications.reminders": "Kurserinnerungen",

    // ---------- Errors ----------
    "error.generic":
      "Etwas ist schiefgelaufen. Bitte in Kürze erneut versuchen.",
    "error.offline": "Du scheinst offline zu sein.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ Vorschlagen",
    "pending_dance.btn_submitting": "Sende…",
    "pending_dance.btn_pending": "In Prüfung",
    "pending_dance.btn_rejected": "Abgelehnt",
    "pending_dance.btn_in_library": "In der Bibliothek",
    "pending_dance.btn_limit": "{limit}/{limit} heute",
    "pending_dance.submitted_title": "Zur Prüfung eingereicht",
    "pending_dance.submitted_body":
      "Ein Admin prüft es bald. ({used}/{limit} heute)",
    "pending_dance.pending_title": "Warte auf Freigabe",
    "pending_dance.pending_body":
      "Ein Admin prüft deinen Vorschlag bald.",
    "pending_dance.rejected_title": "Abgelehnt",
    "pending_dance.rejected_body":
      "Der Admin hat diesen Tanz nicht in die Bibliothek aufgenommen.",
    "pending_dance.limit_title": "Tageslimit erreicht",
    "pending_dance.limit_body":
      "Du hast das heutige Limit (5) erreicht. Versuch es morgen erneut.",
    "pending_dance.dup_title": "Bereits vorgeschlagen",
    "pending_dance.dup_pending_body":
      "Dieser Tanz wartet bereits auf Freigabe.",
    "pending_dance.dup_library_body":
      "Dieser Tanz ist bereits in der Bibliothek.",
    "pending_dance.error_title": "Etwas ist schiefgelaufen",
    "pending_dance.error_body": "Bitte gleich noch einmal versuchen.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "Ausstehende Tänze",
    "admin_pending.not_allowed": "Nur für Admins.",
    "admin_pending.tab_pending": "Ausstehend",
    "admin_pending.tab_approved": "Freigegeben",
    "admin_pending.tab_rejected": "Abgelehnt",
    "admin_pending.tab_all": "Alle",
    "admin_pending.empty_pending":
      "Keine ausstehenden Vorschläge.",
    "admin_pending.empty_generic": "Hier gibt es noch nichts.",
    "admin_pending.untitled": "(Ohne Titel)",
    "admin_pending.by": "Von",
    "admin_pending.rejected_reason": "Ablehnungsgrund",
    "admin_pending.status_approved":
      "Freigegeben und zur Bibliothek hinzugefügt",
    "admin_pending.view_source": "Auf {source} ansehen",
    "admin_pending.view_dance": "Tanz ansehen",
    "admin_pending.approve": "Freigeben",
    "admin_pending.reject": "Ablehnen",
    "admin_pending.reject_modal_title":
      "Diesen Vorschlag ablehnen?",
    "admin_pending.reject_placeholder":
      "Grund optional (für den Nutzer sichtbar)",
    "admin_pending.cancel": "Abbrechen",
    "admin_pending.confirm_reject": "Ablehnen",
    "admin_pending.error_load":
      "Vorschläge konnten nicht geladen werden",
    "admin_pending.approve_ok_title":
      "Freigegeben und zur Bibliothek hinzugefügt",
    "admin_pending.approve_dup_title":
      "Bereits in der Bibliothek",
    "admin_pending.approve_dup_body":
      "Dieser Tanz ist bereits gelistet. Vorschlag entfernt.",
    "admin_pending.approve_fail": "Freigabe fehlgeschlagen",
    "admin_pending.reject_fail": "Ablehnung fehlgeschlagen",
  },

  nl: {
    // ---------- Onboarding ----------
    "onboarding.language.title": "Kies je taal",
    "onboarding.language.subtitle":
      "Je kunt dit altijd wijzigen via Profiel → Instellingen.",
    "onboarding.language.continue": "Doorgaan",
    "onboarding.language.system_default": "Systeemtaal",

    // ---------- Age gate ----------
    "age_gate.hero_title": "Leeftijdscontrole",
    "age_gate.hero_sub":
      "Snoer je laarzen – nog even één stap.",
    "age_gate.title_line1":
      "Om Stompin' Ground Yuma te gebruiken moet je minstens",
    "age_gate.title_years": "13 jaar oud zijn",
    "age_gate.body_copy":
      "Jongere dansers zijn met een ouder of voogd van harte welkom – laat hen dan het account aanmaken.",
    "age_gate.adult_button": "Ik ben 13 of ouder",
    "age_gate.child_button": "Ik ben jonger dan 13",
    "age_gate.legal":
      "Door op {emph} te tikken ga je akkoord met onze {terms} en {privacy}.",
    "age_gate.legal_emph": "Ik ben 13 of ouder",
    "age_gate.under13_title":
      "Vraag een volwassene om in te loggen.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma is voor dansers vanaf 13. Ben je jonger, laat dan een ouder of voogd het account aanmaken en jou inloggen – ze kunnen je meenemen naar de les en jullie kunnen samen dansen wanneer jullie willen!",
    "age_gate.back": "Terug",

    // ---------- Tabs ----------
    "tabs.home": "Home",
    "tabs.dances": "Dansen",
    "tabs.my_dances": "Mijn dansen",
    "tabs.instructor": "Instructeur",
    "tabs.profile": "Profiel",

    // ---------- Auth ----------
    "auth.tab_signin": "Inloggen",
    "auth.tab_signup": "Account aanmaken",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "E-mail",
    "auth.password": "Wachtwoord",
    "auth.name": "Volledige naam",
    "auth.instructor_toggle": "Ik ben instructeur",
    "auth.instructor_toggle_sub":
      "Vereist de toegangscode van de studio",
    "auth.instructor_code": "Instructeur-toegangscode",
    "auth.signin_button": "Inloggen",
    "auth.signup_button": "Account aanmaken",
    "auth.continue_with_google": "Doorgaan met Google",
    "auth.or": "of",
    "auth.forgot_password": "Wachtwoord vergeten?",
    "auth.legal_signin":
      "Door door te gaan ga je akkoord met onze {terms} en {privacy}.",
    "auth.legal_signup":
      "Door een account aan te maken ga je akkoord met onze {terms} en {privacy}, en bevestig je dat line dance een fysieke activiteit is waaraan je op eigen risico deelneemt.",
    "auth.terms": "Voorwaarden",
    "auth.terms_of_service": "Gebruiksvoorwaarden",
    "auth.privacy_policy": "Privacybeleid",
    "auth.error_fill_all": "Vul alle velden in",
    "auth.error_enter_code":
      "Voer je instructeur-toegangscode in",
    "auth.error_generic": "Er ging iets mis",
    "auth.error_google_no_session":
      "Geen sessie ontvangen",
    "auth.error_google_not_configured":
      "Google-login is niet geconfigureerd voor deze build.",
    "auth.error_google_failed": "Google-login mislukt",
    "auth.account_created_title": "Account aangemaakt",
    "auth.account_created_msg":
      "De instructeur-toegangscode klopte niet, dus je bent aangemeld als gewoon lid. Je kunt het opnieuw proberen via Profiel → Overschakelen naar instructeur-profiel.",
    "auth.show_password": "Wachtwoord tonen",
    "auth.hide_password": "Wachtwoord verbergen",

    // ---------- Welcome ----------
    "welcome.greeting": "Welkom, {name}!",
    "welcome.subtitle": "Tijd om te dansen 🥾",
    "welcome.default_name": "vriend",

    // ---------- Common ----------
    "common.save": "Opslaan",
    "common.cancel": "Annuleren",
    "common.done": "Klaar",
    "common.delete": "Verwijderen",
    "common.edit": "Bewerken",
    "common.back": "Terug",
    "common.close": "Sluiten",
    "common.retry": "Opnieuw proberen",
    "common.loading": "Laden…",
    "common.ok": "OK",
    "common.yes": "Ja",
    "common.no": "Nee",
    "common.confirm": "Bevestigen",
    "common.share": "Delen",
    "common.follow": "Volgen",
    "common.unfollow": "Ontvolgen",
    "common.following": "Volgend",
    "common.search": "Zoeken",
    "common.see_all": "Alle bekijken",
    "common.error": "Fout",
    "common.new": "Nieuw",
    "common.publish": "Publiceren",
    "common.unpublish": "Terugtrekken",
    "common.published": "Gepubliceerd",
    "common.draft": "Concept",
    "common.upload": "Uploaden",
    "common.remove": "Verwijderen",
    "common.next": "Volgende",
    "common.skip": "Overslaan",
    "common.open_settings": "Instellingen openen",
    "common.permission_needed": "Toestemming vereist",

    // ---------- Home ----------
    "home.hello": "Hoi, {name}!",
    "home.hello_no_name": "Hoi!",
    "home.subhello": "Klaar om te swingen?",
    "home.browse_cta": "Dansen bekijken",
    "home.achievements_title": "Prestaties",
    "home.achievements_sub_unseen":
      "Je hebt {count} nieuwe badges vrijgespeeld!",
    "home.achievements_sub_unseen_one":
      "Je hebt 1 nieuwe badge vrijgespeeld!",
    "home.achievements_sub_default":
      "Volg je badges en oefenreeks.",
    "home.community_activity": "Community-activiteit",
    "home.feed_empty_title": "Volg andere dansers",
    "home.feed_empty_sub":
      "Hun voltooide dansen, badges en reeksen verschijnen hier.",
    "home.fresh_on_floor": "Vers op de dansvloer",
    "home.recently_practiced": "Recent geoefend",
    "home.pick_up": "Ga verder waar je gebleven was",
    "home.leaderboard_title": "Boot-Scoot-ranglijst",
    "home.leaderboard_default_sub":
      "Zie wie de dansvloer aanvoert – doe mee.",
    "home.events_title": "Events bij jou in de buurt",
    "home.events_sub":
      "Workshops, socials en lessen waar je laarzen ook heen gaan.",
    "home.classes_title": "Recente lessamenvatting",
    "home.classes_sub":
      "Zie welke dansen in recente lessen zijn gegeven.",
    "home.suggest_title": "Dans voorstellen",
    "home.suggest_title_for":
      "Dans voorstellen voor {name}",
    "home.suggest_sub_default":
      "Kies je hoofdinstructeur en stuur je ideeën door.",
    "home.suggest_sub_for":
      "Idee? Stuur het naar {name}.",
    "home.about_title": "Over de locatie",
    "home.about_text":
      "Stompin' Ground Yuma is een vriendelijke community waar dansers van elke leeftijd en niveau samenkomen om te leren, lachen en de nacht door te dansen. Trek je laarzen aan en laten we dansen.",
    "home.icon_all_ages": "Alle leeftijden",
    "home.icon_beginners": "Beginners welkom",
    "home.icon_family": "Gezinsvriendelijk",
    "home.website_cta": "Bezoek stompingroundyuma.org",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "Line-dance-bibliotheek",
    "library.search_placeholder":
      "Zoek op naam, nummer, artiest, choreograaf",
    "library.diff_all": "Alle",
    "library.diff_absolute_beginner": "Absolute beginner",
    "library.diff_beginner": "Beginner",
    "library.diff_improver": "Improver",
    "library.diff_high_improver": "High improver",
    "library.diff_intermediate": "Gemiddeld",
    "library.diff_advanced": "Gevorderd",
    "library.empty_none":
      "Geen dansen die aan deze filters voldoen.",
    "library.reset_filters": "Filters resetten",
    "library.cant_find": "Niet gevonden wat je zocht?",
    "library.external_cta":
      "Zoek in CopperKnob + BootStepper",
    "library.external_cta_q":
      'CopperKnob + BootStepper doorzoeken op "{q}"',
    "library.single_dir":
      "Of blader door één directory",
    "library.popular_copperknob": "Populair op CopperKnob",
    "library.popular_bootstepper": "Populair op BootStepper",
    "library.by": "Door {name}",
    "library.unknown": "Onbekend",
    "library.source_badge": "Dansbibliotheek",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "Mijn tracker",
    "my_dances.subtitle":
      "Houd je line-dance-reis in de gaten",
    "my_dances.tab_completed": "Voltooid ({count})",
    "my_dances.tab_wishlist": "Verlanglijst ({count})",
    "my_dances.empty_completed_title":
      "Nog geen dansen voltooid",
    "my_dances.empty_wishlist_title":
      "Verlanglijst is leeg",
    "my_dances.empty_text":
      "Ga naar de bibliotheek om je volgende uitdaging te vinden!",
    "my_dances.browse_dances": "Dansen bekijken",
    "my_dances.cert_error_title":
      "Certificaat kon niet worden gedownload",
    "my_dances.cert_download_label":
      "Certificaat downloaden",
    "my_dances.cert_download_hint":
      "Downloadt een PDF-certificaat voor deze voltooide dans.",

    // ---------- Instructor ----------
    "instructor.title": "Instructeur",
    "instructor.subtitle": "Dansen · Lessen · Events · Chat",
    "instructor.only": "Alleen voor instructeurs.",
    "instructor.new": "Nieuw",
    "instructor.csv": "CSV",
    "instructor.restore": "Herstellen",
    "instructor.tab_dances": "Dansen",
    "instructor.tab_classes": "Lessen",
    "instructor.tab_events": "Events",
    "instructor.tab_chat": "Chat",
    "instructor.legend_new_dance":
      "Nieuwe dansen starten als **Concept** – alleen jij ziet ze. Tik op **Publiceren** om ze met iedereen te delen.",
    "instructor.no_dances":
      'Nog geen dansen. Tik op "+ Nieuw" om een dans met stapkaart te uploaden, of registreer een les in het Lessen-tab.',
    "instructor.no_classes_yet":
      "Je hebt nog geen lessen geregistreerd.",
    "instructor.go_to_classes": "Naar Lessen",
    "instructor.class_session_default": "Lesbijeenkomst",
    "instructor.dance_count": "{count} dansen · {names}",
    "instructor.dance_count_one": "1 dans · {names}",
    "instructor.pill_sheet": "Kaart",
    "instructor.pill_no_sheet": "Geen kaart",
    "instructor.pill_published": "Gepubliceerd",
    "instructor.pill_draft": "Concept",
    "instructor.edit_sheet": "Kaart",
    "instructor.chat_lounge_hello":
      "Instructeurs-lounge – zeg hallo 👋",
    "instructor.chat_placeholder":
      "Bericht aan de instructeurs… (tag met @naam)",
    "instructor.events_your_events": "Jouw events",
    "instructor.events_hero_sub":
      "Workshops, socials en avonden die jij organiseert.",
    "instructor.events_add_new": "Nieuw event toevoegen",
    "instructor.events_browse_all": "Alle bekijken",
    "instructor.events_empty_title": "Nog geen events",
    "instructor.events_empty_sub":
      "Plaats je volgende workshop, social of privéfeest zodat dansers het in de app kunnen vinden.",
    "instructor.events_upcoming": "Komende",
    "instructor.events_past": "Voorbij",
    "instructor.event_delete_title": "Dit event verwijderen?",
    "instructor.event_delete_msg":
      '"{name}" – dit kan niet ongedaan worden gemaakt.',
    "instructor.event_delete_error":
      "Verwijderen mislukt",
    "instructor.step_sheet_title": "Stapkaart",
    "instructor.new_dance_title":
      "Nieuwe dans + stapkaart",
    "instructor.import_title": "Importeren vanuit CSV",
    "instructor.import_sub":
      "Voeg dansen in bulk toe aan de bibliotheek",
    "instructor.upload_image": "Afbeelding uploaden",
    "instructor.text_notation": "Tekstnotatie",
    "instructor.image_label": "Afbeelding (PNG/JPG)",
    "instructor.step_sheet_image": "Afbeelding van stapkaart",
    "instructor.step_sheet_text": "Tekst van stapkaart",
    "instructor.save_step_sheet": "Stapkaart opslaan",
    "instructor.dance_name": "Naam van de dans *",
    "instructor.choreographer": "Choreograaf *",
    "instructor.song": "Nummer *",
    "instructor.artist": "Artiest",
    "instructor.bpm_field": "BPM",
    "instructor.count_field":
      "Aantal (bijv. 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube-URL",
    "instructor.autofill_youtube":
      "YouTube-zoekopdracht automatisch invullen",
    "instructor.publish_now": "Meteen voor iedereen publiceren",
    "instructor.publish_now_on":
      "Iedereen ziet deze dans in de openbare bibliotheek.",
    "instructor.publish_now_off":
      "Bewaren als concept – alleen jij ziet hem tot je publiceert.",
    "instructor.save_dance": "Dans opslaan",
    "instructor.enter_name_first":
      "Voer eerst een naam in",
    "instructor.enter_name_first_msg":
      "Typ de naam van de dans zodat ik de zoekopdracht kan bouwen.",
    "instructor.missing_info": "Ontbrekende gegevens",
    "instructor.missing_info_msg":
      "Naam, choreograaf en nummer zijn verplicht.",
    "instructor.permission_photo":
      "Sta toegang tot foto's toe om een stapkaart te uploaden.",

    // ---------- Profile ----------
    "profile.title": "Profiel",
    "profile.dancer_default": "Danser",
    "profile.admin": "Beheerder",
    "profile.stat_completed": "Voltooid",
    "profile.stat_wishlist": "Verlanglijst",
    "profile.stat_classes": "Lessen",
    "profile.stat_avg_rating": "Gem. ★",
    "profile.section_achievements": "Prestaties",
    "profile.section_practice_history": "Oefengeschiedenis",
    "profile.total_sessions": "totaal sessies",
    "profile.days_active": "actieve dagen",
    "profile.peak_day": "beste dag",
    "profile.history_foot":
      "Laatste 30 dagen · Open een dans en gebruik de Oefenmodus om een sessie te loggen.",
    "profile.section_account": "Account",
    "profile.instructor_tab": "Instructeur-tab",
    "profile.switch_to_instructor":
      "Overschakelen naar instructeur-profiel",
    "profile.class_recap": "Les-samenvatting",
    "profile.log_a_class": "Les registreren",
    "profile.review_suggestions": "Voorstellen bekijken",
    "profile.suggest_a_dance": "Dans voorstellen",
    "profile.suggest_a_dance_to":
      "Een dans voorstellen aan {name}",
    "profile.my_instructors": "Mijn instructeurs",
    "profile.pick_your_instructors":
      "Kies je instructeurs",
    "profile.instructors_hint_none":
      "Tik om te kiezen wie jouw voorstellen ontvangt",
    "profile.instructors_hint_primary_more":
      "Primair: {name} · +{count} meer",
    "profile.instructors_hint_primary": "Primair: {name}",
    "profile.instructors_hint_no_primary":
      "{count} gekozen – tik om primair in te stellen",
    "profile.followed_choreographers":
      "Gevolgde choreografen",
    "profile.followed_choreographers_sub":
      "Krijg een tik als ze een nieuwe dans plaatsen",
    "profile.my_mentions": "Mijn vermeldingen",
    "profile.mentions_unread":
      "{count} ongelezen vermeldingen van instructeurs",
    "profile.mentions_unread_one":
      "1 ongelezen vermelding van instructeurs",
    "profile.mentions_default":
      "Zie instructeur-tags in je les-chat",
    "profile.notification_prefs":
      "Meldings­voorkeuren",
    "profile.notification_prefs_sub":
      "Zet events, lessen of vermeldingen afzonderlijk uit",
    "profile.language": "Taal",
    "profile.boot_scoot_board": "Boot-Scoot-ranglijst",
    "profile.boot_scoot_visible":
      "Je bent zichtbaar op de ranglijst.",
    "profile.boot_scoot_hidden":
      "Je bent verborgen. Tik om mee te doen.",
    "profile.follows_row": "Volgend & Volgers",
    "profile.follows_row_sub":
      "{following} volgend · {followers} volger",
    "profile.follows_row_sub_plural":
      "{following} volgend · {followers} volgers",
    "profile.show_activity":
      "Toon mij in activiteitenfeed",
    "profile.show_activity_on":
      "Volgers zien je voltooide dansen en badges.",
    "profile.show_activity_off":
      "Je activiteit is voor anderen verborgen.",
    "profile.certificate_theme": "Certificaatthema",
    "profile.certificate_theme_sub":
      "Bepaalt het standaard uiterlijk van de gedownloade PDF-certificaten.",
    "profile.couldnt_save": "Kon niet opslaan",
    "profile.couldnt_update_theme":
      "Thema kon niet worden bijgewerkt",
    "profile.please_try_again": "Probeer het opnieuw.",
    "profile.sign_out": "Uitloggen",
    "profile.delete_account": "Account verwijderen",
    "profile.delete_account_sub":
      "Verwijdert je account en persoonlijke gegevens definitief.",
    "profile.section_connect": "Verbinden met ons",
    "profile.connect_sub":
      "Volg Stompin' Ground Yuma op je favoriete platform – de links openen de native app als geïnstalleerd.",
    "profile.share_app": "App delen",
    "profile.share_app_sub":
      "Nodig vrienden uit voor Stompin' Ground Yuma",
    "profile.visit_website": "Bezoek onze website",
    "profile.privacy_policy": "Privacybeleid",
    "profile.terms_of_service": "Gebruiksvoorwaarden",
    "profile.community_guidelines": "Community-richtlijnen",
    "profile.blocked_users": "Geblokkeerde gebruikers",
    "profile.blocked_users_sub":
      "Beheer wie je in chat en feed hebt gedempt",
    "profile.send_feedback": "Feedback sturen",
    "profile.send_feedback_sub":
      "Bugs, ideeën of een groet",
    "profile.app_version": "Versie {version}",
    "profile.app_version_with_build":
      "Versie {version} ({build})",
    "profile.updates_arrive":
      "Updates komen met nieuwe App Store / Play Store releases.",
    "profile.about_venue": "Over Stompin' Ground Yuma",
    "profile.about_venue_text":
      "Country line dance voor alle leeftijden in Yuma, AZ. Doe mee, leer een nieuwe stap en maak nieuwe vrienden op de dansvloer.",
    "profile.instructor_unlock_title": "Je bent instructeur!",
    "profile.instructor_unlock_msg":
      "Je instructeur-tab is nu vrijgespeeld.",
    "profile.instructor_code_placeholder":
      "Instructeur-toegangscode",
    "profile.enter_access_code":
      "Voer je toegangscode in",
    "profile.invalid_access_code":
      "Ongeldige toegangscode",
    "profile.instructor_modal_sub":
      "Voer de code van je studio in om instructeur-tools vrij te spelen (lessen registreren, stapkaarten uploaden, dansen bewerken, chatten).",
    "profile.unlock": "Vrijspelen",
    "profile.delete_title": "Je account verwijderen?",
    "profile.delete_body":
      "Dit verwijdert definitief:\n• Je login & profiel\n• Je dans-tracking (voltooid / verlanglijst)\n• Je aanwezigheidsgeschiedenis\n• Alle voorstellen of chatberichten die je hebt gestuurd\n\nDe dansen of lessen die je hebt gemaakt blijven zichtbaar voor de community, maar je naam wordt vervangen door \"Verwijderde gebruiker\".",
    "profile.delete_cant_undone":
      "Dit kan niet ongedaan worden gemaakt.",
    "profile.delete_confirm_label":
      "Typ {word} om te bevestigen",
    "profile.delete_type_confirm":
      'Typ "DELETE" (hoofdletters) om te bevestigen.',
    "profile.delete_forever": "Voor altijd verwijderen",
    "profile.deleted_title": "Account verwijderd",
    "profile.deleted_msg":
      "Je account en persoonlijke gegevens zijn verwijderd. Bedankt dat je met ons hebt gedanst!",
    "profile.deleted_generic_error":
      "Account kon niet worden verwijderd. Probeer het opnieuw.",
    "profile.sgy_admin": "SGY Beheer",
    "profile.moderation_queue": "Feed-moderatie­wachtrij",
    "profile.user_feedback": "Gebruikersfeedback",
    "profile.refresh_recommendations":
      "Aanbevelingen vernieuwen",
    "profile.refresh_recommendations_none":
      "Bibliotheek-metadata is gesynchroniseerd met providers",
    "profile.refresh_recommendations_unseen":
      "{count} dansen met afwijkende metadata",
    "profile.refresh_recommendations_unseen_one":
      "1 dans met afwijkende metadata",

    // ---------- Language ----------
    "language.title": "Taal",
    "language.subtitle":
      "Kies de taal voor de app en meldingen.",
    "language.system_default": "Systeemtaal",
    "language.system_default_hint":
      "Volgt de taal van de telefoon ({locale}).",
    "language.saved_toast": "Taal bijgewerkt.",

    // ---------- Notifications prefs ----------
    "notifications.title": "Meldingen",
    "notifications.classes": "Nieuwe lessen",
    "notifications.events": "Nieuwe events",
    "notifications.choreographers":
      "Nieuwe dansen van gevolgde choreografen",
    "notifications.mentions": "@Vermeldingen in chat",
    "notifications.reminders": "Lesherinneringen",

    // ---------- Errors ----------
    "error.generic":
      "Er ging iets mis. Probeer het zo nog eens.",
    "error.offline": "Je lijkt offline te zijn.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ Voorstellen",
    "pending_dance.btn_submitting": "Verzenden…",
    "pending_dance.btn_pending": "In behandeling",
    "pending_dance.btn_rejected": "Afgewezen",
    "pending_dance.btn_in_library": "In de bibliotheek",
    "pending_dance.btn_limit": "{limit}/{limit} vandaag",
    "pending_dance.submitted_title": "Voorstel ingediend",
    "pending_dance.submitted_body":
      "Een admin bekijkt het snel. ({used}/{limit} vandaag)",
    "pending_dance.pending_title": "Wacht op goedkeuring",
    "pending_dance.pending_body":
      "Een admin beoordeelt je inzending binnenkort.",
    "pending_dance.rejected_title": "Afgewezen",
    "pending_dance.rejected_body":
      "De admin heeft deze dans niet toegevoegd.",
    "pending_dance.limit_title": "Daglimiet bereikt",
    "pending_dance.limit_body":
      "Je hebt het daglimiet bereikt (5). Probeer het morgen opnieuw.",
    "pending_dance.dup_title": "Al ingediend",
    "pending_dance.dup_pending_body":
      "Deze dans wacht al op goedkeuring.",
    "pending_dance.dup_library_body":
      "Deze dans staat al in de bibliotheek.",
    "pending_dance.error_title": "Er ging iets mis",
    "pending_dance.error_body": "Probeer het zo nog eens.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "Wachtende dansen",
    "admin_pending.not_allowed": "Alleen voor admins.",
    "admin_pending.tab_pending": "Wachtend",
    "admin_pending.tab_approved": "Goedgekeurd",
    "admin_pending.tab_rejected": "Afgewezen",
    "admin_pending.tab_all": "Alle",
    "admin_pending.empty_pending":
      "Geen wachtende inzendingen.",
    "admin_pending.empty_generic": "Nog niets hier.",
    "admin_pending.untitled": "(Zonder titel)",
    "admin_pending.by": "Door",
    "admin_pending.rejected_reason": "Reden voor afwijzing",
    "admin_pending.status_approved":
      "Goedgekeurd en toegevoegd aan de bibliotheek",
    "admin_pending.view_source": "Bekijk op {source}",
    "admin_pending.view_dance": "Bekijk dans",
    "admin_pending.approve": "Goedkeuren",
    "admin_pending.reject": "Afwijzen",
    "admin_pending.reject_modal_title":
      "Deze inzending afwijzen?",
    "admin_pending.reject_placeholder":
      "Optionele reden (zichtbaar voor gebruiker)",
    "admin_pending.cancel": "Annuleren",
    "admin_pending.confirm_reject": "Afwijzen",
    "admin_pending.error_load":
      "Inzendingen laden mislukt",
    "admin_pending.approve_ok_title":
      "Goedgekeurd en toegevoegd aan bibliotheek",
    "admin_pending.approve_dup_title":
      "Al in de bibliotheek",
    "admin_pending.approve_dup_body":
      "Deze dans staat al vermeld. Inzending gewist.",
    "admin_pending.approve_fail": "Goedkeuring mislukt",
    "admin_pending.reject_fail": "Afwijzen mislukt",
  },

  ko: {
    // ---------- Onboarding ----------
    "onboarding.language.title": "언어를 선택하세요",
    "onboarding.language.subtitle":
      "프로필 → 설정에서 언제든지 변경할 수 있어요.",
    "onboarding.language.continue": "계속",
    "onboarding.language.system_default": "시스템 기본값",

    // ---------- Age gate ----------
    "age_gate.hero_title": "연령 확인",
    "age_gate.hero_sub": "부츠를 신고 잠깐 확인할게요.",
    "age_gate.title_line1":
      "Stompin' Ground Yuma를 사용하려면",
    "age_gate.title_years": "만 13세 이상",
    "age_gate.body_copy":
      "더 어린 댄서는 부모님이나 보호자가 계정을 만들어 함께 이용하면 언제든 환영해요.",
    "age_gate.adult_button": "만 13세 이상입니다",
    "age_gate.child_button": "만 13세 미만입니다",
    "age_gate.legal":
      "{emph}을(를) 누르면 {terms} 및 {privacy}에 동의하는 것으로 간주됩니다.",
    "age_gate.legal_emph": "만 13세 이상입니다",
    "age_gate.under13_title": "어른에게 로그인을 부탁하세요.",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma는 만 13세 이상 댄서를 위한 서비스예요. 만 13세 미만이라면 부모님이나 보호자에게 계정 생성과 로그인을 부탁해 주세요. 함께 수업에 오시면 언제든 같이 춤출 수 있어요!",
    "age_gate.back": "뒤로",

    // ---------- Tabs ----------
    "tabs.home": "홈",
    "tabs.dances": "댄스",
    "tabs.my_dances": "내 댄스",
    "tabs.instructor": "강사",
    "tabs.profile": "프로필",

    // ---------- Auth ----------
    "auth.tab_signin": "로그인",
    "auth.tab_signup": "계정 만들기",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "이메일",
    "auth.password": "비밀번호",
    "auth.name": "이름",
    "auth.instructor_toggle": "저는 강사입니다",
    "auth.instructor_toggle_sub": "스튜디오 접속 코드가 필요해요",
    "auth.instructor_code": "강사 접속 코드",
    "auth.signin_button": "로그인",
    "auth.signup_button": "계정 만들기",
    "auth.continue_with_google": "Google로 계속하기",
    "auth.or": "또는",
    "auth.forgot_password": "비밀번호를 잊으셨나요?",
    "auth.legal_signin":
      "계속하면 저희 {terms} 및 {privacy}에 동의하는 것으로 간주됩니다.",
    "auth.legal_signup":
      "계정을 만들면 저희 {terms} 및 {privacy}에 동의하며, 라인 댄스는 본인 책임 하에 참여하는 신체 활동임을 인정합니다.",
    "auth.terms": "약관",
    "auth.terms_of_service": "이용 약관",
    "auth.privacy_policy": "개인정보 처리방침",
    "auth.error_fill_all": "모든 항목을 입력해 주세요",
    "auth.error_enter_code": "강사 접속 코드를 입력해 주세요",
    "auth.error_generic": "문제가 발생했어요",
    "auth.error_google_no_session": "세션이 반환되지 않았어요",
    "auth.error_google_not_configured":
      "이 빌드에는 Google 로그인이 구성되어 있지 않아요.",
    "auth.error_google_failed": "Google 로그인 실패",
    "auth.account_created_title": "계정이 생성되었어요",
    "auth.account_created_msg":
      "강사 접속 코드가 일치하지 않아 일반 회원으로 로그인되었어요. 프로필 → 강사 프로필로 전환에서 다시 시도할 수 있어요.",
    "auth.show_password": "비밀번호 보기",
    "auth.hide_password": "비밀번호 숨기기",

    // ---------- Welcome ----------
    "welcome.greeting": "{name}님, 환영해요!",
    "welcome.subtitle": "함께 춤춰봐요 🥾",
    "welcome.default_name": "친구",

    // ---------- Common ----------
    "common.save": "저장",
    "common.cancel": "취소",
    "common.done": "완료",
    "common.delete": "삭제",
    "common.edit": "편집",
    "common.back": "뒤로",
    "common.close": "닫기",
    "common.retry": "다시 시도",
    "common.loading": "불러오는 중…",
    "common.ok": "확인",
    "common.yes": "예",
    "common.no": "아니오",
    "common.confirm": "확인",
    "common.share": "공유",
    "common.follow": "팔로우",
    "common.unfollow": "팔로우 취소",
    "common.following": "팔로잉",
    "common.search": "검색",
    "common.see_all": "모두 보기",
    "common.error": "오류",
    "common.new": "새로 만들기",
    "common.publish": "게시",
    "common.unpublish": "게시 취소",
    "common.published": "게시됨",
    "common.draft": "초안",
    "common.upload": "업로드",
    "common.remove": "제거",
    "common.next": "다음",
    "common.skip": "건너뛰기",
    "common.open_settings": "설정 열기",
    "common.permission_needed": "권한이 필요합니다",

    // ---------- Home ----------
    "home.hello": "안녕하세요, {name}님!",
    "home.hello_no_name": "안녕하세요!",
    "home.subhello": "춤 출 준비 되셨나요?",
    "home.browse_cta": "댄스 둘러보기",
    "home.achievements_title": "업적",
    "home.achievements_sub_unseen":
      "새 배지 {count}개를 획득했어요!",
    "home.achievements_sub_unseen_one":
      "새 배지 1개를 획득했어요!",
    "home.achievements_sub_default":
      "배지와 연습 스트릭을 확인해요.",
    "home.community_activity": "커뮤니티 활동",
    "home.feed_empty_title": "다른 댄서를 팔로우해 보세요",
    "home.feed_empty_sub":
      "그들의 완료한 댄스, 배지, 스트릭이 여기에 표시돼요.",
    "home.fresh_on_floor": "새로 올라온 댄스",
    "home.recently_practiced": "최근 연습한 댄스",
    "home.pick_up": "이어서 계속하기",
    "home.leaderboard_title": "부트 스쿠트 랭킹",
    "home.leaderboard_default_sub":
      "댄스플로어를 이끄는 사람을 확인하고 도전해 보세요.",
    "home.events_title": "주변 이벤트 찾기",
    "home.events_sub":
      "부츠가 가는 곳마다 워크숍, 소셜, 수업이 있어요.",
    "home.classes_title": "최근 수업 요약",
    "home.classes_sub":
      "최근 수업에서 어떤 댄스를 배웠는지 확인해요.",
    "home.suggest_title": "댄스 추천하기",
    "home.suggest_title_for": "{name}님에게 댄스 추천",
    "home.suggest_sub_default":
      "주 강사를 선택하고 아이디어를 보내세요.",
    "home.suggest_sub_for":
      "아이디어가 있나요? {name}님에게 보내세요.",
    "home.about_title": "장소 소개",
    "home.about_text":
      "Stompin' Ground Yuma는 모든 연령과 실력의 댄서가 함께 배우고 웃고 밤새 춤추는 친절한 커뮤니티예요. 부츠를 챙기고 함께 춤춰요.",
    "home.icon_all_ages": "모든 연령",
    "home.icon_beginners": "초보자 환영",
    "home.icon_family": "가족 친화적",
    "home.website_cta": "stompingroundyuma.org 방문",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "라인 댄스 라이브러리",
    "library.search_placeholder":
      "이름, 곡, 아티스트, 안무가로 검색",
    "library.diff_all": "전체",
    "library.diff_absolute_beginner": "완전 초보",
    "library.diff_beginner": "초급",
    "library.diff_improver": "향상",
    "library.diff_high_improver": "고급 향상",
    "library.diff_intermediate": "중급",
    "library.diff_advanced": "고급",
    "library.empty_none": "이 필터에 맞는 댄스가 없어요.",
    "library.reset_filters": "필터 초기화",
    "library.cant_find": "찾는 것을 발견하지 못했나요?",
    "library.external_cta":
      "CopperKnob + BootStepper에서 검색",
    "library.external_cta_q":
      'CopperKnob + BootStepper에서 "{q}" 검색',
    "library.single_dir": "또는 개별 디렉터리 탐색",
    "library.popular_copperknob": "CopperKnob 인기 순위",
    "library.popular_bootstepper": "BootStepper 인기 순위",
    "library.by": "{name} 안무",
    "library.unknown": "알 수 없음",
    "library.source_badge": "댄스 라이브러리",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "내 트래커",
    "my_dances.subtitle":
      "라인 댄스 여정을 기록하세요",
    "my_dances.tab_completed": "완료 ({count})",
    "my_dances.tab_wishlist": "위시리스트 ({count})",
    "my_dances.empty_completed_title":
      "아직 완료한 댄스가 없어요",
    "my_dances.empty_wishlist_title":
      "위시리스트가 비어 있어요",
    "my_dances.empty_text":
      "라이브러리에서 다음 도전 상대를 찾아보세요!",
    "my_dances.browse_dances": "댄스 둘러보기",
    "my_dances.cert_error_title":
      "인증서를 다운로드할 수 없어요",
    "my_dances.cert_download_label":
      "인증서 다운로드",
    "my_dances.cert_download_hint":
      "완료된 댄스의 PDF 인증서를 다운로드합니다.",

    // ---------- Instructor ----------
    "instructor.title": "강사",
    "instructor.subtitle": "댄스 · 수업 · 이벤트 · 채팅",
    "instructor.only": "강사 전용입니다.",
    "instructor.new": "새로 만들기",
    "instructor.csv": "CSV",
    "instructor.restore": "복원",
    "instructor.tab_dances": "댄스",
    "instructor.tab_classes": "수업",
    "instructor.tab_events": "이벤트",
    "instructor.tab_chat": "채팅",
    "instructor.legend_new_dance":
      "새 댄스는 **초안**으로 시작해요 – 본인만 볼 수 있어요. **게시**를 누르면 모두와 공유돼요.",
    "instructor.no_dances":
      '아직 댄스가 없어요. "+ 새로 만들기"를 눌러 스텝시트와 함께 댄스를 업로드하거나 수업 탭에서 수업을 기록하세요.',
    "instructor.no_classes_yet":
      "아직 기록한 수업이 없어요.",
    "instructor.go_to_classes": "수업으로 이동",
    "instructor.class_session_default": "수업",
    "instructor.dance_count": "댄스 {count}개 · {names}",
    "instructor.dance_count_one": "댄스 1개 · {names}",
    "instructor.pill_sheet": "시트",
    "instructor.pill_no_sheet": "시트 없음",
    "instructor.pill_published": "게시됨",
    "instructor.pill_draft": "초안",
    "instructor.edit_sheet": "시트",
    "instructor.chat_lounge_hello":
      "강사 라운지 – 인사해요 👋",
    "instructor.chat_placeholder":
      "강사들에게 메시지… (@이름으로 태그)",
    "instructor.events_your_events": "내 이벤트",
    "instructor.events_hero_sub":
      "당신이 개최하는 워크숍, 소셜, 팝업 나이트.",
    "instructor.events_add_new": "새 이벤트 추가",
    "instructor.events_browse_all": "모두 보기",
    "instructor.events_empty_title": "아직 이벤트가 없어요",
    "instructor.events_empty_sub":
      "다음 워크숍, 소셜 또는 프라이빗 파티를 게시하여 앱에서 댄서들이 찾을 수 있게 해주세요.",
    "instructor.events_upcoming": "예정",
    "instructor.events_past": "지난",
    "instructor.event_delete_title": "이 이벤트를 삭제하시겠어요?",
    "instructor.event_delete_msg":
      '"{name}" – 되돌릴 수 없어요.',
    "instructor.event_delete_error": "삭제하지 못했어요",
    "instructor.step_sheet_title": "스텝시트",
    "instructor.new_dance_title":
      "새 댄스 + 스텝시트",
    "instructor.import_title": "CSV에서 가져오기",
    "instructor.import_sub":
      "댄스를 라이브러리에 일괄 추가",
    "instructor.upload_image": "이미지 업로드",
    "instructor.text_notation": "텍스트 표기",
    "instructor.image_label": "이미지 (PNG/JPG)",
    "instructor.step_sheet_image": "스텝시트 이미지",
    "instructor.step_sheet_text": "스텝시트 텍스트",
    "instructor.save_step_sheet": "스텝시트 저장",
    "instructor.dance_name": "댄스 이름 *",
    "instructor.choreographer": "안무가 *",
    "instructor.song": "곡 *",
    "instructor.artist": "아티스트",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "카운트 (예: 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube URL",
    "instructor.autofill_youtube":
      "YouTube 검색 자동 입력",
    "instructor.publish_now": "즉시 모두에게 게시",
    "instructor.publish_now_on":
      "모두가 공개 라이브러리에서 이 댄스를 볼 수 있어요.",
    "instructor.publish_now_off":
      "초안으로 저장 – 게시 전까지 본인만 볼 수 있어요.",
    "instructor.save_dance": "댄스 저장",
    "instructor.enter_name_first": "먼저 이름을 입력해 주세요",
    "instructor.enter_name_first_msg":
      "검색을 만들기 위해 댄스 이름을 입력해 주세요.",
    "instructor.missing_info": "필요한 정보가 부족해요",
    "instructor.missing_info_msg":
      "이름, 안무가, 곡은 필수입니다.",
    "instructor.permission_photo":
      "스텝시트를 업로드하려면 사진 접근을 허용해 주세요.",

    // ---------- Profile ----------
    "profile.title": "프로필",
    "profile.dancer_default": "댄서",
    "profile.admin": "관리자",
    "profile.stat_completed": "완료",
    "profile.stat_wishlist": "위시리스트",
    "profile.stat_classes": "수업",
    "profile.stat_avg_rating": "평균 ★",
    "profile.section_achievements": "업적",
    "profile.section_practice_history": "연습 기록",
    "profile.total_sessions": "전체 세션",
    "profile.days_active": "활동 일수",
    "profile.peak_day": "최고 기록일",
    "profile.history_foot":
      "최근 30일 · 댄스를 열고 연습 모드로 세션을 기록하세요.",
    "profile.section_account": "계정",
    "profile.instructor_tab": "강사 탭",
    "profile.switch_to_instructor": "강사 프로필로 전환",
    "profile.class_recap": "수업 요약",
    "profile.log_a_class": "수업 기록",
    "profile.review_suggestions": "제안 검토",
    "profile.suggest_a_dance": "댄스 추천",
    "profile.suggest_a_dance_to":
      "{name}님에게 댄스 추천",
    "profile.my_instructors": "내 강사",
    "profile.pick_your_instructors": "강사를 선택하세요",
    "profile.instructors_hint_none":
      "제안을 받을 강사를 선택하려면 탭하세요",
    "profile.instructors_hint_primary_more":
      "주 강사: {name} · 외 {count}명",
    "profile.instructors_hint_primary": "주 강사: {name}",
    "profile.instructors_hint_no_primary":
      "{count}명 선택됨 – 주 강사를 지정하려면 탭",
    "profile.followed_choreographers":
      "팔로우한 안무가",
    "profile.followed_choreographers_sub":
      "새 댄스를 올리면 알려드려요",
    "profile.my_mentions": "받은 언급",
    "profile.mentions_unread":
      "강사가 남긴 읽지 않은 언급 {count}개",
    "profile.mentions_unread_one":
      "강사가 남긴 읽지 않은 언급 1개",
    "profile.mentions_default":
      "수업 채팅에서 강사 태그를 확인해요",
    "profile.notification_prefs": "알림 설정",
    "profile.notification_prefs_sub":
      "이벤트, 수업, 언급 알림을 개별로 음소거",
    "profile.language": "언어",
    "profile.boot_scoot_board": "부트 스쿠트 랭킹",
    "profile.boot_scoot_visible": "랭킹에 표시돼요.",
    "profile.boot_scoot_hidden":
      "숨김 상태예요. 참여하려면 탭하세요.",
    "profile.follows_row": "팔로우 및 팔로워",
    "profile.follows_row_sub":
      "팔로잉 {following} · 팔로워 {followers}",
    "profile.follows_row_sub_plural":
      "팔로잉 {following} · 팔로워 {followers}",
    "profile.show_activity": "활동 피드에 표시",
    "profile.show_activity_on":
      "팔로워가 당신의 완료 댄스와 배지를 볼 수 있어요.",
    "profile.show_activity_off":
      "당신의 활동은 다른 사람에게 숨겨져 있어요.",
    "profile.certificate_theme": "인증서 테마",
    "profile.certificate_theme_sub":
      "다운로드하는 PDF 인증서의 기본 디자인이에요.",
    "profile.couldnt_save": "저장하지 못했어요",
    "profile.couldnt_update_theme":
      "테마를 업데이트하지 못했어요",
    "profile.please_try_again": "다시 시도해 주세요.",
    "profile.sign_out": "로그아웃",
    "profile.delete_account": "계정 삭제",
    "profile.delete_account_sub":
      "계정과 개인 데이터를 영구적으로 삭제합니다.",
    "profile.section_connect": "함께해요",
    "profile.connect_sub":
      "좋아하는 플랫폼에서 Stompin' Ground Yuma를 팔로우하세요. 설치되어 있으면 네이티브 앱이 열립니다.",
    "profile.share_app": "앱 공유",
    "profile.share_app_sub":
      "친구를 Stompin' Ground Yuma에 초대해요",
    "profile.visit_website": "웹사이트 방문",
    "profile.privacy_policy": "개인정보 처리방침",
    "profile.terms_of_service": "이용 약관",
    "profile.community_guidelines": "커뮤니티 가이드라인",
    "profile.blocked_users": "차단된 사용자",
    "profile.blocked_users_sub":
      "채팅과 피드에서 음소거한 사람 관리",
    "profile.send_feedback": "피드백 보내기",
    "profile.send_feedback_sub": "버그, 아이디어 또는 인사",
    "profile.app_version": "버전 {version}",
    "profile.app_version_with_build": "버전 {version} ({build})",
    "profile.updates_arrive":
      "업데이트는 새로운 App Store / Play Store 릴리스와 함께 제공됩니다.",
    "profile.about_venue": "Stompin' Ground Yuma 소개",
    "profile.about_venue_text":
      "애리조나 유마의 모든 연령을 위한 컨트리 라인 댄스. 함께 참여해 새 스텝을 배우고 댄스플로어에서 친구를 사귀세요.",
    "profile.instructor_unlock_title": "강사가 되셨어요!",
    "profile.instructor_unlock_msg":
      "강사 탭이 활성화되었어요.",
    "profile.instructor_code_placeholder":
      "강사 접속 코드",
    "profile.enter_access_code": "접속 코드를 입력해 주세요",
    "profile.invalid_access_code": "잘못된 접속 코드",
    "profile.instructor_modal_sub":
      "스튜디오에서 받은 접속 코드를 입력해 강사 도구(수업 기록, 스텝시트 업로드, 댄스 편집, 채팅)를 활성화하세요.",
    "profile.unlock": "활성화",
    "profile.delete_title": "계정을 삭제할까요?",
    "profile.delete_body":
      "이 작업은 다음을 영구적으로 제거해요:\n• 로그인 및 프로필\n• 댄스 트래킹 (완료 / 위시리스트)\n• 수업 참여 기록\n• 보낸 모든 제안 및 채팅 메시지\n\n작성한 댄스나 수업은 커뮤니티에 계속 표시되지만 이름은 \"삭제된 사용자\"로 대체돼요.",
    "profile.delete_cant_undone": "되돌릴 수 없어요.",
    "profile.delete_confirm_label":
      "확인하려면 {word}를 입력하세요",
    "profile.delete_type_confirm":
      '"DELETE"(대문자)를 입력해 확인하세요.',
    "profile.delete_forever": "영구 삭제",
    "profile.deleted_title": "계정 삭제됨",
    "profile.deleted_msg":
      "계정과 개인 데이터가 제거되었어요. 함께 춤춰주셔서 감사해요!",
    "profile.deleted_generic_error":
      "계정을 삭제하지 못했어요. 다시 시도해 주세요.",
    "profile.sgy_admin": "SGY 관리자",
    "profile.moderation_queue": "피드 신고 대기열",
    "profile.user_feedback": "사용자 피드백",
    "profile.refresh_recommendations": "추천 새로고침",
    "profile.refresh_recommendations_none":
      "라이브러리 메타데이터가 제공자와 동기화되었어요",
    "profile.refresh_recommendations_unseen":
      "메타데이터가 어긋난 댄스 {count}개",
    "profile.refresh_recommendations_unseen_one":
      "메타데이터가 어긋난 댄스 1개",

    // ---------- Language ----------
    "language.title": "언어",
    "language.subtitle":
      "앱과 알림에 사용할 언어를 선택하세요.",
    "language.system_default": "시스템 기본값",
    "language.system_default_hint":
      "휴대폰 언어를 따라요 ({locale}).",
    "language.saved_toast": "언어가 업데이트되었어요.",

    // ---------- Notifications prefs ----------
    "notifications.title": "알림",
    "notifications.classes": "새 수업",
    "notifications.events": "새 이벤트",
    "notifications.choreographers":
      "팔로우한 안무가의 새 댄스",
    "notifications.mentions": "채팅에서 @언급",
    "notifications.reminders": "수업 리마인더",

    // ---------- Errors ----------
    "error.generic": "문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
    "error.offline": "오프라인 상태로 보여요.",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ 추가 요청",
    "pending_dance.btn_submitting": "제출 중…",
    "pending_dance.btn_pending": "검토 중",
    "pending_dance.btn_rejected": "거절됨",
    "pending_dance.btn_in_library": "라이브러리에 있음",
    "pending_dance.btn_limit": "오늘 {limit}/{limit}",
    "pending_dance.submitted_title": "검토 요청 완료",
    "pending_dance.submitted_body":
      "관리자가 곧 확인합니다. (오늘 {used}/{limit})",
    "pending_dance.pending_title": "승인 대기",
    "pending_dance.pending_body":
      "관리자가 곧 검토합니다.",
    "pending_dance.rejected_title": "거절됨",
    "pending_dance.rejected_body":
      "관리자가 이 댄스를 라이브러리에 추가하지 않았어요.",
    "pending_dance.limit_title": "일일 한도 도달",
    "pending_dance.limit_body":
      "오늘 한도(5)에 도달했어요. 내일 다시 시도해 주세요.",
    "pending_dance.dup_title": "이미 요청됨",
    "pending_dance.dup_pending_body":
      "이 댄스는 이미 승인 대기 중입니다.",
    "pending_dance.dup_library_body":
      "이 댄스는 이미 라이브러리에 있습니다.",
    "pending_dance.error_title": "문제가 발생했어요",
    "pending_dance.error_body": "잠시 후 다시 시도해 주세요.",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "대기 중인 댄스",
    "admin_pending.not_allowed": "관리자 전용입니다.",
    "admin_pending.tab_pending": "대기",
    "admin_pending.tab_approved": "승인됨",
    "admin_pending.tab_rejected": "거절됨",
    "admin_pending.tab_all": "전체",
    "admin_pending.empty_pending":
      "대기 중인 요청이 없어요.",
    "admin_pending.empty_generic": "아직 아무 것도 없어요.",
    "admin_pending.untitled": "(제목 없음)",
    "admin_pending.by": "제공",
    "admin_pending.rejected_reason": "거절 사유",
    "admin_pending.status_approved":
      "승인되어 라이브러리에 추가됨",
    "admin_pending.view_source": "{source}에서 보기",
    "admin_pending.view_dance": "댄스 보기",
    "admin_pending.approve": "승인",
    "admin_pending.reject": "거절",
    "admin_pending.reject_modal_title":
      "이 요청을 거절할까요?",
    "admin_pending.reject_placeholder":
      "선택 사유 (사용자에게 표시됨)",
    "admin_pending.cancel": "취소",
    "admin_pending.confirm_reject": "거절",
    "admin_pending.error_load":
      "요청을 불러오지 못했어요",
    "admin_pending.approve_ok_title":
      "승인 후 라이브러리에 추가되었어요",
    "admin_pending.approve_dup_title":
      "이미 라이브러리에 있어요",
    "admin_pending.approve_dup_body":
      "이 댄스는 이미 등록되어 있어요. 요청을 정리했어요.",
    "admin_pending.approve_fail": "승인에 실패했어요",
    "admin_pending.reject_fail": "거절에 실패했어요",
  },

  "zh-Hans": {
    // ---------- Onboarding ----------
    "onboarding.language.title": "选择您的语言",
    "onboarding.language.subtitle":
      "您可以随时在「个人资料 → 设置」中更改。",
    "onboarding.language.continue": "继续",
    "onboarding.language.system_default": "系统默认",

    // ---------- Age gate ----------
    "age_gate.hero_title": "年龄验证",
    "age_gate.hero_sub": "穿上靴子——先做一步确认。",
    "age_gate.title_line1":
      "要使用 Stompin' Ground Yuma,您必须年满",
    "age_gate.title_years": "13 岁",
    "age_gate.body_copy":
      "年幼的舞者欢迎与父母或监护人一起加入,让他们来创建账号即可。",
    "age_gate.adult_button": "我已满 13 岁",
    "age_gate.child_button": "我未满 13 岁",
    "age_gate.legal":
      "点击「{emph}」即表示您同意我们的{terms}和{privacy}。",
    "age_gate.legal_emph": "我已满 13 岁",
    "age_gate.under13_title": "请让成年人登录。",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma 面向 13 岁及以上的舞者。如果您未满 13 岁,请让父母或监护人创建账号并登录——他们可以带您来上课,你们随时可以一起跳舞!",
    "age_gate.back": "返回",

    // ---------- Tabs ----------
    "tabs.home": "首页",
    "tabs.dances": "舞蹈",
    "tabs.my_dances": "我的舞蹈",
    "tabs.instructor": "教练",
    "tabs.profile": "我的",

    // ---------- Auth ----------
    "auth.tab_signin": "登录",
    "auth.tab_signup": "创建账号",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "邮箱",
    "auth.password": "密码",
    "auth.name": "姓名",
    "auth.instructor_toggle": "我是教练",
    "auth.instructor_toggle_sub": "需要工作室提供的访问码",
    "auth.instructor_code": "教练访问码",
    "auth.signin_button": "登录",
    "auth.signup_button": "创建账号",
    "auth.continue_with_google": "使用 Google 继续",
    "auth.or": "或",
    "auth.forgot_password": "忘记密码?",
    "auth.legal_signin":
      "继续即表示您同意我们的{terms}和{privacy}。",
    "auth.legal_signup":
      "创建账号即表示您同意我们的{terms}和{privacy},并知悉排舞是一项体育活动,您需自行承担参与风险。",
    "auth.terms": "条款",
    "auth.terms_of_service": "服务条款",
    "auth.privacy_policy": "隐私政策",
    "auth.error_fill_all": "请填写所有字段",
    "auth.error_enter_code": "请输入您的教练访问码",
    "auth.error_generic": "出错了",
    "auth.error_google_no_session": "未返回会话",
    "auth.error_google_not_configured":
      "此版本未配置 Google 登录。",
    "auth.error_google_failed": "Google 登录失败",
    "auth.account_created_title": "账号已创建",
    "auth.account_created_msg":
      "教练访问码不匹配,已以普通会员身份登录。您可以从「个人资料 → 切换到教练资料」再次尝试。",
    "auth.show_password": "显示密码",
    "auth.hide_password": "隐藏密码",

    // ---------- Welcome ----------
    "welcome.greeting": "{name},欢迎加入!",
    "welcome.subtitle": "一起跳舞吧 🥾",
    "welcome.default_name": "朋友",

    // ---------- Common ----------
    "common.save": "保存",
    "common.cancel": "取消",
    "common.done": "完成",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.back": "返回",
    "common.close": "关闭",
    "common.retry": "重试",
    "common.loading": "加载中…",
    "common.ok": "确定",
    "common.yes": "是",
    "common.no": "否",
    "common.confirm": "确认",
    "common.share": "分享",
    "common.follow": "关注",
    "common.unfollow": "取消关注",
    "common.following": "已关注",
    "common.search": "搜索",
    "common.see_all": "查看全部",
    "common.error": "错误",
    "common.new": "新建",
    "common.publish": "发布",
    "common.unpublish": "撤回",
    "common.published": "已发布",
    "common.draft": "草稿",
    "common.upload": "上传",
    "common.remove": "移除",
    "common.next": "下一步",
    "common.skip": "跳过",
    "common.open_settings": "打开设置",
    "common.permission_needed": "需要权限",

    // ---------- Home ----------
    "home.hello": "你好,{name}!",
    "home.hello_no_name": "你好!",
    "home.subhello": "准备好跳一段了吗?",
    "home.browse_cta": "浏览舞蹈",
    "home.achievements_title": "成就",
    "home.achievements_sub_unseen":
      "您解锁了 {count} 枚新徽章!",
    "home.achievements_sub_unseen_one":
      "您解锁了 1 枚新徽章!",
    "home.achievements_sub_default":
      "查看您的徽章和练习连击。",
    "home.community_activity": "社区动态",
    "home.feed_empty_title": "关注其他舞者",
    "home.feed_empty_sub":
      "他们完成的舞蹈、徽章和连击都会显示在这里。",
    "home.fresh_on_floor": "新鲜出炉",
    "home.recently_practiced": "最近练习",
    "home.pick_up": "从上次的位置继续",
    "home.leaderboard_title": "Boot Scoot 排行榜",
    "home.leaderboard_default_sub":
      "看看谁在舞池上领先——加入他们。",
    "home.events_title": "身边的活动",
    "home.events_sub":
      "工作坊、社交活动和课程,靴子到哪都有。",
    "home.classes_title": "近期课程回顾",
    "home.classes_sub":
      "看看最近课程都教了哪些舞蹈。",
    "home.suggest_title": "推荐舞蹈",
    "home.suggest_title_for": "向 {name} 推荐舞蹈",
    "home.suggest_sub_default":
      "选择您的主教练并把想法发给他们。",
    "home.suggest_sub_for":
      "有想法?发给 {name}。",
    "home.about_title": "关于场地",
    "home.about_text":
      "Stompin' Ground Yuma 是一个友好的社区,汇集不同年龄和水平的舞者一起学习、欢笑,并整夜跳舞。穿上靴子,开跳吧。",
    "home.icon_all_ages": "全年龄段",
    "home.icon_beginners": "欢迎初学者",
    "home.icon_family": "适合全家",
    "home.website_cta": "访问 stompingroundyuma.org",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "排舞资料库",
    "library.search_placeholder":
      "搜索名称、歌曲、艺术家、编舞",
    "library.diff_all": "全部",
    "library.diff_absolute_beginner": "零基础",
    "library.diff_beginner": "入门",
    "library.diff_improver": "进阶",
    "library.diff_high_improver": "高阶进阶",
    "library.diff_intermediate": "中级",
    "library.diff_advanced": "高级",
    "library.empty_none": "没有符合筛选条件的舞蹈。",
    "library.reset_filters": "重置筛选",
    "library.cant_find": "找不到想要的?",
    "library.external_cta":
      "在 CopperKnob + BootStepper 中搜索",
    "library.external_cta_q":
      '在 CopperKnob + BootStepper 中搜索"{q}"',
    "library.single_dir": "或浏览单一目录",
    "library.popular_copperknob": "CopperKnob 热门",
    "library.popular_bootstepper": "BootStepper 热门",
    "library.by": "编舞:{name}",
    "library.unknown": "未知",
    "library.source_badge": "舞蹈资料库",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "我的记录",
    "my_dances.subtitle": "记录您的排舞旅程",
    "my_dances.tab_completed": "已完成 ({count})",
    "my_dances.tab_wishlist": "心愿单 ({count})",
    "my_dances.empty_completed_title": "还没有完成的舞蹈",
    "my_dances.empty_wishlist_title": "心愿单是空的",
    "my_dances.empty_text":
      "去资料库找到您的下一项挑战吧!",
    "my_dances.browse_dances": "浏览舞蹈",
    "my_dances.cert_error_title":
      "无法下载证书",
    "my_dances.cert_download_label": "下载证书",
    "my_dances.cert_download_hint":
      "为此已完成的舞蹈下载 PDF 证书。",

    // ---------- Instructor ----------
    "instructor.title": "教练",
    "instructor.subtitle": "舞蹈 · 课程 · 活动 · 聊天",
    "instructor.only": "仅限教练使用。",
    "instructor.new": "新建",
    "instructor.csv": "CSV",
    "instructor.restore": "还原",
    "instructor.tab_dances": "舞蹈",
    "instructor.tab_classes": "课程",
    "instructor.tab_events": "活动",
    "instructor.tab_chat": "聊天",
    "instructor.legend_new_dance":
      "新舞蹈会先以**草稿**形式保存——仅您可见。点击**发布**即可与所有人分享。",
    "instructor.no_dances":
      '还没有舞蹈。点击"+ 新建"上传舞蹈及其步谱,或在课程标签页记录一节课。',
    "instructor.no_classes_yet": "您还没有记录任何课程。",
    "instructor.go_to_classes": "前往课程",
    "instructor.class_session_default": "课程",
    "instructor.dance_count": "{count} 支舞蹈 · {names}",
    "instructor.dance_count_one": "1 支舞蹈 · {names}",
    "instructor.pill_sheet": "步谱",
    "instructor.pill_no_sheet": "无步谱",
    "instructor.pill_published": "已发布",
    "instructor.pill_draft": "草稿",
    "instructor.edit_sheet": "步谱",
    "instructor.chat_lounge_hello":
      "教练休息室 —— 打个招呼 👋",
    "instructor.chat_placeholder":
      "给教练发消息…(用 @姓名 标记)",
    "instructor.events_your_events": "您的活动",
    "instructor.events_hero_sub":
      "您主办的工作坊、社交活动和特别之夜。",
    "instructor.events_add_new": "新增活动",
    "instructor.events_browse_all": "查看全部",
    "instructor.events_empty_title": "还没有活动",
    "instructor.events_empty_sub":
      "发布下一场工作坊、社交或私人聚会,让舞者在应用中找到它。",
    "instructor.events_upcoming": "即将开始",
    "instructor.events_past": "已结束",
    "instructor.event_delete_title": "删除此活动?",
    "instructor.event_delete_msg":
      '"{name}" —— 此操作无法撤销。',
    "instructor.event_delete_error": "无法删除",
    "instructor.step_sheet_title": "步谱",
    "instructor.new_dance_title": "新舞蹈 + 步谱",
    "instructor.import_title": "从 CSV 导入",
    "instructor.import_sub":
      "批量向资料库添加舞蹈",
    "instructor.upload_image": "上传图片",
    "instructor.text_notation": "文字表示",
    "instructor.image_label": "图片 (PNG/JPG)",
    "instructor.step_sheet_image": "步谱图片",
    "instructor.step_sheet_text": "步谱文字",
    "instructor.save_step_sheet": "保存步谱",
    "instructor.dance_name": "舞蹈名称 *",
    "instructor.choreographer": "编舞 *",
    "instructor.song": "歌曲 *",
    "instructor.artist": "艺术家",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "拍数(例如 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube 网址",
    "instructor.autofill_youtube": "自动填充 YouTube 搜索",
    "instructor.publish_now": "立即向所有人发布",
    "instructor.publish_now_on":
      "所有人都将在公共资料库看到此舞蹈。",
    "instructor.publish_now_off":
      "保存为草稿 —— 发布之前仅您可见。",
    "instructor.save_dance": "保存舞蹈",
    "instructor.enter_name_first": "请先输入名称",
    "instructor.enter_name_first_msg":
      "请输入舞蹈名称以便构建搜索。",
    "instructor.missing_info": "信息缺失",
    "instructor.missing_info_msg":
      "名称、编舞和歌曲均为必填。",
    "instructor.permission_photo":
      "请允许访问照片以上传步谱。",

    // ---------- Profile ----------
    "profile.title": "个人资料",
    "profile.dancer_default": "舞者",
    "profile.admin": "管理员",
    "profile.stat_completed": "已完成",
    "profile.stat_wishlist": "心愿单",
    "profile.stat_classes": "课程",
    "profile.stat_avg_rating": "平均 ★",
    "profile.section_achievements": "成就",
    "profile.section_practice_history": "练习记录",
    "profile.total_sessions": "累计次数",
    "profile.days_active": "活跃天数",
    "profile.peak_day": "最佳一天",
    "profile.history_foot":
      "最近 30 天 · 打开任意舞蹈并使用练习模式记录一次练习。",
    "profile.section_account": "账号",
    "profile.instructor_tab": "教练标签页",
    "profile.switch_to_instructor": "切换到教练资料",
    "profile.class_recap": "课程回顾",
    "profile.log_a_class": "记录一节课",
    "profile.review_suggestions": "查看建议",
    "profile.suggest_a_dance": "推荐舞蹈",
    "profile.suggest_a_dance_to": "向 {name} 推荐舞蹈",
    "profile.my_instructors": "我的教练",
    "profile.pick_your_instructors": "选择您的教练",
    "profile.instructors_hint_none":
      "点击选择接收您建议的教练",
    "profile.instructors_hint_primary_more":
      "主教练:{name} · 另有 {count} 位",
    "profile.instructors_hint_primary": "主教练:{name}",
    "profile.instructors_hint_no_primary":
      "已选择 {count} 位 —— 点击设置主教练",
    "profile.followed_choreographers": "已关注的编舞",
    "profile.followed_choreographers_sub":
      "他们发布新舞蹈时会提醒您",
    "profile.my_mentions": "@我的提及",
    "profile.mentions_unread":
      "来自教练的 {count} 条未读提及",
    "profile.mentions_unread_one":
      "来自教练的 1 条未读提及",
    "profile.mentions_default":
      "查看课程聊天中的教练标记",
    "profile.notification_prefs": "通知偏好",
    "profile.notification_prefs_sub":
      "分别静音活动、课程或提及通知",
    "profile.language": "语言",
    "profile.boot_scoot_board": "Boot Scoot 排行榜",
    "profile.boot_scoot_visible": "您在排行榜上可见。",
    "profile.boot_scoot_hidden":
      "您当前被隐藏。点击加入。",
    "profile.follows_row": "关注和粉丝",
    "profile.follows_row_sub":
      "关注 {following} · 粉丝 {followers}",
    "profile.follows_row_sub_plural":
      "关注 {following} · 粉丝 {followers}",
    "profile.show_activity": "在动态中显示我",
    "profile.show_activity_on":
      "粉丝可以看到您的完成记录和徽章。",
    "profile.show_activity_off": "您的动态对他人隐藏。",
    "profile.certificate_theme": "证书主题",
    "profile.certificate_theme_sub":
      "设置您下载的 PDF 证书的默认外观。",
    "profile.couldnt_save": "无法保存",
    "profile.couldnt_update_theme": "无法更新主题",
    "profile.please_try_again": "请重试。",
    "profile.sign_out": "退出登录",
    "profile.delete_account": "删除我的账号",
    "profile.delete_account_sub":
      "永久删除您的账号和个人数据。",
    "profile.section_connect": "与我们保持联系",
    "profile.connect_sub":
      "在您喜爱的平台上关注 Stompin' Ground Yuma —— 若已安装原生应用,链接会自动打开。",
    "profile.share_app": "分享此应用",
    "profile.share_app_sub":
      "邀请朋友加入 Stompin' Ground Yuma",
    "profile.visit_website": "访问我们的网站",
    "profile.privacy_policy": "隐私政策",
    "profile.terms_of_service": "服务条款",
    "profile.community_guidelines": "社区准则",
    "profile.blocked_users": "已屏蔽的用户",
    "profile.blocked_users_sub":
      "管理您在聊天和动态中静音的人",
    "profile.send_feedback": "发送反馈",
    "profile.send_feedback_sub": "Bug、建议或问候",
    "profile.app_version": "版本 {version}",
    "profile.app_version_with_build": "版本 {version} ({build})",
    "profile.updates_arrive":
      "更新将随 App Store / Play Store 新版本一起发布。",
    "profile.about_venue": "关于 Stompin' Ground Yuma",
    "profile.about_venue_text":
      "亚利桑那州尤马市的全年龄段乡村排舞。加入我们,学一支新舞步,在舞池上结交新朋友。",
    "profile.instructor_unlock_title": "您已成为教练!",
    "profile.instructor_unlock_msg":
      "您的教练标签页已解锁。",
    "profile.instructor_code_placeholder": "教练访问码",
    "profile.enter_access_code": "请输入您的访问码",
    "profile.invalid_access_code": "访问码无效",
    "profile.instructor_modal_sub":
      "输入工作室提供的访问码即可解锁教练工具(记录课程、上传步谱、编辑舞蹈、聊天)。",
    "profile.unlock": "解锁",
    "profile.delete_title": "删除您的账号?",
    "profile.delete_body":
      "此操作将永久删除:\n• 您的登录和资料\n• 您的舞蹈记录(已完成 / 心愿单)\n• 您的课程签到记录\n• 您发送过的所有建议或聊天消息\n\n您创建的舞蹈或课程仍会对社区可见,但您的名字会显示为「已删除的用户」。",
    "profile.delete_cant_undone": "此操作无法撤销。",
    "profile.delete_confirm_label": "输入 {word} 以确认",
    "profile.delete_type_confirm":
      '请输入"DELETE"(全部大写)以确认。',
    "profile.delete_forever": "永久删除",
    "profile.deleted_title": "账号已删除",
    "profile.deleted_msg":
      "您的账号和个人数据已被移除。感谢与我们共舞!",
    "profile.deleted_generic_error":
      "无法删除账号。请重试。",
    "profile.sgy_admin": "SGY 管理",
    "profile.moderation_queue": "动态举报队列",
    "profile.user_feedback": "用户反馈",
    "profile.refresh_recommendations": "刷新推荐",
    "profile.refresh_recommendations_none":
      "资料库元数据已与提供方同步",
    "profile.refresh_recommendations_unseen":
      "{count} 支舞蹈元数据不一致",
    "profile.refresh_recommendations_unseen_one":
      "1 支舞蹈元数据不一致",

    // ---------- Language ----------
    "language.title": "语言",
    "language.subtitle":
      "选择您希望在应用和通知中显示的语言。",
    "language.system_default": "系统默认",
    "language.system_default_hint":
      "跟随手机语言 ({locale})。",
    "language.saved_toast": "语言已更新。",

    // ---------- Notifications prefs ----------
    "notifications.title": "通知",
    "notifications.classes": "新课程",
    "notifications.events": "新活动",
    "notifications.choreographers":
      "已关注编舞的新舞蹈",
    "notifications.mentions": "聊天中的 @提及",
    "notifications.reminders": "课程提醒",

    // ---------- Errors ----------
    "error.generic": "出错了。请稍后再试。",
    "error.offline": "您似乎离线了。",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ 请求添加",
    "pending_dance.btn_submitting": "提交中…",
    "pending_dance.btn_pending": "待审核",
    "pending_dance.btn_rejected": "未通过",
    "pending_dance.btn_in_library": "已在库中",
    "pending_dance.btn_limit": "今日 {limit}/{limit}",
    "pending_dance.submitted_title": "已提交审核",
    "pending_dance.submitted_body":
      "管理员将尽快审核。(今日 {used}/{limit})",
    "pending_dance.pending_title": "等待审核",
    "pending_dance.pending_body":
      "管理员将尽快审核您的提交。",
    "pending_dance.rejected_title": "未通过",
    "pending_dance.rejected_body":
      "管理员未将此舞蹈添加到库中。",
    "pending_dance.limit_title": "今日限额已满",
    "pending_dance.limit_body":
      "您已达到今日限额（5）。请明天再试。",
    "pending_dance.dup_title": "已提交",
    "pending_dance.dup_pending_body":
      "此舞蹈已在等待审核。",
    "pending_dance.dup_library_body":
      "此舞蹈已在库中。",
    "pending_dance.error_title": "出错了",
    "pending_dance.error_body": "请稍后再试。",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "待审核舞蹈",
    "admin_pending.not_allowed": "仅限管理员。",
    "admin_pending.tab_pending": "待审核",
    "admin_pending.tab_approved": "已通过",
    "admin_pending.tab_rejected": "已拒绝",
    "admin_pending.tab_all": "全部",
    "admin_pending.empty_pending":
      "没有待审核的提交。",
    "admin_pending.empty_generic": "这里还没有内容。",
    "admin_pending.untitled": "（无标题）",
    "admin_pending.by": "作者",
    "admin_pending.rejected_reason": "拒绝原因",
    "admin_pending.status_approved":
      "已通过并添加到库中",
    "admin_pending.view_source": "在 {source} 查看",
    "admin_pending.view_dance": "查看舞蹈",
    "admin_pending.approve": "通过",
    "admin_pending.reject": "拒绝",
    "admin_pending.reject_modal_title":
      "拒绝此提交？",
    "admin_pending.reject_placeholder":
      "可选原因（对用户可见）",
    "admin_pending.cancel": "取消",
    "admin_pending.confirm_reject": "拒绝",
    "admin_pending.error_load":
      "无法加载提交",
    "admin_pending.approve_ok_title":
      "已通过并添加到库中",
    "admin_pending.approve_dup_title":
      "已在库中",
    "admin_pending.approve_dup_body":
      "此舞蹈已列出，提交已清除。",
    "admin_pending.approve_fail": "审核失败",
    "admin_pending.reject_fail": "拒绝失败",
  },

  "zh-Hant": {
    // ---------- Onboarding ----------
    "onboarding.language.title": "選擇您的語言",
    "onboarding.language.subtitle":
      "您可以隨時在「個人資料 → 設定」中更改。",
    "onboarding.language.continue": "繼續",
    "onboarding.language.system_default": "系統預設",

    // ---------- Age gate ----------
    "age_gate.hero_title": "年齡驗證",
    "age_gate.hero_sub": "穿上靴子——先做一步確認。",
    "age_gate.title_line1":
      "使用 Stompin' Ground Yuma 需要您年滿",
    "age_gate.title_years": "13 歲",
    "age_gate.body_copy":
      "更年輕的舞者歡迎與父母或監護人一起加入,由他們建立帳號即可。",
    "age_gate.adult_button": "我已滿 13 歲",
    "age_gate.child_button": "我未滿 13 歲",
    "age_gate.legal":
      "點按「{emph}」即表示您同意我們的{terms}與{privacy}。",
    "age_gate.legal_emph": "我已滿 13 歲",
    "age_gate.under13_title": "請讓成年人登入。",
    "age_gate.under13_copy":
      "Stompin' Ground Yuma 專為 13 歲以上的舞者設計。若您未滿 13 歲,請由父母或監護人建立帳號並登入——他們可以帶您來上課,大家隨時可以一起跳舞!",
    "age_gate.back": "返回",

    // ---------- Tabs ----------
    "tabs.home": "首頁",
    "tabs.dances": "舞蹈",
    "tabs.my_dances": "我的舞蹈",
    "tabs.instructor": "教練",
    "tabs.profile": "我的",

    // ---------- Auth ----------
    "auth.tab_signin": "登入",
    "auth.tab_signup": "建立帳號",
    "auth.subtitle": "Dance Social HQ",
    "auth.email": "電子郵件",
    "auth.password": "密碼",
    "auth.name": "姓名",
    "auth.instructor_toggle": "我是教練",
    "auth.instructor_toggle_sub": "需要工作室提供的存取碼",
    "auth.instructor_code": "教練存取碼",
    "auth.signin_button": "登入",
    "auth.signup_button": "建立帳號",
    "auth.continue_with_google": "使用 Google 繼續",
    "auth.or": "或",
    "auth.forgot_password": "忘記密碼?",
    "auth.legal_signin":
      "繼續即表示您同意我們的{terms}與{privacy}。",
    "auth.legal_signup":
      "建立帳號即表示您同意我們的{terms}與{privacy},並知悉排舞是一項體能活動,參與風險由您自行承擔。",
    "auth.terms": "條款",
    "auth.terms_of_service": "服務條款",
    "auth.privacy_policy": "隱私權政策",
    "auth.error_fill_all": "請填寫所有欄位",
    "auth.error_enter_code": "請輸入您的教練存取碼",
    "auth.error_generic": "出錯了",
    "auth.error_google_no_session": "未回傳工作階段",
    "auth.error_google_not_configured":
      "此版本尚未設定 Google 登入。",
    "auth.error_google_failed": "Google 登入失敗",
    "auth.account_created_title": "帳號已建立",
    "auth.account_created_msg":
      "教練存取碼不相符,已以一般會員身分登入。您可以從「個人資料 → 切換到教練資料」再次嘗試。",
    "auth.show_password": "顯示密碼",
    "auth.hide_password": "隱藏密碼",

    // ---------- Welcome ----------
    "welcome.greeting": "{name},歡迎加入!",
    "welcome.subtitle": "一起跳舞吧 🥾",
    "welcome.default_name": "朋友",

    // ---------- Common ----------
    "common.save": "儲存",
    "common.cancel": "取消",
    "common.done": "完成",
    "common.delete": "刪除",
    "common.edit": "編輯",
    "common.back": "返回",
    "common.close": "關閉",
    "common.retry": "重試",
    "common.loading": "載入中…",
    "common.ok": "確定",
    "common.yes": "是",
    "common.no": "否",
    "common.confirm": "確認",
    "common.share": "分享",
    "common.follow": "追蹤",
    "common.unfollow": "取消追蹤",
    "common.following": "已追蹤",
    "common.search": "搜尋",
    "common.see_all": "查看全部",
    "common.error": "錯誤",
    "common.new": "新增",
    "common.publish": "發佈",
    "common.unpublish": "取消發佈",
    "common.published": "已發佈",
    "common.draft": "草稿",
    "common.upload": "上傳",
    "common.remove": "移除",
    "common.next": "下一步",
    "common.skip": "略過",
    "common.open_settings": "打開設定",
    "common.permission_needed": "需要權限",

    // ---------- Home ----------
    "home.hello": "嗨,{name}!",
    "home.hello_no_name": "嗨!",
    "home.subhello": "準備好跳一段了嗎?",
    "home.browse_cta": "瀏覽舞蹈",
    "home.achievements_title": "成就",
    "home.achievements_sub_unseen":
      "您解鎖了 {count} 枚新徽章!",
    "home.achievements_sub_unseen_one":
      "您解鎖了 1 枚新徽章!",
    "home.achievements_sub_default":
      "追蹤您的徽章與連續練習。",
    "home.community_activity": "社群動態",
    "home.feed_empty_title": "追蹤其他舞者",
    "home.feed_empty_sub":
      "他們完成的舞蹈、徽章和連續紀錄會顯示在這裡。",
    "home.fresh_on_floor": "新鮮出爐",
    "home.recently_practiced": "最近練習",
    "home.pick_up": "從上次的位置繼續",
    "home.leaderboard_title": "Boot Scoot 排行榜",
    "home.leaderboard_default_sub":
      "看看誰在舞池上領先——加入他們。",
    "home.events_title": "附近的活動",
    "home.events_sub":
      "工作坊、社交活動與課程,靴子到哪都有。",
    "home.classes_title": "近期課程回顧",
    "home.classes_sub":
      "看看最近課程教了哪些舞蹈。",
    "home.suggest_title": "推薦舞蹈",
    "home.suggest_title_for": "向 {name} 推薦舞蹈",
    "home.suggest_sub_default":
      "選擇您的主教練並將想法寄給他們。",
    "home.suggest_sub_for":
      "有想法?寄給 {name}。",
    "home.about_title": "關於場地",
    "home.about_text":
      "Stompin' Ground Yuma 是一個友善的社群,匯聚不同年齡與程度的舞者一起學習、歡笑,徹夜跳舞。穿上靴子,開跳吧。",
    "home.icon_all_ages": "全年齡層",
    "home.icon_beginners": "歡迎初學者",
    "home.icon_family": "適合闔家",
    "home.website_cta": "造訪 stompingroundyuma.org",

    // ---------- Library ----------
    "library.brand_name": "Stompin' Ground Yuma",
    "library.brand_sub": "排舞資料庫",
    "library.search_placeholder":
      "搜尋名稱、歌曲、藝人、編舞",
    "library.diff_all": "全部",
    "library.diff_absolute_beginner": "零基礎",
    "library.diff_beginner": "入門",
    "library.diff_improver": "進階",
    "library.diff_high_improver": "高階進階",
    "library.diff_intermediate": "中級",
    "library.diff_advanced": "高級",
    "library.empty_none": "沒有符合篩選條件的舞蹈。",
    "library.reset_filters": "重設篩選",
    "library.cant_find": "找不到想要的?",
    "library.external_cta":
      "在 CopperKnob + BootStepper 中搜尋",
    "library.external_cta_q":
      '在 CopperKnob + BootStepper 中搜尋「{q}」',
    "library.single_dir": "或瀏覽單一目錄",
    "library.popular_copperknob": "CopperKnob 熱門",
    "library.popular_bootstepper": "BootStepper 熱門",
    "library.by": "編舞:{name}",
    "library.unknown": "未知",
    "library.source_badge": "舞蹈資料庫",
    "library.bpm": "{bpm} BPM",

    // ---------- My Dances ----------
    "my_dances.title": "我的紀錄",
    "my_dances.subtitle": "記錄您的排舞旅程",
    "my_dances.tab_completed": "已完成 ({count})",
    "my_dances.tab_wishlist": "願望清單 ({count})",
    "my_dances.empty_completed_title": "還沒有完成的舞蹈",
    "my_dances.empty_wishlist_title": "願望清單是空的",
    "my_dances.empty_text":
      "去資料庫找到下一個挑戰吧!",
    "my_dances.browse_dances": "瀏覽舞蹈",
    "my_dances.cert_error_title":
      "無法下載證書",
    "my_dances.cert_download_label": "下載證書",
    "my_dances.cert_download_hint":
      "為此已完成的舞蹈下載 PDF 證書。",

    // ---------- Instructor ----------
    "instructor.title": "教練",
    "instructor.subtitle": "舞蹈 · 課程 · 活動 · 聊天",
    "instructor.only": "僅限教練使用。",
    "instructor.new": "新增",
    "instructor.csv": "CSV",
    "instructor.restore": "還原",
    "instructor.tab_dances": "舞蹈",
    "instructor.tab_classes": "課程",
    "instructor.tab_events": "活動",
    "instructor.tab_chat": "聊天",
    "instructor.legend_new_dance":
      "新舞蹈會先以**草稿**形式保存——僅您可見。點按**發佈**即可與所有人分享。",
    "instructor.no_dances":
      '還沒有舞蹈。點按「+ 新增」上傳舞蹈及其步譜,或在「課程」分頁記錄一堂課。',
    "instructor.no_classes_yet": "您還沒有記錄任何課程。",
    "instructor.go_to_classes": "前往課程",
    "instructor.class_session_default": "課程",
    "instructor.dance_count": "{count} 支舞蹈 · {names}",
    "instructor.dance_count_one": "1 支舞蹈 · {names}",
    "instructor.pill_sheet": "步譜",
    "instructor.pill_no_sheet": "無步譜",
    "instructor.pill_published": "已發佈",
    "instructor.pill_draft": "草稿",
    "instructor.edit_sheet": "步譜",
    "instructor.chat_lounge_hello":
      "教練休息室——打個招呼 👋",
    "instructor.chat_placeholder":
      "傳訊息給教練們…(用 @姓名 標註)",
    "instructor.events_your_events": "您的活動",
    "instructor.events_hero_sub":
      "您主辦的工作坊、社交活動和特別之夜。",
    "instructor.events_add_new": "新增活動",
    "instructor.events_browse_all": "查看全部",
    "instructor.events_empty_title": "還沒有活動",
    "instructor.events_empty_sub":
      "發佈下一場工作坊、社交或私人聚會,讓舞者能在應用程式中找到它。",
    "instructor.events_upcoming": "即將舉行",
    "instructor.events_past": "已結束",
    "instructor.event_delete_title": "刪除此活動?",
    "instructor.event_delete_msg":
      '「{name}」——此操作無法復原。',
    "instructor.event_delete_error": "無法刪除",
    "instructor.step_sheet_title": "步譜",
    "instructor.new_dance_title": "新舞蹈 + 步譜",
    "instructor.import_title": "從 CSV 匯入",
    "instructor.import_sub":
      "批次為資料庫加入舞蹈",
    "instructor.upload_image": "上傳圖片",
    "instructor.text_notation": "文字表示",
    "instructor.image_label": "圖片 (PNG/JPG)",
    "instructor.step_sheet_image": "步譜圖片",
    "instructor.step_sheet_text": "步譜文字",
    "instructor.save_step_sheet": "儲存步譜",
    "instructor.dance_name": "舞蹈名稱 *",
    "instructor.choreographer": "編舞 *",
    "instructor.song": "歌曲 *",
    "instructor.artist": "藝人",
    "instructor.bpm_field": "BPM",
    "instructor.count_field": "拍數(例如 32 count, 4 wall)",
    "instructor.youtube_url": "YouTube 網址",
    "instructor.autofill_youtube": "自動填入 YouTube 搜尋",
    "instructor.publish_now": "立即向所有人發佈",
    "instructor.publish_now_on":
      "所有人都將在公開資料庫看到此舞蹈。",
    "instructor.publish_now_off":
      "儲存為草稿——發佈前僅您可見。",
    "instructor.save_dance": "儲存舞蹈",
    "instructor.enter_name_first": "請先輸入名稱",
    "instructor.enter_name_first_msg":
      "請輸入舞蹈名稱以建立搜尋。",
    "instructor.missing_info": "資訊不足",
    "instructor.missing_info_msg":
      "名稱、編舞和歌曲皆為必填。",
    "instructor.permission_photo":
      "請允許存取照片以上傳步譜。",

    // ---------- Profile ----------
    "profile.title": "個人資料",
    "profile.dancer_default": "舞者",
    "profile.admin": "管理員",
    "profile.stat_completed": "已完成",
    "profile.stat_wishlist": "願望清單",
    "profile.stat_classes": "課程",
    "profile.stat_avg_rating": "平均 ★",
    "profile.section_achievements": "成就",
    "profile.section_practice_history": "練習紀錄",
    "profile.total_sessions": "累計次數",
    "profile.days_active": "活躍天數",
    "profile.peak_day": "最佳一天",
    "profile.history_foot":
      "近 30 天 · 開啟任一支舞蹈並使用練習模式記錄一次練習。",
    "profile.section_account": "帳號",
    "profile.instructor_tab": "教練分頁",
    "profile.switch_to_instructor": "切換到教練資料",
    "profile.class_recap": "課程回顧",
    "profile.log_a_class": "記錄一堂課",
    "profile.review_suggestions": "查看建議",
    "profile.suggest_a_dance": "推薦舞蹈",
    "profile.suggest_a_dance_to": "向 {name} 推薦舞蹈",
    "profile.my_instructors": "我的教練",
    "profile.pick_your_instructors": "選擇您的教練",
    "profile.instructors_hint_none":
      "點按以選擇接收您建議的教練",
    "profile.instructors_hint_primary_more":
      "主教練:{name} · 另有 {count} 位",
    "profile.instructors_hint_primary": "主教練:{name}",
    "profile.instructors_hint_no_primary":
      "已選 {count} 位——點按設定主教練",
    "profile.followed_choreographers": "已追蹤的編舞",
    "profile.followed_choreographers_sub":
      "他們發佈新舞蹈時會通知您",
    "profile.my_mentions": "@我的提及",
    "profile.mentions_unread":
      "來自教練的 {count} 則未讀提及",
    "profile.mentions_unread_one":
      "來自教練的 1 則未讀提及",
    "profile.mentions_default":
      "在課程聊天中查看教練標註",
    "profile.notification_prefs": "通知偏好",
    "profile.notification_prefs_sub":
      "分別靜音活動、課程或提及通知",
    "profile.language": "語言",
    "profile.boot_scoot_board": "Boot Scoot 排行榜",
    "profile.boot_scoot_visible": "您在排行榜上可見。",
    "profile.boot_scoot_hidden":
      "您目前被隱藏。點按加入。",
    "profile.follows_row": "追蹤中與粉絲",
    "profile.follows_row_sub":
      "追蹤中 {following} · 粉絲 {followers}",
    "profile.follows_row_sub_plural":
      "追蹤中 {following} · 粉絲 {followers}",
    "profile.show_activity": "在動態中顯示我",
    "profile.show_activity_on":
      "追蹤者可以看到您完成的舞蹈與徽章。",
    "profile.show_activity_off": "您的動態對他人隱藏。",
    "profile.certificate_theme": "證書主題",
    "profile.certificate_theme_sub":
      "設定您下載的 PDF 證書預設外觀。",
    "profile.couldnt_save": "無法儲存",
    "profile.couldnt_update_theme": "無法更新主題",
    "profile.please_try_again": "請再試一次。",
    "profile.sign_out": "登出",
    "profile.delete_account": "刪除我的帳號",
    "profile.delete_account_sub":
      "永久刪除您的帳號與個人資料。",
    "profile.section_connect": "與我們保持聯繫",
    "profile.connect_sub":
      "在您喜愛的平台上追蹤 Stompin' Ground Yuma——若已安裝原生應用程式,連結會自動開啟。",
    "profile.share_app": "分享應用程式",
    "profile.share_app_sub":
      "邀請朋友加入 Stompin' Ground Yuma",
    "profile.visit_website": "造訪我們的網站",
    "profile.privacy_policy": "隱私權政策",
    "profile.terms_of_service": "服務條款",
    "profile.community_guidelines": "社群守則",
    "profile.blocked_users": "已封鎖的使用者",
    "profile.blocked_users_sub":
      "管理您在聊天與動態中靜音的人",
    "profile.send_feedback": "傳送意見回饋",
    "profile.send_feedback_sub": "問題、想法或問候",
    "profile.app_version": "版本 {version}",
    "profile.app_version_with_build": "版本 {version} ({build})",
    "profile.updates_arrive":
      "更新會隨新的 App Store / Play Store 版本推送。",
    "profile.about_venue": "關於 Stompin' Ground Yuma",
    "profile.about_venue_text":
      "亞利桑那州尤馬市全年齡層鄉村排舞。加入我們,學一支新舞步,在舞池上結交新朋友。",
    "profile.instructor_unlock_title": "您已成為教練!",
    "profile.instructor_unlock_msg":
      "您的教練分頁已解鎖。",
    "profile.instructor_code_placeholder": "教練存取碼",
    "profile.enter_access_code": "請輸入您的存取碼",
    "profile.invalid_access_code": "存取碼無效",
    "profile.instructor_modal_sub":
      "輸入工作室提供的存取碼即可解鎖教練工具(記錄課程、上傳步譜、編輯舞蹈、聊天)。",
    "profile.unlock": "解鎖",
    "profile.delete_title": "刪除您的帳號?",
    "profile.delete_body":
      "此操作將永久刪除:\n• 您的登入與資料\n• 您的舞蹈紀錄(已完成 / 願望清單)\n• 您的課程出席紀錄\n• 您傳送過的所有建議或聊天訊息\n\n您建立的舞蹈或課程仍會對社群顯示,但您的名字會替換為「已刪除的使用者」。",
    "profile.delete_cant_undone": "此操作無法復原。",
    "profile.delete_confirm_label": "輸入 {word} 以確認",
    "profile.delete_type_confirm":
      '請輸入「DELETE」(全部大寫)以確認。',
    "profile.delete_forever": "永久刪除",
    "profile.deleted_title": "帳號已刪除",
    "profile.deleted_msg":
      "您的帳號與個人資料已被移除。感謝與我們共舞!",
    "profile.deleted_generic_error":
      "無法刪除帳號。請再試一次。",
    "profile.sgy_admin": "SGY 管理",
    "profile.moderation_queue": "動態檢舉佇列",
    "profile.user_feedback": "使用者意見",
    "profile.refresh_recommendations": "重新整理推薦",
    "profile.refresh_recommendations_none":
      "資料庫中繼資料已與提供者同步",
    "profile.refresh_recommendations_unseen":
      "{count} 支舞蹈中繼資料不一致",
    "profile.refresh_recommendations_unseen_one":
      "1 支舞蹈中繼資料不一致",

    // ---------- Language ----------
    "language.title": "語言",
    "language.subtitle":
      "選擇要在應用程式與通知中顯示的語言。",
    "language.system_default": "系統預設",
    "language.system_default_hint":
      "依照手機語言 ({locale})。",
    "language.saved_toast": "語言已更新。",

    // ---------- Notifications prefs ----------
    "notifications.title": "通知",
    "notifications.classes": "新課程",
    "notifications.events": "新活動",
    "notifications.choreographers":
      "已追蹤編舞的新舞蹈",
    "notifications.mentions": "聊天中的 @提及",
    "notifications.reminders": "課程提醒",

    // ---------- Errors ----------
    "error.generic": "出錯了。請稍後再試。",
    "error.offline": "您似乎已離線。",

    // ---------- User-submitted dances (pending approval) ----------
    "pending_dance.btn_request": "+ 請求加入",
    "pending_dance.btn_submitting": "提交中…",
    "pending_dance.btn_pending": "待審核",
    "pending_dance.btn_rejected": "未通過",
    "pending_dance.btn_in_library": "已在資料庫",
    "pending_dance.btn_limit": "今日 {limit}/{limit}",
    "pending_dance.submitted_title": "已提交審核",
    "pending_dance.submitted_body":
      "管理員將盡快審核。(今日 {used}/{limit})",
    "pending_dance.pending_title": "等待審核",
    "pending_dance.pending_body":
      "管理員將盡快審核您的提交。",
    "pending_dance.rejected_title": "未通過",
    "pending_dance.rejected_body":
      "管理員未將此舞蹈加入資料庫。",
    "pending_dance.limit_title": "今日已達上限",
    "pending_dance.limit_body":
      "您已達到今日上限（5）。請明天再試。",
    "pending_dance.dup_title": "已提交過",
    "pending_dance.dup_pending_body":
      "此舞蹈已在等待審核。",
    "pending_dance.dup_library_body":
      "此舞蹈已在資料庫。",
    "pending_dance.error_title": "發生錯誤",
    "pending_dance.error_body": "請稍後再試。",

    // ---------- Admin: Pending Dances queue ----------
    "admin_pending.title": "待審核舞蹈",
    "admin_pending.not_allowed": "僅限管理員。",
    "admin_pending.tab_pending": "待審核",
    "admin_pending.tab_approved": "已通過",
    "admin_pending.tab_rejected": "已拒絕",
    "admin_pending.tab_all": "全部",
    "admin_pending.empty_pending":
      "沒有待審核的提交。",
    "admin_pending.empty_generic": "這裡還沒有內容。",
    "admin_pending.untitled": "（無標題）",
    "admin_pending.by": "編舞者",
    "admin_pending.rejected_reason": "拒絕原因",
    "admin_pending.status_approved":
      "已通過並加入資料庫",
    "admin_pending.view_source": "在 {source} 檢視",
    "admin_pending.view_dance": "檢視舞蹈",
    "admin_pending.approve": "通過",
    "admin_pending.reject": "拒絕",
    "admin_pending.reject_modal_title":
      "拒絕此提交？",
    "admin_pending.reject_placeholder":
      "可選原因（對使用者可見）",
    "admin_pending.cancel": "取消",
    "admin_pending.confirm_reject": "拒絕",
    "admin_pending.error_load":
      "無法載入提交",
    "admin_pending.approve_ok_title":
      "已通過並加入資料庫",
    "admin_pending.approve_dup_title":
      "已在資料庫",
    "admin_pending.approve_dup_body":
      "此舞蹈已列出，提交已清除。",
    "admin_pending.approve_fail": "審核失敗",
    "admin_pending.reject_fail": "拒絕失敗",
  },
};

