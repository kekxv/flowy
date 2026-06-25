"""add nickname to users

Revision ID: e009
Revises: e008
Create Date: 2026-06-24 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e009"
down_revision: str | None = "e008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        with op.batch_alter_table("users") as batch:
            batch.add_column(sa.Column("nickname", sa.String(128), nullable=True, server_default=""))
    except Exception:
        pass


def downgrade() -> None:
    try:
        with op.batch_alter_table("users") as batch:
            batch.drop_column("nickname")
    except Exception:
        pass
