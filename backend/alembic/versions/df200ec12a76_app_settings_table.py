"""app settings table

Revision ID: df200ec12a76
Revises: 00990fcb887b
Create Date: 2026-05-24 14:00:07.129046
"""

import sqlalchemy as sa

from alembic import op

revision: str = "df200ec12a76"
down_revision: str | None = "00990fcb887b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
