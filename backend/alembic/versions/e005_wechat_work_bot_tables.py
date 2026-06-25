"""wechat work bot tables

Revision ID: e005
Revises: e004
Create Date: 2026-06-23 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e005"
down_revision: str | None = "e004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wechat_work_bot_config",
        sa.Column("key", sa.String(36), primary_key=True),
        sa.Column("value", sa.Text, server_default="{}"),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
    )

    op.create_table(
        "wechat_work_bot_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wechat_user_id", sa.String(128), unique=True, nullable=False),
        sa.Column("flowy_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
        sa.CheckConstraint("role IN ('admin','helper','viewer')", name="ck_bot_user_role"),
    )

    op.create_table(
        "wechat_work_bot_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wechat_user_id", sa.String(128), nullable=False),
        sa.Column("flowy_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("command", sa.String(64), nullable=False),
        sa.Column("args", sa.Text, nullable=True),
        sa.Column("response", sa.Text, nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="success"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.CheckConstraint("status IN ('success','failed')", name="ck_bot_log_status"),
    )


def downgrade() -> None:
    op.drop_table("wechat_work_bot_logs")
    op.drop_table("wechat_work_bot_users")
    op.drop_table("wechat_work_bot_config")
