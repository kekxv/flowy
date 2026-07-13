"""Wiki / Knowledge Base models."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, ForeignKey, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

wiki_collaborators_table = Table(
    "wiki_collaborators",
    Base.metadata,
    Column("wiki_id", String(36), ForeignKey("wiki_pages.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission",
        String(16),
        default="editor",
        nullable=False,
    ),
    Column(
        "added_at",
        String(32),
        default=lambda: datetime.now().isoformat(),
    ),
)


class WikiPage(Base):
    """A wiki / knowledge-base page owned by a user."""

    __tablename__ = "wiki_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(1000), default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    weight: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    owner: Mapped["User"] = relationship("User", lazy="joined", foreign_keys=[owner_id])
    collaborators: Mapped[list["User"]] = relationship(
        "User",
        secondary=wiki_collaborators_table,
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("owner_id", "slug", name="uq_wiki_owner_slug"),
    )
