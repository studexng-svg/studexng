# studex/email.py
"""
Central email utility — tries Resend first, falls back to Brevo.
Use send_email() from anywhere in the codebase.
"""
import logging
import sys
import threading

logger = logging.getLogger(__name__)

FROM_NAME  = "StudEx"
FROM_EMAIL = "noreply@studex.com.ng"
FROM_ADDR  = f"{FROM_NAME} <{FROM_EMAIL}>"

# `manage.py test` must never hit the real Resend/Brevo APIs — every test run
# (creating users, orders, bookings) fires send_notification() with
# send_email defaulting to True, and nothing else in the stack stops that
# from reaching the live provider and burning the real daily send quota.
_IS_TEST_RUN = 'test' in sys.argv or 'pytest' in sys.modules


def html_wrapper(title: str, body_html: str) -> str:
    """Branded email shell used for all notification emails."""
    return f"""
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;
                padding:40px 32px;background:#ffffff;">
      <p style="color:#0D9488;font-size:11px;font-weight:700;letter-spacing:.15em;
                text-transform:uppercase;margin:0 0 6px;">StudEx</p>
      <h1 style="font-size:22px;color:#1C1917;margin:0 0 16px;font-weight:700;">{title}</h1>
      {body_html}
      <hr style="border:none;border-top:1px solid #F5F5F4;margin:32px 0 20px;" />
      <p style="font-size:12px;color:#A8A29E;margin:0;">
        You&rsquo;re receiving this because you have an account on
        <a href="https://studex.com.ng" style="color:#0D9488;text-decoration:none;">StudEx</a>.
        <br>To stop email notifications, update your preferences in
        <a href="https://studex.com.ng/account" style="color:#0D9488;text-decoration:none;">Account Settings</a>.
      </p>
    </div>
    """


def try_resend(to: str, subject: str, html: str) -> bool:
    if _IS_TEST_RUN:
        logger.info(f"[email] Test run — skipped Resend send to {to}: {subject}")
        return True
    try:
        import resend
        from django.conf import settings
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            'from': FROM_ADDR,
            'to': [to],
            'subject': subject,
            'html': html,
        })
        return True
    except Exception as e:
        logger.warning(f"[email] Resend failed for {to}: {e}")
        return False


def try_brevo(to: str, subject: str, html: str) -> bool:
    if _IS_TEST_RUN:
        logger.info(f"[email] Test run — skipped Brevo send to {to}: {subject}")
        return True
    try:
        import requests as http
        from django.conf import settings
        api_key = getattr(settings, 'BREVO_API_KEY', '')
        if not api_key:
            return False
        resp = http.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={'api-key': api_key, 'Content-Type': 'application/json'},
            json={
                'sender': {'name': FROM_NAME, 'email': FROM_EMAIL},
                'to': [{'email': to}],
                'subject': subject,
                'htmlContent': html,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f"[email] Brevo failed for {to}: {e}")
        return False


def send_email(to: str, subject: str, html: str, _async: bool = True) -> None:
    """
    Send an email via Resend, falling back to Brevo on failure.
    Runs in a background thread by default so it never blocks a request.
    """
    def _send():
        if not try_resend(to, subject, html):
            try_brevo(to, subject, html)

    if _async:
        threading.Thread(target=_send, daemon=True).start()
    else:
        _send()


def send_notification_email(recipient, title: str, message: str, action_url: str = "") -> None:
    """
    Send a notification email to a user, respecting their email_notifications preference.
    Called automatically from send_notification() in accounts/utils.py.
    Deduplicates within a 60-second window to prevent double-sends from frontend retries.
    """
    try:
        email = getattr(recipient, 'email', None)
        if not email:
            return

        # Respect the user's email notification preference
        try:
            if not recipient.profile.email_notifications:
                return
        except Exception:
            pass  # No profile — send anyway


        cta = ""
        if action_url:
            full_url = (
                action_url if action_url.startswith("http")
                else f"https://studex.com.ng{action_url}"
            )
            cta = f"""
            <a href="{full_url}"
               style="display:inline-block;margin-top:20px;padding:12px 24px;
                      background:linear-gradient(135deg,#0D9488,#7C3AED);
                      color:#ffffff;text-decoration:none;border-radius:10px;
                      font-size:14px;font-weight:600;">
              View on StudEx
            </a>"""

        body = f"""
        <p style="font-size:15px;color:#44403C;line-height:1.7;margin:0 0 8px;">
          {message}
        </p>
        {cta}
        """

        send_email(
            to=email,
            subject=title,
            html=html_wrapper(title, body),
        )
    except Exception as e:
        logger.warning(f"[email] send_notification_email failed: {e}")
