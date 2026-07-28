from cryptography.fernet import Fernet
from pydantic import computed_field
from pydantic_settings import BaseSettings


def _parse_cors(raw: str) -> list[str]:
    """Parse CORS origins from a string (JSON array or comma-separated)."""
    raw = raw.strip()
    if not raw:
        return ["http://localhost:5173", "http://127.0.0.1:5173"]
    # Try JSON array first
    if raw.startswith("["):
        import json
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(s).strip() for s in parsed if str(s).strip()]
        except (json.JSONDecodeError, ValueError):
            pass
    # Comma-separated
    return [s.strip() for s in raw.split(",") if s.strip()]


class Settings(BaseSettings):
    app_name: str = "Flowy"
    app_secret_key: str = "change-me-to-random-secret"
    jwt_secret: str = "change-me-to-another-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    encryption_key: str = ""  # Fernet key, base64-encoded 32 bytes
    database_url: str = "sqlite+aiosqlite:///./flowy.db"
    sync_interval_minutes: int = 5

    frontend_url: str = "http://localhost:5173"
    # Read as raw string to avoid pydantic-settings json.loads on list[str]
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # OAuth (optional)
    github_client_id: str = ""
    github_client_secret: str = ""
    gitea_client_id: str = ""
    gitea_client_secret: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins_list(self) -> list[str]:
        return _parse_cors(self.cors_origins)

    def validate_security_secrets(self) -> None:
        """Reject secrets that would make production tokens forgeable or unreadable."""
        weak_values = {
            "",
            "change-me-to-random-secret",
            "change-me-to-another-secret",
            "dev-secret-change-in-production",
            "dev-jwt-secret-change-in-production",
        }
        for field_name in ("jwt_secret", "app_secret_key"):
            value = getattr(self, field_name)
            if value in weak_values or len(value) < 32:
                raise ValueError(f"{field_name.upper()} must be a non-default secret of 32+ characters")
        if not self.encryption_key:
            raise ValueError("ENCRYPTION_KEY must be configured and persisted")
        key = self.encryption_key
        if len(key) % 4:
            key += "=" * (4 - len(key) % 4)
        try:
            Fernet(key.encode())
        except Exception as exc:
            raise ValueError("ENCRYPTION_KEY must be a valid Fernet key") from exc

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
