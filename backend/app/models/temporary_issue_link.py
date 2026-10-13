import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TemporaryIssueLink(Base):
    __tablename__ = "temporary_issue_links"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    used_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    revoked_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    issue_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("issues.id", ondelete="SET NULL"), nullable=True)
    attachment_count: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    creator = relationship("User", lazy="joined")
    issue = relationship("Issue", lazy="joined")
Index("ix_temporary_issue_links_creator_active", TemporaryIssueLink.creator_id, TemporaryIssueLink.expires_at, TemporaryIssueLink.used_at)
