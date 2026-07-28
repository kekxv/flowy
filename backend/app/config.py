import json

from pydantic import field_validator
from pydantic_settings import BaseSettings


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
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # OAuth (optional)
    github_client_id: str = ""
    github_client_secret: str = ""
    gitea_client_id: str = ""
    gitea_client_secret: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["http://localhost:5173", "http://127.0.0.1:5173"]
            # Try JSON array first: ["http://..."]
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass
            # Fall back to comma-separated: http://...,http://...
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
