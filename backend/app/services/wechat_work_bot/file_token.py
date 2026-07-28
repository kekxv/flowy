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


def generate_file_token(source_id: str, file_url: str, ttl_seconds: int = 3600) -> str:
    """Generate a time-limited download token.

    Format: base64(json({sid, url, exp}) + '.' + signature)
    """
    exp = int(time.time()) + ttl_seconds
    payload = json.dumps(
        {"sid": source_id, "url": file_url, "exp": exp},
        separators=(",", ":"),
    )
    sig = _sign(payload)
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def verify_file_token(token: str) -> dict | None:
    """Verify a file download token. Returns {sid, url} or None if invalid/expired."""
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

        return {"sid": payload["sid"], "url": payload["url"]}

    except Exception:
        return None
