import logging
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token, encrypt_token
from app.core.url_security import validate_http_url
from app.models.external import ExternalConnection
from app.models.settings import AppSetting
from app.services.external import get_client

logger = logging.getLogger("uvicorn")


# OAuth token endpoint configs (mirror of api/v1/connections.py OAUTH_CONFIGS)
_OAUTH_CONFIGS = {
    "gitea": {
        "token_url": "{instance}/login/oauth/access_token",
    },
    "github": {
        "token_url": "https://github.com/login/oauth/access_token",
    },
}


def _canonical_instance(url: str) -> tuple[str, str, int, str]:
    parsed = urlsplit(url.rstrip("/"))
    scheme = parsed.scheme.lower()
    port = parsed.port or (443 if scheme == "https" else 80)
    return scheme, (parsed.hostname or "").rstrip(".").lower(), port, parsed.path.rstrip("/")


async def resolve_instance_url(db: AsyncSession, provider: str, requested_url: str) -> str:
    """Resolve a user request to a server-approved external-provider instance."""
    requested = requested_url.strip().rstrip("/")
    if provider == "github":
        if requested:
            raise ValueError("GitHub does not support a custom instance URL")
        return ""
    if provider != "gitea":
        raise ValueError(f"Unsupported provider: {provider}")

    configured_setting = await db.get(AppSetting, "gitea_instance_url")
    configured = (
        configured_setting.value.strip().rstrip("/") if configured_setting else ""
    )
    if configured:
        await validate_http_url(configured, allow_private=True)
        if requested and _canonical_instance(requested) != _canonical_instance(configured):
            raise ValueError("Gitea instance must match the administrator-configured URL")
        return configured

    if requested and _canonical_instance(requested) != _canonical_instance("https://gitea.com"):
        raise ValueError("Custom Gitea instances must be configured by an administrator")
    return ""


async def create_pat_connection(
    db: AsyncSession,
    user_id: str,
    provider: str,
    token: str,
    instance_url: str = "",
) -> ExternalConnection:
    instance_url = await resolve_instance_url(db, provider, instance_url)
    client = get_client(provider, token, instance_url)
    username = await client.get_current_username()

    conn = ExternalConnection(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider=provider,
        pat_token=encrypt_token(token),
        instance_url=instance_url,
        remote_username=username,
        remote_user_id=username,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


async def test_connection(db: AsyncSession, connection_id: str) -> tuple[bool, str]:
    """Test an external connection. Returns (ok, error_message)."""
    conn = await db.get(ExternalConnection, connection_id)
    if not conn:
        return False, "Connection not found"
    try:
        token = await get_valid_token(conn, db)
    except ValueError as e:
        return False, f"Config error: {e}"
    except RuntimeError as e:
        return False, f"Token refresh failed: {e}"
    except Exception as e:
        logger.warning("test_connection: get_valid_token failed for %s: %s", conn.provider, e)
        return False, f"Token error: {e}"
    client = get_client(conn.provider, token, conn.instance_url)
    try:
        ok = await client.test_connection()
        if not ok:
            return False, "API call returned no user info"
        return True, ""
    except Exception as e:
        logger.warning("test_connection: client call failed for %s: %s", conn.provider, e)
        return False, f"API error: {e}"


async def get_valid_token(conn: ExternalConnection, db: AsyncSession) -> str:
    """Get a valid access token, refreshing OAuth tokens when expired.

    Works for both PAT and OAuth connections.  Raises on unrecoverable failure.
    """
    await resolve_instance_url(db, conn.provider, conn.instance_url)
    token = decrypt_token(conn.oauth_token or conn.pat_token or "")

    # Only OAuth connections with a refresh token can be renewed
    if conn.oauth_token and conn.refresh_token:
        needs_refresh = not conn.token_expires_at  # unknown expiry — try refresh
        if conn.token_expires_at:
            try:
                expires_at = datetime.fromisoformat(conn.token_expires_at)
                needs_refresh = datetime.now() >= expires_at
            except ValueError:
                needs_refresh = True

        if needs_refresh:
            refresh = decrypt_token(conn.refresh_token)
            cfg = _OAUTH_CONFIGS.get(conn.provider, {})
            base = (conn.instance_url or "https://gitea.com").rstrip("/")
            if conn.provider == "gitea":
                token_url = cfg.get("token_url", "{instance}/login/oauth/access_token").replace(
                    "{instance}", base
                )
            else:
                token_url = cfg.get("token_url", "https://github.com/login/oauth/access_token")

            # Fall back to DB-stored client credentials
            db_settings: dict[str, str] = {}
            sr = await db.execute(select(AppSetting))
            for s in sr.scalars().all():
                db_settings[s.key] = s.value
            cid = db_settings.get(f"{conn.provider}_client_id") or cfg.get("client_id", "")
            csec = db_settings.get(f"{conn.provider}_client_secret") or cfg.get("client_secret", "")

            payload = {
                "client_id": cid,
                "client_secret": csec,
                "refresh_token": refresh,
                "grant_type": "refresh_token",
            }
            async with httpx.AsyncClient(timeout=15, verify=not conn.instance_url) as client:
                resp = await client.post(
                    token_url, data=payload, headers={"Accept": "application/json"}
                )
                if resp.status_code < 400:
                    data = resp.json()
                    new_token = data.get("access_token")
                    if new_token:
                        conn.oauth_token = encrypt_token(new_token)
                        conn.refresh_token = (
                            encrypt_token(data["refresh_token"])
                            if data.get("refresh_token")
                            else conn.refresh_token
                        )
                        expires_in = int(data.get("expires_in") or 0)
                        conn.token_expires_at = (
                            datetime.now() + timedelta(seconds=expires_in if expires_in > 0 else 3600)
                        ).isoformat()
                        await db.commit()
                        logger.info("Refreshed OAuth token for %s", conn.provider)
                        return new_token
            # Refresh failed
            raise RuntimeError(f"OAuth token refresh failed for {conn.provider}")

    return token


async def get_user_connections(db: AsyncSession, user_id: str) -> list[ExternalConnection]:
    result = await db.execute(
        select(ExternalConnection).where(ExternalConnection.user_id == user_id)
    )
    return list(result.scalars().all())


async def delete_connection(db: AsyncSession, connection: ExternalConnection) -> None:
    await db.delete(connection)
    await db.commit()
