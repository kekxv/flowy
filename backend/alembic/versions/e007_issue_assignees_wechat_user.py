"""add wechat_user_id to issue_assignees

Revision ID: e007
Revises: e006
Create Date: 2026-06-24 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e007"
down_revision: str | None = "e006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        with op.batch_alter_table("issue_assignees") as batch:
            batch.add_column(sa.Column("wechat_user_id", sa.String(128), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        with op.batch_alter_table("issue_assignees") as batch:
            batch.drop_column("wechat_user_id")
    except Exception:
        pass
