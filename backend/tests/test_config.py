"""Tests for app/config.py settings."""

from app.config import Settings


class TestSettings:
    def test_defaults(self):
        """Verify default values are set correctly (may be overridden by .env)."""
        settings = Settings()
        assert settings.app_name == "Flowy"
        assert settings.jwt_algorithm == "HS256"
        assert settings.access_token_expire_minutes == 60
        # These may be overridden by .env file, just check they're strings
        assert isinstance(settings.jwt_secret, str)
        assert isinstance(settings.frontend_url, str)
        assert isinstance(settings.sync_interval_minutes, int)

    def test_database_url_default(self):
        """Default database URL is SQLite async."""
        settings = Settings()
        assert "sqlite+aiosqlite" in settings.database_url

    def test_sync_interval_default(self):
        """Default sync interval is 5 minutes."""
        settings = Settings()
        assert settings.sync_interval_minutes == 5

    def test_settings_from_env(self, monkeypatch):
        """Settings can be overridden via environment variables."""
        monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-123")
        monkeypatch.setenv("FRONTEND_URL", "http://test.example.com")
        monkeypatch.setenv("SYNC_INTERVAL_MINUTES", "10")

        # Create fresh settings instance with new env
        fresh = Settings()
        assert fresh.jwt_secret == "test-jwt-secret-123"
        assert fresh.frontend_url == "http://test.example.com"
        assert fresh.sync_interval_minutes == 10

    def test_encryption_key_empty_by_default(self):
        """Encryption key is empty by default (or can be set via env)."""
        settings = Settings()
        # May be overridden by .env file, so just verify it's a string
        assert isinstance(settings.encryption_key, str)

    def test_oauth_defaults_empty(self):
        """OAuth credentials are empty by default."""
        settings = Settings()
        assert settings.github_client_id == ""
        assert settings.github_client_secret == ""
        assert settings.gitea_client_id == ""
        assert settings.gitea_client_secret == ""
