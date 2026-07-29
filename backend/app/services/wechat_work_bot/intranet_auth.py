"""Credential handling for authenticated intranet file sources."""

from app.core.crypto import decrypt_token
from app.models.wechat_work_bot import IntranetSource


def get_source_credentials(source: IntranetSource) -> tuple[str, str] | None:
    """Decrypt a source's Basic Auth credentials immediately before use."""
    if not source.auth_username or not source.auth_password_encrypted:
        return None
    return source.auth_username, decrypt_token(source.auth_password_encrypted)
