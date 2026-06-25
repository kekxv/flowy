import json
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeChatWorkBotConfig(Base):
    """WeChat Work bot configuration (single-row store)."""

    __tablename__ = "wechat_work_bot_config"

    key: Mapped[str] = mapped_column(String(36), primary_key=True, default="config")
    value: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    @property
    def config_dict(self) -> dict:
        return json.loads(self.value) if self.value else {}


class WeChatWorkBotUser(Base):
    """Mapping from WeChat Work userid to Flowy user with bot role.

    flowy_user_id is optional — users can be added as viewers without
    binding to a Flowy account.

    display_name stores the WeChat Work display name for @mention matching
    in group chats (long connection mode doesn't provide userid for @mentions).
    """

    __tablename__ = "wechat_work_bot_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    wechat_user_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True, default=None)
    flowy_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, default=None
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="viewer")
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())
    updated_at: Mapped[str] = mapped_column(
        String(32),
        default=lambda: datetime.now().isoformat(),
        onupdate=lambda: datetime.now().isoformat(),
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('admin','helper','viewer')",
            name="ck_bot_user_role",
        ),
    )


class WeChatWorkBotLog(Base):
    """Command execution log for the bot."""

    __tablename__ = "wechat_work_bot_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    wechat_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    flowy_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    command: Mapped[str] = mapped_column(String(64), nullable=False)
    args: Mapped[str | None] = mapped_column(Text, nullable=True)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="success")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: datetime.now().isoformat())

    __table_args__ = (
        CheckConstraint(
            "status IN ('success','failed')",
            name="ck_bot_log_status",
        ),
    )
