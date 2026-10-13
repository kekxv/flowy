import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_token
from app.models.issue import Issue, issue_assignees
from app.models.temporary_issue_link import TemporaryIssueLink

MIN_EXPIRY_MINUTES = 5
MAX_EXPIRY_MINUTES = 7 * 24 * 60
MAX_ACTIVE_LINKS = 20
def hash_link_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
def create_raw_token() -> str:
    return secrets.token_urlsafe(32)
def _now() -> str:
    return datetime.now(UTC).isoformat()
class TemporaryIssueLinkService:
    async def create(self, db: AsyncSession, creator_id: str, expires_in_minutes: int = 1440):
        if not MIN_EXPIRY_MINUTES <= expires_in_minutes <= MAX_EXPIRY_MINUTES:
            raise ValueError(f"Expiry must be between {MIN_EXPIRY_MINUTES} and {MAX_EXPIRY_MINUTES} minutes")
        now = _now()
        count = await db.scalar(select(func.count(TemporaryIssueLink.id)).where(TemporaryIssueLink.creator_id == creator_id, TemporaryIssueLink.used_at.is_(None), TemporaryIssueLink.revoked_at.is_(None), TemporaryIssueLink.expires_at > now))
        if (count or 0) >= MAX_ACTIVE_LINKS:
            raise ValueError("Too many active links")
        raw = create_raw_token()
        link = TemporaryIssueLink(token_hash=hash_link_token(raw), token_encrypted=encrypt_token(raw), creator_id=creator_id, expires_at=(datetime.now(UTC) + timedelta(minutes=expires_in_minutes)).isoformat())
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return link, raw
    async def get_active(self, db: AsyncSession, raw_token: str):
        return await db.scalar(select(TemporaryIssueLink).where(TemporaryIssueLink.token_hash == hash_link_token(raw_token), TemporaryIssueLink.used_at.is_(None), TemporaryIssueLink.revoked_at.is_(None), TemporaryIssueLink.expires_at > _now()))
    async def reserve_attachment(self, db: AsyncSession, raw_token: str) -> TemporaryIssueLink | None:
        result = await db.execute(update(TemporaryIssueLink).where(TemporaryIssueLink.token_hash == hash_link_token(raw_token), TemporaryIssueLink.used_at.is_(None), TemporaryIssueLink.revoked_at.is_(None), TemporaryIssueLink.expires_at > _now(), TemporaryIssueLink.attachment_count < 5).values(attachment_count=TemporaryIssueLink.attachment_count + 1))
        if result.rowcount != 1:
            return None
        await db.commit()
        return await self.get_active(db, raw_token)

    async def consume_and_create_issue(self, db: AsyncSession, raw_token: str, data: dict) -> Issue:
        now = _now()
        result = await db.execute(
            update(TemporaryIssueLink)
            .where(
                TemporaryIssueLink.token_hash == hash_link_token(raw_token),
                TemporaryIssueLink.used_at.is_(None),
                TemporaryIssueLink.revoked_at.is_(None),
                TemporaryIssueLink.expires_at > now,
            )
            .values(used_at=now)
        )
        if result.rowcount != 1:
            raise ValueError("Link is expired or already used")
        link = await db.scalar(select(TemporaryIssueLink).where(TemporaryIssueLink.token_hash == hash_link_token(raw_token)))
        issue = Issue(id=str(uuid4()), title=data["title"], description=data.get("description", ""), issue_type=data.get("issue_type", "bug"), priority=data.get("priority", "medium"), due_date=data.get("due_date"), reporter_id=link.creator_id)
        db.add(issue)
        await db.flush()
        await db.execute(issue_assignees.insert().values(issue_id=issue.id, user_id=link.creator_id, role="member", assigned_at=now))
        link.issue_id = issue.id
        await db.commit()
        await db.refresh(issue)
        return issue
