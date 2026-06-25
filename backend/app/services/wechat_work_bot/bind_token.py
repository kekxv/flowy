"""Binding token generation and verification for quick user binding."""

import base64
import hashlib
import hmac
import json
import time

from app.config import settings

BIND_TOKEN_TTL = 600  # 10 minutes


def _sign(payload: str) -> str:
    key = (settings.app_secret_key or "flowy-default").encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()[:16]


def generate_bind_token(flowy_user_id: str, role: str) -> str:
    """Generate a time-limited binding token.

    Format: base64(json({uid, role, exp}) + '.' + signature)
    Valid for 10 minutes, single-use.
    """
    exp = int(time.time()) + BIND_TOKEN_TTL
    payload = json.dumps(
        {"uid": flowy_user_id, "role": role, "exp": exp},
        separators=(",", ":"),
    )
    sig = _sign(payload)
    raw = f"{payload}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def verify_bind_token(token: str) -> dict | None:
    """Verify a binding token. Returns {uid, role} or None if invalid/expired."""
    try:
        padded = token + "=" * (4 - len(token) % 4) if len(token) % 4 else token
        raw = base64.urlsafe_b64decode(padded).decode()

        if "." not in raw:
            return None

        payload_str, sig = raw.rsplit(".", 1)
        if _sign(payload_str) != sig:
            return None

        payload = json.loads(payload_str)
        if payload.get("exp", 0) < time.time():
            return None

        return {"uid": payload["uid"], "role": payload["role"]}

    except Exception:
        return None
