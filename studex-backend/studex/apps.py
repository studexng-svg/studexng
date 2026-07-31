from django.apps import AppConfig


class StudexConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'studex'

    def ready(self):
        # Only start the scheduler in the real server process (gunicorn in
        # production, `manage.py runserver` locally).
        #
        # The comment here used to claim this "skips during migrate,
        # makemigrations, shell, and other management commands" — it
        # didn't. SCHEDULER_STARTED only guards against starting twice
        # within one already-running process (e.g. the autoreloader's
        # child process); every fresh manage.py invocation gets a fresh
        # environment, so `check`, `makemigrations`, `test`, `shell`, and
        # the Procfile's own `release: python manage.py migrate` step were
        # ALL starting the full scheduler via this hook — including
        # DjangoJobStore(), which touches the database immediately at
        # construction time. On a machine where the (sqlite, locally) or
        # Postgres connection is contended/slow, that alone was enough to
        # hang a bare `manage.py check` indefinitely, unrelated to whatever
        # the actual command was trying to do.
        import sys
        is_server = 'runserver' in sys.argv or 'gunicorn' in sys.argv[0].lower()
        if not is_server:
            return

        import os
        if os.environ.get('SCHEDULER_STARTED') != '1':
            os.environ['SCHEDULER_STARTED'] = '1'
            try:
                from scheduler import start
                start()
                print("[studex] Scheduler started OK", flush=True)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Scheduler failed to start: {e}")
                print(f"[studex] Scheduler FAILED to start: {e}", flush=True)