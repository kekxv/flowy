import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

issue_assignees = Table(
    "issue_assignees",
    Base.metadata,
    Column("issue_id", String(36), ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String(32), default="member", primary_key=True),
    Column("assigned_at", String(32), default=lambda: datetime.now().isoformat()),
)

issue_labels_table = Table(
    "issue_labels",
    Base.metadata,
    Column("issue_id", String(36), ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True),
    Column("label_id", String(36), ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True),
)

issue_milestones_table = Table(
    "issue_milestones",
    Base.metadata,
    Column("issue_id", String(36), ForeignKey("issues.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "milestone_id",
        String(36),
        ForeignKey("milestones.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    issue_type: Mapped[str] = mapped_column(String(16), default="bug")  # bug / feature
    status: Mapped[str] = mapped_column(String(32), default="open")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    reporter_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )
    closed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    time_estimate_ms: Mapped[int] = mapped_column(default=0, server_default="0")

    reporter: Mapped["User"] = relationship("User", lazy="joined")
    assignees: Mapped[list["User"]] = relationship(
        "User", secondary=issue_assignees, lazy="selectin"
    )
    labels: Mapped[list["Label"]] = relationship(
        "Label", secondary=issue_labels_table, lazy="selectin"
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        "Milestone", secondary=issue_milestones_table, lazy="selectin"
    )
    comments: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="issue", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('open','in_progress','resolved','closed','cancelled','proposed','accepted','rejected')",
            name="ck_issue_status",
        ),
        CheckConstraint(
            "priority IN ('critical','high','medium','low','trivial')",
            name="ck_issue_priority",
        ),
    )


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#808080")
    description: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())


class Comment(Base):
    __tablename__ = "issue_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    issue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("issue_comments.id", ondelete="CASCADE"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="valid")
    status_changed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    issue: Mapped["Issue"] = relationship("Issue", back_populates="comments")
    author: Mapped["User"] = relationship("User", lazy="joined", foreign_keys=[author_id])
    status_changer: Mapped["User"] = relationship(
        "User",
        lazy="joined",
        foreign_keys=[status_changed_by],
    )
