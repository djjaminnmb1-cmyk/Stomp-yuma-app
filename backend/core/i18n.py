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


SUPPORTED_LANGUAGES: tuple[str, ...] = (
    "en",
    "es",
    "fr",
    "de",
    "nl",
    "ko",
    "zh-Hans",
    "zh-Hant",
)
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
        # Any new chat post (opt-out via ``chat_alerts``)
        "push.chat_message.title": "{sender} posted in chat",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} replied to your message",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 Your dance was approved!",
        "push.pending_dance.approved.body": "\u201c{title}\u201d is now in the library. Tap to view.",
        "push.pending_dance.rejected.title": "Your submission wasn\u2019t approved",
        "push.pending_dance.rejected.body": "\u201c{title}\u201d \u2014 {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 New dance submission",
        "push.admin_pending_dance.body": "{submitter} submitted “{title}” — review it in the pending queue.",
        "push.admin_instructor_grant.title": "🪪 New instructor on the floor",
        "push.admin_instructor_grant.body": "{who} just unlocked the Instructor role. Audit if needed.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ New dance in the library",
        "push.library_new_dance.body": "“{dance_name}” by {choreographer} — tap to open.",
        "push.library_new_class.title": "📅 New class on the schedule",
        "push.library_new_class.body": "{instructor}: {class_title} — {when}",

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
        "push.chat_message.title": "{sender} escribió en el chat",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} respondió a tu mensaje",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 ¡Tu baile fue aprobado!",
        "push.pending_dance.approved.body": "«{title}» ya está en la biblioteca. Toca para ver.",
        "push.pending_dance.rejected.title": "Tu envío no fue aprobado",
        "push.pending_dance.rejected.body": "«{title}» — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 Nuevo baile enviado",
        "push.admin_pending_dance.body": "{submitter} envió «{title}» — revísalo en la cola.",
        "push.admin_instructor_grant.title": "🪪 Nuevo instructor",
        "push.admin_instructor_grant.body": "{who} desbloqueó el rol de instructor. Audita si es necesario.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ Nuevo baile en la biblioteca",
        "push.library_new_dance.body": "«{dance_name}» de {choreographer} — toca para abrir.",
        "push.library_new_class.title": "📅 Nueva clase programada",
        "push.library_new_class.body": "{instructor}: {class_title} — {when}",

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
        "push.chat_message.title": "{sender} a écrit dans le chat",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} a répondu à votre message",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 Votre danse a été approuvée !",
        "push.pending_dance.approved.body": "« {title} » est maintenant dans la bibliothèque. Touchez pour voir.",
        "push.pending_dance.rejected.title": "Votre proposition a été refusée",
        "push.pending_dance.rejected.body": "« {title} » — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 Nouvelle soumission de danse",
        "push.admin_pending_dance.body": "{submitter} a soumis « {title} » — à vérifier dans la file.",
        "push.admin_instructor_grant.title": "🪪 Nouveau profe sur la piste",
        "push.admin_instructor_grant.body": "{who} vient de passer Instructeur. À auditer au besoin.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ Nouvelle danse en bibliothèque",
        "push.library_new_dance.body": "« {dance_name} » de {choreographer} — appuyez pour ouvrir.",
        "push.library_new_class.title": "📅 Nouveau cours programmé",
        "push.library_new_class.body": "{instructor} : {class_title} — {when}",

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
    "de": {
        # ---------- Push-Benachrichtigungen ----------
        "push.new_dance.title": "Neuer Tanz von {choreographer}",
        "push.new_dance.body": "„{dance_name}“ ist gerade in der Bibliothek gelandet – schau vorbei.",
        "push.new_event.title": "{instructor} hat ein neues Event veröffentlicht",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} hat einen neuen Kurs hinzugefügt",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "Kurs morgen: {class_title}",
        "push.class_reminder.body": "Wir sehen uns um {when} — bring deine Stiefel mit!",
        "push.new_follower.title": "{follower} folgt dir jetzt",
        "push.new_follower.body": "Sag Hallo auf ihrem Profil.",
        "push.chat_mention.title": "{sender} hat dich erwähnt",
        "push.chat_mention.body": "{preview}",
        "push.chat_message.title": "{sender} hat im Chat geschrieben",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} hat auf deine Nachricht geantwortet",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 Dein Tanz wurde freigegeben!",
        "push.pending_dance.approved.body": "„{title}“ ist jetzt in der Bibliothek. Tippen zum Ansehen.",
        "push.pending_dance.rejected.title": "Dein Vorschlag wurde abgelehnt",
        "push.pending_dance.rejected.body": "„{title}“ — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 Neue Tanz-Einreichung",
        "push.admin_pending_dance.body": "{submitter} hat „{title}“ eingereicht — in der Warteschlange prüfen.",
        "push.admin_instructor_grant.title": "🪪 Neue Trainerin / neuer Trainer",
        "push.admin_instructor_grant.body": "{who} hat gerade die Trainerrolle freigeschaltet. Bei Bedarf prüfen.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ Neuer Tanz in der Bibliothek",
        "push.library_new_dance.body": "„{dance_name}“ von {choreographer} — tippe zum Öffnen.",
        "push.library_new_class.title": "📅 Neuer Kurs im Plan",
        "push.library_new_class.body": "{instructor}: {class_title} — {when}",

        # ---------- Passwort-Reset-E-Mail ----------
        "email.reset.subject": "Setze dein Stompin' Ground Yuma Passwort zurück",
        "email.reset.greeting": "Hallo {name},",
        "email.reset.intro": (
            "Wir haben eine Anfrage zum Zurücksetzen deines Stompin' Ground "
            "Yuma Passworts erhalten. Tippe auf die Schaltfläche unten, um "
            "ein neues Passwort festzulegen. Dieser Link läuft in "
            "{minutes} Minuten ab und kann nur einmal verwendet werden."
        ),
        "email.reset.button": "Passwort zurücksetzen",
        "email.reset.copy_hint": "Oder kopiere diesen Link in deinen Browser:",
        "email.reset.ignore": (
            "Wenn du das nicht angefordert hast, kannst du diese E-Mail "
            "getrost ignorieren – dein Passwort bleibt unverändert."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "nl": {
        # ---------- Push-meldingen ----------
        "push.new_dance.title": "Nieuwe dans van {choreographer}",
        "push.new_dance.body": "\"{dance_name}\" staat nu in de bibliotheek — ga eens kijken.",
        "push.new_event.title": "{instructor} plaatste een nieuw event",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} voegde een nieuwe les toe",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "Les morgen: {class_title}",
        "push.class_reminder.body": "Tot {when} — vergeet je laarzen niet!",
        "push.new_follower.title": "{follower} volgt je nu",
        "push.new_follower.body": "Zeg hallo op hun profiel.",
        "push.chat_mention.title": "{sender} noemde je",
        "push.chat_mention.body": "{preview}",
        "push.chat_message.title": "{sender} plaatste een chatbericht",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} reageerde op je bericht",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 Je dans is goedgekeurd!",
        "push.pending_dance.approved.body": "'{title}' staat nu in de bibliotheek. Tik om te bekijken.",
        "push.pending_dance.rejected.title": "Je inzending is afgewezen",
        "push.pending_dance.rejected.body": "'{title}' — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 Nieuwe dansinzending",
        "push.admin_pending_dance.body": "{submitter} stuurde '{title}' — bekijk de wachtrij.",
        "push.admin_instructor_grant.title": "🪪 Nieuwe instructeur",
        "push.admin_instructor_grant.body": "{who} heeft net de instructeursrol vrijgespeeld. Controleer indien nodig.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ Nieuwe dans in de bibliotheek",
        "push.library_new_dance.body": "'{dance_name}' van {choreographer} — tik om te openen.",
        "push.library_new_class.title": "📅 Nieuwe les gepland",
        "push.library_new_class.body": "{instructor}: {class_title} — {when}",

        # ---------- Wachtwoord reset e-mail ----------
        "email.reset.subject": "Reset je Stompin' Ground Yuma wachtwoord",
        "email.reset.greeting": "Hoi {name},",
        "email.reset.intro": (
            "We ontvingen een verzoek om je Stompin' Ground Yuma wachtwoord "
            "te resetten. Tik op de knop hieronder om een nieuw wachtwoord in "
            "te stellen. Deze link vervalt over {minutes} minuten en kan "
            "slechts één keer worden gebruikt."
        ),
        "email.reset.button": "Wachtwoord resetten",
        "email.reset.copy_hint": "Of kopieer deze link in je browser:",
        "email.reset.ignore": (
            "Als jij dit niet hebt aangevraagd, kun je deze e-mail veilig "
            "negeren — je wachtwoord blijft hetzelfde."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "ko": {
        # ---------- 푸시 알림 ----------
        "push.new_dance.title": "{choreographer}의 새 댄스",
        "push.new_dance.body": "\"{dance_name}\"이(가) 라이브러리에 방금 올라왔어요 — 확인해 보세요.",
        "push.new_event.title": "{instructor}이(가) 새 이벤트를 올렸어요",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor}이(가) 새 수업을 추가했어요",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "내일 수업: {class_title}",
        "push.class_reminder.body": "{when}에 만나요 — 부츠 잊지 마세요!",
        "push.new_follower.title": "{follower}님이 회원님을 팔로우하기 시작했어요",
        "push.new_follower.body": "프로필에서 인사를 남겨보세요.",
        "push.chat_mention.title": "{sender}님이 회원님을 언급했어요",
        "push.chat_mention.body": "{preview}",
        "push.chat_message.title": "{sender}님이 채팅에 글을 올렸어요",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender}님이 회원님의 메시지에 답장했어요",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 댄스가 승인되었어요!",
        "push.pending_dance.approved.body": "「{title}」이(가) 라이브러리에 추가되었어요. 눌러서 확인하세요.",
        "push.pending_dance.rejected.title": "제출이 승인되지 않았어요",
        "push.pending_dance.rejected.body": "「{title}」 — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 새 댄스 제출",
        "push.admin_pending_dance.body": "{submitter}님이 「{title}」을(를) 제출했어요 — 대기열에서 확인하세요.",
        "push.admin_instructor_grant.title": "🪪 새 강사",
        "push.admin_instructor_grant.body": "{who}님이 강사 역할을 활성화했어요. 필요하면 확인하세요.",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ 라이브러리에 새 댄스",
        "push.library_new_dance.body": "{choreographer}님의 「{dance_name}」 — 눌러서 열어보세요.",
        "push.library_new_class.title": "📅 새 수업 일정",
        "push.library_new_class.body": "{instructor}: {class_title} — {when}",

        # ---------- 비밀번호 재설정 이메일 ----------
        "email.reset.subject": "Stompin' Ground Yuma 비밀번호 재설정",
        "email.reset.greeting": "{name}님, 안녕하세요.",
        "email.reset.intro": (
            "Stompin' Ground Yuma 비밀번호 재설정 요청을 받았어요. "
            "아래 버튼을 눌러 새 비밀번호를 설정해 주세요. 이 링크는 "
            "{minutes}분 후에 만료되며 한 번만 사용할 수 있어요."
        ),
        "email.reset.button": "비밀번호 재설정",
        "email.reset.copy_hint": "또는 이 링크를 브라우저에 복사하세요:",
        "email.reset.ignore": (
            "요청하지 않으셨다면 이 이메일을 무시해도 괜찮아요 — "
            "비밀번호는 그대로 유지됩니다."
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "zh-Hans": {
        # ---------- 推送通知 ----------
        "push.new_dance.title": "{choreographer} 的新舞蹈",
        "push.new_dance.body": "\"{dance_name}\" 刚刚上线,来看看吧。",
        "push.new_event.title": "{instructor} 发布了新活动",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} 新增了一节课",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "明日课程:{class_title}",
        "push.class_reminder.body": "{when} 见 — 别忘记带靴子!",
        "push.new_follower.title": "{follower} 开始关注你了",
        "push.new_follower.body": "去他的主页打个招呼吧。",
        "push.chat_mention.title": "{sender} 提到了你",
        "push.chat_mention.body": "{preview}",
        "push.chat_message.title": "{sender} 在聊天中发言",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} 回复了你的消息",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 您的舞蹈已通过！",
        "push.pending_dance.approved.body": "「{title}」现在已在库中。点击查看。",
        "push.pending_dance.rejected.title": "您的提交未通过",
        "push.pending_dance.rejected.body": "「{title}」 — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 新的舞蹈提交",
        "push.admin_pending_dance.body": "{submitter} 提交了「{title}」— 请在待审队列查看。",
        "push.admin_instructor_grant.title": "🪪 新讲师",
        "push.admin_instructor_grant.body": "{who} 刚刚解锁了讲师角色。如需要可审查。",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ 库里新舞上线",
        "push.library_new_dance.body": "{choreographer} 的「{dance_name}」— 点击打开。",
        "push.library_new_class.title": "📅 新课程已排",
        "push.library_new_class.body": "{instructor}:{class_title} — {when}",

        # ---------- 密码重置邮件 ----------
        "email.reset.subject": "重置您的 Stompin' Ground Yuma 密码",
        "email.reset.greeting": "你好 {name},",
        "email.reset.intro": (
            "我们收到重置您 Stompin' Ground Yuma 密码的请求。"
            "点击下方按钮设置新密码。此链接将在 {minutes} 分钟后过期,只能使用一次。"
        ),
        "email.reset.button": "重置密码",
        "email.reset.copy_hint": "或将此链接复制到浏览器:",
        "email.reset.ignore": (
            "如果这不是您的请求,可以安全地忽略此邮件 — 您的密码将保持不变。"
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
    "zh-Hant": {
        # ---------- 推播通知 ----------
        "push.new_dance.title": "{choreographer} 的新舞蹈",
        "push.new_dance.body": "「{dance_name}」剛剛上線,快來看看。",
        "push.new_event.title": "{instructor} 發佈了新活動",
        "push.new_event.body": "{event_title} — {when}",
        "push.new_class.title": "{instructor} 新增了一堂課",
        "push.new_class.body": "{class_title} — {when}",
        "push.class_reminder.title": "明日課程:{class_title}",
        "push.class_reminder.body": "{when} 見 — 別忘了帶靴子!",
        "push.new_follower.title": "{follower} 開始追蹤你了",
        "push.new_follower.body": "去他的主頁打個招呼吧。",
        "push.chat_mention.title": "{sender} 提到了你",
        "push.chat_mention.body": "{preview}",
        "push.chat_message.title": "{sender} 在聊天中發言",
        "push.chat_message.body": "{preview}",
        "push.chat_reply.title": "{sender} 回覆了你的訊息",
        "push.chat_reply.body": "{preview}",
        # Pending-dance submission approved / rejected
        "push.pending_dance.approved.title": "🎉 您的舞蹈已通過！",
        "push.pending_dance.approved.body": "「{title}」現已在資料庫中。點選檢視。",
        "push.pending_dance.rejected.title": "您的提交未通過",
        "push.pending_dance.rejected.body": "「{title}」 — {reason}",
        # June 2026 — admin/library/announcement broadcast categories.
        "push.admin_pending_dance.title": "📥 新的舞蹈投稿",
        "push.admin_pending_dance.body": "{submitter} 投稿了「{title}」— 請於待審佇列中查看。",
        "push.admin_instructor_grant.title": "🪪 新教練",
        "push.admin_instructor_grant.body": "{who} 剛剛解鎖教練角色,如有需要可審查。",
        "push.announcement.title": "📣 {title}",
        "push.announcement.body": "{preview}",
        "push.library_new_dance.title": "✨ 資料庫新增舞蹈",
        "push.library_new_dance.body": "{choreographer} 的「{dance_name}」— 點擊開啟。",
        "push.library_new_class.title": "📅 新課程已排定",
        "push.library_new_class.body": "{instructor}:{class_title} — {when}",

        # ---------- 密碼重設信件 ----------
        "email.reset.subject": "重設您的 Stompin' Ground Yuma 密碼",
        "email.reset.greeting": "你好 {name},",
        "email.reset.intro": (
            "我們收到重設您 Stompin' Ground Yuma 密碼的請求。"
            "點按下方按鈕設定新密碼。此連結將於 {minutes} 分鐘後失效,且只能使用一次。"
        ),
        "email.reset.button": "重設密碼",
        "email.reset.copy_hint": "或將此連結複製到瀏覽器:",
        "email.reset.ignore": (
            "若您並未提出此要求,可以放心忽略這封信 — 您的密碼將維持不變。"
        ),
        "email.reset.signoff": "— Stompin' Ground Yuma",
    },
}


def _normalise_lang(lang: Optional[str]) -> str:
    """Return one of ``SUPPORTED_LANGUAGES``. Accepts BCP-47 tags
    (``"es-MX"`` → ``"es"``) and falls back to English on any
    unsupported / empty value.

    Chinese is a special case because the two supported catalogs
    (``zh-Hans`` / ``zh-Hant``) share the same base language.
    We inspect the script + region subtags so ``zh-CN`` /
    ``zh-Hans-*`` land in Simplified and ``zh-TW`` / ``zh-HK`` /
    ``zh-MO`` / ``zh-Hant-*`` land in Traditional. A bare ``zh``
    defaults to Simplified (larger reader base) — the client can
    always override.
    """
    if not lang:
        return DEFAULT_LANGUAGE
    tag = str(lang).replace("_", "-").strip()
    lower = tag.lower()
    base = lower.split("-")[0]

    if base == "zh":
        subtags = lower.split("-")[1:]
        if any(t in {"hant", "tw", "hk", "mo"} for t in subtags):
            return "zh-Hant"
        return "zh-Hans"

    # Direct match for hyphenated codes like ``de`` / ``ko`` / ``nl``
    if lower in SUPPORTED_LANGUAGES:
        return lower
    if base in SUPPORTED_LANGUAGES:
        return base
    return DEFAULT_LANGUAGE


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
    catalog. Used by the ``PATCH /api/auth/me`` validator.

    Accepts the canonical short codes (``en``, ``es``, ``fr``,
    ``de``, ``nl``, ``ko``), the two Chinese script variants
    (``zh-Hans``, ``zh-Hant``), and BCP-47 tags that CLEARLY
    disambiguate to one of them (e.g. ``zh-CN`` for Simplified,
    ``zh-TW`` for Traditional). A BARE ``zh`` is rejected because
    the caller would have to pick a script — the client sends the
    explicit variant.
    """
    if not lang:
        return False
    tag = str(lang).replace("_", "-").strip().lower()
    base = tag.split("-")[0]
    if base == "zh":
        subtags = tag.split("-")[1:]
        if any(t in {"hans", "cn", "sg", "hant", "tw", "hk", "mo"} for t in subtags):
            return True
        # Bare "zh" → not accepted from the client; force explicit choice.
        return False
    return base in SUPPORTED_LANGUAGES
