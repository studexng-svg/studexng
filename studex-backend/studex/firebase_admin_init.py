# studex/firebase_admin_init.py
import firebase_admin
from firebase_admin import credentials
from django.conf import settings
import os

# Build absolute path to the JSON file
service_account_path = os.path.join(settings.BASE_DIR, '..', 'firebase_service_account.json')

cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred)