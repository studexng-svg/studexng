# notifications/apps.py
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"

    def ready(self):
        """
        Called once when Django finishes loading all apps.
        This is the correct place to start background threads.
        The `os.environ` guard prevents it running twice in dev
        (Django's autoreloader spawns a child process).
        """
        # Signals must always be registered — no guard here.
        import notifications.admin_notify  # noqa: F401

        # start_reminder_thread() has its own threading lock so it's
        # safe to call unconditionally — it only ever starts one thread.
        # In dev the autoreloader calls ready() twice but the lock prevents
        # a second thread. In production (Gunicorn) it starts once per worker,
        # but the global _thread_started flag gates it to one thread total.
        from notifications.reminders import start_reminder_thread
        start_reminder_thread()