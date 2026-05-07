import firebase_admin
from firebase_admin import credentials
import os
import json


def initialize_firebase():
    if firebase_admin._apps:
        return
    service_account_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON', '')
    if not service_account_json:
        return
    cred = credentials.Certificate(json.loads(service_account_json))
    firebase_admin.initialize_app(cred)


initialize_firebase()
