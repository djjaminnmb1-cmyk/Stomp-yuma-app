"""Server-side i18n — one place for every string that leaves the API
in a user's own language.

The mobile app owns UI translations (see ``frontend/src/i18n``); this
module owns strings that ORIGINATE on the server: push-notification
titles / bodies, transactional emails (password reset), and the
static legal pages. Anything else the API returns is either raw user
data (dance names, chat messages) or a code the client resolves
locally — we deliberately never translate error messages that already
have client-side handling, because the client's dictionary is
richer.

Design
------
* Strings live in ``_CATALOG`` keyed by ``(lang, key)``. English is
  the source-of-truth; missing translations transparently fall back
  to English so a new key never breaks a Spanish user's push.
* ``t(key, lang, **kwargs)`` returns the translated string with
  ``{name}`` / ``{count}`` placeholders substituted. Missing
  placeholders are silently kept as literals — never crash the push
  path over a formatting bug.
* ``preferred_language_for(user)`` reads ``users.preferred_language``
  (set by the client) and falls back to ``"en"``. Explicit lookup
  helper so callers can't accidentally reach into the doc directly
  and forget the fallback.
"""
from __future__ import annotations

from typing import Any, Mapping, Optional


SUPPORTED_LANGUAGES: tuple[str, ...] = ("en", "es", "fr")
DEFAULT_LANGUAGE: str = "en"


# Two-level catalog: ``_CATALOG[lang][key] = template``. Templates
# use Python str.format() placeholders (``{name}``) so callers don't
# need a heavier gettext-style extractor for a dozen strings.
_CATALOG: dict[str, dict[str, str]] = {
    "en": {
        # ---------- Push notification templates ----------
        # New dance by a followed choreographer
        "push.new_dance.title": "New dance by {choreographer}",
        "push.new_dance.body": "“{dance_name}” just landed in the library — go check it out.",
        # New event / class from a followed instructor
        "push.new_event.title": "{instructor} posted a new event",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} added a new class",
        "push.new_class.body": "{class_title} — {when}",
        # 24 h class reminder
        "push.class_reminder.title": "Class tomorrow: {class_title}",
        "push.class_reminder.body": "See you at {when} — bring your boots!",
        # Someone followed the user
        "push.new_follower.title": "{follower} started following you",
        "push.new_follower.body": "Say howdy on their profile.",
        # Mention in instructor chat
        "push.chat_mention.title": "{sender} mentioned you",
        "push.chat_mention.body": "{preview}",
        # ---------- Password-reset email ----------
        "email.reset.subject": "Reset your Stompin' Ground Yuma password",
        "email.reset.greeting": "Hi {name},",
        "email.reset.intro": (
            "We received a request to reset your Stompin' Ground Yuma password. "
            "Tap the button below to set a new password. This link expires in "
            "{minutes} minutes and can only be used once."
        ),
        "email.reset.button": "Reset password",
        "email.reset.copy_hint": "Or copy this link into your browser:",
        "email.reset.ignore": (
            "If you didn't request this, you can safely ignore this email — "
            "your password will stay the same."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "es": {
        # ---------- Notificaciones push ----------
        "push.new_dance.title": "Nuevo baile de {choreographer}",
        "push.new_dance.body": "«{dance_name}» acaba de llegar a la biblioteca — ¡échale un vistazo!",
        "push.new_event.title": "{instructor} publicó un nuevo evento",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} agregó una nueva clase",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "Clase mañana: {class_title}",
        "push.class_reminder.body": "Te esperamos a las {when} — ¡trae tus botas!",
        "push.new_follower.title": "{follower} empezó a seguirte",
        "push.new_follower.body": "Salúdalo en su perfil.",
        "push.chat_mention.title": "{sender} te mencionó",
        "push.chat_mention.body": "{preview}",
        # ---------- Correo de restablecimiento ----------
        "email.reset.subject": "Restablece tu contraseña de Stompin' Ground Yuma",
        "email.reset.greeting": "Hola {name},",
        "email.reset.intro": (
            "Recibimos una solicitud para restablecer tu contraseña de Stompin' "
            "Ground Yuma. Toca el botón para elegir una nueva. Este enlace "
            "expira en {minutes} minutos y solo puede usarse una vez."
        ),
        "email.reset.button": "Restablecer contraseña",
        "email.reset.copy_hint": "O copia este enlace en tu navegador:",
        "email.reset.ignore": (
            "Si no lo solicitaste, puedes ignorar este correo — tu contraseña "
            "seguirá siendo la misma."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "fr": {
        # ---------- Notifications push ----------
        "push.new_dance.title": "Nouvelle danse de {choreographer}",
        "push.new_dance.body": "« {dance_name} » vient d'arriver dans la bibliothèque — jetez-y un œil !",
        "push.new_event.title": "{instructor} a publié un nouvel événement",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} a ajouté un nouveau cours",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "Cours demain : {class_title}",
        "push.class_reminder.body": "Rendez-vous à {when} — apportez vos bottes !",
        "push.new_follower.title": "{follower} vous suit désormais",
        "push.new_follower.body": "Passez lui dire bonjour sur son profil.",
        "push.chat_mention.title": "{sender} vous a mentionné",
        "push.chat_mention.body": "{preview}",
        # ---------- Email de réinitialisation ----------
        "email.reset.subject": "Réinitialisez votre mot de passe Stompin' Ground Yuma",
        "email.reset.greeting": "Bonjour {name},",
        "email.reset.intro": (
            "Nous avons reçu une demande de réinitialisation de votre mot de "
            "passe Stompin' Ground Yuma. Appuyez sur le bouton ci-dessous pour "
            "en choisir un nouveau. Ce lien expire dans {minutes} minutes et "
            "ne peut être utilisé qu'une seule fois."
        ),
        "email.reset.button": "Réinitialiser le mot de passe",
        "email.reset.copy_hint": "Ou copiez ce lien dans votre navigateur :",
        "email.reset.ignore": (
            "Si vous n'êtes pas à l'origine de cette demande, vous pouvez "
            "ignorer cet email — votre mot de passe restera inchangé."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
}


def _normalise_lang(lang: Optional[str]) -> str:
    """Return one of ``SUPPORTED_LANGUAGES``. Accepts BCP-47 tags
    (``"es-MX"`` → ``"es"``) and falls back to English on any
    unsupported / empty value."""
    if not lang:
        return DEFAULT_LANGUAGE
    base = str(lang).lower().split("-")[0].split("_")[0].strip()
    return base if base in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def t(key: str, lang: Optional[str] = None, /, **kwargs: Any) -> str:
    """Look up + interpolate a translation. Fallback chain:

        1. ``lang`` catalog
        2. English catalog (source of truth)
        3. the ``key`` literal (so a typo is at least visible)
    """
    normalised = _normalise_lang(lang)
    catalog = _CATALOG.get(normalised) or {}
    template = catalog.get(key)
    if template is None and normalised != DEFAULT_LANGUAGE:
        template = _CATALOG[DEFAULT_LANGUAGE].get(key)
    if template is None:
        return key
    if not kwargs:
        return template
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError, ValueError):
        # Never crash the caller because of a missing placeholder.
        return template


def preferred_language_for(user: Optional[Mapping[str, Any]]) -> str:
    """Return the effective language for a user document.

    Callers can pass a ``users`` doc (``{"preferred_language": "es", ...}``)
    or a raw string; both round-trip to a valid supported code.
    """
    if user is None:
        return DEFAULT_LANGUAGE
    if isinstance(user, str):
        return _normalise_lang(user)
    return _normalise_lang(user.get("preferred_language"))


def is_supported(lang: Optional[str]) -> bool:
    """True when ``lang`` (BCP-47 or short code) maps to a supported
    catalog. Used by the ``PATCH /api/auth/me`` validator."""
    if not lang:
        return False
    return _normalise_lang(lang) in SUPPORTED_LANGUAGES and str(
        lang
    ).lower().split("-")[0].split("_")[0].strip() in SUPPORTED_LANGUAGES
