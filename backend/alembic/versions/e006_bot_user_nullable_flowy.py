"""make bot user flowy_user_id nullable

Revision ID: e006
Revises: e005
Create Date: 2026-06-24 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e006"
down_revision: str | None = "e005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        with op.batch_alter_table("wechat_work_bot_users") as batch:
            batch.alter_column("flowy_user_id", existing_type=sa.String(36), nullable=True)
    except Exception:
        pass


def downgrade() -> None:
    try:
        with op.batch_alter_table("wechat_work_bot_users") as batch:
            batch.alter_column("flowy_user_id", existing_type=sa.String(36), nullable=False)
    except Exception:
        pass
