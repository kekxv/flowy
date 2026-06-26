from cryptography.fernet import Fernet

from app.config import settings


def _get_fernet() -> Fernet:
    if not settings.encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    key = settings.encryption_key
    # Tolerate keys generated with secrets.token_urlsafe() which strips
    # the trailing '=' padding that Fernet (base64.urlsafe_b64decode) requires.
    remainder = len(key) % 4
    if remainder:
        key = key + "=" * (4 - remainder)
    return Fernet(key.encode())


def encrypt_token(plaintext: str) -> str:
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
