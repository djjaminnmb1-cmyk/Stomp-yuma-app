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
 * When you add a new key, add it to ALL THREE locales; the missing-
 * translations helper below only fires in dev and complains loudly.
 */
export type Locale = "en" | "es" | "fr";

export const SUPPORTED_LOCALES: Locale[] = ["en", "es", "fr"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

// Fallback locale used by i18n-js when a key is missing.
export const DEFAULT_LOCALE: Locale = "en";

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
  },
};
