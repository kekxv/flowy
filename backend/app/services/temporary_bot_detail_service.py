import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_token
from app.models.temporary_bot_detail import TemporaryBotDetail

MIN_EXPIRY_MINUTES = 5
MAX_EXPIRY_MINUTES = 7 * 24 * 60


def hash_detail_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class TemporaryBotDetailService:
    async def create(self, db: AsyncSession, creator_id: str | None, title: str, summary: str, content: str, expires_in_minutes: int = 1440):
        if not MIN_EXPIRY_MINUTES <= expires_in_minutes <= MAX_EXPIRY_MINUTES:
            raise ValueError(f"Expiry must be between {MIN_EXPIRY_MINUTES} and {MAX_EXPIRY_MINUTES} minutes")
        raw = secrets.token_urlsafe(32)
        detail = TemporaryBotDetail(
            token_hash=hash_detail_token(raw), token_encrypted=encrypt_token(raw), creator_id=creator_id,
            title=title, summary=summary, content=content,
            expires_at=(datetime.now(UTC) + timedelta(minutes=expires_in_minutes)).isoformat(),
        )
        db.add(detail)
        await db.commit()
        await db.refresh(detail)
        return detail, raw

    async def get_active(self, db: AsyncSession, raw_token: str) -> TemporaryBotDetail | None:
        return await db.scalar(select(TemporaryBotDetail).where(
            TemporaryBotDetail.token_hash == hash_detail_token(raw_token),
            TemporaryBotDetail.expires_at > datetime.now(UTC).isoformat(),
        ))
