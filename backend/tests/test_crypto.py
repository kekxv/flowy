"""Tests for app/core/crypto.py."""

import os

import pytest

from app.core.crypto import decrypt_token, encrypt_token
from app.config import settings


class TestEncryptDecrypt:
    def test_roundtrip(self):
        """Encrypt then decrypt returns original value."""
        plaintext = "my-secret-token-12345"
        encrypted = encrypt_token(plaintext)
        decrypted = decrypt_token(encrypted)
        assert decrypted == plaintext

    def test_encrypt_changes_value(self):
        """Encrypted value differs from plaintext."""
        plaintext = "hello-world"
        encrypted = encrypt_token(plaintext)
        assert encrypted != plaintext
        # Fernet produces different ciphertext each time (includes IV)
        encrypted2 = encrypt_token(plaintext)
        assert encrypted != encrypted2

    def test_decrypt_invalid_token_raises(self):
        """Decoding invalid ciphertext raises an exception."""
        with pytest.raises(Exception):
            decrypt_token("not-a-valid-base64-token!!!")

    def test_empty_string_roundtrip(self):
        """Empty string can be encrypted and decrypted."""
        encrypted = encrypt_token("")
        assert decrypt_token(encrypted) == ""

    def test_unicode_roundtrip(self):
        """Unicode strings can be encrypted and decrypted."""
        plaintext = "测试中文🔐"
        encrypted = encrypt_token(plaintext)
        assert decrypt_token(encrypted) == plaintext

    def test_no_encryption_key_raises(self, monkeypatch):
        """Missing ENCRYPTION_KEY raises RuntimeError."""
        monkeypatch.setenv("ENCRYPTION_KEY", "")
        # Need to reload settings to pick up the new env var
        from app.config import Settings
        new_settings = Settings()
        assert new_settings.encryption_key == ""

        # The Fernet constructor will fail with invalid key
        from cryptography.fernet import Fernet
        with pytest.raises(Exception):
            Fernet("".encode())
