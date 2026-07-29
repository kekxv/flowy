"""add Basic Auth credentials to intranet sources

Revision ID: e011
Revises: e010_intranet_sources
Create Date: 2026-07-29 02:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e011"
down_revision: str | None = "e010_intranet_sources"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "intranet_sources",
        sa.Column("auth_username", sa.String(length=256), nullable=True),
    )
    op.add_column(
        "intranet_sources",
        sa.Column("auth_password_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("intranet_sources", "auth_password_encrypted")
    op.drop_column("intranet_sources", "auth_username")
