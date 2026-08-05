"""HMAC-signed file download tokens for intranet file proxy."""

import base64
import hashlib
import hmac
import json
import time

from app.config import settings


def _sign(payload: str) -> str:
    key = (settings.app_secret_key or "flowy-default").encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def generate_file_token(
    source_id: str,
    file_url: str,
    ttl_seconds: int = 3600,
    *,
    filename: str | None = None,
    size: int | None = None,
) -> str:
    """Generate a time-limited download token.

    Format: base64(json({sid, url, exp, filename?, size?}) + '.' + signature)
    """
    exp = int(time.time()) + ttl_seconds
    token_data: dict[str, str | int] = {
        "sid": source_id,
        "url": file_url,
        "exp": exp,
    }
    if isinstance(filename, str) and filename:
        token_data["filename"] = filename
    if isinstance(size, int) and not isinstance(size, bool) and size >= 0:
        token_data["size"] = size
    payload = json.dumps(token_data, ensure_ascii=False, separators=(",", ":"))
    sig = _sign(payload)
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def verify_file_token(token: str) -> dict | None:
    """Return verified source/URL and optional display metadata, or ``None``."""
    try:
        padded = token + "=" * (4 - len(token) % 4) if len(token) % 4 else token
        raw = base64.urlsafe_b64decode(padded).decode()

        if "." not in raw:
            return None

        payload_str, sig = raw.rsplit(".", 1)
        if not hmac.compare_digest(_sign(payload_str), sig):
            return None

        payload = json.loads(payload_str)
        if payload.get("exp", 0) < time.time():
            return None

        result = {"sid": payload["sid"], "url": payload["url"]}
        if isinstance(payload.get("filename"), str) and payload["filename"]:
            result["filename"] = payload["filename"]
        size = payload.get("size")
        if isinstance(size, int) and not isinstance(size, bool) and size >= 0:
            result["size"] = size
        return result

    except Exception:
        return None
