"""add display_name to wechat_work_bot_users

Revision ID: e008
Revises: e007
Create Date: 2026-06-24 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e008"
down_revision: str | None = "e007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        with op.batch_alter_table("wechat_work_bot_users") as batch:
            batch.add_column(sa.Column("display_name", sa.String(128), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        with op.batch_alter_table("wechat_work_bot_users") as batch:
            batch.drop_column("display_name")
    except Exception:
        pass
