"""oauth state frontend_url

Revision ID: e004
Revises: e003
Create Date: 2026-05-26 01:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e004"
down_revision: str | None = "e003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        with op.batch_alter_table("oauth_states") as batch:
            batch.add_column(sa.Column("frontend_url", sa.String(512), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    try:
        with op.batch_alter_table("oauth_states") as batch:
            batch.drop_column("frontend_url")
    except Exception:
        pass
