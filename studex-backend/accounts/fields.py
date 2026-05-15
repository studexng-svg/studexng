from django.db import models


_ENC_PREFIX = 'enc::'


def _fernet():
    from django.conf import settings
    from cryptography.fernet import Fernet
    key = getattr(settings, 'FIELD_ENCRYPTION_KEY', '')
    if not key:
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_field(value: str) -> str:
    if not value:
        return value
    if value.startswith(_ENC_PREFIX):
        return value  # Already encrypted — don't double-encrypt
    f = _fernet()
    if not f:
        return value  # No key configured — leave plaintext
    return _ENC_PREFIX + f.encrypt(value.encode()).decode()


def decrypt_field(value: str) -> str:
    if not value:
        return value
    if not value.startswith(_ENC_PREFIX):
        return value  # Plaintext (legacy or no key) — return as-is
    f = _fernet()
    if not f:
        return value
    try:
        return f.decrypt(value[len(_ENC_PREFIX):].encode()).decode()
    except Exception:
        return value  # Decryption failed — return raw rather than crash


class EncryptedCharField(models.CharField):
    """
    CharField that transparently encrypts values at rest using Fernet (AES-128-CBC + HMAC).
    Requires FIELD_ENCRYPTION_KEY in settings. Falls back to plaintext if key is absent
    so that development environments work without configuration.
    """

    def from_db_value(self, value, expression, connection):
        return decrypt_field(value)

    def get_prep_value(self, value):
        return encrypt_field(value) if value else value

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        path = 'accounts.fields.EncryptedCharField'
        return name, path, args, kwargs
