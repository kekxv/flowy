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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
