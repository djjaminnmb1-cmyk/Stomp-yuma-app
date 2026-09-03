"""Public legal pages (privacy) served as self-contained HTML.

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

Localisation
------------
The privacy policy is served in English, Spanish, and French. The
language is selected by:

  1. Explicit ``?lang=<code>`` query parameter (BCP-47 short code)
  2. ``Accept-Language`` request header — first supported tag wins
  3. Default: English

``Content-Language`` is echoed in the response so caching proxies
key correctly. ``Vary: Accept-Language`` lets shared caches store
each locale variant separately.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, Request, Response

from core.i18n import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, _normalise_lang


router = APIRouter(prefix="/legal", tags=["legal"])


# Last-updated timestamp for reviewers. Bump ONLY when the content
# below changes materially.
_LAST_UPDATED = "June 2026"
_CONTACT = "whereyumalinesuptodance@stompingroundyuma.org"


# Per-language content blocks. English is the source of truth; other
# languages track it. The HTML skeleton is shared — only the strings
# rotate.
_CONTENT: dict[str, dict[str, object]] = {
    "en": {
        "title": "Privacy Policy",
        "subtitle": "Stompin' Ground Yuma",
        "updated_label": "Last updated",
        "intro": (
            "Stompin' Ground Yuma (\"we\", \"our\", \"us\") operates this "
            "mobile app to help our line-dance community track dances, "
            "class attendance, and studio events. This policy explains what "
            "we collect, why, and the choices you have."
        ),
        "sections": [
            ("1. Information we collect", [
                "<b>Account info</b> — name, email, and (if you register with email) an encrypted password hash. We never store your password in plain text.",
                "<b>Google sign-in</b> — if you tap \"Continue with Google\" we receive your name, email, and public profile picture from Google. We do not receive your Google password.",
                "<b>Sign in with Apple</b> — if you tap \"Continue with Apple\" Apple returns a stable, anonymised user identifier and (only if you allow it) your name and email. If you choose to hide your email, Apple provides us a relay address; we don't receive your real one.",
                "<b>App activity</b> — dances you mark as completed or wishlist, classes you attend, dances you suggest, chat messages you post in the instructor chat, activity-feed events and reactions, follow / unfollow actions.",
                "<b>Device push token</b> — if you allow notifications, we store a device push token so we can send reminders and class updates.",
                "<b>Approximate location (opt-in)</b> — only when you tap \"Near me\" on the <b>Find Events</b> screen. We use it once to compute distances and never store the coordinates on our servers.",
                "<b>Event addresses</b> — if you're an instructor and post an event, the address you type is stored and geocoded to display events on a map / list. Please only post addresses you have the right to publish.",
            ]),
            ("2. How we use it", [
                "To sign you in and keep your account secure.",
                "To show your personal dance library, wishlist, and attendance history.",
                "To let instructors coordinate classes, suggestions, and community chat.",
                "To power social features — activity feed, reactions, follows, and dancer discovery — so you can cheer on other dancers in the community.",
                "To send you class reminders and event updates (only if you opted in to notifications).",
            ]),
            ("3. Who we share it with", [
                "<b>Google</b> — only if you sign in with Google, for authentication.",
                "<b>Apple</b> — only if you sign in with Apple, for authentication.",
                "<b>Firebase Cloud Messaging (Google)</b> — your device push token is registered with FCM so we can deliver reminders to Android and iOS.",
                "<b>Email provider (SMTP)</b> — only when you request a password reset.",
                "<b>OpenStreetMap Nominatim</b> — event addresses are sent to Nominatim to obtain map coordinates. We do <b>not</b> send your personal identifiers along with the address.",
                "<b>Third-party step-sheet APIs (CopperKnob, BootStepper)</b> — read-only lookups for dance metadata. We send only the dance title / choreographer, never your identifiers.",
            ], "We do <b>not</b> sell your data. Your data is only shared with the service providers we rely on to run the app:"),
            ("4. Data retention & deletion",
             "You can permanently delete your account and all personal data at any time from inside the app: go to <b>Profile → Delete My Account</b> and confirm. Deleting your account removes your login, tracking, attendance history, suggestions, and chat messages. Content you authored for the community (dances or classes) is preserved but your name is replaced with \"Deleted user\"."),
            ("5. Your rights", [
                "You can view your data at any time inside the app.",
                "You can correct your name / email from the Profile screen.",
                "You can delete your account (see section 4).",
                "You can withdraw notification consent from your device settings.",
            ]),
            ("6. Children",
             f"The app is intended for line dancers of all ages, but children under 13 should only use it with a parent or guardian's supervision. We do not knowingly collect data from children under 13 without parental involvement. If you believe a child under 13 created an account without permission, <a href=\"mailto:{_CONTACT}?subject=COPPA%20request\">contact us</a> and we'll remove the account."),
            ("7. California residents (CCPA)",
             "If you live in California you have the right to know what personal information we collect, request a copy, request that we delete it, and not be discriminated against for exercising your rights. We do not sell your personal information. To make a request, email us using the contact link below."),
            ("8. EU / UK residents (GDPR)",
             "If you live in the EU, UK, or European Economic Area, you have the right to access, correct, port, or erase your personal data, and to object to or restrict its processing. Our legal basis for processing is either your consent (e.g. notifications, location) or the performance of our service agreement (your account and tracking data). Email us to exercise any of these rights."),
            ("9. Security",
             "Passwords are hashed with bcrypt. All traffic between the app and our servers is encrypted over HTTPS. Reset tokens expire after 15 minutes. Administrative access is restricted by JWT-based session tokens with password-version revocation."),
            ("10. DMCA / Copyright takedown",
             f"The Stompin' Ground Yuma dance directory links to third-party step sheets hosted on services such as CopperKnob and BootStepper. If you own a step sheet or other content that appears in the app without permission, <a href=\"mailto:{_CONTACT}?subject=DMCA%20takedown\">email us</a> with a description of the work, where it appears, and your contact details. We'll remove valid takedown requests within a reasonable time."),
            ("11. Contact us",
             f"Questions or requests? Email us at <a href=\"mailto:{_CONTACT}\">{_CONTACT}</a> and we'll get back to you."),
        ],
        "footer": "Stompin' Ground Yuma · Yuma, Arizona",
    },
    "es": {
        "title": "Política de privacidad",
        "subtitle": "Stompin' Ground Yuma",
        "updated_label": "Última actualización",
        "intro": (
            "Stompin' Ground Yuma («nosotros») opera esta aplicación móvil "
            "para ayudar a nuestra comunidad de line dance a llevar un "
            "registro de bailes, asistencia a clases y eventos del estudio. "
            "Esta política explica qué recopilamos, por qué y qué opciones "
            "tienes."
        ),
        "sections": [
            ("1. Información que recopilamos", [
                "<b>Datos de la cuenta</b> — nombre, correo electrónico y (si te registras por correo) un hash cifrado de tu contraseña. Nunca guardamos tu contraseña en texto plano.",
                "<b>Inicio de sesión con Google</b> — si tocas «Continuar con Google», recibimos tu nombre, correo y foto de perfil pública de Google. Nunca recibimos tu contraseña de Google.",
                "<b>Inicio de sesión con Apple</b> — si tocas «Continuar con Apple», Apple nos devuelve un identificador anónimo estable y (solo si lo permites) tu nombre y correo. Si eliges ocultar tu correo, Apple nos proporciona una dirección de reenvío; nunca recibimos el real.",
                "<b>Actividad en la app</b> — bailes que marcas como completados o en tu lista de deseos, clases a las que asistes, bailes que sugieres, mensajes de chat, eventos del feed y reacciones, acciones de seguir / dejar de seguir.",
                "<b>Token de notificaciones del dispositivo</b> — si permites notificaciones, guardamos el token de tu dispositivo para enviar recordatorios y actualizaciones de clase.",
                "<b>Ubicación aproximada (opcional)</b> — solo cuando tocas «Cerca de mí» en la pantalla <b>Buscar eventos</b>. La usamos una sola vez para calcular distancias y nunca guardamos las coordenadas en nuestros servidores.",
                "<b>Direcciones de eventos</b> — si eres instructor y publicas un evento, la dirección que escribes se guarda y se geocodifica para mostrar el evento en un mapa / listado. Publica solo direcciones que tengas derecho a difundir.",
            ]),
            ("2. Cómo la usamos", [
                "Para iniciar tu sesión y mantener tu cuenta segura.",
                "Para mostrar tu biblioteca personal de bailes, lista de deseos e historial de asistencia.",
                "Para que los instructores coordinen clases, sugerencias y el chat de la comunidad.",
                "Para las funciones sociales — feed, reacciones, seguimientos y descubrimiento de otros bailarines — y así puedas animar al resto de la comunidad.",
                "Para enviarte recordatorios de clases y actualizaciones de eventos (solo si aceptaste recibir notificaciones).",
            ]),
            ("3. Con quién la compartimos", [
                "<b>Google</b> — solo si inicias sesión con Google, para autenticación.",
                "<b>Apple</b> — solo si inicias sesión con Apple, para autenticación.",
                "<b>Firebase Cloud Messaging (Google)</b> — tu token de notificaciones se registra con FCM para entregar recordatorios en Android y iOS.",
                "<b>Proveedor de correo (SMTP)</b> — solo cuando solicitas restablecer tu contraseña.",
                "<b>OpenStreetMap Nominatim</b> — las direcciones de eventos se envían a Nominatim para obtener coordenadas. <b>No</b> enviamos tus identificadores personales junto con la dirección.",
                "<b>APIs externas de hojas de pasos (CopperKnob, BootStepper)</b> — consultas de solo lectura sobre metadatos de bailes. Enviamos solo el título del baile y la coreografía, nunca tus identificadores.",
            ], "<b>No</b> vendemos tus datos. Solo se comparten con los proveedores que necesitamos para operar la app:"),
            ("4. Retención y eliminación de datos",
             "Puedes eliminar permanentemente tu cuenta y todos tus datos personales desde dentro de la app: ve a <b>Perfil → Eliminar mi cuenta</b> y confirma. Al eliminar tu cuenta se borran tu inicio de sesión, seguimiento, historial de asistencia, sugerencias y mensajes de chat. El contenido que creaste para la comunidad (bailes o clases) se conserva, pero tu nombre se reemplaza por «Usuario eliminado»."),
            ("5. Tus derechos", [
                "Puedes consultar tus datos en cualquier momento dentro de la app.",
                "Puedes corregir tu nombre / correo desde la pantalla de Perfil.",
                "Puedes eliminar tu cuenta (ver sección 4).",
                "Puedes retirar tu consentimiento para notificaciones desde los ajustes del dispositivo.",
            ]),
            ("6. Niños",
             f"La app está pensada para bailarines de todas las edades, pero los menores de 13 años solo deberían usarla con supervisión de un padre o tutor. No recopilamos a sabiendas datos de menores de 13 años sin participación parental. Si crees que un menor de 13 creó una cuenta sin permiso, <a href=\"mailto:{_CONTACT}?subject=COPPA%20request\">contáctanos</a> y la eliminaremos."),
            ("7. Residentes de California (CCPA)",
             "Si vives en California, tienes derecho a saber qué información personal recopilamos, solicitar una copia, pedir su eliminación y no ser discriminado por ejercer estos derechos. No vendemos tu información personal. Para hacer una solicitud, escríbenos usando el enlace de contacto."),
            ("8. Residentes de la UE / Reino Unido (RGPD)",
             "Si vives en la UE, Reino Unido o el Espacio Económico Europeo, tienes derecho a acceder, rectificar, portar o suprimir tus datos personales, así como a oponerte o restringir su tratamiento. La base legal es tu consentimiento (p. ej. notificaciones, ubicación) o el cumplimiento del contrato de servicio (tu cuenta y datos de seguimiento). Escríbenos para ejercer cualquiera de estos derechos."),
            ("9. Seguridad",
             "Las contraseñas se cifran con bcrypt. Todo el tráfico entre la app y nuestros servidores va por HTTPS. Los tokens de restablecimiento expiran en 15 minutos. El acceso administrativo se restringe con tokens JWT que se invalidan al cambiar la contraseña."),
            ("10. DMCA / Retirada por derechos de autor",
             f"El directorio de bailes de Stompin' Ground Yuma enlaza a hojas de pasos alojadas por terceros como CopperKnob y BootStepper. Si eres titular de una hoja de pasos u otro contenido que aparece sin permiso, <a href=\"mailto:{_CONTACT}?subject=DMCA%20takedown\">escríbenos</a> describiendo la obra, dónde aparece y tus datos de contacto. Retiraremos las solicitudes válidas en un plazo razonable."),
            ("11. Contáctanos",
             f"¿Preguntas o solicitudes? Escríbenos a <a href=\"mailto:{_CONTACT}\">{_CONTACT}</a> y te responderemos."),
        ],
        "footer": "Stompin' Ground Yuma · Yuma, Arizona",
    },
    "fr": {
        "title": "Politique de confidentialité",
        "subtitle": "Stompin' Ground Yuma",
        "updated_label": "Dernière mise à jour",
        "intro": (
            "Stompin' Ground Yuma (« nous ») exploite cette application "
            "mobile pour aider notre communauté de line dance à suivre "
            "les danses, la présence aux cours et les événements du "
            "studio. Cette politique explique ce que nous collectons, "
            "pourquoi, et les choix qui vous sont offerts."
        ),
        "sections": [
            ("1. Informations que nous collectons", [
                "<b>Informations de compte</b> — nom, e-mail, et (si vous vous inscrivez par e-mail) un hachage chiffré de votre mot de passe. Nous ne stockons jamais votre mot de passe en clair.",
                "<b>Connexion Google</b> — si vous appuyez sur « Continuer avec Google », nous recevons de Google votre nom, e-mail et photo de profil publique. Nous ne recevons pas votre mot de passe Google.",
                "<b>Connexion avec Apple</b> — si vous appuyez sur « Continuer avec Apple », Apple nous renvoie un identifiant anonyme stable et (uniquement si vous l'autorisez) votre nom et e-mail. Si vous choisissez de masquer votre e-mail, Apple nous fournit une adresse de relais ; nous ne recevons jamais la vraie.",
                "<b>Activité dans l'app</b> — danses marquées comme terminées ou en liste de souhaits, cours suivis, danses suggérées, messages postés dans le chat instructeur, événements du fil d'activité et réactions, actions de suivi / désabonnement.",
                "<b>Jeton de notification de l'appareil</b> — si vous autorisez les notifications, nous stockons le jeton de votre appareil pour envoyer des rappels et mises à jour de cours.",
                "<b>Localisation approximative (facultative)</b> — uniquement quand vous appuyez sur « Près de moi » sur l'écran <b>Trouver des événements</b>. Nous l'utilisons une fois pour calculer les distances et ne stockons jamais les coordonnées sur nos serveurs.",
                "<b>Adresses des événements</b> — si vous êtes instructeur et publiez un événement, l'adresse saisie est stockée et géocodée pour afficher l'événement sur une carte / liste. Ne publiez que les adresses que vous avez le droit de diffuser.",
            ]),
            ("2. Comment nous les utilisons", [
                "Pour vous connecter et sécuriser votre compte.",
                "Pour afficher votre bibliothèque de danses, votre liste de souhaits et votre historique de présence.",
                "Pour permettre aux instructeurs de coordonner les cours, suggestions et discussions communautaires.",
                "Pour alimenter les fonctionnalités sociales — fil d'activité, réactions, abonnements et découverte de danseurs — afin que vous puissiez soutenir les autres membres.",
                "Pour vous envoyer des rappels de cours et mises à jour d'événements (uniquement si vous avez consenti aux notifications).",
            ]),
            ("3. Avec qui nous les partageons", [
                "<b>Google</b> — uniquement si vous vous connectez avec Google, pour l'authentification.",
                "<b>Apple</b> — uniquement si vous vous connectez avec Apple, pour l'authentification.",
                "<b>Firebase Cloud Messaging (Google)</b> — votre jeton de notification est enregistré auprès de FCM pour livrer les rappels sur Android et iOS.",
                "<b>Fournisseur d'e-mail (SMTP)</b> — uniquement lorsque vous demandez une réinitialisation de mot de passe.",
                "<b>OpenStreetMap Nominatim</b> — les adresses d'événements sont envoyées à Nominatim pour obtenir des coordonnées. Nous <b>n'envoyons pas</b> vos identifiants personnels avec l'adresse.",
                "<b>APIs tierces de fiches de pas (CopperKnob, BootStepper)</b> — recherches en lecture seule sur les métadonnées de danses. Nous n'envoyons que le titre de la danse et le chorégraphe, jamais vos identifiants.",
            ], "Nous ne <b>vendons pas</b> vos données. Elles ne sont partagées qu'avec les prestataires nécessaires au fonctionnement de l'app :"),
            ("4. Conservation & suppression des données",
             "Vous pouvez supprimer définitivement votre compte et toutes vos données personnelles à tout moment depuis l'app : allez dans <b>Profil → Supprimer mon compte</b> et confirmez. La suppression retire votre connexion, votre suivi, votre historique de présence, vos suggestions et messages de chat. Le contenu que vous avez créé pour la communauté (danses ou cours) est conservé, mais votre nom est remplacé par « Utilisateur supprimé »."),
            ("5. Vos droits", [
                "Vous pouvez consulter vos données à tout moment dans l'app.",
                "Vous pouvez corriger votre nom / e-mail depuis l'écran Profil.",
                "Vous pouvez supprimer votre compte (voir section 4).",
                "Vous pouvez retirer votre consentement aux notifications depuis les réglages de votre appareil.",
            ]),
            ("6. Enfants",
             f"L'app est destinée aux danseurs de tous âges, mais les enfants de moins de 13 ans ne devraient l'utiliser qu'avec la supervision d'un parent ou tuteur. Nous ne collectons pas sciemment de données auprès d'enfants de moins de 13 ans sans intervention parentale. Si vous pensez qu'un enfant de moins de 13 ans a créé un compte sans autorisation, <a href=\"mailto:{_CONTACT}?subject=COPPA%20request\">contactez-nous</a> et nous supprimerons le compte."),
            ("7. Résidents de Californie (CCPA)",
             "Si vous vivez en Californie, vous avez le droit de savoir quelles informations personnelles nous collectons, d'en demander une copie, d'en demander la suppression, et de ne pas subir de discrimination pour l'exercice de ces droits. Nous ne vendons pas vos informations personnelles. Pour toute demande, écrivez-nous via le lien de contact."),
            ("8. Résidents de l'UE / Royaume-Uni (RGPD)",
             "Si vous vivez dans l'UE, au Royaume-Uni ou dans l'Espace économique européen, vous avez le droit d'accéder, de rectifier, de porter ou d'effacer vos données personnelles, et de vous opposer à leur traitement ou de le restreindre. Notre base légale est votre consentement (par ex. notifications, localisation) ou l'exécution du contrat de service (compte et données de suivi). Écrivez-nous pour exercer l'un de ces droits."),
            ("9. Sécurité",
             "Les mots de passe sont hachés avec bcrypt. Tout le trafic entre l'app et nos serveurs est chiffré via HTTPS. Les jetons de réinitialisation expirent après 15 minutes. L'accès administrateur est restreint par des jetons JWT avec révocation à chaque changement de mot de passe."),
            ("10. DMCA / Retrait pour droits d'auteur",
             f"L'annuaire de danses Stompin' Ground Yuma pointe vers des fiches hébergées par des services tiers comme CopperKnob et BootStepper. Si vous êtes titulaire d'une fiche qui apparaît sans autorisation, <a href=\"mailto:{_CONTACT}?subject=DMCA%20takedown\">écrivez-nous</a> en décrivant l'œuvre, où elle apparaît et vos coordonnées. Nous traiterons les demandes valides dans un délai raisonnable."),
            ("11. Contact",
             f"Questions ou demandes ? Écrivez-nous à <a href=\"mailto:{_CONTACT}\">{_CONTACT}</a> et nous vous répondrons."),
        ],
        "footer": "Stompin' Ground Yuma · Yuma, Arizona",
    },
}


_META_DESCRIPTIONS: dict[str, str] = {
    "en": "Privacy policy for the Stompin' Ground Yuma line-dance mobile app.",
    "es": "Política de privacidad de la aplicación móvil de line dance Stompin' Ground Yuma.",
    "fr": "Politique de confidentialité de l'application mobile de line dance Stompin' Ground Yuma.",
}


def _render_privacy(lang: str) -> str:
    """Assemble the full HTML page for a supported language.

    The skeleton and CSS never change across languages — only the
    strings do. Keeping them in a single template makes it trivial to
    keep the three renders visually identical.
    """
    content = _CONTENT.get(lang) or _CONTENT[DEFAULT_LANGUAGE]
    description = _META_DESCRIPTIONS.get(lang) or _META_DESCRIPTIONS[DEFAULT_LANGUAGE]

    # Section rendering — each entry is either
    #   (title, [bullet, ...])
    #   (title, str)  # single paragraph
    #   (title, [bullet, ...], intro_paragraph)
    sections_html: list[str] = []
    for entry in content["sections"]:  # type: ignore[assignment]
        title = entry[0]
        body = entry[1]
        intro = entry[2] if len(entry) > 2 else None
        block = [f"    <h2>{title}</h2>"]
        if intro:
            block.append(f"    <p>{intro}</p>")
        if isinstance(body, list):
            block.append("    <ul>")
            for b in body:
                block.append(f"      <li>{b}</li>")
            block.append("    </ul>")
        else:
            block.append(f"    <p>{body}</p>")
        sections_html.append("\n".join(block))

    body_html = "\n\n".join(sections_html)

    return f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="index, follow"/>
  <title>{content['title']} · Stompin&#39; Ground Yuma</title>
  <meta name="description" content="{description}"/>
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
    .lang-nav {{
      text-align: center; padding: 12px 8px; font-size: 13px;
      color: var(--muted);
    }}
    .lang-nav a {{ color: var(--muted); margin: 0 6px; }}
    .lang-nav a.active {{ color: var(--brand); font-weight: 700; }}
    .footer {{
      color: var(--muted); font-size: 13px; text-align: center;
      margin-top: 32px;
    }}
  </style>
</head>
<body>
  <header>
    <h1>{content['title']}</h1>
    <p>{content['subtitle']}</p>
  </header>
  <nav class="lang-nav" aria-label="Language">
    <a href="?lang=en"{' class="active"' if lang == 'en' else ''}>English</a>·
    <a href="?lang=es"{' class="active"' if lang == 'es' else ''}>Español</a>·
    <a href="?lang=fr"{' class="active"' if lang == 'fr' else ''}>Français</a>
  </nav>
  <main>
    <p class="updated">{content['updated_label']}: {_LAST_UPDATED}</p>
    <p>{content['intro']}</p>

{body_html}

    <p class="footer">{content['footer']}</p>
  </main>
</body>
</html>
"""


def _pick_language(
    lang_query: Optional[str],
    accept_language: Optional[str],
) -> str:
    """Content-negotiate the response language.

    Explicit ``?lang=`` wins. Otherwise scan ``Accept-Language`` for
    the first supported tag (parsing is deliberately minimal — we
    don't respect q-weights because the ordered list is already the
    browser's stated preference, and Apple/Google reviewers hit us
    with a single locale).
    """
    if lang_query:
        normalised = _normalise_lang(lang_query)
        if normalised in SUPPORTED_LANGUAGES:
            return normalised
    if accept_language:
        for chunk in accept_language.split(","):
            tag = chunk.split(";", 1)[0].strip()
            normalised = _normalise_lang(tag)
            if normalised in SUPPORTED_LANGUAGES and tag:
                # Only return the negotiated tag if the client
                # actually asked for something that mapped — otherwise
                # a wildcard header (``*``) would trivially match.
                base = tag.lower().split("-")[0].split("_")[0].strip()
                if base in SUPPORTED_LANGUAGES:
                    return base
    return DEFAULT_LANGUAGE


@router.get("/privacy", response_class=Response)
async def privacy_policy(
    request: Request,
    lang: Optional[str] = Query(
        None,
        max_length=8,
        description="BCP-47 short code (en, es, fr).",
    ),
) -> Response:
    """Return the privacy policy as a full HTML page in the chosen
    language.

    Cache: ``public, max-age=3600`` with ``Vary: Accept-Language`` so
    intermediaries cache each locale variant separately.
    """
    accept = request.headers.get("accept-language")
    chosen = _pick_language(lang, accept)
    html = _render_privacy(chosen)
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Language": chosen,
            "Vary": "Accept-Language",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",
        },
    )
