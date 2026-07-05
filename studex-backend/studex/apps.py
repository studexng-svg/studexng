from django.apps import AppConfig


class StudexConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'studex'

    def ready(self):
        # Only start the scheduler in the main server process.
        # Skips during migrate, makemigrations, shell, and other management commands.
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