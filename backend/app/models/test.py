import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TestRequest(Base):
    __tablename__ = "test_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    objective: Mapped[str] = mapped_column(Text, default="")
    expected_effect: Mapped[str] = mapped_column(Text, default="")
    current_behavior: Mapped[str] = mapped_column(Text, default="")
    issue_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("issues.id", ondelete="SET NULL"), nullable=True)
    reporter_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    tester_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="submitted")
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat(), onupdate=lambda: datetime.now().isoformat())
    reporter = relationship("User", foreign_keys=[reporter_id], lazy="joined")
    tester = relationship("User", foreign_keys=[tester_id], lazy="joined")
    issue = relationship("Issue", lazy="joined")
    runs = relationship("TestRun", back_populates="request", cascade="all, delete-orphan", order_by="TestRun.created_at.desc()", lazy="selectin")
    __table_args__ = (
        CheckConstraint("status IN ('submitted','queued','testing','passed','failed','cancelled','rejected')", name="ck_test_request_status"),
        Index("ix_test_requests_status", "status"),
    )


class TestRun(Base):
    __tablename__ = "test_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("test_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    tester_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[str] = mapped_column(String(256), default="")
    method: Mapped[str] = mapped_column(Text, default="")
    server_url: Mapped[str] = mapped_column(String(1000), default="")
    steps: Mapped[str] = mapped_column(Text, default="")
    result: Mapped[str] = mapped_column(Text, default="")
    report: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    request = relationship("TestRequest", back_populates="runs")
    tester = relationship("User", lazy="joined")
    __table_args__ = (CheckConstraint("status IN ('passed','failed')", name="ck_test_run_status"),)


class TestAttachment(Base):
    __tablename__ = "test_attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("test_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())


class TestStatusHistory(Base):
    __tablename__ = "test_status_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("test_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(16), nullable=False)
    to_status: Mapped[str] = mapped_column(String(16), nullable=False)
    changed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())


class TestCollectionLink(Base):
    __tablename__ = "test_collection_links"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at: Mapped[str] = mapped_column(String(32), nullable=False)
    used_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    revoked_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attachment_count: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    creator = relationship("User", lazy="joined")


class TestCollectionAttachment(Base):
    __tablename__ = "test_collection_attachments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id: Mapped[str] = mapped_column(String(36), ForeignKey("test_collection_links.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
