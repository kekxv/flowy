import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExternalConnection(Base):
    __tablename__ = "external_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    oauth_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pat_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    instance_url: Mapped[str] = mapped_column(String(256), default="")
    remote_username: Mapped[str] = mapped_column(String(128), nullable=False)
    remote_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_synced_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    user: Mapped["User"] = relationship("User", lazy="joined")

    __table_args__ = (CheckConstraint("provider IN ('github','gitea')", name="ck_conn_provider"),)


class ExternalIssue(Base):
    __tablename__ = "external_issues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    issue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("external_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    external_url: Mapped[str] = mapped_column(String(512), nullable=False)
    external_repo: Mapped[str] = mapped_column(String(256), nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    link_type: Mapped[str] = mapped_column(String(16), default="issue")
    merged_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_synced_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sync_direction: Mapped[str] = mapped_column(String(16), default="bidirectional")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    issue: Mapped["Issue"] = relationship("Issue", lazy="joined")
    connection: Mapped["ExternalConnection"] = relationship("ExternalConnection", lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "sync_direction IN ('bidirectional','import_only','export_only')",
            name="ck_ext_issue_direction",
        ),
    )


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    connection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("external_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    issues_processed: Mapped[int] = mapped_column(default=0)
    issues_created: Mapped[int] = mapped_column(default=0)
    issues_updated: Mapped[int] = mapped_column(default=0)
    errors: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    completed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    connection: Mapped["ExternalConnection"] = relationship("ExternalConnection", lazy="joined")

    __table_args__ = (
        CheckConstraint(
            "direction IN ('import','export','bidirectional')",
            name="ck_sync_direction",
        ),
        CheckConstraint(
            "status IN ('running','success','partial','failed')",
            name="ck_sync_status",
        ),
    )


class OAuthState(Base):
    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(128), primary_key=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    instance_url: Mapped[str] = mapped_column(String(256), default="")
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    frontend_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
