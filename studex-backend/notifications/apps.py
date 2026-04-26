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
        import os
        if os.environ.get("RUN_MAIN") != "true":
            # Only run in the reloader child process (or in production where
            # RUN_MAIN is not set at all — Render, Gunicorn, etc.)
            return

        from notifications.reminders import start_reminder_thread
        start_reminder_thread()